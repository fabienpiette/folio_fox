package testutil

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/repositories"
)

// MockBookFilters is a placeholder for book filters - would be implemented based on actual filters struct
type MockBookFilters struct {
	// Add fields as needed based on actual BookFilters implementation
}

// MockIndexerManager provides mock implementation for IndexerManagerInterface
type MockIndexerManager struct {
	mock.Mock
}

func (m *MockIndexerManager) Search(ctx context.Context, userID int64, request *models.SearchRequest) (*models.SearchResponse, error) {
	args := m.Called(ctx, userID, request)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.SearchResponse), args.Error(1)
}

func (m *MockIndexerManager) GetHealthyIndexers(ctx context.Context) ([]*models.Indexer, error) {
	args := m.Called(ctx)
	return args.Get(0).([]*models.Indexer), args.Error(1)
}

func (m *MockIndexerManager) TestIndexer(ctx context.Context, indexerID int64) (*models.IndexerTestResult, error) {
	args := m.Called(ctx, indexerID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.IndexerTestResult), args.Error(1)
}

// MockUserRepository provides mock implementation for UserRepository
type MockUserRepository struct {
	mock.Mock
}

func (m *MockUserRepository) Create(ctx context.Context, user *models.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *MockUserRepository) GetByID(ctx context.Context, id int64) (*models.User, error) {
	args := m.Called(ctx, id)
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockUserRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	args := m.Called(ctx, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockUserRepository) Update(ctx context.Context, user *models.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *MockUserRepository) Delete(ctx context.Context, id int64) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockUserRepository) List(ctx context.Context, filters interface{}) ([]*models.User, int, error) {
	args := m.Called(ctx, filters)
	return args.Get(0).([]*models.User), args.Int(1), args.Error(2)
}

// MockBookRepository provides mock implementation for BookRepository
type MockBookRepository struct {
	mock.Mock
}

func (m *MockBookRepository) Create(ctx context.Context, book *models.Book) error {
	args := m.Called(ctx, book)
	return args.Error(0)
}

func (m *MockBookRepository) GetByID(ctx context.Context, id int64) (*models.Book, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Book), args.Error(1)
}

func (m *MockBookRepository) Update(ctx context.Context, book *models.Book) error {
	args := m.Called(ctx, book)
	return args.Error(0)
}

func (m *MockBookRepository) Delete(ctx context.Context, id int64) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *MockBookRepository) List(ctx context.Context, filters *repositories.BookFilters) ([]*models.Book, int, error) {
	args := m.Called(ctx, filters)
	return args.Get(0).([]*models.Book), args.Int(1), args.Error(2)
}

func (m *MockBookRepository) Search(ctx context.Context, query string, filters *repositories.BookFilters) ([]*models.Book, int, error) {
	args := m.Called(ctx, query, filters)
	return args.Get(0).([]*models.Book), args.Int(1), args.Error(2)
}

func (m *MockBookRepository) GetWithRelations(ctx context.Context, id int64) (*models.Book, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Book), args.Error(1)
}

func (m *MockBookRepository) AddAuthor(ctx context.Context, bookID, authorID int64, role string) error {
	args := m.Called(ctx, bookID, authorID, role)
	return args.Error(0)
}

func (m *MockBookRepository) RemoveAuthor(ctx context.Context, bookID, authorID int64) error {
	args := m.Called(ctx, bookID, authorID)
	return args.Error(0)
}

func (m *MockBookRepository) GetByISBN(ctx context.Context, isbn string) (*models.Book, error) {
	args := m.Called(ctx, isbn)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Book), args.Error(1)
}

func (m *MockBookRepository) GetAuthors(ctx context.Context, bookID int64) ([]*models.Author, error) {
	args := m.Called(ctx, bookID)
	return args.Get(0).([]*models.Author), args.Error(1)
}

func (m *MockBookRepository) GetGenres(ctx context.Context, bookID int64) ([]*models.Genre, error) {
	args := m.Called(ctx, bookID)
	return args.Get(0).([]*models.Genre), args.Error(1)
}

