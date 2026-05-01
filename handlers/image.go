package handlers

import (
	"net/http"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/errors"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"go.uber.org/zap"
)

// RandomImage handles random image requests in a unified way, working with both
// local and S3 storage based on the configured storage type.
//
// This handler:
// 1. Checks the storage type configuration (local or S3)
// 2. Delegates to the appropriate specialized handler
// 3. Returns a random image with proper format detection, including special handling for PNG
//
// Benefits:
// - Provides a single entry point for random image functionality
// - Maintains proper content type detection for all image formats
// - Handles PNG transparency properly with special cases
// - Ensures consistent headers and caching behavior
func RandomImage(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			errors.HandleError(w, errors.ErrInvalidParam, "Method not allowed", nil)
			logger.Warn("Invalid request method",
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path))
			return
		}

		logger.Info("Processing random image request",
			zap.String("storage_type", string(cfg.StorageType)))

		// Use the appropriate handler based on storage type
		if cfg.StorageType == config.StorageTypeS3 {
			logger.Debug("Using S3 random image handler")
			// Use the existing S3 handler
			RandomImageHandler(utils.S3Client, cfg)(w, r)
		} else {
			logger.Debug("Using local random image handler")
			// Use the existing local handler
			LocalRandomImageHandler(cfg)(w, r)
		}
	}
}
