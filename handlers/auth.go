package handlers

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/errors"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"go.uber.org/zap"
)

// maskAPIKey returns a masked version of the API key for safe logging
func maskAPIKey(key string) string {
	if len(key) <= 4 {
		return "****"
	}
	return key[:4] + "****"
}

// AuthResponse represents the response for API key validation
type AuthResponse struct {
	Valid bool   `json:"valid"`
	Role  string `json:"role,omitempty"`
	Error string `json:"error,omitempty"`
}

// isKeyValid checks if the provided key matches either admin or guest key
// Returns (isValid, role)
func isKeyValid(cfg *config.Config, providedKey string) (bool, string) {
	if cfg.APIKey != "" && subtle.ConstantTimeCompare([]byte(providedKey), []byte(cfg.APIKey)) == 1 {
		return true, "admin"
	}
	if cfg.GuestAPIKey != "" && subtle.ConstantTimeCompare([]byte(providedKey), []byte(cfg.GuestAPIKey)) == 1 {
		return true, "guest"
	}
	return false, ""
}

// ValidateAPIKey provides an endpoint to validate API keys
func ValidateAPIKey(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			errors.WriteError(w, errors.ErrInvalidAPIKey)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			errors.WriteError(w, errors.ErrInvalidAPIKey)
			return
		}

		providedKey := parts[1]

		if valid, role := isKeyValid(cfg, providedKey); valid {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"valid":true,"role":"` + role + `"}`))
			logger.Debug("API key validated successfully", zap.String("role", role))
		} else {
			errors.WriteError(w, errors.ErrInvalidAPIKey)
			logger.Warn("API key validation failed",
				zap.String("masked_key", maskAPIKey(providedKey)))
		}
	}
}

// RequireAPIKey middleware to validate admin API key before processing requests
func RequireAPIKey(cfg *config.Config, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			errors.WriteError(w, errors.ErrInvalidAPIKey)
			logger.Warn("Missing API key for admin endpoint",
				zap.String("path", r.URL.Path),
				zap.String("method", r.Method))
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			errors.WriteError(w, errors.ErrInvalidAPIKey)
			logger.Warn("Invalid Authorization header format",
				zap.String("path", r.URL.Path),
				zap.String("method", r.Method))
			return
		}

		providedKey := parts[1]

		if cfg.APIKey == "" {
			errors.WriteError(w, errors.ErrInvalidAPIKey)
			logger.Error("Admin API key is not configured on server",
				zap.String("path", r.URL.Path),
				zap.String("method", r.Method))
			return
		}

		if subtle.ConstantTimeCompare([]byte(providedKey), []byte(cfg.APIKey)) != 1 {
			errors.WriteError(w, errors.ErrInvalidAPIKey)
			logger.Warn("Admin API key validation failed",
				zap.String("path", r.URL.Path),
				zap.String("method", r.Method),
				zap.String("masked_key", maskAPIKey(providedKey)))
			return
		}

		next(w, r)
	}
}

// RequireRole validates API key and enforces minimum role requirement
// minRole: "" (any valid key), "guest" (guest or admin), "admin" (admin only)
// Falls back to public access if no keys are configured at all
func RequireRole(cfg *config.Config, minRole string, next http.HandlerFunc) http.HandlerFunc {
	// If no keys configured at all, allow public access
	if cfg.GuestAPIKey == "" && cfg.APIKey == "" {
		return next
	}

	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			errors.WriteError(w, errors.ErrInvalidAPIKey)
			logger.Warn("Missing API key for protected endpoint",
				zap.String("path", r.URL.Path),
				zap.String("min_role", minRole))
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			errors.WriteError(w, errors.ErrInvalidAPIKey)
			return
		}

		providedKey := parts[1]
		if valid, role := isKeyValid(cfg, providedKey); valid {
			if !roleAllowed(role, minRole) {
				errors.WriteError(w, errors.ErrNoPermission)
				logger.Warn("Insufficient role for endpoint",
					zap.String("role", role),
					zap.String("required", minRole),
					zap.String("path", r.URL.Path))
				return
			}

			logger.Debug("API key validated for protected endpoint",
				zap.String("role", role),
				zap.String("path", r.URL.Path))
			next(w, r)
			return
		}

		errors.WriteError(w, errors.ErrInvalidAPIKey)
		logger.Warn("API key validation failed for protected endpoint",
			zap.String("path", r.URL.Path),
			zap.String("method", r.Method),
			zap.String("masked_key", maskAPIKey(providedKey)))
	}
}

// roleAllowed checks whether a given role meets the minimum role requirement
func roleAllowed(actualRole, minRole string) bool {
	switch minRole {
	case "admin":
		return actualRole == "admin"
	case "guest":
		return actualRole == "admin" || actualRole == "guest"
	default:
		return actualRole == "admin" || actualRole == "guest"
	}
}
