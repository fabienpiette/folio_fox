package testutil

import (
	"context"
	"fmt"
	"math/rand"
	"runtime"
	"testing"
	"time"

	"github.com/fabienpiette/folio_fox/internal/models"
)

// BenchmarkConfig holds configuration for benchmark tests
type BenchmarkConfig struct {
	NumBooks       int
	NumUsers       int
	NumSearches    int
	NumDownloads   int
	SearchTerms    []string
	Concurrency    int
	TestDuration   time.Duration
}

// DefaultBenchmarkConfig returns a default benchmark configuration
func DefaultBenchmarkConfig() *BenchmarkConfig {
	return &BenchmarkConfig{
		NumBooks:     1000,
		NumUsers:     100,
		NumSearches:  500,
		NumDownloads: 200,
		SearchTerms: []string{
			"fiction", "science fiction", "fantasy", "mystery", "romance",
			"thriller", "biography", "history", "programming", "cookbook",
			"travel", "self-help", "business", "health", "art",
		},
		Concurrency:  10,
		TestDuration: 30 * time.Second,
	}
}

// BenchmarkHelper provides utilities for performance testing
type BenchmarkHelper struct {
	Config *BenchmarkConfig
	Random *rand.Rand
}

// NewBenchmarkHelper creates a new benchmark helper
func NewBenchmarkHelper(config *BenchmarkConfig) *BenchmarkHelper {
	if config == nil {
		config = DefaultBenchmarkConfig()
	}
	
	return &BenchmarkHelper{
		Config: config,
		Random: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// GenerateTestBooks creates a slice of test books for benchmarking
func (bh *BenchmarkHelper) GenerateTestBooks(count int) []*models.Book {
	books := make([]*models.Book, count)
	
	_ = []string{
		"John Smith", "Jane Doe", "Michael Johnson", "Sarah Wilson",
		"David Brown", "Lisa Davis", "Robert Miller", "Jennifer Garcia",
		"William Rodriguez", "Elizabeth Martinez", "James Anderson", "Mary Taylor",
	}
	
	genres := []string{
		"Fiction", "Science Fiction", "Fantasy", "Mystery", "Romance",
		"Thriller", "Biography", "History", "Programming", "Cookbook",
	}
	
	_ = []string{"epub", "pdf", "mobi", "azw3"}
	
	for i := 0; i < count; i++ {
		subtitle := fmt.Sprintf("Test Subtitle %d", i)
		description := fmt.Sprintf("This is a test book description for book %d", i)
		isbn13 := fmt.Sprintf("978%010d", bh.Random.Intn(1000000000))
		pageCount := bh.Random.Intn(500) + 100
		rating := float64(bh.Random.Intn(50)+10) / 10.0 // 1.0 to 5.0
		
		books[i] = &models.Book{
			ID:            int64(i + 1),
			Title:         fmt.Sprintf("Test Book %d", i+1),
			Subtitle:      &subtitle,
			Description:   &description,
			ISBN13:        &isbn13,
			PageCount:     &pageCount,
			RatingAverage: &rating,
			RatingCount:   bh.Random.Intn(1000),
			Tags:          models.StringList{genres[i%len(genres)], "test"},
			CreatedAt:     time.Now().Add(-time.Duration(bh.Random.Intn(365)) * 24 * time.Hour),
			UpdatedAt:     time.Now(),
		}
	}
	
	return books
}

// GenerateTestUsers creates a slice of test users for benchmarking
func (bh *BenchmarkHelper) GenerateTestUsers(count int) []*models.User {
	users := make([]*models.User, count)
	
	_ = []string{
		"John", "Jane", "Michael", "Sarah", "David", "Lisa", "Robert", "Jennifer",
		"William", "Elizabeth", "James", "Mary", "Christopher", "Patricia", "Daniel", "Linda",
	}
	
	_ = []string{
		"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
		"Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Taylor",
	}
	
	for i := 0; i < count; i++ {
		email := fmt.Sprintf("user%d@example.com", i+1)
		
		users[i] = &models.User{
			ID:        int64(i + 1),
			Email:     &email,
			Username:  fmt.Sprintf("user%d", i+1),
			IsActive:  true,
			CreatedAt: time.Now().Add(-time.Duration(bh.Random.Intn(365)) * 24 * time.Hour),
			UpdatedAt: time.Now(),
		}
	}
	
	return users
}

// GenerateSearchTerms creates random search terms
func (bh *BenchmarkHelper) GenerateSearchTerms(count int) []string {
	terms := make([]string, count)
	
	for i := 0; i < count; i++ {
		// Mix of single words and phrases
		if bh.Random.Float32() < 0.3 {
			terms[i] = bh.Config.SearchTerms[bh.Random.Intn(len(bh.Config.SearchTerms))]
		} else {
			term1 := bh.Config.SearchTerms[bh.Random.Intn(len(bh.Config.SearchTerms))]
			term2 := bh.Config.SearchTerms[bh.Random.Intn(len(bh.Config.SearchTerms))]
			terms[i] = fmt.Sprintf("%s %s", term1, term2)
		}
	}
	
	return terms
}

// BenchmarkResult holds the results of a benchmark test
type BenchmarkResult struct {
	Name            string
	Duration        time.Duration
	Operations      int64
	OperationsPerSec float64
	MemoryAllocated int64
	GCPauses        time.Duration
	ErrorCount      int64
	MinLatency      time.Duration
	MaxLatency      time.Duration
	AvgLatency      time.Duration
	P95Latency      time.Duration
	P99Latency      time.Duration
}

// BenchmarkRunner runs performance benchmarks
type BenchmarkRunner struct {
	helper *BenchmarkHelper
	t      *testing.B
}

// NewBenchmarkRunner creates a new benchmark runner
func NewBenchmarkRunner(t *testing.B, config *BenchmarkConfig) *BenchmarkRunner {
	return &BenchmarkRunner{
		helper: NewBenchmarkHelper(config),
		t:      t,
	}
}

// RunDatabaseBenchmarks runs database performance benchmarks
func (br *BenchmarkRunner) RunDatabaseBenchmarks() {
	// This would run various database benchmarks
	br.t.Run("InsertBooks", br.benchmarkInsertBooks)
	br.t.Run("QueryBooks", br.benchmarkQueryBooks)
	br.t.Run("SearchBooks", br.benchmarkSearchBooks)
	br.t.Run("UpdateBooks", br.benchmarkUpdateBooks)
}

// RunSearchBenchmarks runs search performance benchmarks
func (br *BenchmarkRunner) RunSearchBenchmarks() {
	br.t.Run("SimpleSearch", br.benchmarkSimpleSearch)
	br.t.Run("ComplexSearch", br.benchmarkComplexSearch)
	br.t.Run("CachedSearch", br.benchmarkCachedSearch)
	br.t.Run("ConcurrentSearch", br.benchmarkConcurrentSearch)
}

// RunAPIBenchmarks runs API endpoint benchmarks
func (br *BenchmarkRunner) RunAPIBenchmarks() {
	br.t.Run("SearchEndpoint", br.benchmarkSearchEndpoint)
	br.t.Run("LibraryEndpoint", br.benchmarkLibraryEndpoint)
	br.t.Run("DownloadEndpoint", br.benchmarkDownloadEndpoint)
}

// Benchmark implementations (placeholders - would be implemented based on actual services)
func (br *BenchmarkRunner) benchmarkInsertBooks(b *testing.B) {
	books := br.helper.GenerateTestBooks(b.N)
	
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		// Simulate book insertion
		_ = books[i]
		// In real implementation: repo.Create(ctx, books[i])
	}
}

func (br *BenchmarkRunner) benchmarkQueryBooks(b *testing.B) {
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		bookID := int64(br.helper.Random.Intn(1000) + 1)
		// Simulate book query
		_ = bookID
		// In real implementation: repo.GetByID(ctx, bookID)
	}
}

