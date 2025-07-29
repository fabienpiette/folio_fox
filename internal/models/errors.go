package models

import (
	"errors"
	"fmt"
	"strings"
)

// Common application errors
var (
	ErrUserNotFound         = errors.New("user not found")
	ErrUserAlreadyExists    = errors.New("user already exists")
	ErrInvalidCredentials   = errors.New("invalid credentials")
	ErrBookNotFound         = errors.New("book not found")
	ErrBookAlreadyExists    = errors.New("book already exists")
	ErrAuthorNotFound       = errors.New("author not found")
	ErrPublisherNotFound    = errors.New("publisher not found")
	ErrSeriesNotFound       = errors.New("series not found")
	ErrGenreNotFound        = errors.New("genre not found")
	ErrIndexerNotFound      = errors.New("indexer not found")
	ErrDownloadNotFound     = errors.New("download not found")
	ErrInvalidInput         = errors.New("invalid input")
	ErrPermissionDenied     = errors.New("permission denied")
	ErrResourceNotFound     = errors.New("resource not found")
	ErrConflict             = errors.New("resource conflict")
	ErrInternalServerError  = errors.New("internal server error")
	ErrServiceUnavailable   = errors.New("service unavailable")
	ErrRateLimitExceeded    = errors.New("rate limit exceeded")
)

// APIError represents a structured API error response
type APIError struct {
	Type       string                 `json:"type"`
	Title      string                 `json:"title"`
	Status     int                    `json:"status"`
	Detail     string                 `json:"detail,omitempty"`
	Instance   string                 `json:"instance,omitempty"`
	Errors     []ValidationError      `json:"errors"`
	Timestamp  string                 `json:"timestamp"`
	RequestID  string                 `json:"request_id,omitempty"`
}

// ValidationError represents a field validation error
type ValidationError struct {
	Field   string `json:"field"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error implements the error interface
func (e *APIError) Error() string {
	return fmt.Sprintf("%s: %s", e.Title, e.Detail)
}

// NewAPIError creates a new APIError
func NewAPIError(status int, title, detail, instance string) *APIError {
	return &APIError{
		Type:      fmt.Sprintf("https://api.foliofox.local/problems/%s", kebabCase(title)),
		Title:     title,
		Status:    status,
		Detail:    detail,
		Instance:  instance,
		Timestamp: "2025-07-28T10:30:00Z", // In real implementation, use time.Now()
	}
}

// AddValidationError adds a validation error to the API error
func (e *APIError) AddValidationError(field, code, message string) {
	if e.Errors == nil {
		e.Errors = make([]ValidationError, 0)
	}
	e.Errors = append(e.Errors, ValidationError{
		Field:   field,
		Code:    code,
		Message: message,
	})
}

// kebabCase converts a string to kebab-case
func kebabCase(s string) string {
	// Check if string is all uppercase (excluding spaces)
	allUpper := true
	hasLetter := false
	for _, r := range s {
		if r >= 'a' && r <= 'z' {
			allUpper = false
			break
		}
		if r >= 'A' && r <= 'Z' {
			hasLetter = true
		}
	}
	
	// If it's all uppercase and has letters, return as-is (unless it has spaces)
	if allUpper && hasLetter && !strings.Contains(s, " ") && !strings.Contains(s, "_") {
		return s
	}
	
	result := ""
	for i, r := range s {
		if r == ' ' || r == '_' {
			result += "-"
		} else if i > 0 && r >= 'A' && r <= 'Z' && result[len(result)-1] != '-' {
			result += "-" + string(r)
		} else {
			result += string(r)
		}
	}
	return result
}