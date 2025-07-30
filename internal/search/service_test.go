package search

import (
	"context"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/repositories"
	"github.com/fabienpiette/folio_fox/internal/testutil"
)


// Mock MetadataProvider for testing
type MockMetadataProvider struct {
	mock.Mock
}

func (m *MockMetadataProvider) EnrichMetadata(ctx context.Context, result *models.SearchResult) (*models.Book, error) {
	args := m.Called(ctx, result)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Book), args.Error(1)
}

func (m *MockMetadataProvider) GetName() string {
	args := m.Called()
	return args.String(0)
}

func (m *MockMetadataProvider) IsEnabled() bool {
	args := m.Called()
	return args.Bool(0)
}

func TestNewService(t *testing.T) {
	mockIndexerManager := new(testutil.MockIndexerManager)
	mockBookRepo := new(testutil.MockBookRepository)
	mockSearchRepo := new(testutil.MockSearchRepository)
	logger := logrus.New()

	service := NewService(mockIndexerManager, mockBookRepo, mockSearchRepo, logger)

	assert.NotNil(t, service)
	// Note: Can't directly compare private fields, but we can test behavior
	assert.NotNil(t, service)
}

func TestService_AddMetadataProvider(t *testing.T) {
	service := createTestService()
	mockProvider := new(MockMetadataProvider)

	// Initially no providers
	assert.Empty(t, service.metadataProviders)

	service.AddMetadataProvider(mockProvider)

	assert.Len(t, service.metadataProviders, 1)
	assert.Equal(t, mockProvider, service.metadataProviders[0])

	// Add another provider
	mockProvider2 := new(MockMetadataProvider)
	service.AddMetadataProvider(mockProvider2)

	assert.Len(t, service.metadataProviders, 2)
	assert.Equal(t, mockProvider2, service.metadataProviders[1])
}

func TestService_Search_Success(t *testing.T) {
	service := createTestService()
	ctx := context.Background()
	userID := int64(123)

	request := &models.SearchRequest{
		Query:    "test book",
		UseCache: true,
		Timeout:  30,
		Limit:    50,
	}

	// Mock base response from indexer manager
	baseResponse := &models.SearchResponse{
		Query:        "test book",
		Results:      []models.SearchResult{createTestSearchResult()},
		TotalResults: 1,
		IndexersSearched: []models.IndexerSearchResult{
			{IndexerID: 1, IndexerName: "Test Indexer", ResultCount: 1, ResponseTimeMS: 200},
		},
		SearchDurationMS: 300,
		Cached:           false,
	}

	// We can't directly access private fields, so we'll setup the mock differently
	mockIndexerManager := service.indexerManager.(*testutil.MockIndexerManager)
	mockIndexerManager.On("Search", ctx, userID, mock.AnythingOfType("*models.SearchRequest")).Return(baseResponse, nil)

	response, err := service.Search(ctx, userID, request)

	require.NoError(t, err)
	assert.NotNil(t, response)
	assert.Equal(t, "test book", response.Query)
	assert.Len(t, response.Results, 1)
	assert.Greater(t, response.Results[0].RelevanceScore, 0.0)
	assert.GreaterOrEqual(t, response.Results[0].QualityScore, 0)

	mockIndexerManager.AssertExpectations(t)
}

func TestService_Search_IndexerManagerError(t *testing.T) {
	service := createTestService()
	ctx := context.Background()
	userID := int64(123)

	request := &models.SearchRequest{
		Query: "test book",
	}

	// Mock indexer manager to return error  
	mockIndexerManager := service.indexerManager.(*testutil.MockIndexerManager)
	mockIndexerManager.On("Search", ctx, userID, mock.AnythingOfType("*models.SearchRequest")).Return((*models.SearchResponse)(nil), assert.AnError)

	response, err := service.Search(ctx, userID, request)

	assert.Error(t, err)
	assert.Nil(t, response)
	assert.Contains(t, err.Error(), "base search failed")

	mockIndexerManager.AssertExpectations(t)
}

func TestService_SearchLibrary_WithQuery(t *testing.T) {
	service := createTestService()
	ctx := context.Background()
	query := "test book"
	filters := &repositories.BookFilters{}

	expectedBooks := []*models.Book{testutil.TestBook()}

	mockBookRepo := service.bookRepo.(*testutil.MockBookRepository)
	mockBookRepo.On("Search", ctx, query, filters).Return(expectedBooks, 1, nil)

	books, count, err := service.SearchLibrary(ctx, query, filters)

	require.NoError(t, err)
	assert.Equal(t, expectedBooks, books)
	assert.Equal(t, 1, count)

	mockBookRepo.AssertExpectations(t)
}