func (m *MockBookRepository) GetFiles(ctx context.Context, bookID int64) ([]*models.BookFile, error) {
	args := m.Called(ctx, bookID)
	return args.Get(0).([]*models.BookFile), args.Error(1)
}

func (m *MockBookRepository) AddGenre(ctx context.Context, bookID, genreID int64) error {
	args := m.Called(ctx, bookID, genreID)
	return args.Error(0)
}

func (m *MockBookRepository) RemoveGenre(ctx context.Context, bookID, genreID int64) error {
	args := m.Called(ctx, bookID, genreID)
	return args.Error(0)
}

// MockSearchRepository provides mock implementation for SearchRepository
type MockSearchRepository struct {
	mock.Mock
}

func (m *MockSearchRepository) SaveSearchHistory(ctx context.Context, userID int64, query string, resultsCount int) error {
	args := m.Called(ctx, userID, query, resultsCount)
	return args.Error(0)
}

func (m *MockSearchRepository) GetUserSearchHistory(ctx context.Context, userID int64, limit int, days int) ([]*models.SearchHistoryEntry, error) {
	args := m.Called(ctx, userID, limit, days)
	return args.Get(0).([]*models.SearchHistoryEntry), args.Error(1)
}

func (m *MockSearchRepository) DeleteUserSearchHistory(ctx context.Context, userID int64, olderThanDays *int) error {
	args := m.Called(ctx, userID, olderThanDays)
	return args.Error(0)
}

func (m *MockSearchRepository) GetPopularSearches(ctx context.Context, limit int, days int) ([]interface{}, error) {
	args := m.Called(ctx, limit, days)
	return args.Get(0).([]interface{}), args.Error(1)
}

func (m *MockSearchRepository) CreateHistoryEntry(ctx context.Context, entry *models.SearchHistoryEntry) error {
	args := m.Called(ctx, entry)
	return args.Error(0)
}

func (m *MockSearchRepository) DeleteExpiredCache(ctx context.Context) error {
	args := m.Called(ctx)
	return args.Error(0)
}

func (m *MockSearchRepository) CacheSearchResults(ctx context.Context, cacheKey string, results *models.SearchResponse, ttlMinutes int) error {
	args := m.Called(ctx, cacheKey, results, ttlMinutes)
	return args.Error(0)
}

func (m *MockSearchRepository) GetCachedSearchResults(ctx context.Context, cacheKey string) (*models.SearchResponse, error) {
	args := m.Called(ctx, cacheKey)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.SearchResponse), args.Error(1)
}

// MockDownloadRepository provides mock implementation for DownloadRepository
type MockDownloadRepository struct {
	mock.Mock
}

func (m *MockDownloadRepository) Create(ctx context.Context, download *models.DownloadQueueItem) error {
	args := m.Called(ctx, download)
	return args.Error(0)
}

func (m *MockDownloadRepository) GetByID(ctx context.Context, id int64) (*models.DownloadQueueItem, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.DownloadQueueItem), args.Error(1)
}

func (m *MockDownloadRepository) Update(ctx context.Context, download *models.DownloadQueueItem) error {
	args := m.Called(ctx, download)
	return args.Error(0)
}

func (m *MockDownloadRepository) GetUserDownloads(ctx context.Context, userID int64, filters interface{}) ([]*models.DownloadQueueItem, int, error) {
	args := m.Called(ctx, userID, filters)
	return args.Get(0).([]*models.DownloadQueueItem), args.Int(1), args.Error(2)
}

func (m *MockDownloadRepository) GetPendingDownloads(ctx context.Context, limit int) ([]*models.DownloadQueueItem, error) {
	args := m.Called(ctx, limit)
	return args.Get(0).([]*models.DownloadQueueItem), args.Error(1)
}

func (m *MockDownloadRepository) GetDownloadStats(ctx context.Context, userID *int64, period string) (*models.DownloadStats, error) {
	args := m.Called(ctx, userID, period)
	return args.Get(0).(*models.DownloadStats), args.Error(1)
}

// MockIndexerRepository provides mock implementation for IndexerRepository
type MockIndexerRepository struct {
	mock.Mock
}

func (m *MockIndexerRepository) Create(ctx context.Context, indexer *models.Indexer) error {
	args := m.Called(ctx, indexer)
	return args.Error(0)
}

