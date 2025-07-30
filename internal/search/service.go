package search

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/fabienpiette/folio_fox/internal/models"
	"github.com/fabienpiette/folio_fox/internal/repositories"
)

// Service provides enhanced search functionality with metadata enrichment
type Service struct {
	indexerManager repositories.IndexerManagerInterface
	bookRepo       repositories.BookRepository
	searchRepo     repositories.SearchRepository
	logger         *logrus.Logger
	
	// Metadata providers
	metadataProviders []MetadataProvider
}

// MetadataProvider interface for external metadata sources
type MetadataProvider interface {
	EnrichMetadata(ctx context.Context, result *models.SearchResult) (*models.Book, error)
	GetName() string
	IsEnabled() bool
}

// NewService creates a new search service
func NewService(
	indexerManager repositories.IndexerManagerInterface,
	bookRepo repositories.BookRepository,
	searchRepo repositories.SearchRepository,
	logger *logrus.Logger,
) *Service {
	return &Service{
		indexerManager:    indexerManager,
		bookRepo:          bookRepo,
		searchRepo:        searchRepo,
		logger:            logger,
		metadataProviders: []MetadataProvider{},
	}
}

// AddMetadataProvider adds a metadata provider to the service
func (s *Service) AddMetadataProvider(provider MetadataProvider) {
	s.metadataProviders = append(s.metadataProviders, provider)
}

// Search performs an enhanced search with improved ranking and metadata enrichment
func (s *Service) Search(ctx context.Context, userID int64, request *models.SearchRequest) (*models.SearchResponse, error) {
	// Preprocess search query
	enhancedRequest := s.preprocessSearchRequest(request)
	
	// Perform the base search through indexer manager
	baseResponse, err := s.indexerManager.Search(ctx, userID, enhancedRequest)
	if err != nil {
		return nil, fmt.Errorf("base search failed: %w", err)
	}
	
	// Enhanced post-processing
	enhancedResults := s.enhanceSearchResults(ctx, baseResponse.Results, request.Query)
	
	// Apply advanced filtering
	filteredResults := s.applyAdvancedFilters(enhancedResults, request)
	
	// Advanced ranking
	rankedResults := s.advancedRanking(filteredResults, request.Query)
	
	// Metadata enrichment (async for better performance)
	s.enrichMetadataAsync(ctx, rankedResults)
	
	// Build enhanced response
	enhancedResponse := &models.SearchResponse{
		Query:            baseResponse.Query,
		Results:          rankedResults,
		TotalResults:     len(rankedResults),
		IndexersSearched: baseResponse.IndexersSearched,
		SearchDurationMS: baseResponse.SearchDurationMS,
		Cached:           baseResponse.Cached,
		CacheExpiresAt:   baseResponse.CacheExpiresAt,
	}
	
	s.logger.Infof("Enhanced search for '%s' processed %d results into %d ranked results",
		request.Query, len(baseResponse.Results), len(rankedResults))
	
	return enhancedResponse, nil
}

// SearchLibrary searches the local library with full-text search
func (s *Service) SearchLibrary(ctx context.Context, query string, filters *repositories.BookFilters) ([]*models.Book, int, error) {
	// Use FTS if query is provided, otherwise use regular filtering
	if query != "" {
		return s.bookRepo.Search(ctx, query, filters)
	}
	return s.bookRepo.List(ctx, filters)
}

// GetSuggestions provides search suggestions based on library content and search history
func (s *Service) GetSuggestions(ctx context.Context, userID int64, partialQuery string, suggestionType string, limit int) ([]*SearchSuggestion, error) {
	var suggestions []*SearchSuggestion
	
	switch suggestionType {
	case "title":
		suggestions = s.getTitleSuggestions(ctx, partialQuery, limit)
	case "author":
		suggestions = s.getAuthorSuggestions(ctx, partialQuery, limit)
	case "series":
		suggestions = s.getSeriesSuggestions(ctx, partialQuery, limit)
	case "genre":
		suggestions = s.getGenreSuggestions(ctx, partialQuery, limit)
	default:
		// Get all types
		suggestions = append(suggestions, s.getTitleSuggestions(ctx, partialQuery, limit/4)...)
		suggestions = append(suggestions, s.getAuthorSuggestions(ctx, partialQuery, limit/4)...)
		suggestions = append(suggestions, s.getSeriesSuggestions(ctx, partialQuery, limit/4)...)
		suggestions = append(suggestions, s.getGenreSuggestions(ctx, partialQuery, limit/4)...)
	}
	
	// Add popular searches from history
	historySuggestions := s.getHistoricalSuggestions(ctx, userID, partialQuery, limit/4)
	suggestions = append(suggestions, historySuggestions...)
	
	// Sort by relevance and limit
	sort.Slice(suggestions, func(i, j int) bool {
		return suggestions[i].Relevance > suggestions[j].Relevance
	})
	
	if len(suggestions) > limit {
		suggestions = suggestions[:limit]
	}
	
	// Ensure we always return a non-nil slice
	if suggestions == nil {
		suggestions = []*SearchSuggestion{}
	}
	
	return suggestions, nil
}

