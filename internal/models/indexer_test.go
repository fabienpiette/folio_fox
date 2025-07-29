package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIndexerType_Constants(t *testing.T) {
	assert.Equal(t, IndexerType("public"), IndexerTypePublic)
	assert.Equal(t, IndexerType("private"), IndexerTypePrivate)
	assert.Equal(t, IndexerType("semi-private"), IndexerTypeSemiPrivate)
}

func TestIndexerStatus_Constants(t *testing.T) {
	assert.Equal(t, IndexerStatus("healthy"), IndexerStatusHealthy)
	assert.Equal(t, IndexerStatus("degraded"), IndexerStatusDegraded)
	assert.Equal(t, IndexerStatus("down"), IndexerStatusDown)
	assert.Equal(t, IndexerStatus("maintenance"), IndexerStatusMaintenance)
}

func TestIndexer_JSONSerialization(t *testing.T) {
	apiEndpoint := "/api/v1/search"
	userAgent := "FolioFox/1.0"
	description := "Test indexer description"
	website := "https://testindexer.com"
	status := IndexerStatusHealthy
	lastHealthCheck := time.Now().UTC().Truncate(time.Second)
	responseTime := 150
	errorMessage := "No errors"

	indexer := &Indexer{
		ID:                1,
		Name:              "Test Indexer",
		BaseURL:           "https://testindexer.com",
		APIEndpoint:       &apiEndpoint,
		IndexerType:       IndexerTypePublic,
		SupportsSearch:    true,
		SupportsDownload:  true,
		IsActive:          true,
		Priority:          1,
		RateLimitRequests: 60,
		RateLimitWindow:   60,
		TimeoutSeconds:    30,
		UserAgent:         &userAgent,
		Description:       &description,
		Website:           &website,
		CreatedAt:         time.Now().UTC().Truncate(time.Second),
		UpdatedAt:         time.Now().UTC().Truncate(time.Second),
		Status:            &status,
		LastHealthCheck:   &lastHealthCheck,
		ResponseTimeMS:    &responseTime,
		ErrorMessage:      &errorMessage,
	}

	jsonData, err := json.Marshal(indexer)
	require.NoError(t, err)

	var unmarshaled Indexer
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, indexer.ID, unmarshaled.ID)
	assert.Equal(t, indexer.Name, unmarshaled.Name)
	assert.Equal(t, indexer.BaseURL, unmarshaled.BaseURL)
	assert.Equal(t, *indexer.APIEndpoint, *unmarshaled.APIEndpoint)
	assert.Equal(t, indexer.IndexerType, unmarshaled.IndexerType)
	assert.Equal(t, indexer.SupportsSearch, unmarshaled.SupportsSearch)
	assert.Equal(t, indexer.SupportsDownload, unmarshaled.SupportsDownload)
	assert.Equal(t, indexer.IsActive, unmarshaled.IsActive)
	assert.Equal(t, indexer.Priority, unmarshaled.Priority)
	assert.Equal(t, indexer.RateLimitRequests, unmarshaled.RateLimitRequests)
	assert.Equal(t, indexer.RateLimitWindow, unmarshaled.RateLimitWindow)
	assert.Equal(t, indexer.TimeoutSeconds, unmarshaled.TimeoutSeconds)
	assert.Equal(t, *indexer.UserAgent, *unmarshaled.UserAgent)
	assert.Equal(t, *indexer.Description, *unmarshaled.Description)
	assert.Equal(t, *indexer.Website, *unmarshaled.Website)
	assert.Equal(t, *indexer.Status, *unmarshaled.Status)
	assert.Equal(t, *indexer.ResponseTimeMS, *unmarshaled.ResponseTimeMS)
}

