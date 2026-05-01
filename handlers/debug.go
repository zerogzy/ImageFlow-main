package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/errors"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"go.uber.org/zap"
)

// DebugTagsResponse represents the response for the debug tags API
type DebugTagsResponse struct {
	Tag    string   `json:"tag"`
	Images []string `json:"images"`
}

// DebugTagsHandler returns a handler for debugging tag issues
func DebugTagsHandler(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get tag parameter
		tag := r.URL.Query().Get("tag")
		if tag == "" {
			errors.HandleError(w, errors.ErrInvalidParam, "Tag parameter is required", nil)
			logger.Warn("Missing tag parameter",
				zap.String("path", r.URL.Path))
			return
		}

		// Find all images with the specified tag
		images, err := findImagesWithTagDebug(tag, string(cfg.StorageType), cfg.ImageBasePath)
		if err != nil {
			logger.Error("Failed to find images with tag",
				zap.String("tag", tag),
				zap.Error(err))
			errors.HandleError(w, errors.ErrInternal, "Failed to find images", nil)
			return
		}

		// Return JSON response
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(DebugTagsResponse{
			Tag:    tag,
			Images: images,
		}); err != nil {
			logger.Error("Failed to encode response",
				zap.String("tag", tag),
				zap.Error(err))
			errors.HandleError(w, errors.ErrInternal, "Failed to encode response", nil)
			return
		}

		logger.Debug("Successfully retrieved images by tag",
			zap.String("tag", tag),
			zap.Int("image_count", len(images)))
	}
}

// findImagesWithTagDebug finds all images with the specified tag
func findImagesWithTagDebug(tag, storageType, basePath string) ([]string, error) {
	// Get metadata from Redis if enabled
	if utils.IsRedisMetadataStore() {
		// Use Redis to get all images with the specified tag
		imageIDs, err := utils.GetImagesByTag(context.Background(), tag)
		if err != nil {
			logger.Warn("Failed to get images by tag from Redis, falling back to file storage",
				zap.String("tag", tag),
				zap.Error(err))
		} else {
			logger.Info("Found images with tag from Redis",
				zap.String("tag", tag),
				zap.Int("count", len(imageIDs)))

			// Log detailed metadata for debugging
			for _, id := range imageIDs {
				metadata, err := utils.MetadataManager.GetMetadata(context.Background(), id)
				if err == nil && metadata != nil {
					logger.Debug("Image metadata from Redis",
						zap.String("id", metadata.ID),
						zap.Strings("tags", metadata.Tags),
						zap.String("orientation", metadata.Orientation))
				}
			}

			return imageIDs, nil
		}
	}

	// Fall back to file-based storage
	var images []string

	if storageType == "s3" {
		// For S3 storage, we need to implement S3-specific logic
		s3Storage, ok := utils.Storage.(*utils.S3Storage)
		if !ok {
			return nil, fmt.Errorf("failed to get S3 storage instance")
		}

		// List all metadata objects
		metadataPrefix := "metadata/"
		objects, err := s3Storage.ListObjects(context.Background(), metadataPrefix)
		if err != nil {
			return nil, fmt.Errorf("failed to list S3 objects: %v", err)
		}

		// Process each metadata file
		for _, obj := range objects {
			// Skip if not a JSON file
			if filepath.Ext(obj.Key) != ".json" {
				continue
			}

			// Extract ID from key
			id := filepath.Base(obj.Key)
			id = id[:len(id)-5] // Remove .json extension

			// Get metadata
			metadata, err := utils.MetadataManager.GetMetadata(context.Background(), id)
			if err != nil {
				logger.Warn("Failed to read metadata from S3",
					zap.String("id", id),
					zap.Error(err))
				continue
			}

			// Check if image has the requested tag
			hasTag := false
			for _, imgTag := range metadata.Tags {
				if imgTag == tag {
					hasTag = true
					break
				}
			}

			if hasTag {
				// Add image ID to the result
				images = append(images, id)
				logger.Debug("Found image with tag in S3",
					zap.String("id", id),
					zap.String("tag", tag),
					zap.Strings("all_tags", metadata.Tags),
					zap.String("orientation", metadata.Orientation))
			}
		}
	} else {
		// For local storage, we can read metadata files from the metadata directory
		metadataDir := filepath.Join(basePath, "metadata")

		// Read all files in the metadata directory
		files, err := os.ReadDir(metadataDir)
		if err != nil {
			return nil, fmt.Errorf("failed to read metadata directory: %v", err)
		}

		// Process each metadata file
		for _, file := range files {
			if file.IsDir() || filepath.Ext(file.Name()) != ".json" {
				continue
			}

			// Extract ID from filename
			id := filepath.Base(file.Name())
			id = id[:len(id)-5] // Remove .json extension

			// Get metadata
			metadata, err := utils.MetadataManager.GetMetadata(context.Background(), id)
			if err != nil {
				logger.Warn("Failed to read metadata from local storage",
					zap.String("id", id),
					zap.Error(err))
				continue
			}

			// Check if image has the requested tag
			hasTag := false
			for _, imgTag := range metadata.Tags {
				if imgTag == tag {
					hasTag = true
					break
				}
			}

			if hasTag {
				// Add image ID to the result
				images = append(images, id)
				logger.Debug("Found image with tag in local storage",
					zap.String("id", id),
					zap.String("tag", tag),
					zap.Strings("all_tags", metadata.Tags),
					zap.String("orientation", metadata.Orientation))
			}
		}
	}

	return images, nil
}
