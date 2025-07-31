package models

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCommonErrors(t *testing.T) {
	// Test that all common errors are defined
	errors := []error{
		ErrUserNotFound,
		ErrUserAlreadyExists,
		ErrInvalidCredentials,
		ErrBookNotFound,
		ErrBookAlreadyExists,
		ErrAuthorNotFound,
		ErrPublisherNotFound,
		ErrSeriesNotFound,
		ErrGenreNotFound,
		ErrIndexerNotFound,
		ErrDownloadNotFound,
		ErrInvalidInput,
		ErrPermissionDenied,
		ErrResourceNotFound,
		ErrConflict,
		ErrInternalServerError,
		ErrServiceUnavailable,
		ErrRateLimitExceeded,
	}

	for _, err := range errors {
		assert.NotNil(t, err)
		assert.NotEmpty(t, err.Error())
	}
}

func TestErrorMessages(t *testing.T) {
	tests := []struct {
		err      error
		expected string
	}{
		{ErrUserNotFound, "user not found"},
		{ErrUserAlreadyExists, "user already exists"},
		{ErrInvalidCredentials, "invalid credentials"},
		{ErrBookNotFound, "book not found"},
		{ErrBookAlreadyExists, "book already exists"},
		{ErrAuthorNotFound, "author not found"},
		{ErrPublisherNotFound, "publisher not found"},
		{ErrSeriesNotFound, "series not found"},
		{ErrGenreNotFound, "genre not found"},
		{ErrIndexerNotFound, "indexer not found"},
		{ErrDownloadNotFound, "download not found"},
		{ErrInvalidInput, "invalid input"},
		{ErrPermissionDenied, "permission denied"},
		{ErrResourceNotFound, "resource not found"},
		{ErrConflict, "resource conflict"},
		{ErrInternalServerError, "internal server error"},
		{ErrServiceUnavailable, "service unavailable"},
		{ErrRateLimitExceeded, "rate limit exceeded"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.err.Error())
		})
	}
}

func TestAPIError_Error(t *testing.T) {
	apiError := &APIError{
		Title:  "Bad Request",
		Detail: "The request was invalid",
	}

	expected := "Bad Request: The request was invalid"
	assert.Equal(t, expected, apiError.Error())
}

func TestAPIError_ErrorWithEmptyDetail(t *testing.T) {
	apiError := &APIError{
		Title:  "Not Found",
		Detail: "",
	}

	expected := "Not Found: "
	assert.Equal(t, expected, apiError.Error())
}

func TestNewAPIError(t *testing.T) {
	apiError := NewAPIError(400, "Bad Request", "Invalid input provided", "/api/v1/books")

	assert.Equal(t, "https://api.foliofox.local/problems/Bad-Request", apiError.Type)
	assert.Equal(t, "Bad Request", apiError.Title)
	assert.Equal(t, 400, apiError.Status)
	assert.Equal(t, "Invalid input provided", apiError.Detail)
	assert.Equal(t, "/api/v1/books", apiError.Instance)
	assert.Equal(t, "2025-07-28T10:30:00Z", apiError.Timestamp)
	assert.Empty(t, apiError.Errors)
	assert.Empty(t, apiError.RequestID)
}

func TestNewAPIError_WithComplexTitle(t *testing.T) {
	apiError := NewAPIError(422, "Validation Failed", "Multiple validation errors", "/api/v1/users")

	assert.Equal(t, "https://api.foliofox.local/problems/Validation-Failed", apiError.Type)
	assert.Equal(t, "Validation Failed", apiError.Title)
	assert.Equal(t, 422, apiError.Status)
}

func TestAPIError_AddValidationError(t *testing.T) {
	apiError := NewAPIError(422, "Validation Error", "Request validation failed", "/api/v1/books")

	assert.Nil(t, apiError.Errors)

	apiError.AddValidationError("title", "required", "Title is required")

	require.NotNil(t, apiError.Errors)
	require.Len(t, apiError.Errors, 1)

	validationError := apiError.Errors[0]
	assert.Equal(t, "title", validationError.Field)
	assert.Equal(t, "required", validationError.Code)
	assert.Equal(t, "Title is required", validationError.Message)
}