// preprocessSearchRequest enhances the search request with query analysis
func (s *Service) preprocessSearchRequest(request *models.SearchRequest) *models.SearchRequest {
	enhanced := *request
	
	// Query preprocessing
	enhanced.Query = s.preprocessQuery(request.Query)
	
	// Auto-detect search intent and adjust parameters
	if s.isAuthorSearch(request.Query) {
		s.logger.Debug("Detected author search intent")
		// Could adjust indexer selection or search parameters
	}
	
	if s.isSeriesSearch(request.Query) {
		s.logger.Debug("Detected series search intent")
		// Could adjust search parameters for series searches
	}
	
	return &enhanced
}

// preprocessQuery cleans and enhances the search query
func (s *Service) preprocessQuery(query string) string {
	// Trim whitespace
	query = strings.TrimSpace(query)
	
	// Remove excessive whitespace
	query = strings.Join(strings.Fields(query), " ")
	
	// Handle common abbreviations and expansions
	query = s.expandAbbreviations(query)
	
	// Remove special characters that might interfere with search
	query = s.sanitizeQuery(query)
	
	return query
}

// enhanceSearchResults applies additional processing to search results
func (s *Service) enhanceSearchResults(ctx context.Context, results []models.SearchResult, originalQuery string) []models.SearchResult {
	enhanced := make([]models.SearchResult, len(results))
	copy(enhanced, results)
	
	for i := range enhanced {
		// Enhanced relevance scoring
		enhanced[i].RelevanceScore = s.calculateEnhancedRelevance(originalQuery, &enhanced[i])
		
		// Extract additional metadata from title
		s.extractTitleMetadata(&enhanced[i])
		
		// Quality score enhancement
		enhanced[i].QualityScore = s.enhanceQualityScore(&enhanced[i])
	}
	
	return enhanced
}

// applyAdvancedFilters applies sophisticated filtering logic
func (s *Service) applyAdvancedFilters(results []models.SearchResult, request *models.SearchRequest) []models.SearchResult {
	filtered := make([]models.SearchResult, 0, len(results))
	
	for _, result := range results {
		// Size filtering
		if request.MaxSizeMB > 0 && result.FileSizeBytes != nil {
			sizeMB := *result.FileSizeBytes / (1024 * 1024)
			if sizeMB > int64(request.MaxSizeMB) {
				continue
			}
		}
		
		// Quality filtering
		if request.MinQuality > 0 && result.QualityScore < request.MinQuality {
			continue
		}
		
		// Format filtering
		if len(request.Formats) > 0 {
			formatMatch := false
			for _, format := range request.Formats {
				if strings.EqualFold(result.Format, format) {
					formatMatch = true
					break
				}
			}
			if !formatMatch {
				continue
			}
		}
		
		// Language filtering
		if len(request.Languages) > 0 && result.Language != nil {
			languageMatch := false
			for _, lang := range request.Languages {
				if strings.EqualFold(*result.Language, lang) {
					languageMatch = true
					break
				}
			}
			if !languageMatch {
				continue
			}
		}
		
		// Advanced quality filters
		if !s.passesAdvancedQualityFilters(&result) {
			continue
		}
		
		filtered = append(filtered, result)
	}
	
	return filtered
}

// advancedRanking applies sophisticated ranking algorithms
func (s *Service) advancedRanking(results []models.SearchResult, query string) []models.SearchResult {
	// Calculate final scores
	for i := range results {
		results[i].RelevanceScore = s.calculateFinalScore(&results[i], query)
	}
	
	// Sort by final score
	sort.Slice(results, func(i, j int) bool {
		// Primary sort by relevance score
		if math.Abs(results[i].RelevanceScore-results[j].RelevanceScore) > 0.001 {
			return results[i].RelevanceScore > results[j].RelevanceScore
		}
		
		// Secondary sort by quality score
		if results[i].QualityScore != results[j].QualityScore {
			return results[i].QualityScore > results[j].QualityScore
		}
		
		// Tertiary sort by file size (prefer smaller files for ebooks)
		if results[i].FileSizeBytes != nil && results[j].FileSizeBytes != nil {
			return *results[i].FileSizeBytes < *results[j].FileSizeBytes
		}
		
		return false
	})
	
	return results
}

