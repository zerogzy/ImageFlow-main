package errors

import (
	"encoding/json"
	"net/http"

	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"go.uber.org/zap"
)

type ErrorCode int

const (
	ErrInternal     ErrorCode = 1000 // Internal server error
	ErrInvalidParam ErrorCode = 1001 // Invalid parameter
	ErrUnauthorized ErrorCode = 1002 // Unauthorized
	ErrForbidden    ErrorCode = 1003 // Forbidden
	ErrNotFound     ErrorCode = 1004 // Resource not found

	ErrImageProcess ErrorCode = 2000 // Image processing error
	ErrImageUpload  ErrorCode = 2001 // Image upload error
	ErrImageDelete  ErrorCode = 2002 // Image deletion error
	ErrImageList    ErrorCode = 2003 // Image list retrieval error
	ErrMetadata     ErrorCode = 2004 // Metadata operation error
)

type ErrorResponse struct {
	Code    ErrorCode   `json:"code"`              // Error code
	Message string      `json:"message"`           // Error message
	Details interface{} `json:"details,omitempty"` // Error details
}

func (code ErrorCode) HTTPError() int {
	switch code {
	case ErrInvalidParam:
		return http.StatusBadRequest
	case ErrUnauthorized:
		return http.StatusUnauthorized
	case ErrForbidden:
		return http.StatusForbidden
	case ErrNotFound:
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

func NewError(code ErrorCode, message string, details interface{}) *ErrorResponse {
	return &ErrorResponse{
		Code:    code,
		Message: message,
		Details: details,
	}
}

func WriteError(w http.ResponseWriter, err *ErrorResponse) {
	logFields := []zap.Field{
		zap.Int("error_code", int(err.Code)),
		zap.String("error_message", err.Message),
	}
	if err.Details != nil {
		logFields = append(logFields, zap.Any("error_details", err.Details))
	}

	switch err.Code {
	case ErrInternal, ErrImageProcess, ErrImageUpload, ErrImageDelete, ErrImageList, ErrMetadata:
		logger.Error("Internal server error occurred", logFields...)
	case ErrInvalidParam:
		logger.Warn("Invalid parameter error", logFields...)
	case ErrUnauthorized, ErrForbidden, ErrNotFound:
		logger.Info("Access control error", logFields...)
	default:
		logger.Error("Unknown error occurred", logFields...)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.Code.HTTPError())
	json.NewEncoder(w).Encode(err)
}

func HandleError(w http.ResponseWriter, code ErrorCode, message string, details interface{}) {
	err := NewError(code, message, details)
	WriteError(w, err)
}

var (
	ErrInvalidAPIKey = NewError(ErrUnauthorized, "Invalid API key", nil)
	ErrNoPermission  = NewError(ErrForbidden, "No permission to access", nil)
	ErrServerError   = NewError(ErrInternal, "Internal server error", nil)
)
