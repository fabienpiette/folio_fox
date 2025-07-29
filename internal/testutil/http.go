package testutil

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"

	"github.com/fabienpiette/folio_fox/internal/config"
	"github.com/fabienpiette/folio_fox/internal/models"
)

// HTTPTestContext provides utilities for HTTP testing
type HTTPTestContext struct {
	Router *gin.Engine
	Config *config.Config
	t      *testing.T
}

// NewHTTPTestContext creates a new HTTP test context
func NewHTTPTestContext(t *testing.T) *HTTPTestContext {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	return &HTTPTestContext{
		Router: router,
		Config: GetTestConfig(t).Config,
		t:      t,
	}
}

// HTTPTestRequest represents a test HTTP request
type HTTPTestRequest struct {
	Method      string
	Path        string
	Body        interface{}
	Headers     map[string]string
	QueryParams map[string]string
	UserID      *int64 // For authenticated requests
}

// HTTPTestResponse represents a test HTTP response
type HTTPTestResponse struct {
	StatusCode int
	Body       []byte
	Headers    http.Header
}

// MakeRequest makes an HTTP request and returns the response
func (ctx *HTTPTestContext) MakeRequest(req HTTPTestRequest) *HTTPTestResponse {
	var body io.Reader

	// Prepare request body
	if req.Body != nil {
		if str, ok := req.Body.(string); ok {
			body = strings.NewReader(str)
		} else {
			bodyBytes, err := json.Marshal(req.Body)
			require.NoError(ctx.t, err)
			body = bytes.NewReader(bodyBytes)
		}
	}

	// Create HTTP request
	httpReq := httptest.NewRequest(req.Method, req.Path, body)

	// Add query parameters
	if req.QueryParams != nil {
		q := httpReq.URL.Query()
		for key, value := range req.QueryParams {
			q.Add(key, value)
		}
		httpReq.URL.RawQuery = q.Encode()
	}

	// Add headers
	if req.Headers != nil {
		for key, value := range req.Headers {
			httpReq.Header.Set(key, value)
		}
	}

	// Add JWT token for authenticated requests
	if req.UserID != nil {
		token := ctx.CreateJWTToken(*req.UserID)
		httpReq.Header.Set("Authorization", "Bearer "+token)
	}

	// Set default content type for JSON requests
	if req.Body != nil && httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	// Create response recorder
	w := httptest.NewRecorder()

	// Make the request
	ctx.Router.ServeHTTP(w, httpReq)

	// Return response
	return &HTTPTestResponse{
		StatusCode: w.Code,
		Body:       w.Body.Bytes(),
		Headers:    w.Header(),
	}
}

// CreateJWTToken creates a JWT token for testing
func (ctx *HTTPTestContext) CreateJWTToken(userID int64) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Duration(ctx.Config.Auth.TokenDuration) * time.Second).Unix(),
		"iat":     time.Now().Unix(),
	})

	tokenString, err := token.SignedString([]byte(ctx.Config.Auth.JWTSecret))
	require.NoError(ctx.t, err)

	return tokenString
}

// AssertJSONResponse asserts that the response is JSON and matches expected status
func (ctx *HTTPTestContext) AssertJSONResponse(resp *HTTPTestResponse, expectedStatus int, target interface{}) {
	require.Equal(ctx.t, expectedStatus, resp.StatusCode)
	require.Equal(ctx.t, "application/json; charset=utf-8", resp.Headers.Get("Content-Type"))
	
	if target != nil {
		err := json.Unmarshal(resp.Body, target)
		require.NoError(ctx.t, err, "Failed to unmarshal JSON response: %s", string(resp.Body))
	}
}

// AssertErrorResponse asserts that the response contains an error
func (ctx *HTTPTestContext) AssertErrorResponse(resp *HTTPTestResponse, expectedStatus int, expectedMessage string) {
	require.Equal(ctx.t, expectedStatus, resp.StatusCode)
	
	var errorResp map[string]interface{}
	err := json.Unmarshal(resp.Body, &errorResp)
	require.NoError(ctx.t, err)
	
	require.Contains(ctx.t, errorResp, "error")
	if expectedMessage != "" {
		require.Contains(ctx.t, errorResp["error"].(string), expectedMessage)
	}
}

// GetJSONField extracts a field from JSON response
func (ctx *HTTPTestContext) GetJSONField(resp *HTTPTestResponse, field string) interface{} {
	var data map[string]interface{}
	err := json.Unmarshal(resp.Body, &data)
	require.NoError(ctx.t, err)
	
	return data[field]
}

