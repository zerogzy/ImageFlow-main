package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/errors"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"go.uber.org/zap"
)

// ConfigHandler returns a handler function that exposes selected configuration values to clients
func ConfigHandler(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			errors.HandleError(w, errors.ErrInvalidParam, "Method not allowed", nil)
			logger.Warn("Invalid request method",
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path))
			return
		}

		// Get client-safe configuration
		clientConfig := cfg.GetClientConfig()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(clientConfig); err != nil {
			logger.Error("Failed to encode config response",
				zap.Error(err))
			errors.HandleError(w, errors.ErrInternal, "Internal server error", nil)
			return
		}

		logger.Debug("Config request successful",
			zap.Any("config", clientConfig))
	}
}
