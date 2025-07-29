package search

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/foliofox/foliofox/internal/indexers"
	"github.com/foliofox/foliofox/internal/models"
	"github.com/foliofox/foliofox/internal/repositories"
)

// OptimizedService provides high-performance search functionality with advanced optimizations
type OptimizedService struct {
	indexerManager *indexers.Manager
	bookRepo       repositories.BookRepository
	searchRepo     repositories.SearchRepository
	logger         *logrus.Logger
	
	// Performance optimization components
	queryOptimizer    *QueryOptimizer
	resultProcessor   *ResultProcessor
	cacheManager     *CacheManager
	performanceMonitor *PerformanceMonitor
	
	// Metadata providers
	metadataProviders []MetadataProvider
	
	// Configuration
	config *SearchConfig
}

// SearchConfig holds performance-related configuration
type SearchConfig struct {
	MaxConcurrentSearches    int           `json:"max_concurrent_searches"`
	SearchTimeout           time.Duration `json:"search_timeout"`
	ResultProcessingTimeout time.Duration `json:"result_processing_timeout"`
	MaxResultsPerIndexer    int           `json:"max_results_per_indexer"`
	CacheEnabled           bool          `json:"cache_enabled"`
	CacheTTL               time.Duration `json:"cache_ttl"`
	MemoryLimitMB          int           `json:"memory_limit_mb"`
	EnableMetrics          bool          `json:"enable_metrics"`
}

// QueryOptimizer handles search query preprocessing and optimization
type QueryOptimizer struct {
	stopWords      map[string]bool
	synonyms       map[string][]string
	queryTemplates map[string]string
	mu             sync.RWMutex
}

// ResultProcessor handles parallel result processing and optimization
type ResultProcessor struct {
	workerPool chan struct{}
	semaphore  chan struct{}
}

// CacheManager provides intelligent caching with memory management
type CacheManager struct {
	localCache    map[string]*CacheEntry
	mu            sync.RWMutex
	maxMemoryMB   int
	currentMemory int64
	hitRate       float64
}

// CacheEntry represents a cached search result
type CacheEntry struct {
	Data       *models.SearchResponse `json:"data"`
	ExpiresAt  time.Time             `json:"expires_at"`
	HitCount   int                   `json:"hit_count"`
	Size       int64                 `json:"size"`
	CreatedAt  time.Time             `json:"created_at"`
}

// PerformanceMonitor tracks and reports search performance metrics
type PerformanceMonitor struct {
	metrics     map[string]*PerformanceMetric
	mu          sync.RWMutex
	logger      *logrus.Logger
	enabled     bool
}

// PerformanceMetric stores performance data for a specific operation
type PerformanceMetric struct {
	Count         int64         `json:"count"`
	TotalTime     time.Duration `json:"total_time"`
	MinTime       time.Duration `json:"min_time"`
	MaxTime       time.Duration `json:"max_time"`
	LastExecution time.Time     `json:"last_execution"`
	ErrorCount    int64         `json:"error_count"`
}

// NewOptimizedService creates a new optimized search service
func NewOptimizedService(
	indexerManager *indexers.Manager,
	bookRepo repositories.BookRepository,
	searchRepo repositories.SearchRepository,
	logger *logrus.Logger,
	config *SearchConfig,
) *OptimizedService {
	if config == nil {
		config = &SearchConfig{
			MaxConcurrentSearches:    runtime.NumCPU() * 2,
			SearchTimeout:           30 * time.Second,
			ResultProcessingTimeout: 10 * time.Second,
			MaxResultsPerIndexer:    1000,
			CacheEnabled:           true,
			CacheTTL:               1 * time.Hour,
			MemoryLimitMB:          512,
			EnableMetrics:          true,
		}
	}

	return &OptimizedService{
		indexerManager: indexerManager,
		bookRepo:       bookRepo,
		searchRepo:     searchRepo,
		logger:         logger,
		config:         config,
		queryOptimizer: NewQueryOptimizer(),
		resultProcessor: NewResultProcessor(config.MaxConcurrentSearches),
		cacheManager:   NewCacheManager(config.MemoryLimitMB),
		performanceMonitor: NewPerformanceMonitor(logger, config.EnableMetrics),
		metadataProviders: []MetadataProvider{},
	}
}