func (m *MockIndexerRepository) GetByID(ctx context.Context, id int64) (*models.Indexer, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Indexer), args.Error(1)
}

func (m *MockIndexerRepository) Update(ctx context.Context, indexer *models.Indexer) error {
	args := m.Called(ctx, indexer)
	return args.Error(0)
}

func (m *MockIndexerRepository) GetEnabled(ctx context.Context) ([]*models.Indexer, error) {
	args := m.Called(ctx)
	return args.Get(0).([]*models.Indexer), args.Error(1)
}

func (m *MockIndexerRepository) UpdateHealthStatus(ctx context.Context, id int64, status models.IndexerStatus, lastCheck time.Time, errorMessage *string) error {
	args := m.Called(ctx, id, status, lastCheck, errorMessage)
	return args.Error(0)
}

// MockHTTPServer provides a test HTTP server for external service testing
type MockHTTPServer struct {
	Server   *httptest.Server
	Requests []MockHTTPRequest
	mu       sync.RWMutex
}

type MockHTTPRequest struct {
	Method    string
	Path      string
	Headers   map[string]string
	Body      string
	Timestamp time.Time
}

// NewMockHTTPServer creates a new mock HTTP server
func NewMockHTTPServer() *MockHTTPServer {
	mockServer := &MockHTTPServer{
		Requests: make([]MockHTTPRequest, 0),
	}

	mockServer.Server = httptest.NewServer(http.HandlerFunc(mockServer.handler))
	return mockServer
}

// Close shuts down the mock server
func (m *MockHTTPServer) Close() {
	m.Server.Close()
}

// GetURL returns the base URL of the mock server
func (m *MockHTTPServer) GetURL() string {
	return m.Server.URL
}

// GetRequests returns all captured requests
func (m *MockHTTPServer) GetRequests() []MockHTTPRequest {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	// Return a copy to avoid race conditions
	requests := make([]MockHTTPRequest, len(m.Requests))
	copy(requests, m.Requests)
	return requests
}

// ClearRequests clears all captured requests
func (m *MockHTTPServer) ClearRequests() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Requests = m.Requests[:0]
}

// SetResponse sets a custom response for specific endpoints
var mockResponses = make(map[string]func(w http.ResponseWriter, r *http.Request))

func (m *MockHTTPServer) SetResponse(path string, handler func(w http.ResponseWriter, r *http.Request)) {
	mockResponses[path] = handler
}

func (m *MockHTTPServer) handler(w http.ResponseWriter, r *http.Request) {
	// Capture the request
	body := ""
	if r.Body != nil {
		bodyBytes := make([]byte, r.ContentLength)
		r.Body.Read(bodyBytes)
		body = string(bodyBytes)
	}

	headers := make(map[string]string)
	for k, v := range r.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}

	m.mu.Lock()
	m.Requests = append(m.Requests, MockHTTPRequest{
		Method:    r.Method,
		Path:      r.URL.Path,
		Headers:   headers,
		Body:      body,
		Timestamp: time.Now(),
	})
	m.mu.Unlock()

	// Check for custom response handlers
	if handler, exists := mockResponses[r.URL.Path]; exists {
		handler(w, r)
		return
	}

	// Default responses for common endpoints
	switch r.URL.Path {
	case "/api/v1/indexer":
		// Mock Prowlarr indexer list
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`[{"id":1,"name":"Test Indexer","protocol":"torrent","privacy":"public"}]`))
	
	case "/api/v1/search":
		// Mock Prowlarr search
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`[{"guid":"test-guid","title":"Test Book","link":"http://example.com/test.torrent","pubDate":"2023-01-01T00:00:00Z"}]`))
	
	case "/api/v2.0/indexers/all/results":
		// Mock Jackett search
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"Results":[{"Title":"Test Book","Link":"http://example.com/test.torrent","PublishDate":"2023-01-01T00:00:00Z"}]}`))
	
	default:
		// Default 404 response
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":"Not found"}`))
	}
}