func TestAPIError_AddMultipleValidationErrors(t *testing.T) {
	apiError := NewAPIError(422, "Validation Error", "Multiple validation errors", "/api/v1/users")

	apiError.AddValidationError("username", "required", "Username is required")
	apiError.AddValidationError("email", "invalid", "Email format is invalid")
	apiError.AddValidationError("password", "min_length", "Password must be at least 8 characters")

	require.Len(t, apiError.Errors, 3)

	// Check first error
	assert.Equal(t, "username", apiError.Errors[0].Field)
	assert.Equal(t, "required", apiError.Errors[0].Code)
	assert.Equal(t, "Username is required", apiError.Errors[0].Message)

	// Check second error
	assert.Equal(t, "email", apiError.Errors[1].Field)
	assert.Equal(t, "invalid", apiError.Errors[1].Code)
	assert.Equal(t, "Email format is invalid", apiError.Errors[1].Message)

	// Check third error
	assert.Equal(t, "password", apiError.Errors[2].Field)
	assert.Equal(t, "min_length", apiError.Errors[2].Code)
	assert.Equal(t, "Password must be at least 8 characters", apiError.Errors[2].Message)
}

func TestAPIError_JSONSerialization(t *testing.T) {
	apiError := NewAPIError(404, "Not Found", "The requested resource was not found", "/api/v1/books/123")
	apiError.RequestID = "req-abc123"
	apiError.AddValidationError("id", "not_found", "Book with ID 123 not found")

	jsonData, err := json.Marshal(apiError)
	require.NoError(t, err)

	var unmarshaled APIError
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, apiError.Type, unmarshaled.Type)
	assert.Equal(t, apiError.Title, unmarshaled.Title)
	assert.Equal(t, apiError.Status, unmarshaled.Status)
	assert.Equal(t, apiError.Detail, unmarshaled.Detail)
	assert.Equal(t, apiError.Instance, unmarshaled.Instance)
	assert.Equal(t, apiError.Timestamp, unmarshaled.Timestamp)
	assert.Equal(t, apiError.RequestID, unmarshaled.RequestID)
	
	require.Len(t, unmarshaled.Errors, 1)
	assert.Equal(t, apiError.Errors[0].Field, unmarshaled.Errors[0].Field)
	assert.Equal(t, apiError.Errors[0].Code, unmarshaled.Errors[0].Code)
	assert.Equal(t, apiError.Errors[0].Message, unmarshaled.Errors[0].Message)
}

func TestValidationError_JSONSerialization(t *testing.T) {
	validationError := ValidationError{
		Field:   "email",
		Code:    "invalid_format",
		Message: "Email address is not in a valid format",
	}

	jsonData, err := json.Marshal(validationError)
	require.NoError(t, err)

	var unmarshaled ValidationError
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, validationError.Field, unmarshaled.Field)
	assert.Equal(t, validationError.Code, unmarshaled.Code)
	assert.Equal(t, validationError.Message, unmarshaled.Message)
}