// Search performs an optimized search with advanced performance features
func (s *OptimizedService) Search(ctx context.Context, userID int64, request *models.SearchRequest) (*models.SearchResponse, error) {
	startTime := time.Now()
	defer func() {
		s.performanceMonitor.RecordMetric("search_total", time.Since(startTime), nil)
	}()

	// Memory pressure check
	if s.isMemoryPressureHigh() {
		s.logger.Warn("High memory pressure detected, applying search limitations")
		request = s.applyMemoryPressureLimits(request)
	}

	// Query optimization
	optimizedRequest, err := s.queryOptimizer.OptimizeQuery(request)
	if err != nil {
		s.performanceMonitor.RecordMetric("search_optimization_error", time.Since(startTime), err)
		return nil, fmt.Errorf("query optimization failed: %w", err)
	}

	// Check cache first
	if s.config.CacheEnabled {
		if cached := s.cacheManager.Get(optimizedRequest); cached != nil {
			s.performanceMonitor.RecordMetric("search_cache_hit", time.Since(startTime), nil)
			cached.Cached = true
			return cached, nil
		}
	}

	// Perform multi-indexer search with optimization
	response, err := s.performOptimizedSearch(ctx, userID, optimizedRequest)
	if err != nil {
		s.performanceMonitor.RecordMetric("search_error", time.Since(startTime), err)
		return nil, err
	}

	// Cache successful results
	if s.config.CacheEnabled && response != nil && len(response.Results) > 0 {
		s.cacheManager.Set(optimizedRequest, response, s.config.CacheTTL)
	}

	// Record performance metrics
	s.performanceMonitor.RecordMetric("search_success", time.Since(startTime), nil)
	s.recordSearchPerformance(optimizedRequest, response, time.Since(startTime))

	return response, nil
}

// performOptimizedSearch executes the core search logic with optimizations
func (s *OptimizedService) performOptimizedSearch(ctx context.Context, userID int64, request *models.SearchRequest) (*models.SearchResponse, error) {
	searchCtx, cancel := context.WithTimeout(ctx, s.config.SearchTimeout)
	defer cancel()

	// Get base search results from indexer manager
	baseResponse, err := s.indexerManager.Search(searchCtx, userID, request)
	if err != nil {
		return nil, fmt.Errorf("indexer search failed: %w", err)
	}

	if len(baseResponse.Results) == 0 {
		return baseResponse, nil
	}

	// Parallel result processing
	processingStart := time.Now()
	enhancedResults, err := s.resultProcessor.ProcessResults(
		searchCtx,
		baseResponse.Results,
		request,
		s.config.ResultProcessingTimeout,
	)
	if err != nil {
		s.logger.Warnf("Result processing failed, using base results: %v", err)
		enhancedResults = baseResponse.Results
	}

	s.performanceMonitor.RecordMetric("result_processing", time.Since(processingStart), nil)

	// Advanced deduplication and ranking
	rankingStart := time.Now()
	finalResults := s.advancedRankingWithOptimization(enhancedResults, request.Query)
	s.performanceMonitor.RecordMetric("result_ranking", time.Since(rankingStart), nil)

	// Apply limits to prevent memory issues
	if len(finalResults) > s.config.MaxResultsPerIndexer {
		finalResults = finalResults[:s.config.MaxResultsPerIndexer]
	}

	// Build optimized response
	response := &models.SearchResponse{
		Query:            baseResponse.Query,
		Results:          finalResults,
		TotalResults:     len(finalResults),
		IndexersSearched: baseResponse.IndexersSearched,
		SearchDurationMS: int(time.Since(processingStart).Milliseconds()),
		Cached:           false,
	}

	return response, nil
}

// NewQueryOptimizer creates a new query optimizer
func NewQueryOptimizer() *QueryOptimizer {
	return &QueryOptimizer{
		stopWords: map[string]bool{
			"the": true, "a": true, "an": true, "and": true, "or": true,
			"but": true, "in": true, "on": true, "at": true, "to": true,
			"for": true, "of": true, "with": true, "by": true, "from": true,
		},
		synonyms: map[string][]string{
			"book":    {"novel", "text", "work", "publication"},
			"author":  {"writer", "novelist", "creator"},
			"series":  {"collection", "set", "saga"},
			"fantasy": {"magical", "supernatural", "mythical"},
			"scifi":   {"science fiction", "sf", "sci-fi"},
		},
		queryTemplates: make(map[string]string),
	}
}