// GetResponseString returns the response body as string
func (resp *HTTPTestResponse) GetResponseString() string {
	return string(resp.Body)
}

// WebSocketTestServer provides utilities for WebSocket testing
type WebSocketTestServer struct {
	Server   *httptest.Server
	Messages [][]byte
	t        *testing.T
}

// NewWebSocketTestServer creates a WebSocket test server
func NewWebSocketTestServer(t *testing.T) *WebSocketTestServer {
	return &WebSocketTestServer{
		Messages: make([][]byte, 0),
		t:        t,
	}
}

// Start starts the WebSocket test server
func (ws *WebSocketTestServer) Start() {
	// This would implement WebSocket testing utilities
	// For now, it's a placeholder
}

// Stop stops the WebSocket test server
func (ws *WebSocketTestServer) Stop() {
	if ws.Server != nil {
		ws.Server.Close()
	}
}

// AuthMiddlewareTest provides authentication middleware for testing
func AuthMiddlewareTest(config *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		tokenString := parts[1]

		// Parse and validate JWT token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// Validate signing method
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(config.Auth.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Extract claims
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			if userID, exists := claims["user_id"]; exists {
				// Convert to int64
				switch v := userID.(type) {
				case float64:
					c.Set("user_id", int64(v))
				case int64:
					c.Set("user_id", v)
				default:
					c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID in token"})
					c.Abort()
					return
				}
			} else {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in token"})
				c.Abort()
				return
			}
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// SetupTestRoutes sets up common test routes
func (ctx *HTTPTestContext) SetupTestRoutes() {
	// Health check route
	ctx.Router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Test authentication route
	auth := ctx.Router.Group("/api/v1")
	auth.Use(AuthMiddlewareTest(ctx.Config))
	{
		auth.GET("/me", func(c *gin.Context) {
			userID, _ := c.Get("user_id")
			c.JSON(http.StatusOK, gin.H{"user_id": userID})
		})
	}
}

// APITestSuite provides a complete test suite for API testing
type APITestSuite struct {
	*HTTPTestContext
	MockServices *MockServiceContainer
	TestUser     *models.User
}

// MockServiceContainer holds mock services for testing
type MockServiceContainer struct {
	UserRepo     *MockUserRepository
	BookRepo     *MockBookRepository
	SearchRepo   *MockSearchRepository
	DownloadRepo *MockDownloadRepository
	IndexerRepo  *MockIndexerRepository
}

// NewAPITestSuite creates a complete API test suite
func NewAPITestSuite(t *testing.T) *APITestSuite {
	httpCtx := NewHTTPTestContext(t)
	
	// Create mock services
	mockServices := &MockServiceContainer{
		UserRepo:     new(MockUserRepository),
		BookRepo:     new(MockBookRepository),
		SearchRepo:   new(MockSearchRepository),
		DownloadRepo: new(MockDownloadRepository),
		IndexerRepo:  new(MockIndexerRepository),
	}

	testUser := TestUser()

	suite := &APITestSuite{
		HTTPTestContext: httpCtx,
		MockServices:    mockServices,
		TestUser:        testUser,
	}

	// Setup common mock expectations
	suite.setupCommonMocks()

	return suite
}

// setupCommonMocks sets up common mock expectations
func (suite *APITestSuite) setupCommonMocks() {
	// Setup common user repository mock
	suite.MockServices.UserRepo.On("GetByID", 
		context.Background(), 
		suite.TestUser.ID).Return(suite.TestUser, nil)
}

// Cleanup cleans up the test suite
func (suite *APITestSuite) Cleanup() {
	// Assert all mocks were called as expected
	suite.MockServices.UserRepo.AssertExpectations(suite.t)
	suite.MockServices.BookRepo.AssertExpectations(suite.t)
	suite.MockServices.SearchRepo.AssertExpectations(suite.t)
	suite.MockServices.DownloadRepo.AssertExpectations(suite.t)
	suite.MockServices.IndexerRepo.AssertExpectations(suite.t)
}

// CreateAuthenticatedRequest creates an authenticated request
func (suite *APITestSuite) CreateAuthenticatedRequest(method, path string, body interface{}) HTTPTestRequest {
	return HTTPTestRequest{
		Method: method,
		Path:   path,
		Body:   body,
		UserID: &suite.TestUser.ID,
	}
}

// CreateAnonymousRequest creates an anonymous request
func (suite *APITestSuite) CreateAnonymousRequest(method, path string, body interface{}) HTTPTestRequest {
	return HTTPTestRequest{
		Method: method,
		Path:   path,
		Body:   body,
	}
}