func TestUserIndexerConfig_JSONSerialization(t *testing.T) {
	apiKey := "test-api-key"
	username := "testuser"
	customSettings := `{"setting1": "value1", "setting2": true}`
	lastTestDate := time.Now().UTC().Truncate(time.Second)
	lastTestSuccess := true

	config := &UserIndexerConfig{
		ID:              1,
		UserID:          100,
		IndexerID:       1,
		IsEnabled:       true,
		APIKey:          &apiKey,
		Username:        &username,
		CustomSettings:  &customSettings,
		LastTestDate:    &lastTestDate,
		LastTestSuccess: &lastTestSuccess,
		CreatedAt:       time.Now().UTC().Truncate(time.Second),
		UpdatedAt:       time.Now().UTC().Truncate(time.Second),
	}

	jsonData, err := json.Marshal(config)
	require.NoError(t, err)

	// Verify password hash is not included in JSON
	jsonStr := string(jsonData)
	assert.NotContains(t, jsonStr, "password_hash")

	var unmarshaled UserIndexerConfig
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, config.ID, unmarshaled.ID)
	assert.Equal(t, config.UserID, unmarshaled.UserID)
	assert.Equal(t, config.IndexerID, unmarshaled.IndexerID)
	assert.Equal(t, config.IsEnabled, unmarshaled.IsEnabled)
	assert.Equal(t, *config.APIKey, *unmarshaled.APIKey)
	assert.Equal(t, *config.Username, *unmarshaled.Username)
	assert.Equal(t, *config.CustomSettings, *unmarshaled.CustomSettings)
	assert.Equal(t, *config.LastTestSuccess, *unmarshaled.LastTestSuccess)
}

func TestIndexerHealth_JSONSerialization(t *testing.T) {
	responseTime := 200
	errorMessage := "Connection timeout"

	health := &IndexerHealth{
		ID:             1,
		IndexerID:      1,
		Status:         IndexerStatusDegraded,
		ResponseTimeMS: &responseTime,
		ErrorMessage:   &errorMessage,
		CheckedAt:      time.Now().UTC().Truncate(time.Second),
	}

	jsonData, err := json.Marshal(health)
	require.NoError(t, err)

	var unmarshaled IndexerHealth
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, health.ID, unmarshaled.ID)
	assert.Equal(t, health.IndexerID, unmarshaled.IndexerID)
	assert.Equal(t, health.Status, unmarshaled.Status)
	assert.Equal(t, *health.ResponseTimeMS, *unmarshaled.ResponseTimeMS)
	assert.Equal(t, *health.ErrorMessage, *unmarshaled.ErrorMessage)
	assert.Equal(t, health.CheckedAt.Unix(), unmarshaled.CheckedAt.Unix())
}

func TestSearchResult_JSONSerialization(t *testing.T) {
	author := "Test Author"
	description := "Test book description"
	fileSizeBytes := int64(1048576)
	sourceURL := "https://example.com/source"
	language := "en"
	year := 2023
	isbn := "9781234567890"
	coverURL := "https://example.com/cover.jpg"

	result := &SearchResult{
		IndexerID:       1,
		IndexerName:     "Test Indexer",
		Title:           "Test Book",
		Author:          &author,
		Description:     &description,
		Format:          "epub",
		FileSizeBytes:   &fileSizeBytes,
		FileSizeHuman:   "1.0 MB",
		QualityScore:    85,
		DownloadURL:     "https://example.com/download",
		SourceURL:       &sourceURL,
		Language:        &language,
		PublicationYear: &year,
		ISBN:            &isbn,
		CoverURL:        &coverURL,
		Tags:            []string{"fiction", "test"},
		Metadata: map[string]interface{}{
			"source": "test",
			"quality": "high",
		},
		FoundAt:        time.Now().UTC().Truncate(time.Second),
		RelevanceScore: 0.95,
	}

	jsonData, err := json.Marshal(result)
	require.NoError(t, err)

	var unmarshaled SearchResult
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, result.IndexerID, unmarshaled.IndexerID)
	assert.Equal(t, result.IndexerName, unmarshaled.IndexerName)
	assert.Equal(t, result.Title, unmarshaled.Title)
	assert.Equal(t, *result.Author, *unmarshaled.Author)
	assert.Equal(t, *result.Description, *unmarshaled.Description)
	assert.Equal(t, result.Format, unmarshaled.Format)
	assert.Equal(t, *result.FileSizeBytes, *unmarshaled.FileSizeBytes)
	assert.Equal(t, result.FileSizeHuman, unmarshaled.FileSizeHuman)
	assert.Equal(t, result.QualityScore, unmarshaled.QualityScore)
	assert.Equal(t, result.DownloadURL, unmarshaled.DownloadURL)
	assert.Equal(t, *result.Language, *unmarshaled.Language)
	assert.Equal(t, *result.PublicationYear, *unmarshaled.PublicationYear)
	assert.Equal(t, *result.ISBN, *unmarshaled.ISBN)
	assert.Equal(t, result.Tags, unmarshaled.Tags)
	assert.Equal(t, result.Metadata, unmarshaled.Metadata)
	assert.Equal(t, result.RelevanceScore, unmarshaled.RelevanceScore)
}