// OptimizeQuery optimizes the search query for better performance and results
func (qo *QueryOptimizer) OptimizeQuery(request *models.SearchRequest) (*models.SearchRequest, error) {
	optimized := *request

	// Clean and normalize query
	query := strings.TrimSpace(strings.ToLower(request.Query))
	
	// Remove excessive whitespace
	query = strings.Join(strings.Fields(query), " ")
	
	// Expand abbreviations and synonyms
	query = qo.expandSynonyms(query)
	
	// Remove stop words for better relevance (but keep original for exact matches)
	optimizedQuery := qo.removeStopWords(query)
	if len(optimizedQuery) > 0 {
		optimized.Query = optimizedQuery
	} else {
		optimized.Query = query // Fallback to original if all words were stop words
	}

	// Apply query templates for common patterns
	optimized.Query = qo.applyQueryTemplates(optimized.Query)

	return &optimized, nil
}

// expandSynonyms expands known synonyms in the query
func (qo *QueryOptimizer) expandSynonyms(query string) string {
	words := strings.Fields(query)
	expanded := make([]string, 0, len(words)*2)

	for _, word := range words {
		expanded = append(expanded, word)
		if synonyms, exists := qo.synonyms[word]; exists {
			// Add primary synonym
			if len(synonyms) > 0 {
				expanded = append(expanded, synonyms[0])
			}
		}
	}

	return strings.Join(expanded, " ")
}

// removeStopWords removes common stop words that don't contribute to search relevance
func (qo *QueryOptimizer) removeStopWords(query string) string {
	words := strings.Fields(query)
	filtered := make([]string, 0, len(words))

	for _, word := range words {
		if !qo.stopWords[word] {
			filtered = append(filtered, word)
		}
	}

	return strings.Join(filtered, " ")
}

// applyQueryTemplates applies predefined query templates for better search results
func (qo *QueryOptimizer) applyQueryTemplates(query string) string {
	// Author search pattern
	if strings.Contains(query, "by ") || strings.Contains(query, "author:") {
		query = strings.ReplaceAll(query, "by ", "")
		query = strings.ReplaceAll(query, "author:", "")
		query = "author:" + strings.TrimSpace(query)
	}

	// Series search pattern
	if strings.Contains(query, "series") || strings.Contains(query, "book ") {
		if strings.Contains(query, "book 1") || strings.Contains(query, "book 2") {
			query = strings.ReplaceAll(query, "book ", "")
			query = "series:" + strings.TrimSpace(query)
		}
	}

	return query
}

// NewResultProcessor creates a new result processor
func NewResultProcessor(maxWorkers int) *ResultProcessor {
	return &ResultProcessor{
		workerPool: make(chan struct{}, maxWorkers),
		semaphore:  make(chan struct{}, maxWorkers),
	}
}

// ProcessResults processes search results in parallel for optimal performance
func (rp *ResultProcessor) ProcessResults(
	ctx context.Context,
	results []models.SearchResult,
	request *models.SearchRequest,
	timeout time.Duration,
) ([]models.SearchResult, error) {
	if len(results) == 0 {
		return results, nil
	}

	processCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Calculate optimal batch size based on CPU cores and result count
	batchSize := int(math.Max(float64(len(results)/runtime.NumCPU()), 10))
	batches := rp.createBatches(results, batchSize)

	// Process batches in parallel
	processedBatches := make([][]models.SearchResult, len(batches))
	var wg sync.WaitGroup
	var processingErr error

	for i, batch := range batches {
		wg.Add(1)
		go func(index int, resultBatch []models.SearchResult) {
			defer wg.Done()

			select {
			case <-processCtx.Done():
				processingErr = processCtx.Err()
				return
			case rp.semaphore <- struct{}{}:
				defer func() { <-rp.semaphore }()

				processed := rp.processBatch(resultBatch, request)
				processedBatches[index] = processed
			}
		}(i, batch)
	}

	wg.Wait()

	if processingErr != nil {
		return nil, processingErr
	}

	// Merge processed batches
	var merged []models.SearchResult
	for _, batch := range processedBatches {
		merged = append(merged, batch...)
	}

	return merged, nil
}

// createBatches divides results into optimal-sized batches for parallel processing
func (rp *ResultProcessor) createBatches(results []models.SearchResult, batchSize int) [][]models.SearchResult {
	var batches [][]models.SearchResult
	
	for i := 0; i < len(results); i += batchSize {
		end := i + batchSize
		if end > len(results) {
			end = len(results)
		}
		batches = append(batches, results[i:end])
	}
	
	return batches
}

