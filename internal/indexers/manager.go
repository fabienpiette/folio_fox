package indexers

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/repositories"
)

// Manager coordinates multiple indexer clients and provides unified search functionality
type Manager struct {
	prowlarrClient  *ProwlarrClient
	jackettClient   *JackettClient
	directIndexers  map[string]DirectIndexer
	indexerRepo     repositories.IndexerRepository
	searchRepo      repositories.SearchRepository
	logger          *logrus.Logger
	healthMonitor   *HealthMonitor
	mu              sync.RWMutex
}

// DirectIndexer interface for direct indexer implementations
type DirectIndexer interface {
	Search(ctx context.Context, request *models.SearchRequest) (*models.SearchResponse, error)
	TestConnection(ctx context.Context) (*models.IndexerTestResult, error)
	GetName() string
	GetType() string
}

// NewManager creates a new indexer manager
func NewManager(
	indexerRepo repositories.IndexerRepository,
	searchRepo repositories.SearchRepository,
	logger *logrus.Logger,
) *Manager {
	return &Manager{
		directIndexers: make(map[string]DirectIndexer),
		indexerRepo:    indexerRepo,
		searchRepo:     searchRepo,
		logger:         logger,
		healthMonitor:  NewHealthMonitor(indexerRepo, logger),
	}
}

// SetProwlarrClient sets the Prowlarr client
func (m *Manager) SetProwlarrClient(client *ProwlarrClient) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.prowlarrClient = client
}

// SetJackettClient sets the Jackett client
func (m *Manager) SetJackettClient(client *JackettClient) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.jackettClient = client
}

// AddDirectIndexer adds a direct indexer implementation
func (m *Manager) AddDirectIndexer(indexer DirectIndexer) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.directIndexers[indexer.GetType()] = indexer
}

// Search performs a coordinated search across all enabled indexers
func (m *Manager) Search(ctx context.Context, userID int64, request *models.SearchRequest) (*models.SearchResponse, error) {
	start := time.Now()

	// Check cache first if enabled
	if request.UseCache {
		if cached := m.getCachedResults(ctx, request); cached != nil {
			m.logger.Infof("Returning cached search results for query: %s", request.Query)
			return cached, nil
		}
	}

	// Get user's enabled indexers
	enabledIndexers, err := m.indexerRepo.GetUserEnabledIndexers(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user indexers: %w", err)
	}

	if len(enabledIndexers) == 0 {
		return &models.SearchResponse{
			Query:            request.Query,
			Results:          []models.SearchResult{},
			TotalResults:     0,
			IndexersSearched: []models.IndexerSearchResult{},
			SearchDurationMS: int(time.Since(start).Milliseconds()),
		}, nil
	}

	// Create channels for collecting results
	resultsChan := make(chan *models.SearchResponse, len(enabledIndexers))
	errorsChan := make(chan error, len(enabledIndexers))

	// Launch searches in parallel
	var wg sync.WaitGroup
	searchCtx, cancel := context.WithTimeout(ctx, time.Duration(request.Timeout)*time.Second)
	defer cancel()

	for _, indexer := range enabledIndexers {
		wg.Add(1)
		go m.searchIndexer(searchCtx, &wg, indexer, request, resultsChan, errorsChan)
	}

	// Wait for all searches to complete
	go func() {
		wg.Wait()
		close(resultsChan)
		close(errorsChan)
	}()

	// Collect and aggregate results
	var allResults []models.SearchResult
	var indexersSearched []models.IndexerSearchResult
	errors := make([]error, 0)

	for result := range resultsChan {
		if result != nil {
			allResults = append(allResults, result.Results...)
			indexersSearched = append(indexersSearched, result.IndexersSearched...)
		}
	}

	for err := range errorsChan {
		if err != nil {
			errors = append(errors, err)
			m.logger.Warnf("Indexer search error: %v", err)
		}
	}

	// Deduplicate and rank results
	deduplicatedResults := m.deduplicateResults(allResults)
	rankedResults := m.rankResults(deduplicatedResults, request.Query)

	// Apply limit if specified
	if request.Limit > 0 && len(rankedResults) > request.Limit {
		rankedResults = rankedResults[:request.Limit]
	}

	response := &models.SearchResponse{
		Query:            request.Query,
		Results:          rankedResults,
		TotalResults:     len(rankedResults),
		IndexersSearched: indexersSearched,
		SearchDurationMS: int(time.Since(start).Milliseconds()),
		Cached:           false,
	}

	// Cache results if enabled
	if request.UseCache && len(rankedResults) > 0 {
		m.cacheResults(ctx, request, response)
	}

	// Record search history
	m.recordSearchHistory(ctx, userID, request, response)

	m.logger.Infof("Multi-indexer search for '%s' returned %d results from %d indexers in %dms",
		request.Query, len(rankedResults), len(indexersSearched), response.SearchDurationMS)

	return response, nil
}