func TestSearchRequest_JSONSerialization(t *testing.T) {
	request := &SearchRequest{
		Query:      "test book",
		Indexers:   []int64{1, 2, 3},
		Formats:    []string{"epub", "pdf"},
		Languages:  []string{"en", "fr"},
		MinQuality: 70,
		MaxSizeMB:  100,
		Timeout:    30,
		Limit:      50,
		UseCache:   true,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled SearchRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, request.Query, unmarshaled.Query)
	assert.Equal(t, request.Indexers, unmarshaled.Indexers)
	assert.Equal(t, request.Formats, unmarshaled.Formats)
	assert.Equal(t, request.Languages, unmarshaled.Languages)
	assert.Equal(t, request.MinQuality, unmarshaled.MinQuality)
	assert.Equal(t, request.MaxSizeMB, unmarshaled.MaxSizeMB)
	assert.Equal(t, request.Timeout, unmarshaled.Timeout)
	assert.Equal(t, request.Limit, unmarshaled.Limit)
	assert.Equal(t, request.UseCache, unmarshaled.UseCache)
}

func TestSearchResponse_JSONSerialization(t *testing.T) {
	cacheExpiresAt := time.Now().Add(1 * time.Hour).UTC().Truncate(time.Second)

	response := &SearchResponse{
		Query:        "test search",
		Results:      []SearchResult{},
		TotalResults: 25,
		IndexersSearched: []IndexerSearchResult{
			{
				IndexerID:      1,
				IndexerName:    "Test Indexer",
				ResultCount:    15,
				ResponseTimeMS: 200,
			},
			{
				IndexerID:      2,
				IndexerName:    "Another Indexer",
				ResultCount:    10,
				ResponseTimeMS: 350,
				Error:          stringPtr("Connection timeout"),
			},
		},
		SearchDurationMS: 500,
		Cached:           true,
		CacheExpiresAt:   &cacheExpiresAt,
	}

	jsonData, err := json.Marshal(response)
	require.NoError(t, err)

	var unmarshaled SearchResponse
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, response.Query, unmarshaled.Query)
	assert.Equal(t, response.TotalResults, unmarshaled.TotalResults)
	assert.Len(t, unmarshaled.IndexersSearched, 2)
	assert.Equal(t, response.IndexersSearched[0].IndexerID, unmarshaled.IndexersSearched[0].IndexerID)
	assert.Equal(t, response.IndexersSearched[0].ResultCount, unmarshaled.IndexersSearched[0].ResultCount)
	assert.Equal(t, response.SearchDurationMS, unmarshaled.SearchDurationMS)
	assert.Equal(t, response.Cached, unmarshaled.Cached)
	assert.Equal(t, response.CacheExpiresAt.Unix(), unmarshaled.CacheExpiresAt.Unix())
}