// processBatch processes a batch of results with optimizations
func (rp *ResultProcessor) processBatch(batch []models.SearchResult, request *models.SearchRequest) []models.SearchResult {
	processed := make([]models.SearchResult, len(batch))
	
	for i, result := range batch {
		// Enhanced relevance scoring
		result.RelevanceScore = rp.calculateOptimizedRelevance(request.Query, &result)
		
		// Quality score enhancement
		result.QualityScore = rp.enhanceQualityScore(&result)
		
		// Memory optimization - remove unnecessary fields for large datasets
		result = rp.optimizeResultForMemory(result)
		
		processed[i] = result
	}
	
	return processed
}

// calculateOptimizedRelevance calculates relevance with advanced algorithms
func (rp *ResultProcessor) calculateOptimizedRelevance(query string, result *models.SearchResult) float64 {
	query = strings.ToLower(query)
	title := strings.ToLower(result.Title)
	
	// Base TF-IDF like scoring
	score := 0.0
	queryWords := strings.Fields(query)
	
	if len(queryWords) == 0 {
		return 0.0
	}
	
	// Exact phrase match (highest priority)
	if strings.Contains(title, query) {
		score += 0.8
	}
	
	// Word frequency and position scoring
	for i, word := range queryWords {
		if strings.Contains(title, word) {
			// Word match base score
			wordScore := 0.2
			
			// Position bonus (earlier words more important)
			positionBonus := float64(len(queryWords)-i) / float64(len(queryWords)) * 0.1
			wordScore += positionBonus
			
			// Title start bonus
			if strings.HasPrefix(title, word) {
				wordScore += 0.15
			}
			
			score += wordScore
		}
		
		// Author match with lower weight
		if result.Author != nil && strings.Contains(strings.ToLower(*result.Author), word) {
			score += 0.1
		}
	}
	
	// Normalize by query length
	score = score / float64(len(queryWords))
	
	// Quality boost
	qualityBoost := float64(result.QualityScore) / 1000.0 // Max 0.1 boost
	score += qualityBoost
	
	return math.Min(score, 1.0)
}

// enhanceQualityScore improves quality scoring with additional factors
func (rp *ResultProcessor) enhanceQualityScore(result *models.SearchResult) int {
	score := result.QualityScore
	
	// File size reasonableness (ebooks typically 1-50MB)
	if result.FileSizeBytes != nil {
		sizeMB := *result.FileSizeBytes / (1024 * 1024)
		if sizeMB >= 1 && sizeMB <= 50 {
			score += 15
		} else if sizeMB > 100 {
			score -= 20
		} else if sizeMB < 1 {
			score -= 10
		}
	}
	
	// Format quality scoring
	switch strings.ToLower(result.Format) {
	case "epub":
		score += 15
	case "pdf":
		score += 8
	case "mobi":
		score += 12
	case "azw3":
		score += 10
	case "txt":
		score -= 15
	}
	
	// Title quality indicators
	title := strings.ToLower(result.Title)
	if strings.Contains(title, "retail") || strings.Contains(title, "original") {
		score += 20
	}
	if strings.Contains(title, "scan") || strings.Contains(title, "ocr") {
		score -= 15
	}
	if strings.Contains(title, "sample") {
		score -= 25
	}
	
	// Clamp score
	if score > 100 {
		score = 100
	} else if score < 0 {
		score = 0
	}
	
	return score
}

// optimizeResultForMemory removes unnecessary data to reduce memory usage
func (rp *ResultProcessor) optimizeResultForMemory(result models.SearchResult) models.SearchResult {
	// For large result sets, trim description length
	if result.Description != nil && len(*result.Description) > 500 {
		trimmed := (*result.Description)[:497] + "..."
		result.Description = &trimmed
	}
	
	// Limit metadata size
	if result.Metadata != nil {
		optimizedMetadata := make(map[string]interface{})
		for k, v := range result.Metadata {
			// Keep only essential metadata fields
			if k == "isbn" || k == "publisher" || k == "year" {
				optimizedMetadata[k] = v
			}
		}
		result.Metadata = optimizedMetadata
	}
	
	return result
}

// NewCacheManager creates a new cache manager
func NewCacheManager(maxMemoryMB int) *CacheManager {
	return &CacheManager{
		localCache:  make(map[string]*CacheEntry),
		maxMemoryMB: maxMemoryMB,
		hitRate:     0.0,
	}
}