// calculateEnhancedRelevance calculates an enhanced relevance score
func (s *Service) calculateEnhancedRelevance(query string, result *models.SearchResult) float64 {
	query = strings.ToLower(query)
	title := strings.ToLower(result.Title)
	
	score := 0.0
	queryWords := strings.Fields(query)
	
	if len(queryWords) == 0 {
		return 0.0
	}
	
	// Exact title match bonus
	if strings.Contains(title, query) {
		score += 0.5
	}
	
	// Word-by-word analysis
	wordMatches := 0
	for _, word := range queryWords {
		if strings.Contains(title, word) {
			wordMatches++
			
			// Position bonus (words earlier in title are more important)
			pos := strings.Index(title, word)
			positionBonus := math.Max(0, (100.0-float64(pos))/100.0) * 0.1
			score += positionBonus
		}
		
		// Author match bonus
		if result.Author != nil && strings.Contains(strings.ToLower(*result.Author), word) {
			score += 0.2
		}
	}
	
	// Word match ratio
	wordMatchRatio := float64(wordMatches) / float64(len(queryWords))
	score += wordMatchRatio * 0.6
	
	// Format popularity bonus
	formatBonus := s.getFormatPopularityBonus(result.Format)
	score += formatBonus
	
	// Indexer reliability bonus
	indexerBonus := s.getIndexerReliabilityBonus(result.IndexerID)
	score += indexerBonus
	
	return math.Min(score, 1.0)
}

// enhanceQualityScore enhances the quality score based on additional factors
func (s *Service) enhanceQualityScore(result *models.SearchResult) int {
	score := result.QualityScore
	
	// File size reasonableness for ebooks
	if result.FileSizeBytes != nil {
		sizeMB := *result.FileSizeBytes / (1024 * 1024)
		if sizeMB >= 1 && sizeMB <= 50 {
			score += 10
		} else if sizeMB > 100 {
			score -= 15 // Unusually large files might be low quality
		}
	}
	
	// Format preference
	switch strings.ToLower(result.Format) {
	case "epub":
		score += 10 // EPUB is generally preferred for ebooks
	case "pdf":
		score += 5  // PDF is common but less ideal for ebooks
	case "txt":
		score -= 10 // Plain text usually lacks formatting
	}
	
	// Title quality indicators
	title := strings.ToLower(result.Title)
	if strings.Contains(title, "retail") || strings.Contains(title, "original") {
		score += 15
	}
	if strings.Contains(title, "scan") || strings.Contains(title, "ocr") {
		score -= 10
	}
	
	// Clamp score to valid range
	if score > 100 {
		score = 100
	} else if score < 0 {
		score = 0
	}
	
	return score
}

// calculateFinalScore calculates the final ranking score
func (s *Service) calculateFinalScore(result *models.SearchResult, query string) float64 {
	// Weighted combination of factors
	relevanceWeight := 0.4
	qualityWeight := 0.3
	freshnessWeight := 0.1
	popularityWeight := 0.2
	
	relevanceScore := result.RelevanceScore
	qualityScore := float64(result.QualityScore) / 100.0
	
	// Freshness score (newer results get slight bonus)
	freshnessScore := s.calculateFreshnessScore(result.FoundAt)
	
	// Popularity score (based on indexer and format)
	popularityScore := s.calculatePopularityScore(result)
	
	finalScore := relevanceWeight*relevanceScore +
		qualityWeight*qualityScore +
		freshnessWeight*freshnessScore +
		popularityWeight*popularityScore
	
	return finalScore
}

// enrichMetadataAsync enriches search results with external metadata asynchronously
func (s *Service) enrichMetadataAsync(ctx context.Context, results []models.SearchResult) {
	// This runs in the background to avoid blocking the search response
	go func() {
		for i := range results {
			for _, provider := range s.metadataProviders {
				if !provider.IsEnabled() {
					continue
				}
				
				book, err := provider.EnrichMetadata(ctx, &results[i])
				if err != nil {
					s.logger.Debugf("Metadata enrichment failed for %s: %v", provider.GetName(), err)
					continue
				}
				
				if book != nil {
					// Store enriched metadata
					// This would typically be cached for future use
					s.logger.Debugf("Enriched metadata for '%s' from %s", results[i].Title, provider.GetName())
				}
			}
		}
	}()
}

// Helper methods for suggestions
func (s *Service) getTitleSuggestions(ctx context.Context, query string, limit int) []*SearchSuggestion {
	// This would query the books table for title matches
	// Placeholder implementation
	return []*SearchSuggestion{}
}

func (s *Service) getAuthorSuggestions(ctx context.Context, query string, limit int) []*SearchSuggestion {
	// This would query the authors table
	// Placeholder implementation
	return []*SearchSuggestion{}
}

func (s *Service) getSeriesSuggestions(ctx context.Context, query string, limit int) []*SearchSuggestion {
	// This would query the series table
	// Placeholder implementation
	return []*SearchSuggestion{}
}

