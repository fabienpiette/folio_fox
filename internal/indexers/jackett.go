package indexers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
	"golang.org/x/time/rate"
	"github.com/foliofox/foliofox/internal/models"
)

// JackettClient handles communication with Jackett API
type JackettClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
	limiter    *rate.Limiter
	logger     *logrus.Logger
}

// NewJackettClient creates a new Jackett API client
func NewJackettClient(config *models.JackettConfig, logger *logrus.Logger) *JackettClient {
	// Create rate limiter based on configuration
	limiter := rate.NewLimiter(
		rate.Every(time.Duration(config.RateLimitWindow)*time.Second/time.Duration(config.RateLimitRequests)),
		config.RateLimitRequests,
	)

	return &JackettClient{
		baseURL: config.BaseURL,
		apiKey:  config.APIKey,
		httpClient: &http.Client{
			Timeout: time.Duration(config.TimeoutSeconds) * time.Second,
		},
		limiter: limiter,
		logger:  logger,
	}
}

// TestConnection tests the connection to Jackett
func (c *JackettClient) TestConnection(ctx context.Context) (*models.IndexerTestResult, error) {
	start := time.Now()
	
	if err := c.limiter.Wait(ctx); err != nil {
		return nil, fmt.Errorf("rate limit error: %w", err)
	}

	// Make request to server info endpoint
	req, err := c.createRequest(ctx, "GET", "/api/v2.0/server/config", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		errMsg := err.Error()
		return &models.IndexerTestResult{
			Success:      false,
			ErrorMessage: &errMsg,
		}, nil
	}
	defer resp.Body.Close()

	responseTime := int(time.Since(start).Milliseconds())

	if resp.StatusCode != http.StatusOK {
		errMsg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		return &models.IndexerTestResult{
			Success:        false,
			ResponseTimeMS: responseTime,
			ErrorMessage:   &errMsg,
		}, nil
	}

	// Parse response to get version info
	var configResp struct {
		Version string `json:"version"`
	}
	
	body, err := io.ReadAll(resp.Body)
	if err == nil {
		json.Unmarshal(body, &configResp)
	}

	// Get indexer count
	indexers, _ := c.GetIndexers(ctx)
	indexerCount := len(indexers)
	configuredCount := 0
	for _, indexer := range indexers {
		if indexer.IsConfigured {
			configuredCount++
		}
	}

	capabilities := []string{"search", "torrent", "indexer_management"}

	return &models.IndexerTestResult{
		Success:        true,
		ResponseTimeMS: responseTime,
		Version:        &configResp.Version,
		Capabilities:   capabilities,
	}, nil
}

