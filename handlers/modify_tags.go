package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/errors"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"go.uber.org/zap"
)

type UpdateTagsRequest struct {
	ID   string   `json:"id"`
	Tags []string `json:"tags"`
}

type UpdateTagsResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

func UpdateTagsHandler(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			errors.HandleError(w, errors.ErrInvalidParam, "Method not allowed", nil)
			return
		}

		var req UpdateTagsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			errors.HandleError(w, errors.ErrInvalidParam, "Invalid request body", nil)
			return
		}

		if req.ID == "" {
			errors.HandleError(w, errors.ErrInvalidParam, "Image ID is required", nil)
			return
		}

		// Trim and deduplicate tags
		seen := make(map[string]struct{})
		var cleanTags []string
		for _, t := range req.Tags {
			t = strings.TrimSpace(t)
			if t == "" {
				continue
			}
			if _, ok := seen[t]; ok {
				continue
			}
			seen[t] = struct{}{}
			cleanTags = append(cleanTags, t)
		}

		ctx := context.Background()
		metadata, err := utils.MetadataManager.GetMetadata(ctx, req.ID)
		if err != nil || metadata == nil {
			logger.Error("Image not found for tag update",
				zap.String("id", req.ID),
				zap.Error(err))
			errors.HandleError(w, errors.ErrNotFound, "Image not found", err)
			return
		}

		// Update tags in Redis if available
		if utils.IsRedisMetadataStore() {
			oldTags := metadata.Tags
			if err := utils.UpdateImageTags(ctx, req.ID, oldTags, cleanTags); err != nil {
				logger.Error("Failed to update tags in Redis",
					zap.String("id", req.ID),
					zap.Error(err))
				errors.HandleError(w, errors.ErrInternal, "Failed to update tags", err)
				return
			}
		}

		// Update metadata
		metadata.Tags = cleanTags
		if err := utils.MetadataManager.SaveMetadata(ctx, metadata); err != nil {
			logger.Error("Failed to save updated metadata",
				zap.String("id", req.ID),
				zap.Error(err))
			errors.HandleError(w, errors.ErrInternal, "Failed to save tags", err)
			return
		}

		// Clear page cache
		if utils.IsRedisMetadataStore() {
			utils.ClearPageCache(ctx)
		}

		logger.Info("Tags updated successfully",
			zap.String("id", req.ID),
			zap.Strings("tags", cleanTags))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(UpdateTagsResponse{
			Success: true,
			Message: "Tags updated successfully",
		})
	}
}