func TestService_SearchLibrary_WithoutQuery(t *testing.T) {
	service := createTestService()
	ctx := context.Background()
	query := ""
	filters := &repositories.BookFilters{}

	expectedBooks := []*models.Book{testutil.TestBook()}

	mockBookRepo := service.bookRepo.(*testutil.MockBookRepository) 
	mockBookRepo.On("List", ctx, filters).Return(expectedBooks, 1, nil)

	books, count, err := service.SearchLibrary(ctx, query, filters)

	require.NoError(t, err)
	assert.Equal(t, expectedBooks, books)
	assert.Equal(t, 1, count)

	mockBookRepo.AssertExpectations(t)
}

func TestService_GetSuggestions_ByType(t *testing.T) {
	service := createTestService()
	ctx := context.Background()
	userID := int64(123)
	partialQuery := "test"
	limit := 10

	tests := []struct {
		name           string
		suggestionType string
	}{
		{"title suggestions", "title"},
		{"author suggestions", "author"},
		{"series suggestions", "series"},
		{"genre suggestions", "genre"},
		{"all suggestions", "all"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			suggestions, err := service.GetSuggestions(ctx, userID, partialQuery, tt.suggestionType, limit)

			// Since our implementation returns empty slices for now, we just check for no error
			assert.NoError(t, err)
			assert.NotNil(t, suggestions)
		})
	}
}

func TestService_preprocessSearchRequest(t *testing.T) {
	service := createTestService()

	tests := []struct {
		name     string
		input    *models.SearchRequest
		expected string
	}{
		{
			name:     "normal query",
			input:    &models.SearchRequest{Query: "test book"},
			expected: "test book",
		},
		{
			name:     "query with extra whitespace",
			input:    &models.SearchRequest{Query: "  test   book  "},
			expected: "test book",
		},
		{
			name:     "empty query",
			input:    &models.SearchRequest{Query: ""},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.preprocessSearchRequest(tt.input)
			assert.Equal(t, tt.expected, result.Query)
		})
	}
}

func TestService_preprocessQuery(t *testing.T) {
	service := createTestService()

	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "normal query",
			input:    "test book",
			expected: "test book",
		},
		{
			name:     "query with extra whitespace",
			input:    "  test   book  ",
			expected: "test book",
		},
		{
			name:     "query with abbreviations",
			input:    "scifi book",
			expected: "science fiction book",
		},
		{
			name:     "query with special characters",
			input:    "test[book]",
			expected: "testbook",
		},
		{
			name:     "empty query",
			input:    "",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.preprocessQuery(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestService_calculateEnhancedRelevance(t *testing.T) {
	service := createTestService()

	tests := []struct {
		name     string
		query    string
		result   *models.SearchResult
		minScore float64
		maxScore float64
	}{
		{
			name:     "exact title match",
			query:    "test book",
			result:   &models.SearchResult{Title: "Test Book", IndexerID: 1, Format: "epub"},
			minScore: 0.5,
			maxScore: 1.0,
		},
		{
			name:     "partial title match",
			query:    "test",
			result:   &models.SearchResult{Title: "Test Book Title", IndexerID: 1, Format: "epub"},
			minScore: 0.1,
			maxScore: 1.0,
		},
		{
			name:     "no match",
			query:    "nonexistent",
			result:   &models.SearchResult{Title: "Different Book", IndexerID: 1, Format: "epub"},
			minScore: 0.0,
			maxScore: 0.2,
		},
		{
			name:     "author match",
			query:    "test author",
			result:   &models.SearchResult{Title: "Some Book", Author: stringPtr("Test Author"), IndexerID: 1, Format: "epub"},
			minScore: 0.1,
			maxScore: 1.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			score := service.calculateEnhancedRelevance(tt.query, tt.result)
			assert.GreaterOrEqual(t, score, tt.minScore)
			assert.LessOrEqual(t, score, tt.maxScore)
		})
	}
}

func TestService_enhanceQualityScore(t *testing.T) {
	service := createTestService()

	tests := []struct {
		name          string
		result        *models.SearchResult
		expectedDelta int // How much we expect the score to change
	}{
		{
			name: "epub format bonus",
			result: &models.SearchResult{
				QualityScore: 70,
				Format:       "epub",
			},
			expectedDelta: 10, // Should get EPUB bonus
		},
		{
			name: "pdf format bonus",
			result: &models.SearchResult{
				QualityScore: 70,
				Format:       "pdf",
			},
			expectedDelta: 5, // Should get smaller PDF bonus
		},
		{
			name: "txt format penalty",
			result: &models.SearchResult{
				QualityScore: 70,
				Format:       "txt",
			},
			expectedDelta: -10, // Should get TXT penalty
		},
		{
			name: "retail quality indicator",
			result: &models.SearchResult{
				Title:        "Test Book [Retail]",
				QualityScore: 70,
				Format:       "epub",
			},
			expectedDelta: 25, // 10 for epub + 15 for retail
		},
		{
			name: "reasonable file size",
			result: &models.SearchResult{
				QualityScore:  70,
				Format:        "epub",
				FileSizeBytes: int64Ptr(5 * 1024 * 1024), // 5MB
			},
			expectedDelta: 20, // 10 for epub + 10 for reasonable size
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			originalScore := tt.result.QualityScore
			newScore := service.enhanceQualityScore(tt.result)
			actualDelta := newScore - originalScore

			assert.Equal(t, tt.expectedDelta, actualDelta, 
				"Expected quality score to change by %d, but got %d (original: %d, new: %d)",
				tt.expectedDelta, actualDelta, originalScore, newScore)
		})
	}
}