func (br *BenchmarkRunner) benchmarkSearchBooks(b *testing.B) {
	searchTerms := br.helper.GenerateSearchTerms(b.N)
	
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		// Simulate book search
		_ = searchTerms[i%len(searchTerms)]
		// In real implementation: searchService.Search(ctx, userID, request)
	}
}

func (br *BenchmarkRunner) benchmarkUpdateBooks(b *testing.B) {
	books := br.helper.GenerateTestBooks(b.N)
	
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		// Simulate book update
		books[i].UpdatedAt = time.Now()
		// In real implementation: repo.Update(ctx, books[i])
	}
}

func (br *BenchmarkRunner) benchmarkSimpleSearch(b *testing.B) {
	searchTerms := br.helper.GenerateSearchTerms(100)
	
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		term := searchTerms[i%len(searchTerms)]
		// Simulate simple search
		_ = term
		// In real implementation: searchService.SimpleSearch(ctx, term)
	}
}

func (br *BenchmarkRunner) benchmarkComplexSearch(b *testing.B) {
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		// Create complex search request
		request := &models.SearchRequest{
			Query:      br.helper.Config.SearchTerms[i%len(br.helper.Config.SearchTerms)],
			UseCache:   true,
			Timeout:    30,
			Limit:      50,
			MinQuality: 70,
			MaxSizeMB:  100,
			Formats:    []string{"epub", "pdf"},
			Languages:  []string{"en"},
		}
		
		// Simulate complex search
		_ = request
		// In real implementation: searchService.Search(ctx, userID, request)
	}
}