func TestKebabCase(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"BadRequest", "Bad-Request"},
		{"NotFound", "Not-Found"},
		{"ValidationError", "Validation-Error"},
		{"Internal Server Error", "Internal-Server-Error"},
		{"Rate Limit Exceeded", "Rate-Limit-Exceeded"},
		{"simple", "simple"},
		{"ALLCAPS", "ALLCAPS"},
		{"", ""},
		{"Single", "Single"},
		{"Multiple Words Here", "Multiple-Words-Here"},
		{"CamelCaseWithSpaces And More", "Camel-Case-With-Spaces-And-More"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := kebabCase(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestAPIError_WithoutValidationErrors(t *testing.T) {
	apiError := NewAPIError(500, "Internal Server Error", "An unexpected error occurred", "/api/v1/search")

	jsonData, err := json.Marshal(apiError)
	require.NoError(t, err)

	// Check that errors field is omitted when empty
	var jsonMap map[string]interface{}
	err = json.Unmarshal(jsonData, &jsonMap)
	require.NoError(t, err)

	// The errors field should be present but empty
	errors, exists := jsonMap["errors"]
	assert.True(t, exists)
	assert.Nil(t, errors)
}

func TestAPIError_ImplementsErrorInterface(t *testing.T) {
	apiError := NewAPIError(400, "Bad Request", "Invalid input", "/api/v1/test")

	// Verify that APIError implements the error interface
	var err error = apiError
	assert.Equal(t, "Bad Request: Invalid input", err.Error())
}

// Benchmark tests
func BenchmarkNewAPIError(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = NewAPIError(400, "Bad Request", "Invalid input provided", "/api/v1/books")
	}
}

func BenchmarkAPIError_AddValidationError(b *testing.B) {
	apiError := NewAPIError(422, "Validation Error", "Multiple validation errors", "/api/v1/users")
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		apiError.AddValidationError("field", "code", "message")
	}
}

func BenchmarkAPIError_JSONMarshal(b *testing.B) {
	apiError := NewAPIError(422, "Validation Error", "Multiple validation errors", "/api/v1/users")
	apiError.RequestID = "req-benchmark-123"
	apiError.AddValidationError("username", "required", "Username is required")
	apiError.AddValidationError("email", "invalid", "Email format is invalid")
	apiError.AddValidationError("password", "min_length", "Password must be at least 8 characters")
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = json.Marshal(apiError) // Benchmark ignores return values
	}
}

func BenchmarkKebabCase(b *testing.B) {
	testStrings := []string{
		"BadRequest",
		"NotFound",
		"ValidationError",
		"Internal Server Error",
		"Rate Limit Exceeded",
		"CamelCaseWithSpaces And More",
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		kebabCase(testStrings[i%len(testStrings)])
	}
}

// Table-driven tests for comprehensive error scenarios
func TestAPIError_VariousStatusCodes(t *testing.T) {
	tests := []struct {
		status int
		title  string
		detail string
	}{
		{400, "Bad Request", "The request was malformed"},
		{401, "Unauthorized", "Authentication required"},
		{403, "Forbidden", "Access denied"},
		{404, "Not Found", "Resource not found"},
		{422, "Unprocessable Entity", "Validation failed"},
		{429, "Too Many Requests", "Rate limit exceeded"},
		{500, "Internal Server Error", "Server error occurred"},
		{502, "Bad Gateway", "Upstream server error"},
		{503, "Service Unavailable", "Service temporarily unavailable"},
	}

	for _, tt := range tests {
		t.Run(tt.title, func(t *testing.T) {
			apiError := NewAPIError(tt.status, tt.title, tt.detail, "/api/v1/test")
			
			assert.Equal(t, tt.status, apiError.Status)
			assert.Equal(t, tt.title, apiError.Title)
			assert.Equal(t, tt.detail, apiError.Detail)
			assert.Contains(t, apiError.Type, kebabCase(tt.title))
		})
	}
}

func TestAPIError_EdgeCases(t *testing.T) {
	t.Run("empty strings", func(t *testing.T) {
		apiError := NewAPIError(400, "", "", "")
		assert.Equal(t, 400, apiError.Status)
		assert.Equal(t, "", apiError.Title)
		assert.Equal(t, "", apiError.Detail)
		assert.Equal(t, "", apiError.Instance)
	})

	t.Run("zero status code", func(t *testing.T) {
		apiError := NewAPIError(0, "No Status", "No status code", "/test")
		assert.Equal(t, 0, apiError.Status)
	})

	t.Run("negative status code", func(t *testing.T) {
		apiError := NewAPIError(-1, "Invalid Status", "Negative status code", "/test")
		assert.Equal(t, -1, apiError.Status)
	})
}