func TestService_applyAdvancedFilters(t *testing.T) {
	service := createTestService()

	results := []models.SearchResult{
		{
			Title:         "Book 1",
			Format:        "epub",
			QualityScore:  80,
			FileSizeBytes: int64Ptr(5 * 1024 * 1024), // 5MB
			Language:      stringPtr("en"),
		},
		{
			Title:         "Book 2",
			Format:        "pdf",
			QualityScore:  60, // Below quality threshold
			FileSizeBytes: int64Ptr(10 * 1024 * 1024), // 10MB
			Language:      stringPtr("fr"),
		},
		{
			Title:         "Book 3",
			Format:        "txt", // Not in allowed formats
			QualityScore:  90,
			FileSizeBytes: int64Ptr(1 * 1024 * 1024), // 1MB
			Language:      stringPtr("en"),
		},
		{
			Title:         "Book 4",
			Format:        "epub",
			QualityScore:  85,
			FileSizeBytes: int64Ptr(200 * 1024 * 1024), // 200MB - too large
			Language:      stringPtr("en"),
		},
	}

	request := &models.SearchRequest{
		Formats:    []string{"epub", "pdf"},
		Languages:  []string{"en"},
		MinQuality: 70,
		MaxSizeMB:  100,
	}

	filtered := service.applyAdvancedFilters(results, request)

	// Only Book 1 should pass all filters
	assert.Len(t, filtered, 1)
	assert.Equal(t, "Book 1", filtered[0].Title)
}

func TestService_advancedRanking(t *testing.T) {
	service := createTestService()

	results := []models.SearchResult{
		{
			Title:          "Book B",
			QualityScore:   70,
			RelevanceScore: 0.8,
			FileSizeBytes:  int64Ptr(10 * 1024 * 1024),
			FoundAt:        time.Now(),
		},
		{
			Title:          "Book A",
			QualityScore:   90,
			RelevanceScore: 0.9,
			FileSizeBytes:  int64Ptr(5 * 1024 * 1024),
			FoundAt:        time.Now(),
		},
		{
			Title:          "Book C",
			QualityScore:   80,
			RelevanceScore: 0.7,
			FileSizeBytes:  int64Ptr(15 * 1024 * 1024),
			FoundAt:        time.Now(),
		},
	}

	ranked := service.advancedRanking(results, "test query")

	// Should be sorted by final score (relevance + quality + freshness + popularity)
	assert.Len(t, ranked, 3)
	
	// Verify order - Book A should be first (highest relevance + quality)
	assert.Equal(t, "Book A", ranked[0].Title)
	
	// All results should have updated relevance scores
	for _, result := range ranked {
		assert.Greater(t, result.RelevanceScore, 0.0)
	}
}