// searchIndexer performs search on a single indexer
func (m *Manager) searchIndexer(
	ctx context.Context,
	wg *sync.WaitGroup,
	indexer *models.Indexer,
	request *models.SearchRequest,
	resultsChan chan<- *models.SearchResponse,
	errorsChan chan<- error,
) {
	defer wg.Done()

	var result *models.SearchResponse
	var err error

	switch {
	case m.prowlarrClient != nil && strings.Contains(strings.ToLower(indexer.Name), "prowlarr"):
		result, err = m.prowlarrClient.Search(ctx, request)
	case m.jackettClient != nil && strings.Contains(strings.ToLower(indexer.Name), "jackett"):
		result, err = m.jackettClient.Search(ctx, request)
	default:
		// Try direct indexer
		if directIndexer, exists := m.directIndexers[strings.ToLower(indexer.Name)]; exists {
			result, err = directIndexer.Search(ctx, request)
		} else {
			err = fmt.Errorf("no client available for indexer: %s", indexer.Name)
		}
	}

	if err != nil {
		errorsChan <- fmt.Errorf("indexer %s: %w", indexer.Name, err)
		
		// Record failed health check
		errMsg := err.Error()
		m.healthMonitor.RecordHealthCheck(ctx, indexer.ID, models.IndexerStatusDown, nil, &errMsg)
		return
	}

	if result != nil {
		// Record successful health check
		avgResponseTime := 0
		if len(result.IndexersSearched) > 0 {
			avgResponseTime = result.IndexersSearched[0].ResponseTimeMS
		}
		m.healthMonitor.RecordHealthCheck(ctx, indexer.ID, models.IndexerStatusHealthy, &avgResponseTime, nil)
		
		resultsChan <- result
	}
}

// deduplicateResults removes duplicate search results based on title and format
func (m *Manager) deduplicateResults(results []models.SearchResult) []models.SearchResult {
	seen := make(map[string]bool)
	deduplicated := make([]models.SearchResult, 0, len(results))

	for _, result := range results {
		// Create a key based on normalized title and format
		key := m.normalizeTitle(result.Title) + "|" + result.Format
		
		if !seen[key] {
			seen[key] = true
			deduplicated = append(deduplicated, result)
		}
	}

	m.logger.Debugf("Deduplicated %d results to %d unique items", len(results), len(deduplicated))
	return deduplicated
}

// rankResults sorts results by relevance and quality
func (m *Manager) rankResults(results []models.SearchResult, query string) []models.SearchResult {
	// Sort by combined score (relevance + quality)
	for i := range results {
		relevanceScore := m.calculateRelevanceScore(query, results[i].Title)
		qualityScore := float64(results[i].QualityScore) / 100.0
		
		// Combined score with weights
		results[i].RelevanceScore = relevanceScore*0.7 + qualityScore*0.3
	}

	// Sort by combined score (descending)
	sort.Slice(results, func(i, j int) bool {
		return results[i].RelevanceScore > results[j].RelevanceScore
	})

	return results
}

