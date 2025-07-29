package indexers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/sirupsen/logrus"
	"golang.org/x/time/rate"
	"github.com/fabienpiette/folio_fox/internal/models"
)

// ProwlarrClient handles communication with Prowlarr API
type ProwlarrClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
	limiter    *rate.Limiter
	logger     *logrus.Logger
}

// NewProwlarrClient creates a new Prowlarr API client
func NewProwlarrClient(config *models.ProwlarrConfig, logger *logrus.Logger) *ProwlarrClient {
	// Create rate limiter based on configuration
	limiter := rate.NewLimiter(
		rate.Every(time.Duration(config.RateLimitWindow)*time.Second/time.Duration(config.RateLimitRequests)),
		config.RateLimitRequests,
	)

	return &ProwlarrClient{
		baseURL: config.BaseURL,
		apiKey:  config.APIKey,
		httpClient: &http.Client{
			Timeout: time.Duration(config.TimeoutSeconds) * time.Second,
		},
		limiter: limiter,
		logger:  logger,
	}
}

// TestConnection tests the connection to Prowlarr
func (c *ProwlarrClient) TestConnection(ctx context.Context) (*models.IndexerTestResult, error) {
	start := time.Now()
	
	// Wait for rate limiter
	if err := c.limiter.Wait(ctx); err != nil {
		return nil, fmt.Errorf("rate limit error: %w", err)
	}

	// Make request to system status endpoint
	req, err := c.createRequest(ctx, "GET", "/api/v1/system/status", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return &models.IndexerTestResult{
			Success:      false,
			ErrorMessage: &err.Error(),
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
	var statusResp struct {
		Version string `json:"version"`
	}
	
	body, err := io.ReadAll(resp.Body)
	if err == nil {
		json.Unmarshal(body, &statusResp)
	}

	capabilities := []string{"search", "rss", "indexer_management"}

	return &models.IndexerTestResult{
		Success:        true,
		ResponseTimeMS: responseTime,
		Version:        &statusResp.Version,
		Capabilities:   capabilities,
	}, nil
}

// GetIndexers retrieves all indexers from Prowlarr
func (c *ProwlarrClient) GetIndexers(ctx context.Context) ([]*models.ProwlarrIndexer, error) {
	if err := c.limiter.Wait(ctx); err != nil {
		return nil, fmt.Errorf("rate limit error: %w", err)
	}

	req, err := c.createRequest(ctx, "GET", "/api/v1/indexer", nil)
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

	var prowlarrIndexers []struct {
		ID           int      `json:"id"`
		Name         string   `json:"name"`
		Description  *string  `json:"description"`
		Language     string   `json:"language"`
		Type         string   `json:"type"`
		Protocol     string   `json:"protocol"`
		Categories   []int    `json:"categories"`
		Capabilities []string `json:"capabilities"`
		Enable       bool     `json:"enable"`
		Priority     int      `json:"priority"`
		Added        *string  `json:"added"`
	}

	if err := json.Unmarshal(body, &prowlarrIndexers); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	// Convert to our model
	indexers := make([]*models.ProwlarrIndexer, len(prowlarrIndexers))
	for i, pi := range prowlarrIndexers {
		var lastSync *time.Time
		if pi.Added != nil {
			if t, err := time.Parse(time.RFC3339, *pi.Added); err == nil {
				lastSync = &t
			}
		}

		indexers[i] = &models.ProwlarrIndexer{
			ProwlarrID:   pi.ID,
			Name:         pi.Name,
			Description:  pi.Description,
			Language:     pi.Language,
			Type:         pi.Type,
			Protocol:     pi.Protocol,
			Categories:   pi.Categories,
			Capabilities: pi.Capabilities,
			IsEnabled:    pi.Enable,
			Priority:     pi.Priority,
			LastRSSSync:  lastSync,
		}
	}

	c.logger.Infof("Retrieved %d indexers from Prowlarr", len(indexers))
	return indexers, nil
}

// Search performs a search across Prowlarr indexers
func (c *ProwlarrClient) Search(ctx context.Context, request *models.SearchRequest) (*models.SearchResponse, error) {
	start := time.Now()
	
	if err := c.limiter.Wait(ctx); err != nil {
		return nil, fmt.Errorf("rate limit error: %w", err)
	}

	// Build search URL
	searchURL := "/api/v1/search"
	params := url.Values{}
	params.Set("query", request.Query)
	
	if len(request.Indexers) > 0 {
		for _, indexerID := range request.Indexers {
			params.Add("indexerIds", strconv.FormatInt(indexerID, 10))
		}
	}
	
	if request.Limit > 0 {
		params.Set("limit", strconv.Itoa(request.Limit))
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
			IndexerID    int     `json:"indexerId"`
			IndexerName  string  `json:"indexerName"`
			Title        string  `json:"title"`
			Size         *int64  `json:"size"`
			Seeders      *int    `json:"seeders"`
			Leechers     *int    `json:"leechers"`
			Category     string  `json:"category"`
			DownloadURL  string  `json:"downloadUrl"`
			InfoURL      *string `json:"infoUrl"`
			PublishDate  *string `json:"publishDate"`
			Grabs        *int    `json:"grabs"`
			Files        *int    `json:"files"`
		} `json:"results"`
	}

	if err := json.Unmarshal(body, &searchResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal search response: %w", err)
	}

	// Convert to our search results
	results := make([]models.SearchResult, len(searchResp.Results))
	indexerStats := make(map[int64]*models.IndexerSearchResult)

	for i, result := range searchResp.Results {
		// Track indexer statistics
		indexerID := int64(result.IndexerID)
		if _, exists := indexerStats[indexerID]; !exists {
			indexerStats[indexerID] = &models.IndexerSearchResult{
				IndexerID:   indexerID,
				IndexerName: result.IndexerName,
				ResultCount: 0,
			}
		}
		indexerStats[indexerID].ResultCount++

		// Determine file format from title or category
		format := c.extractFormat(result.Title, result.Category)
		
		// Calculate quality score based on seeders, size, etc.
		qualityScore := c.calculateQualityScore(result.Seeders, result.Size)

		var publishedDate *time.Time
		if result.PublishDate != nil {
			if t, err := time.Parse(time.RFC3339, *result.PublishDate); err == nil {
				publishedDate = &t
			}
		}

		results[i] = models.SearchResult{
			IndexerID:       indexerID,
			IndexerName:     result.IndexerName,
			Title:           result.Title,
			Format:          format,
			FileSizeBytes:   result.Size,
			FileSizeHuman:   c.formatFileSize(result.Size),
			QualityScore:    qualityScore,
			DownloadURL:     result.DownloadURL,
			SourceURL:       result.InfoURL,
			FoundAt:         time.Now(),
			RelevanceScore:  c.calculateRelevanceScore(request.Query, result.Title),
			Metadata: map[string]interface{}{
				"seeders":  result.Seeders,
				"leechers": result.Leechers,
				"grabs":    result.Grabs,
				"files":    result.Files,
			},
		}
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

	c.logger.Infof("Prowlarr search for '%s' returned %d results in %dms", 
		request.Query, len(results), response.SearchDurationMS)

	return response, nil
}

// createRequest creates an HTTP request with proper headers and authentication
func (c *ProwlarrClient) createRequest(ctx context.Context, method, path string, body []byte) (*http.Request, error) {
	fullURL := c.baseURL + path
	
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, bodyReader)
	if err != nil {
		return nil, err
	}

	// Add API key header
	req.Header.Set("X-Api-Key", c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "FolioFox/1.0")

	return req, nil
}

// extractFormat attempts to extract file format from title or category
func (c *ProwlarrClient) extractFormat(title, category string) string {
	title = strings.ToLower(title)
	
	formats := []string{"epub", "pdf", "mobi", "azw3", "txt", "djvu", "fb2", "rtf"}
	for _, format := range formats {
		if strings.Contains(title, "."+format) || strings.Contains(title, " "+format+" ") {
			return format
		}
	}
	
	// Default based on category
	if strings.Contains(strings.ToLower(category), "ebook") {
		return "epub"
	}
	
	return "unknown"
}

// calculateQualityScore calculates a quality score based on various factors
func (c *ProwlarrClient) calculateQualityScore(seeders *int, size *int64) int {
	score := 50 // Base score
	
	if seeders != nil {
		// More seeders = higher quality
		if *seeders > 10 {
			score += 30
		} else if *seeders > 5 {
			score += 20
		} else if *seeders > 0 {
			score += 10
		}
	}
	
	if size != nil {
		// Reasonable file size for books (1MB - 50MB)
		sizeMB := *size / (1024 * 1024)
		if sizeMB >= 1 && sizeMB <= 50 {
			score += 20
		} else if sizeMB > 50 && sizeMB <= 100 {
			score += 10
		} else if sizeMB > 100 {
			score -= 10 // Very large files might be low quality
		}
	}
	
	if score > 100 {
		score = 100
	} else if score < 0 {
		score = 0
	}
	
	return score
}

// calculateRelevanceScore calculates relevance based on query and title similarity
func (c *ProwlarrClient) calculateRelevanceScore(query, title string) float64 {
	query = strings.ToLower(query)
	title = strings.ToLower(title)
	
	// Simple relevance scoring based on word matches
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

// formatFileSize formats file size in human readable format
func (c *ProwlarrClient) formatFileSize(size *int64) string {
	if size == nil {
		return "Unknown"
	}
	
	const unit = 1024
	s := *size
	if s < unit {
		return fmt.Sprintf("%d B", s)
	}
	
	div, exp := int64(unit), 0
	for n := s / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	
	return fmt.Sprintf("%.1f %cB", float64(s)/float64(div), "KMGTPE"[exp])
}