func TestService_isAuthorSearch(t *testing.T) {
	service := createTestService()

	tests := []struct {
		query    string
		expected bool
	}{
		{"by Stephen King", true},
		{"author: John Doe", true},
		{"written by Jane Smith", true},
		{"Book Title by Author", true},
		{"just a book title", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.query, func(t *testing.T) {
			result := service.isAuthorSearch(tt.query)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestService_isSeriesSearch(t *testing.T) {
	service := createTestService()

	tests := []struct {
		query    string
		expected bool
	}{
		{"Harry Potter series", true},
		{"Book 1 of series", true},
		{"Volume 2", true},
		{"Part one", true},
		{"just a title", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.query, func(t *testing.T) {
			result := service.isSeriesSearch(tt.query)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestService_expandAbbreviations(t *testing.T) {
	service := createTestService()

	tests := []struct {
		input    string
		expected string
	}{
		{"scifi book", "science fiction book"},
		{"sf novel", "science fiction novel"},
		{"ya romance", "young adult romance"},
		{"nf biography", "non fiction biography"},
		{"regular text", "regular text"},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := service.expandAbbreviations(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestService_sanitizeQuery(t *testing.T) {
	service := createTestService()

	tests := []struct {
		input    string
		expected string
	}{
		{"normal query", "normal query"},
		{"query [with] brackets", "query with brackets"},
		{"query (with) parentheses", "query with parentheses"},
		{"query \"with\" quotes", "query with quotes"},
		{"query {with} braces", "query with braces"},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := service.sanitizeQuery(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestService_extractYear(t *testing.T) {
	service := createTestService()

	tests := []struct {
		title    string
		expected int
	}{
		{"Book Title 2023", 2023},
		{"2020 Book Title", 2020},
		{"Book 1995 Edition", 1995},
		{"Book Title", 0}, // No year
		{"Book 1800", 1800}, // Edge case - valid year
		{"Book 1799", 0},    // Too old
		{"Book 2030", 0},    // Future year (beyond current year)
		{"Book 12345", 0},   // Not a 4-digit year
	}

	for _, tt := range tests {
		t.Run(tt.title, func(t *testing.T) {
			result := service.extractYear(tt.title)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestService_passesAdvancedQualityFilters(t *testing.T) {
	service := createTestService()

	tests := []struct {
		name     string
		result   *models.SearchResult
		expected bool
	}{
		{
			name:     "clean title",
			result:   &models.SearchResult{Title: "Clean Book Title"},
			expected: true,
		},
		{
			name:     "title with cam indicator",
			result:   &models.SearchResult{Title: "Book Title CAM"},
			expected: false,
		},
		{
			name:     "title with sample indicator",
			result:   &models.SearchResult{Title: "Sample Book Title"},
			expected: false,
		},
		{
			name:     "title with virus indicator",
			result:   &models.SearchResult{Title: "Book Title [VIRUS]"},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.passesAdvancedQualityFilters(tt.result)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Benchmark tests
func BenchmarkService_Search(b *testing.B) {
	service := createTestService()
	ctx := context.Background()
	userID := int64(123)

	request := &models.SearchRequest{
		Query:   "benchmark test",
		Timeout: 30,
		Limit:   50,
	}

	baseResponse := &models.SearchResponse{
		Query:   "benchmark test",
		Results: []models.SearchResult{createTestSearchResult()},
	}

	mockIndexerManager := service.indexerManager.(*testutil.MockIndexerManager)
	mockIndexerManager.On("Search", mock.Anything, mock.Anything, mock.Anything).Return(baseResponse, nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := service.Search(ctx, userID, request)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkService_calculateEnhancedRelevance(b *testing.B) {
	service := createTestService()
	query := "test book query"
	result := &models.SearchResult{
		Title:     "Test Book Query Result",
		Author:    stringPtr("Test Author"),
		IndexerID: 1,
		Format:    "epub",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		service.calculateEnhancedRelevance(query, result)
	}
}

func BenchmarkService_enhanceQualityScore(b *testing.B) {
	service := createTestService()
	result := &models.SearchResult{
		Title:         "Test Book [Retail]",
		QualityScore:  70,
		Format:        "epub",
		FileSizeBytes: int64Ptr(5 * 1024 * 1024),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		service.enhanceQualityScore(result)
	}
}

// Helper functions
func createTestService() *Service {
	mockIndexerManager := new(testutil.MockIndexerManager)
	mockBookRepo := new(testutil.MockBookRepository)
	mockSearchRepo := new(testutil.MockSearchRepository)
	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel) // Reduce log noise in tests

	return NewService(mockIndexerManager, mockBookRepo, mockSearchRepo, logger)
}

func createTestSearchResult() models.SearchResult {
	return models.SearchResult{
		IndexerID:      1,
		IndexerName:    "Test Indexer",
		Title:          "Test Book Title",
		Author:         stringPtr("Test Author"),
		Format:         "epub",
		QualityScore:   80,
		FileSizeBytes:  int64Ptr(5 * 1024 * 1024),
		DownloadURL:    "http://example.com/download",
		Language:       stringPtr("en"),
		FoundAt:        time.Now(),
		RelevanceScore: 0.5,
	}
}

func stringPtr(s string) *string {
	return &s
}

func int64Ptr(i int64) *int64 {
	return &i
}