func TestSearchHistoryEntry_JSONSerialization(t *testing.T) {
	filters := map[string]interface{}{
		"formats":    []string{"epub", "pdf"},
		"min_quality": 70,
	}
	indexersSearched := []int64{1, 2, 3}

	entry := &SearchHistoryEntry{
		ID:               1,
		UserID:           100,
		Query:            "historical search",
		Filters:          filters,
		ResultsCount:     42,
		IndexersSearched: indexersSearched,
		SearchDurationMS: 750,
		SearchedAt:       time.Now().UTC().Truncate(time.Second),
	}

	jsonData, err := json.Marshal(entry)
	require.NoError(t, err)

	var unmarshaled SearchHistoryEntry
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, entry.ID, unmarshaled.ID)
	assert.Equal(t, entry.UserID, unmarshaled.UserID)
	assert.Equal(t, entry.Query, unmarshaled.Query)
	assert.Equal(t, entry.ResultsCount, unmarshaled.ResultsCount)
	assert.Equal(t, entry.IndexersSearched, unmarshaled.IndexersSearched)
	assert.Equal(t, entry.SearchDurationMS, unmarshaled.SearchDurationMS)
	
	// Check filters - JSON unmarshaling changes types
	assert.NotNil(t, unmarshaled.Filters)
	formats, ok := unmarshaled.Filters["formats"].([]interface{})
	require.True(t, ok, "formats should be []interface{}")
	assert.Len(t, formats, 2)
	assert.Equal(t, "epub", formats[0])
	assert.Equal(t, "pdf", formats[1])
	assert.Equal(t, float64(70), unmarshaled.Filters["min_quality"]) // JSON unmarshals numbers as float64
}

func TestIndexerTestResult_JSONSerialization(t *testing.T) {
	errorMessage := "Invalid API key"
	version := "v1.2.3"

	result := &IndexerTestResult{
		IndexerID:      1,
		Success:        false,
		ResponseTimeMS: 500,
		ErrorMessage:   &errorMessage,
		Capabilities:   []string{"search", "download"},
		Version:        &version,
	}

	jsonData, err := json.Marshal(result)
	require.NoError(t, err)

	var unmarshaled IndexerTestResult
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, result.IndexerID, unmarshaled.IndexerID)
	assert.Equal(t, result.Success, unmarshaled.Success)
	assert.Equal(t, result.ResponseTimeMS, unmarshaled.ResponseTimeMS)
	assert.Equal(t, *result.ErrorMessage, *unmarshaled.ErrorMessage)
	assert.Equal(t, result.Capabilities, unmarshaled.Capabilities)
	assert.Equal(t, *result.Version, *unmarshaled.Version)
}

func TestProwlarrConfig_JSONSerialization(t *testing.T) {
	lastSync := time.Now().UTC().Truncate(time.Second)
	version := "0.4.0"

	config := &ProwlarrConfig{
		Enabled:           true,
		BaseURL:           "http://localhost:9696",
		APIKey:            "test-api-key",
		TimeoutSeconds:    30,
		RateLimitRequests: 60,
		RateLimitWindow:   60,
		SyncIntervalHours: 24,
		LastSync:          &lastSync,
		Version:           &version,
		Status:            "connected",
	}

	jsonData, err := json.Marshal(config)
	require.NoError(t, err)

	var unmarshaled ProwlarrConfig
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, config.Enabled, unmarshaled.Enabled)
	assert.Equal(t, config.BaseURL, unmarshaled.BaseURL)
	assert.Equal(t, config.APIKey, unmarshaled.APIKey)
	assert.Equal(t, config.TimeoutSeconds, unmarshaled.TimeoutSeconds)
	assert.Equal(t, config.RateLimitRequests, unmarshaled.RateLimitRequests)
	assert.Equal(t, config.SyncIntervalHours, unmarshaled.SyncIntervalHours)
	assert.Equal(t, config.LastSync.Unix(), unmarshaled.LastSync.Unix())
	assert.Equal(t, *config.Version, *unmarshaled.Version)
	assert.Equal(t, config.Status, unmarshaled.Status)
}