func (br *BenchmarkRunner) benchmarkCachedSearch(b *testing.B) {
	// Use same search term to test caching
	searchTerm := "popular book"
	
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		// Simulate cached search
		_ = searchTerm
		// In real implementation: searchService.Search(ctx, userID, &SearchRequest{Query: searchTerm, UseCache: true})
	}
}

func (br *BenchmarkRunner) benchmarkConcurrentSearch(b *testing.B) {
	searchTerms := br.helper.GenerateSearchTerms(100)
	
	b.ResetTimer()
	b.ReportAllocs()
	
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			term := searchTerms[br.helper.Random.Intn(len(searchTerms))]
			// Simulate concurrent search
			_ = term
			// In real implementation: searchService.Search(ctx, userID, &SearchRequest{Query: term})
		}
	})
}

func (br *BenchmarkRunner) benchmarkSearchEndpoint(b *testing.B) {
	// This would benchmark the HTTP search endpoint
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		// Simulate HTTP search request
		term := br.helper.Config.SearchTerms[i%len(br.helper.Config.SearchTerms)]
		_ = term
		// In real implementation: make HTTP request to /api/v1/search?query=term
	}
}

func (br *BenchmarkRunner) benchmarkLibraryEndpoint(b *testing.B) {
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		// Simulate HTTP library request
		// In real implementation: make HTTP request to /api/v1/library
	}
}

func (br *BenchmarkRunner) benchmarkDownloadEndpoint(b *testing.B) {
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		// Simulate HTTP download request
		downloadID := int64(br.helper.Random.Intn(1000) + 1)
		_ = downloadID
		// In real implementation: make HTTP request to /api/v1/downloads/downloadID
	}
}

// MeasureMemoryUsage measures memory usage during a function execution
func MeasureMemoryUsage(fn func()) (allocatedBytes int64, gcPauses time.Duration) {
	var memBefore, memAfter runtime.MemStats
	
	// Collect garbage before measurement
	runtime.GC()
	
	// Measure before
	runtime.ReadMemStats(&memBefore)
	
	// Execute function
	fn()
	
	// Measure after
	runtime.ReadMemStats(&memAfter)
	
	allocatedBytes = int64(memAfter.TotalAlloc - memBefore.TotalAlloc)
	gcPauses = 0 // Simplified for now
	
	return allocatedBytes, gcPauses
}

// LoadTestConfig holds configuration for load testing
type LoadTestConfig struct {
	Duration     time.Duration
	Concurrency  int
	RampUpTime   time.Duration
	RequestRate  int // requests per second
	TestEndpoint string
}

// LoadTestRunner runs load tests
type LoadTestRunner struct {
	config *LoadTestConfig
	helper *BenchmarkHelper
}

// NewLoadTestRunner creates a new load test runner
func NewLoadTestRunner(config *LoadTestConfig) *LoadTestRunner {
	return &LoadTestRunner{
		config: config,
		helper: NewBenchmarkHelper(nil),
	}
}