// Get retrieves a cached search response
func (cm *CacheManager) Get(request *models.SearchRequest) *models.SearchResponse {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	
	key := cm.generateCacheKey(request)
	entry, exists := cm.localCache[key]
	
	if !exists || time.Now().After(entry.ExpiresAt) {
		return nil
	}
	
	entry.HitCount++
	return entry.Data
}

// Set stores a search response in cache
func (cm *CacheManager) Set(request *models.SearchRequest, response *models.SearchResponse, ttl time.Duration) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	
	// Check memory pressure
	if cm.isMemoryLimitExceeded() {
		cm.evictLRUEntries()
	}
	
	key := cm.generateCacheKey(request)
	size := cm.estimateResponseSize(response)
	
	entry := &CacheEntry{
		Data:      response,
		ExpiresAt: time.Now().Add(ttl),
		HitCount:  0,
		Size:      size,
		CreatedAt: time.Now(),
	}
	
	cm.localCache[key] = entry
	cm.currentMemory += size
}

// generateCacheKey creates a unique cache key for the request
func (cm *CacheManager) generateCacheKey(request *models.SearchRequest) string {
	data := fmt.Sprintf("%s|%v|%v|%d|%d", 
		request.Query,
		request.Indexers,
		request.Formats,
		request.MinQuality,
		request.MaxSizeMB,
	)
	
	// Simple hash (in production, use crypto/sha256)
	return fmt.Sprintf("%x", []byte(data))
}

// estimateResponseSize estimates the memory usage of a response
func (cm *CacheManager) estimateResponseSize(response *models.SearchResponse) int64 {
	// Rough estimation: 1KB per result + base overhead
	return int64(len(response.Results)*1024 + 512)
}

// isMemoryLimitExceeded checks if cache memory limit is exceeded
func (cm *CacheManager) isMemoryLimitExceeded() bool {
	return cm.currentMemory > int64(cm.maxMemoryMB*1024*1024)
}

// evictLRUEntries removes least recently used cache entries
func (cm *CacheManager) evictLRUEntries() {
	// Sort entries by last access time and hit count
	type entryInfo struct {
		key   string
		entry *CacheEntry
		score float64
	}
	
	var entries []entryInfo
	for key, entry := range cm.localCache {
		// Score based on recency and hit count
		timeSinceCreation := time.Since(entry.CreatedAt).Hours()
		score := float64(entry.HitCount) / (1.0 + timeSinceCreation)
		
		entries = append(entries, entryInfo{
			key:   key,
			entry: entry,
			score: score,
		})
	}
	
	// Sort by score (ascending - remove lowest scores first)
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].score < entries[j].score
	})
	
	// Remove bottom 25% of entries
	removeCount := len(entries) / 4
	for i := 0; i < removeCount && cm.isMemoryLimitExceeded(); i++ {
		key := entries[i].key
		entry := entries[i].entry
		
		delete(cm.localCache, key)
		cm.currentMemory -= entry.Size
	}
}

// advancedRankingWithOptimization provides optimized result ranking
func (s *OptimizedService) advancedRankingWithOptimization(results []models.SearchResult, query string) []models.SearchResult {
	if len(results) == 0 {
		return results
	}

	// Parallel sorting for large result sets
	if len(results) > 1000 {
		return s.parallelSort(results)
	}

	// Standard sorting for smaller sets
	sort.Slice(results, func(i, j int) bool {
		// Primary: relevance score
		if math.Abs(results[i].RelevanceScore-results[j].RelevanceScore) > 0.001 {
			return results[i].RelevanceScore > results[j].RelevanceScore
		}
		
		// Secondary: quality score  
		if results[i].QualityScore != results[j].QualityScore {
			return results[i].QualityScore > results[j].QualityScore
		}
		
		// Tertiary: file size (prefer reasonable sizes)
		if results[i].FileSizeBytes != nil && results[j].FileSizeBytes != nil {
			sizeI := *results[i].FileSizeBytes / (1024 * 1024) // MB
			sizeJ := *results[j].FileSizeBytes / (1024 * 1024) // MB
			
			// Prefer files in 1-50MB range
			reasonableI := sizeI >= 1 && sizeI <= 50
			reasonableJ := sizeJ >= 1 && sizeJ <= 50
			
			if reasonableI && !reasonableJ {
				return true
			}
			if !reasonableI && reasonableJ {
				return false
			}
			
			// If both reasonable or both unreasonable, prefer smaller
			return sizeI < sizeJ
		}
		
		return false
	})

	return results
}