func TestProwlarrIndexer_JSONSerialization(t *testing.T) {
	description := "Test Prowlarr indexer"
	lastRSSSync := time.Now().UTC().Truncate(time.Second)
	localIndexerID := int64(42)

	indexer := &ProwlarrIndexer{
		ProwlarrID:     123,
		Name:           "Test Prowlarr Indexer",
		Description:    &description,
		Language:       "en-US",
		Type:           "public",
		Protocol:       "torrent",
		Categories:     []int{7000, 7020},
		Capabilities:   []string{"search", "tv-search", "movie-search"},
		IsEnabled:      true,
		Priority:       1,
		LastRSSSync:    &lastRSSSync,
		LocalIndexerID: &localIndexerID,
	}

	jsonData, err := json.Marshal(indexer)
	require.NoError(t, err)

	var unmarshaled ProwlarrIndexer
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, indexer.ProwlarrID, unmarshaled.ProwlarrID)
	assert.Equal(t, indexer.Name, unmarshaled.Name)
	assert.Equal(t, *indexer.Description, *unmarshaled.Description)
	assert.Equal(t, indexer.Language, unmarshaled.Language)
	assert.Equal(t, indexer.Type, unmarshaled.Type)
	assert.Equal(t, indexer.Protocol, unmarshaled.Protocol)
	assert.Equal(t, indexer.Categories, unmarshaled.Categories)
	assert.Equal(t, indexer.Capabilities, unmarshaled.Capabilities)
	assert.Equal(t, indexer.IsEnabled, unmarshaled.IsEnabled)
	assert.Equal(t, indexer.Priority, unmarshaled.Priority)
	assert.Equal(t, indexer.LastRSSSync.Unix(), unmarshaled.LastRSSSync.Unix())
	assert.Equal(t, *indexer.LocalIndexerID, *unmarshaled.LocalIndexerID)
}

func TestJackettConfig_JSONSerialization(t *testing.T) {
	version := "0.20.0"

	config := &JackettConfig{
		Enabled:           true,
		BaseURL:           "http://localhost:9117",
		APIKey:            "jackett-api-key",
		TimeoutSeconds:    30,
		RateLimitRequests: 60,
		RateLimitWindow:   60,
		Version:           &version,
		Status:            "connected",
	}

	jsonData, err := json.Marshal(config)
	require.NoError(t, err)

	var unmarshaled JackettConfig
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, config.Enabled, unmarshaled.Enabled)
	assert.Equal(t, config.BaseURL, unmarshaled.BaseURL)
	assert.Equal(t, config.APIKey, unmarshaled.APIKey)
	assert.Equal(t, config.TimeoutSeconds, unmarshaled.TimeoutSeconds)
	assert.Equal(t, config.RateLimitRequests, unmarshaled.RateLimitRequests)
	assert.Equal(t, config.RateLimitWindow, unmarshaled.RateLimitWindow)
	assert.Equal(t, *config.Version, *unmarshaled.Version)
	assert.Equal(t, config.Status, unmarshaled.Status)
}

func TestJackettIndexer_JSONSerialization(t *testing.T) {
	description := "Test Jackett indexer"
	isWorking := true
	lastError := "Rate limit exceeded"

	indexer := &JackettIndexer{
		JackettID:    "testindexer",
		Name:         "Test Jackett Indexer",
		Description:  &description,
		Language:     "en-US",
		Type:         "public",
		Category:     "Books",
		IsConfigured: true,
		IsWorking:    &isWorking,
		LastError:    &lastError,
		Capabilities: []string{"search", "book-search"},
	}

	jsonData, err := json.Marshal(indexer)
	require.NoError(t, err)

	var unmarshaled JackettIndexer
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, indexer.JackettID, unmarshaled.JackettID)
	assert.Equal(t, indexer.Name, unmarshaled.Name)
	assert.Equal(t, *indexer.Description, *unmarshaled.Description)
	assert.Equal(t, indexer.Language, unmarshaled.Language)
	assert.Equal(t, indexer.Type, unmarshaled.Type)
	assert.Equal(t, indexer.Category, unmarshaled.Category)
	assert.Equal(t, indexer.IsConfigured, unmarshaled.IsConfigured)
	assert.Equal(t, *indexer.IsWorking, *unmarshaled.IsWorking)
	assert.Equal(t, *indexer.LastError, *unmarshaled.LastError)
	assert.Equal(t, indexer.Capabilities, unmarshaled.Capabilities)
}