func (s *Service) getGenreSuggestions(ctx context.Context, query string, limit int) []*SearchSuggestion {
	// This would query the genres table
	// Placeholder implementation
	return []*SearchSuggestion{}
}

func (s *Service) getHistoricalSuggestions(ctx context.Context, userID int64, query string, limit int) []*SearchSuggestion {
	// This would query search history for popular searches
	// Placeholder implementation
	return []*SearchSuggestion{}
}

// Helper methods for query analysis
func (s *Service) isAuthorSearch(query string) bool {
	query = strings.ToLower(query)
	authorIndicators := []string{"by ", "author:", "written by"}
	for _, indicator := range authorIndicators {
		if strings.Contains(query, indicator) {
			return true
		}
	}
	return false
}

func (s *Service) isSeriesSearch(query string) bool {
	query = strings.ToLower(query)
	seriesIndicators := []string{"series", "book 1", "book 2", "volume", "part"}
	for _, indicator := range seriesIndicators {
		if strings.Contains(query, indicator) {
			return true
		}
	}
	return false
}

func (s *Service) expandAbbreviations(query string) string {
	abbreviations := map[string]string{
		"scifi": "science fiction",
		"sf":    "science fiction",
		"ya":    "young adult",
		"nf":    "non fiction",
	}
	
	for abbr, expansion := range abbreviations {
		query = strings.ReplaceAll(strings.ToLower(query), abbr, expansion)
	}
	
	return query
}

func (s *Service) sanitizeQuery(query string) string {
	// Remove characters that might interfere with search
	replacements := map[string]string{
		"[":  "",
		"]":  "",
		"{":  "",
		"}":  "",
		"(":  "",
		")":  "",
		"\"": "",
		"'":  "",
	}
	
	for old, new := range replacements {
		query = strings.ReplaceAll(query, old, new)
	}
	
	return query
}

func (s *Service) extractTitleMetadata(result *models.SearchResult) {
	title := result.Title
	
	// Extract year from title
	if year := s.extractYear(title); year != 0 {
		result.PublicationYear = &year
	}
	
	// Extract edition information
	if strings.Contains(strings.ToLower(title), "revised") {
		if result.Metadata == nil {
			result.Metadata = make(map[string]interface{})
		}
		result.Metadata["edition"] = "revised"
	}
}

func (s *Service) extractYear(title string) int {
	// Simple regex would be better, but this is a basic implementation
	words := strings.Fields(title)
	for _, word := range words {
		if len(word) == 4 {
			if year := s.parseYear(word); year >= 1800 && year <= time.Now().Year() {
				return year
			}
		}
	}
	return 0
}

func (s *Service) parseYear(str string) int {
	year := 0
	for _, r := range str {
		if r < '0' || r > '9' {
			return 0
		}
		year = year*10 + int(r-'0')
	}
	return year
}

func (s *Service) passesAdvancedQualityFilters(result *models.SearchResult) bool {
	title := strings.ToLower(result.Title)
	
	// Filter out obviously bad quality indicators
	badIndicators := []string{
		"cam", "ts", "tc", "r5", "dvdscr", "workprint",
		"sample", "trailer", "fake", "virus",
	}
	
	for _, indicator := range badIndicators {
		if strings.Contains(title, indicator) {
			return false
		}
	}
	
	return true
}

func (s *Service) getFormatPopularityBonus(format string) float64 {
	popularity := map[string]float64{
		"epub": 0.1,
		"pdf":  0.05,
		"mobi": 0.08,
		"azw3": 0.06,
		"txt":  -0.05,
	}
	
	if bonus, exists := popularity[strings.ToLower(format)]; exists {
		return bonus
	}
	return 0.0
}

func (s *Service) getIndexerReliabilityBonus(indexerID int64) float64 {
	// This would be based on historical reliability data
	// For now, return a neutral score
	return 0.0
}

func (s *Service) calculateFreshnessScore(foundAt time.Time) float64 {
	// Newer results get a slight bonus
	hoursOld := time.Since(foundAt).Hours()
	if hoursOld < 24 {
		return 1.0
	} else if hoursOld < 168 { // 1 week
		return 0.8
	} else if hoursOld < 720 { // 1 month
		return 0.6
	}
	return 0.4
}

func (s *Service) calculatePopularityScore(result *models.SearchResult) float64 {
	score := 0.5 // Base score
	
	// Format popularity
	score += s.getFormatPopularityBonus(result.Format)
	
	// Indexer reliability
	score += s.getIndexerReliabilityBonus(result.IndexerID)
	
	return math.Max(0, math.Min(1, score))
}

// Data structures

// SearchSuggestion represents a search suggestion
type SearchSuggestion struct {
	Text      string  `json:"text"`
	Type      string  `json:"type"`
	Count     int     `json:"count"`
	Relevance float64 `json:"relevance"`
}