// RunLoadTest runs a load test with the specified configuration
func (ltr *LoadTestRunner) RunLoadTest(ctx context.Context, testFunc func(context.Context) error) (*LoadTestResults, error) {
	results := &LoadTestResults{
		StartTime:   time.Now(),
		Duration:    ltr.config.Duration,
		Concurrency: ltr.config.Concurrency,
		Latencies:   make([]time.Duration, 0),
	}
	
	// Channel to collect individual request results
	resultsChan := make(chan RequestResult, ltr.config.Concurrency*100)
	
	// Context with timeout
	testCtx, cancel := context.WithTimeout(ctx, ltr.config.Duration)
	defer cancel()
	
	// Start workers
	for i := 0; i < ltr.config.Concurrency; i++ {
		go ltr.worker(testCtx, testFunc, resultsChan)
	}
	
	// Collect results
	go func() {
		for result := range resultsChan {
			results.TotalRequests++
			results.Latencies = append(results.Latencies, result.Latency)
			
			if result.Error != nil {
				results.ErrorCount++
			} else {
				results.SuccessCount++
			}
		}
	}()
	
	// Wait for test completion
	<-testCtx.Done()
	close(resultsChan)
	
	// Calculate final statistics
	results.EndTime = time.Now()
	results.calculateStatistics()
	
	return results, nil
}

// RequestResult holds the result of a single request
type RequestResult struct {
	Latency time.Duration
	Error   error
}

// LoadTestResults holds the results of a load test
type LoadTestResults struct {
	StartTime      time.Time
	EndTime        time.Time
	Duration       time.Duration
	Concurrency    int
	TotalRequests  int64
	SuccessCount   int64
	ErrorCount     int64
	Latencies      []time.Duration
	MinLatency     time.Duration
	MaxLatency     time.Duration
	AvgLatency     time.Duration
	P95Latency     time.Duration
	P99Latency     time.Duration
	RequestsPerSec float64
	ErrorRate      float64
}

// worker runs individual load test requests
func (ltr *LoadTestRunner) worker(ctx context.Context, testFunc func(context.Context) error, results chan<- RequestResult) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			start := time.Now()
			err := testFunc(ctx)
			latency := time.Since(start)
			
			results <- RequestResult{
				Latency: latency,
				Error:   err,
			}
			
			// Rate limiting if configured
			if ltr.config.RequestRate > 0 {
				interval := time.Second / time.Duration(ltr.config.RequestRate)
				time.Sleep(interval)
			}
		}
	}
}

// calculateStatistics calculates final statistics for load test results
func (results *LoadTestResults) calculateStatistics() {
	if len(results.Latencies) == 0 {
		return
	}
	
	// Sort latencies for percentile calculations
	latencies := make([]time.Duration, len(results.Latencies))
	copy(latencies, results.Latencies)
	
	// Simple sorting (could use sort.Slice for better performance)
	for i := 0; i < len(latencies)-1; i++ {
		for j := i + 1; j < len(latencies); j++ {
			if latencies[i] > latencies[j] {
				latencies[i], latencies[j] = latencies[j], latencies[i]
			}
		}
	}
	
	// Calculate statistics
	results.MinLatency = latencies[0]
	results.MaxLatency = latencies[len(latencies)-1]
	
	// Average latency
	var total time.Duration
	for _, latency := range latencies {
		total += latency
	}
	results.AvgLatency = total / time.Duration(len(latencies))
	
	// Percentiles
	p95Index := int(float64(len(latencies)) * 0.95)
	p99Index := int(float64(len(latencies)) * 0.99)
	
	if p95Index < len(latencies) {
		results.P95Latency = latencies[p95Index]
	}
	if p99Index < len(latencies) {
		results.P99Latency = latencies[p99Index]
	}
	
	// Requests per second
	actualDuration := results.EndTime.Sub(results.StartTime)
	results.RequestsPerSec = float64(results.TotalRequests) / actualDuration.Seconds()
	
	// Error rate
	results.ErrorRate = float64(results.ErrorCount) / float64(results.TotalRequests) * 100
}