// ProwlarrMockServer creates a mock server specifically for Prowlarr testing
func ProwlarrMockServer() *MockHTTPServer {
	server := NewMockHTTPServer()
	
	// Set up Prowlarr-specific responses
	server.SetResponse("/api/v1/indexer", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		indexers := `[
			{"id":1,"name":"Test Indexer 1","protocol":"torrent","privacy":"public","supportsRss":true},
			{"id":2,"name":"Test Indexer 2","protocol":"usenet","privacy":"private","supportsRss":true}
		]`
		w.Write([]byte(indexers))
	})

	server.SetResponse("/api/v1/search", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		results := `[
			{
				"guid":"test-guid-1",
				"title":"Test Book 1 by Author",
				"link":"http://example.com/test1.torrent",
				"pubDate":"2023-01-01T00:00:00Z",
				"size":1048576,
				"indexer":"Test Indexer 1"
			},
			{
				"guid":"test-guid-2", 
				"title":"Test Book 2 EPUB",
				"link":"http://example.com/test2.torrent",
				"pubDate":"2023-01-02T00:00:00Z",
				"size":2097152,
				"indexer":"Test Indexer 2"
			}
		]`
		w.Write([]byte(results))
	})

	return server
}

// JackettMockServer creates a mock server specifically for Jackett testing
func JackettMockServer() *MockHTTPServer {
	server := NewMockHTTPServer()
	
	// Set up Jackett-specific responses
	server.SetResponse("/api/v2.0/indexers", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		indexers := `[
			{"id":"testindexer1","name":"Test Indexer 1","type":"public"},
			{"id":"testindexer2","name":"Test Indexer 2","type":"private"}
		]`
		w.Write([]byte(indexers))
	})

	server.SetResponse("/api/v2.0/indexers/all/results", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		results := `{
			"Results":[
				{
					"Title":"Test Book 1 by Author",
					"Link":"http://example.com/test1.torrent",
					"PublishDate":"2023-01-01T00:00:00Z",
					"Size":1048576,
					"Tracker":"testindexer1"
				},
				{
					"Title":"Test Book 2 EPUB",
					"Link":"http://example.com/test2.torrent", 
					"PublishDate":"2023-01-02T00:00:00Z",
					"Size":2097152,
					"Tracker":"testindexer2"
				}
			]
		}`
		w.Write([]byte(results))
	})

	return server
}

// TestUser creates a test user for use in tests
func TestUser() *models.User {
	email := "test@example.com"
	return &models.User{
		ID:       1,
		Email:    &email,
		Username: "testuser",
		IsActive:  true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

// TestBook creates a test book for use in tests
func TestBook() *models.Book {
	subtitle := "A Test Subtitle"
	description := "A test book description"
	isbn13 := "9781234567890"
	pageCount := 300
	rating := 4.5
	
	return &models.Book{
		ID:            1,
		Title:         "Test Book Title",
		Subtitle:      &subtitle,
		Description:   &description,
		ISBN13:        &isbn13,
		PageCount:     &pageCount,
		RatingAverage: &rating,
		RatingCount:   100,
		Tags:          models.StringList{"fiction", "test"},
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
}

// TestSearchRequest creates a test search request
func TestSearchRequest() *models.SearchRequest {
	return &models.SearchRequest{
		Query:      "test book",
		UseCache:   true,
		Timeout:    30,
		Limit:      50,
		MinQuality: 70,
		MaxSizeMB:  100,
		Formats:    []string{"epub", "pdf"},
		Languages:  []string{"en"},
	}
}

// TestSearchResult creates a test search result
func TestSearchResult() models.SearchResult {
	author := "Test Author"
	language := "en"
	sizeBytes := int64(1048576) // 1MB
	year := 2023
	sourceURL := "http://example.com/test.torrent"
	
	return models.SearchResult{
		Title:          "Test Book Result",
		Author:         &author,
		Language:       &language,
		Format:         "epub",
		FileSizeBytes:  &sizeBytes,
		QualityScore:   85,
		RelevanceScore: 0.95,
		IndexerID:      1,
		SourceURL:      &sourceURL,
		FoundAt:        time.Now(),
		PublicationYear: &year,
		Metadata:       map[string]interface{}{"test": "metadata"},
	}
}