// getCachedResults retrieves cached search results
func (m *Manager) getCachedResults(ctx context.Context, request *models.SearchRequest) *models.SearchResponse {
	queryHash := m.generateQueryHash(request)
	
	cached, err := m.searchRepo.GetCachedSearchResults(ctx, queryHash)
	if err != nil {
		m.logger.Debugf("Cache miss for query hash: %s", queryHash)
		return nil
	}

	if cached != nil {
		cached.Cached = true
		m.logger.Debugf("Cache hit for query: %s", request.Query)
	}

	return cached
}

// cacheResults stores search results in cache
func (m *Manager) cacheResults(ctx context.Context, request *models.SearchRequest, response *models.SearchResponse) {
	queryHash := m.generateQueryHash(request)
	ttlMinutes := 60 // Default cache TTL
	
	if err := m.searchRepo.CacheSearchResults(ctx, queryHash, response, ttlMinutes); err != nil {
		m.logger.Warnf("Failed to cache search results: %v", err)
	} else {
		m.logger.Debugf("Cached search results for query: %s", request.Query)
	}
}

// recordSearchHistory records the search in user's history
func (m *Manager) recordSearchHistory(ctx context.Context, userID int64, request *models.SearchRequest, response *models.SearchResponse) {
	indexerIDs := make([]int64, len(response.IndexersSearched))
	for i, indexer := range response.IndexersSearched {
		indexerIDs[i] = indexer.IndexerID
	}

	entry := &models.SearchHistoryEntry{
		UserID:           userID,
		Query:            request.Query,
		Filters:          make(map[string]interface{}),
		ResultsCount:     response.TotalResults,
		IndexersSearched: indexerIDs,
		SearchDurationMS: response.SearchDurationMS,
		SearchedAt:       time.Now(),
	}

	// Add filters to history
	if len(request.Formats) > 0 {
		entry.Filters["formats"] = request.Formats
	}
	if len(request.Languages) > 0 {
		entry.Filters["languages"] = request.Languages
	}
	if request.MinQuality > 0 {
		entry.Filters["min_quality"] = request.MinQuality
	}

	if err := m.searchRepo.CreateHistoryEntry(ctx, entry); err != nil {
		m.logger.Warnf("Failed to record search history: %v", err)
	}
}

// Helper methods
func (m *Manager) normalizeTitle(title string) string {
	// Simple normalization - remove special characters and convert to lowercase
	normalized := strings.ToLower(title)
	normalized = strings.ReplaceAll(normalized, ".", "")
	normalized = strings.ReplaceAll(normalized, "-", " ")
	normalized = strings.ReplaceAll(normalized, "_", " ")
	return strings.TrimSpace(normalized)
}

func (m *Manager) generateQueryHash(request *models.SearchRequest) string {
	// Simple hash generation based on query and filters
	data := fmt.Sprintf("%s|%v|%v|%v|%d|%d", 
		request.Query, request.Indexers, request.Formats, 
		request.Languages, request.MinQuality, request.MaxSizeMB)
	
	// In production, use crypto/sha256 or similar
	hash := fmt.Sprintf("%x", []byte(data))
	return hash
}

func (m *Manager) calculateRelevanceScore(query, title string) float64 {
	query = strings.ToLower(query)
	title = strings.ToLower(title)
	
	queryWords := strings.Fields(query)
	matchCount := 0
	
	for _, word := range queryWords {
		if strings.Contains(title, word) {
			matchCount++
		}
	}
	
	if len(queryWords) == 0 {
		return 0.0
	}
	
	return float64(matchCount) / float64(len(queryWords))
}

// StartHealthMonitoring starts the background health monitoring
func (m *Manager) StartHealthMonitoring(ctx context.Context) {
	go m.healthMonitor.Start(ctx)
}