// Benchmark tests
func BenchmarkSearchResult_JSONMarshal(b *testing.B) {
	author := "Benchmark Author"
	fileSizeBytes := int64(1048576)
	result := &SearchResult{
		IndexerID:     1,
		IndexerName:   "Benchmark Indexer",
		Title:         "Benchmark Book Title",
		Author:        &author,
		Format:        "epub",
		FileSizeBytes: &fileSizeBytes,
		FileSizeHuman: "1.0 MB",
		QualityScore:  85,
		DownloadURL:   "https://example.com/download",
		Tags:          []string{"fiction", "benchmark", "test"},
		Metadata: map[string]interface{}{
			"source":     "benchmark",
			"quality":    "high",
			"compressed": true,
		},
		FoundAt:        time.Now(),
		RelevanceScore: 0.95,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		json.Marshal(result)
	}
}

func BenchmarkSearchResponse_JSONMarshal(b *testing.B) {
	// Create response with multiple results
	results := make([]SearchResult, 50)
	for i := 0; i < 50; i++ {
		author := "Author " + string(rune(i+'A'))
		results[i] = SearchResult{
			IndexerID:      int64(i%5 + 1),
			IndexerName:    "Indexer " + string(rune(i%5+'A')),
			Title:          "Book Title " + string(rune(i+'A')),
			Author:         &author,
			Format:         "epub",
			QualityScore:   80 + i%20,
			DownloadURL:    "https://example.com/download/" + string(rune(i+'A')),
			FoundAt:        time.Now(),
			RelevanceScore: float64(100-i) / 100.0,
		}
	}

	response := &SearchResponse{
		Query:            "benchmark search",
		Results:          results,
		TotalResults:     50,
		IndexersSearched: make([]IndexerSearchResult, 5),
		SearchDurationMS: 500,
		Cached:           false,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		json.Marshal(response)
	}
}

// Test edge cases and validation
func TestSearchRequest_EmptyQuery(t *testing.T) {
	request := &SearchRequest{
		Query:   "",
		Timeout: 30,
		Limit:   50,
	}

	jsonData, err := json.Marshal(request)
	require.NoError(t, err)

	var unmarshaled SearchRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, "", unmarshaled.Query)
}

func TestIndexer_WithNilOptionalFields(t *testing.T) {
	indexer := &Indexer{
		ID:                1,
		Name:              "Basic Indexer",
		BaseURL:           "https://basic.com",
		IndexerType:       IndexerTypePublic,
		SupportsSearch:    true,
		SupportsDownload:  false,
		IsActive:          true,
		Priority:          1,
		RateLimitRequests: 60,
		RateLimitWindow:   60,
		TimeoutSeconds:    30,
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}

	jsonData, err := json.Marshal(indexer)
	require.NoError(t, err)

	var unmarshaled Indexer
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, indexer.Name, unmarshaled.Name)
	assert.Nil(t, unmarshaled.APIEndpoint)
	assert.Nil(t, unmarshaled.UserAgent)
	assert.Nil(t, unmarshaled.Description)
	assert.Nil(t, unmarshaled.Website)
	assert.Nil(t, unmarshaled.Status)
	assert.Nil(t, unmarshaled.LastHealthCheck)
	assert.Nil(t, unmarshaled.ResponseTimeMS)
	assert.Nil(t, unmarshaled.ErrorMessage)
}

func TestSearchResult_WithEmptyMetadata(t *testing.T) {
	result := &SearchResult{
		IndexerID:   1,
		IndexerName: "Test Indexer",
		Title:       "Test Book",
		Format:      "epub",
		DownloadURL: "https://example.com/download",
		FoundAt:     time.Now(),
		Tags:        []string{},
		Metadata:    map[string]interface{}{},
	}

	jsonData, err := json.Marshal(result)
	require.NoError(t, err)

	var unmarshaled SearchResult
	err = json.Unmarshal(jsonData, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, result.Title, unmarshaled.Title)
	assert.Empty(t, unmarshaled.Tags)
	assert.Empty(t, unmarshaled.Metadata)
}