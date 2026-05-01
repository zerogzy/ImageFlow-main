package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/errors"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"go.uber.org/zap"
)

// TagsResponse represents the response for the tags API
type TagsResponse struct {
	Tags []string `json:"tags"`
}

// TagsHandler returns a handler for retrieving all unique tags
func TagsHandler(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logger.Info("Processing tags request",
			zap.String("storage_type", string(cfg.StorageType)))

		// Get all unique tags based on storage type
		tags, err := getAllUniqueTags(string(cfg.StorageType), cfg.ImageBasePath)
		if err != nil {
			logger.Error("Failed to retrieve tags", zap.Error(err))
			errors.HandleError(w, errors.ErrInternal, "Failed to retrieve tags", err)
			return
		}

		logger.Debug("Retrieved unique tags",
			zap.Int("count", len(tags)))

		// Return JSON response
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(TagsResponse{Tags: tags}); err != nil {
			logger.Error("Failed to encode tags response", zap.Error(err))
			errors.HandleError(w, errors.ErrInternal, "Failed to encode response", err)
			return
		}
	}
}

// getAllUniqueTags retrieves all unique tags from image metadata
func getAllUniqueTags(storageType, basePath string) ([]string, error) {
	// Get unique tags from Redis if enabled
	if utils.IsRedisMetadataStore() {
		logger.Debug("Using Redis to get unique tags")
		// Use Redis to get all unique tags
		return utils.GetAllUniqueTags(context.Background())
	}

	logger.Debug("Using file-based storage to get unique tags",
		zap.String("storage_type", storageType))

	// Fall back to file-based storage
	// Use a map to store unique tags
	uniqueTags := make(map[string]struct{})
	var mu sync.Mutex

	if storageType == "s3" {
		// For S3 storage, we need to list all metadata files
		// and extract tags from each one
		return getS3UniqueTags(uniqueTags, &mu)
	} else {
		// For local storage, we can read metadata files from the metadata directory
		return getLocalUniqueTags(basePath, uniqueTags, &mu)
	}
}

// getLocalUniqueTags retrieves unique tags from local metadata files
func getLocalUniqueTags(basePath string, uniqueTags map[string]struct{}, mu *sync.Mutex) ([]string, error) {
	metadataDir := filepath.Join(basePath, "metadata")
	logger.Debug("Reading metadata directory", zap.String("dir", metadataDir))

	// Read all files in the metadata directory
	files, err := os.ReadDir(metadataDir)
	if err != nil {
		logger.Error("Failed to read metadata directory",
			zap.String("dir", metadataDir),
			zap.Error(err))
		return nil, err
	}

	// Process each metadata file
	processedFiles := 0
	for _, file := range files {
		if file.IsDir() || filepath.Ext(file.Name()) != ".json" {
			continue
		}

		// Extract ID from filename
		id := filepath.Base(file.Name())
		id = id[:len(id)-5] // Remove .json extension

		// Get metadata
		metadata, err := utils.MetadataManager.GetMetadata(context.Background(), id)
		if err != nil || metadata == nil {
			logger.Warn("Failed to get metadata",
				zap.String("id", id),
				zap.Error(err))
			continue
		}

		// Add tags to the unique tags map
		mu.Lock()
		for _, tag := range metadata.Tags {
			uniqueTags[tag] = struct{}{}
		}
		mu.Unlock()
		processedFiles++
	}

	logger.Debug("Processed metadata files",
		zap.Int("total_files", processedFiles),
		zap.Int("unique_tags", len(uniqueTags)))

	// Convert map keys to slice
	return mapKeysToSortedSlice(uniqueTags), nil
}

// getS3UniqueTags retrieves unique tags from S3 metadata
func getS3UniqueTags(uniqueTags map[string]struct{}, mu *sync.Mutex) ([]string, error) {
	logger.Debug("Getting unique tags from S3 metadata")

	// Get all metadata from S3
	s3Storage, ok := utils.Storage.(*utils.S3Storage)
	if !ok {
		logger.Error("Failed to get S3 storage instance")
		return nil, nil
	}

	// List all metadata objects
	metadataPrefix := "metadata/"
	objects, err := s3Storage.ListObjects(context.Background(), metadataPrefix)
	if err != nil {
		logger.Error("Failed to list S3 metadata objects",
			zap.String("prefix", metadataPrefix),
			zap.Error(err))
		return nil, err
	}

	// Process each metadata file
	processedFiles := 0
	for _, obj := range objects {
		// Extract ID from key
		key := obj.Key
		if filepath.Ext(key) != ".json" {
			continue
		}

		// Extract ID from key
		id := filepath.Base(key)
		id = id[:len(id)-5] // Remove .json extension

		// Get metadata
		metadata, err := utils.MetadataManager.GetMetadata(context.Background(), id)
		if err != nil || metadata == nil {
			logger.Warn("Failed to get metadata",
				zap.String("id", id),
				zap.Error(err))
			continue
		}

		// Add tags to the unique tags map
		mu.Lock()
		for _, tag := range metadata.Tags {
			uniqueTags[tag] = struct{}{}
		}
		mu.Unlock()
		processedFiles++
	}

	logger.Debug("Processed S3 metadata files",
		zap.Int("total_files", processedFiles),
		zap.Int("unique_tags", len(uniqueTags)))

	// Convert map keys to slice
	return mapKeysToSortedSlice(uniqueTags), nil
}

// mapKeysToSortedSlice converts map keys to a sorted slice
func mapKeysToSortedSlice(m map[string]struct{}) []string {
	result := make([]string, 0, len(m))
	for key := range m {
		result = append(result, key)
	}
	sort.Strings(result)
	return result
}