// StopHealthMonitoring stops the background health monitoring
func (m *Manager) StopHealthMonitoring() {
	m.healthMonitor.Stop()
}

// GetHealthyIndexers returns a list of currently healthy indexers
func (m *Manager) GetHealthyIndexers(ctx context.Context) ([]*models.Indexer, error) {
	// Get all active indexers
	allIndexers, err := m.indexerRepo.List(ctx, true)
	if err != nil {
		return nil, fmt.Errorf("failed to get all indexers: %w", err)
	}

	// Filter for healthy indexers
	healthyIndexers := make([]*models.Indexer, 0)
	for _, indexer := range allIndexers {
		if indexer.Status == nil || *indexer.Status == models.IndexerStatusHealthy {
			healthyIndexers = append(healthyIndexers, indexer)
		}
	}

	return healthyIndexers, nil
}

// TestIndexer tests the connection to a specific indexer
func (m *Manager) TestIndexer(ctx context.Context, indexerID int64) (*models.IndexerTestResult, error) {
	// Get the indexer details
	indexer, err := m.indexerRepo.GetByID(ctx, indexerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get indexer: %w", err)
	}

	start := time.Now()
	var result *models.IndexerTestResult

	// Test based on indexer type
	switch {
	case m.prowlarrClient != nil && strings.Contains(strings.ToLower(indexer.Name), "prowlarr"):
		// Test Prowlarr indexer
		testResult, err := m.prowlarrClient.TestConnection(ctx)
		if err != nil {
			errMsg := err.Error()
			result = &models.IndexerTestResult{
				IndexerID:      indexerID,
				Success:        false,
				ResponseTimeMS: int(time.Since(start).Milliseconds()),
				ErrorMessage:   &errMsg,
			}
		} else {
			result = testResult
			result.IndexerID = indexerID
		}
	case m.jackettClient != nil && strings.Contains(strings.ToLower(indexer.Name), "jackett"):
		// Test Jackett indexer
		testResult, err := m.jackettClient.TestConnection(ctx)
		if err != nil {
			errMsg := err.Error()
			result = &models.IndexerTestResult{
				IndexerID:      indexerID,
				Success:        false,
				ResponseTimeMS: int(time.Since(start).Milliseconds()),
				ErrorMessage:   &errMsg,
			}
		} else {
			result = testResult
			result.IndexerID = indexerID
		}
	default:
		// Test direct indexer
		if directIndexer, exists := m.directIndexers[strings.ToLower(indexer.Name)]; exists {
			testResult, err := directIndexer.TestConnection(ctx)
			if err != nil {
				errMsg := err.Error()
				result = &models.IndexerTestResult{
					IndexerID:      indexerID,
					Success:        false,
					ResponseTimeMS: int(time.Since(start).Milliseconds()),
					ErrorMessage:   &errMsg,
				}
			} else {
				result = testResult
				result.IndexerID = indexerID
			}
		} else {
			errMsg := fmt.Sprintf("no client available for indexer: %s", indexer.Name)
			result = &models.IndexerTestResult{
				IndexerID:      indexerID,
				Success:        false,
				ResponseTimeMS: int(time.Since(start).Milliseconds()),
				ErrorMessage:   &errMsg,
			}
		}
	}

	// Record health check based on test result
	var status models.IndexerStatus
	var responseTime *int
	var errorMsg *string

	if result.Success {
		status = models.IndexerStatusHealthy
		responseTime = &result.ResponseTimeMS
	} else {
		status = models.IndexerStatusDown
		errorMsg = result.ErrorMessage
	}

	m.healthMonitor.RecordHealthCheck(ctx, indexerID, status, responseTime, errorMsg)

	m.logger.Infof("Tested indexer %s (ID: %d): success=%t, response_time=%dms", 
		indexer.Name, indexerID, result.Success, result.ResponseTimeMS)

	return result, nil
}