// parallelSort sorts large result sets using parallel merge sort
func (s *OptimizedService) parallelSort(results []models.SearchResult) []models.SearchResult {
	if len(results) <= 1000 {
		// Base case: use standard sort
		sort.Slice(results, func(i, j int) bool {
			return results[i].RelevanceScore > results[j].RelevanceScore
		})
		return results
	}

	// Divide into chunks for parallel processing
	mid := len(results) / 2
	var wg sync.WaitGroup
	
	var left, right []models.SearchResult
	
	wg.Add(2)
	go func() {
		defer wg.Done()
		left = s.parallelSort(results[:mid])
	}()
	
	go func() {
		defer wg.Done()
		right = s.parallelSort(results[mid:])
	}()
	
	wg.Wait()
	
	// Merge sorted halves
	return s.mergeResults(left, right)
}

// mergeResults merges two sorted result slices
func (s *OptimizedService) mergeResults(left, right []models.SearchResult) []models.SearchResult {
	result := make([]models.SearchResult, 0, len(left)+len(right))
	i, j := 0, 0
	
	for i < len(left) && j < len(right) {
		if left[i].RelevanceScore >= right[j].RelevanceScore {
			result = append(result, left[i])
			i++
		} else {
			result = append(result, right[j])
			j++
		}
	}
	
	// Append remaining elements
	result = append(result, left[i:]...)
	result = append(result, right[j:]...)
	
	return result
}

// Performance monitoring methods

// NewPerformanceMonitor creates a new performance monitor
func NewPerformanceMonitor(logger *logrus.Logger, enabled bool) *PerformanceMonitor {
	return &PerformanceMonitor{
		metrics: make(map[string]*PerformanceMetric),
		logger:  logger,
		enabled: enabled,
	}
}

// RecordMetric records a performance metric
func (pm *PerformanceMonitor) RecordMetric(operation string, duration time.Duration, err error) {
	if !pm.enabled {
		return
	}

	pm.mu.Lock()
	defer pm.mu.Unlock()

	metric, exists := pm.metrics[operation]
	if !exists {
		metric = &PerformanceMetric{
			MinTime: duration,
			MaxTime: duration,
		}
		pm.metrics[operation] = metric
	}

	metric.Count++
	metric.TotalTime += duration
	metric.LastExecution = time.Now()

	if duration < metric.MinTime {
		metric.MinTime = duration
	}
	if duration > metric.MaxTime {
		metric.MaxTime = duration
	}

	if err != nil {
		metric.ErrorCount++
	}

	// Log slow operations
	if duration > 2*time.Second {
		pm.logger.Warnf("Slow %s operation: %v", operation, duration)
	}
}

// GetMetrics returns current performance metrics
func (pm *PerformanceMonitor) GetMetrics() map[string]*PerformanceMetric {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	result := make(map[string]*PerformanceMetric)
	for k, v := range pm.metrics {
		result[k] = v
	}
	return result
}

// Helper methods

// isMemoryPressureHigh checks if system memory pressure is high
func (s *OptimizedService) isMemoryPressureHigh() bool {
	var m runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&m)
	
	// Consider pressure high if using more than configured limit
	usedMB := m.Alloc / 1024 / 1024
	return int(usedMB) > s.config.MemoryLimitMB
}

// applyMemoryPressureLimits reduces search scope under memory pressure
func (s *OptimizedService) applyMemoryPressureLimits(request *models.SearchRequest) *models.SearchRequest {
	limited := *request
	
	// Reduce result limits
	if limited.Limit == 0 || limited.Limit > 100 {
		limited.Limit = 100
	}
	
	// Reduce timeout
	if limited.Timeout > 15 {
		limited.Timeout = 15
	}
	
	s.logger.Warn("Applied memory pressure limits to search request")
	return &limited
}

// recordSearchPerformance logs search performance statistics
func (s *OptimizedService) recordSearchPerformance(request *models.SearchRequest, response *models.SearchResponse, duration time.Duration) {
	if !s.config.EnableMetrics {
		return
	}

	// This would typically write to a database table for analysis
	s.logger.WithFields(logrus.Fields{
		"query":              request.Query,
		"result_count":       len(response.Results),
		"duration_ms":        duration.Milliseconds(),
		"indexers_searched":  len(response.IndexersSearched),
		"cached":            response.Cached,
	}).Info("Search performance recorded")
}