// GetIndexers retrieves all indexers from Jackett
func (c *JackettClient) GetIndexers(ctx context.Context) ([]*models.JackettIndexer, error) {
	if err := c.limiter.Wait(ctx); err != nil {
		return nil, fmt.Errorf("rate limit error: %w", err)
	}

	req, err := c.createRequest(ctx, "GET", "/api/v2.0/indexers", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var jackettIndexers []struct {
		ID           string   `json:"id"`
		Name         string   `json:"name"`
		Description  *string  `json:"description"`
		Language     string   `json:"language"`
		Type         string   `json:"type"`
		Configured   bool     `json:"configured"`
		LastError    *string  `json:"last_error"`
		Caps         []string `json:"caps"`
	}

	if err := json.Unmarshal(body, &jackettIndexers); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	// Convert to our model
	indexers := make([]*models.JackettIndexer, len(jackettIndexers))
	for i, ji := range jackettIndexers {
		isWorking := ji.LastError == nil
		
		indexers[i] = &models.JackettIndexer{
			JackettID:    ji.ID,
			Name:         ji.Name,
			Description:  ji.Description,
			Language:     ji.Language,
			Type:         ji.Type,
			Category:     c.extractCategory(ji.Name, ji.Type),
			IsConfigured: ji.Configured,
			IsWorking:    &isWorking,
			LastError:    ji.LastError,
			Capabilities: ji.Caps,
		}
	}

	c.logger.Infof("Retrieved %d indexers from Jackett", len(indexers))
	return indexers, nil
}

// Search performs a search across Jackett indexers
func (c *JackettClient) Search(ctx context.Context, request *models.SearchRequest) (*models.SearchResponse, error) {
	start := time.Now()
	
	if err := c.limiter.Wait(ctx); err != nil {
		return nil, fmt.Errorf("rate limit error: %w", err)
	}

	// Build search URL - Jackett uses different endpoints for different search types
	searchURL := "/api/v2.0/indexers/all/results"
	params := url.Values{}
	params.Set("apikey", c.apiKey)
	params.Set("Query", request.Query)
	
	// Add category filter for ebooks if specified
	if len(request.Formats) > 0 {
		// Map formats to Jackett categories
		params.Set("Category", "7000,7020") // eBooks categories
	}

	fullURL := searchURL + "?" + params.Encode()
	
	req, err := c.createRequest(ctx, "GET", fullURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("search request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("search failed with HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var searchResp struct {
		Results []struct {
			Tracker       string  `json:"Tracker"`
			TrackerId     string  `json:"TrackerId"`
			CategoryDesc  string  `json:"CategoryDesc"`
			Title         string  `json:"Title"`
			Size          *int64  `json:"Size"`
			Seeders       *int    `json:"Seeders"`
			Peers         *int    `json:"Peers"`
			Link          string  `json:"Link"`
			Details       *string `json:"Details"`
			PublishDate   *string `json:"PublishDate"`
			Grabs         *int    `json:"Grabs"`
		} `json:"Results"`
	}

	if err := json.Unmarshal(body, &searchResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal search response: %w", err)
	}

	// Convert to our search results
	results := make([]models.SearchResult, 0, len(searchResp.Results))
	indexerStats := make(map[string]*models.IndexerSearchResult)
	indexerIDMap := make(map[string]int64) // Map tracker names to IDs

	for i, result := range searchResp.Results {
		// Skip non-ebook results
		if !c.isEbookResult(result.Title, result.CategoryDesc) {
			continue
		}

		// Track indexer statistics
		trackerName := result.Tracker
		if _, exists := indexerStats[trackerName]; !exists {
			indexerID := int64(i + 1) // Simple ID mapping
			indexerIDMap[trackerName] = indexerID
			indexerStats[trackerName] = &models.IndexerSearchResult{
				IndexerID:   indexerID,
				IndexerName: trackerName,
				ResultCount: 0,
			}
		}
		indexerStats[trackerName].ResultCount++

		// Extract format and other metadata
		format := c.extractFormat(result.Title, result.CategoryDesc)
		author := c.extractAuthor(result.Title)
		
		// Calculate quality score
		qualityScore := c.calculateQualityScore(result.Seeders, result.Size)

		var publishedDate *time.Time
		if result.PublishDate != nil {
			if t, err := time.Parse("2006-01-02T15:04:05", *result.PublishDate); err == nil {
				publishedDate = &t
			}
		}

		searchResult := models.SearchResult{
			IndexerID:       indexerIDMap[trackerName],
			IndexerName:     trackerName,
			Title:           result.Title,
			Author:          author,
			Format:          format,
			FileSizeBytes:   result.Size,
			FileSizeHuman:   c.formatFileSize(result.Size),
			QualityScore:    qualityScore,
			DownloadURL:     result.Link,
			SourceURL:       result.Details,
			FoundAt:         time.Now(),
			RelevanceScore:  c.calculateRelevanceScore(request.Query, result.Title),
			Metadata: map[string]interface{}{
				"seeders":       result.Seeders,
				"peers":         result.Peers,
				"grabs":         result.Grabs,
				"category":      result.CategoryDesc,
				"tracker_id":    result.TrackerId,
				"publish_date":  publishedDate,
			},
		}

		results = append(results, searchResult)
	}

	// Convert indexer stats map to slice
	indexersSearched := make([]models.IndexerSearchResult, 0, len(indexerStats))
	for _, stat := range indexerStats {
		stat.ResponseTimeMS = int(time.Since(start).Milliseconds())
		indexersSearched = append(indexersSearched, *stat)
	}

	response := &models.SearchResponse{
		Query:            request.Query,
		Results:          results,
		TotalResults:     len(results),
		IndexersSearched: indexersSearched,
		SearchDurationMS: int(time.Since(start).Milliseconds()),
		Cached:           false,
	}

	c.logger.Infof("Jackett search for '%s' returned %d results in %dms", 
		request.Query, len(results), response.SearchDurationMS)

	return response, nil
}

// createRequest creates an HTTP request with proper headers
func (c *JackettClient) createRequest(ctx context.Context, method, path string, body []byte) (*http.Request, error) {
	fullURL := c.baseURL + path
	
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, bodyReader)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "FolioFox/1.0")

	return req, nil
}

// extractCategory extracts category from indexer name/type
func (c *JackettClient) extractCategory(name, indexerType string) string {
	name = strings.ToLower(name)
	if strings.Contains(name, "ebook") || strings.Contains(name, "book") {
		return "ebooks"
	}
	return "general"
}

// isEbookResult determines if a result is likely an ebook
func (c *JackettClient) isEbookResult(title, category string) bool {
	title = strings.ToLower(title)
	category = strings.ToLower(category)
	
	// Check for ebook file extensions
	ebookExtensions := []string{".epub", ".pdf", ".mobi", ".azw3", ".djvu", ".fb2", ".txt"}
	for _, ext := range ebookExtensions {
		if strings.Contains(title, ext) {
			return true
		}
	}
	
	// Check category
	if strings.Contains(category, "ebook") || strings.Contains(category, "book") {
		return true
	}
	
	// Check for book-related keywords
	bookKeywords := []string{"epub", "pdf", "mobi", "kindle", "book", "novel", "fiction"}
	for _, keyword := range bookKeywords {
		if strings.Contains(title, keyword) {
			return true
		}
	}
	
	return false
}

// extractAuthor attempts to extract author name from title
func (c *JackettClient) extractAuthor(title string) *string {
	// Common patterns for author extraction
	patterns := []string{
		"by ",
		"- ",
		" - ",
	}
	
	title = strings.ToLower(title)
	for _, pattern := range patterns {
		if idx := strings.Index(title, pattern); idx != -1 {
			author := strings.TrimSpace(title[idx+len(pattern):])
			// Take only the first part before any other separators
			if spaceIdx := strings.Index(author, " "); spaceIdx != -1 && spaceIdx < 50 {
				author = author[:spaceIdx+1] + strings.Fields(author[spaceIdx+1:])[0]
			}
			if len(author) > 3 && len(author) < 100 {
				return &author
			}
		}
	}
	
	return nil
}

// Other helper methods are similar to ProwlarrClient...