package downloads

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/foliofox/foliofox/internal/models"
	"github.com/foliofox/foliofox/internal/repositories"
)

// OptimizedManager provides high-performance concurrent download management
type OptimizedManager struct {
	downloadRepo     repositories.DownloadRepository
	userPrefRepo     repositories.UserPreferencesRepository
	fileManager      *FileManager
	logger           *logrus.Logger
	
	// Performance optimization components
	bandwidthManager *BandwidthManager
	priorityQueue    *PriorityQueue
	memoryManager    *MemoryManager
	performanceMonitor *DownloadPerformanceMonitor
	
	// Configuration
	config *DownloadConfig
	
	// State management
	activeDownloads   *ActiveDownloadTracker
	downloadQueue     chan *models.DownloadQueueItem
	stopChan          chan struct{}
	wg                sync.WaitGroup
	
	// Progress tracking optimization
	progressBroadcaster *ProgressBroadcaster
	
	// Adaptive scaling
	workerController *WorkerController
}

// DownloadConfig holds performance-related configuration
type DownloadConfig struct {
	MaxConcurrentDownloads  int           `json:"max_concurrent_downloads"`
	MinConcurrentDownloads  int           `json:"min_concurrent_downloads"`
	DownloadTimeout         time.Duration `json:"download_timeout"`
	RetryDelay             time.Duration `json:"retry_delay"`
	MaxBandwidthKBPS       int64         `json:"max_bandwidth_kbps"`
	MemoryLimitMB          int           `json:"memory_limit_mb"`
	AdaptiveScaling        bool          `json:"adaptive_scaling"`
	PriorityQueueSize      int           `json:"priority_queue_size"`
	ProgressUpdateInterval time.Duration `json:"progress_update_interval"`
	EnableMetrics          bool          `json:"enable_metrics"`
	ChunkSize              int64         `json:"chunk_size"`
}

// BandwidthManager controls download bandwidth usage
type BandwidthManager struct {
	maxBandwidthKBPS   int64
	currentUsageKBPS   int64
	downloadTokens     chan struct{}
	mu                 sync.RWMutex
	lastUpdate         time.Time
	usageHistory       []int64
	windowSize         int
}

// PriorityQueue manages download prioritization
type PriorityQueue struct {
	items    []*QueueItem
	capacity int
	mu       sync.RWMutex
}

// QueueItem represents a prioritized download item
type QueueItem struct {
	Download     *models.DownloadQueueItem
	Priority     int64
	UserPriority int
	TimePriority int64
	QueuedAt     time.Time
	EstimatedETASeconds int64
}

// MemoryManager controls memory usage during downloads
type MemoryManager struct {
	maxMemoryMB     int
	currentUsageMB  int64
	downloadBuffers map[int64][]byte
	mu              sync.RWMutex
	gcTriggerMB     int
}

// ActiveDownloadTracker efficiently tracks active downloads
type ActiveDownloadTracker struct {
	downloads map[int64]*OptimizedDownloadWorker
	mu        sync.RWMutex
	count     int32
}

// OptimizedDownloadWorker represents an enhanced download worker
type OptimizedDownloadWorker struct {
	item            *models.DownloadQueueItem
	httpClient      *http.Client
	cancelFunc      context.CancelFunc
	progressChan    chan *models.DownloadProgress
	startTime       time.Time
	bytesDownloaded int64
	downloadSpeed   int64 // bytes per second
	lastProgressTime time.Time
	memoryBuffer    []byte
	bandwidthToken  chan struct{}
	mu              sync.RWMutex
}

// ProgressBroadcaster efficiently broadcasts progress updates
type ProgressBroadcaster struct {
	progressUpdates chan *ProgressUpdate
	callbacks       map[int64][]func(*models.DownloadProgress)
	mu              sync.RWMutex
	batchSize       int
	flushInterval   time.Duration
}

// ProgressUpdate represents a progress update
type ProgressUpdate struct {
	DownloadID int64
	Progress   *models.DownloadProgress
	Timestamp  time.Time
}

// WorkerController manages adaptive worker scaling
type WorkerController struct {
	currentWorkers  int32
	minWorkers      int32
	maxWorkers      int32
	scaleUpThreshold  float64
	scaleDownThreshold float64
	lastScaleTime   time.Time
	cooldownPeriod  time.Duration
	metrics         *WorkerMetrics
	mu              sync.RWMutex
}

// WorkerMetrics tracks worker performance metrics
type WorkerMetrics struct {
	ActiveWorkers       int32
	IdleWorkers        int32
	QueueLength        int32
	AverageWaitTime    time.Duration
	AverageProcessTime time.Duration
	ThroughputMBPS     float64
}

// DownloadPerformanceMonitor tracks download performance
type DownloadPerformanceMonitor struct {
	metrics map[string]*DownloadMetric
	mu      sync.RWMutex
	logger  *logrus.Logger
	enabled bool
}

// DownloadMetric stores download performance data
type DownloadMetric struct {
	TotalDownloads    int64
	CompletedDownloads int64
	FailedDownloads   int64
	TotalBytesDownloaded int64
	AverageSpeedKBPS  float64
	AverageFileSize   int64
	LastUpdated       time.Time
}

// NewOptimizedManager creates a new optimized download manager
func NewOptimizedManager(
	downloadRepo repositories.DownloadRepository,
	userPrefRepo repositories.UserPreferencesRepository,
	fileManager *FileManager,
	logger *logrus.Logger,
	config *DownloadConfig,
) *OptimizedManager {
	if config == nil {
		config = &DownloadConfig{
			MaxConcurrentDownloads:  runtime.NumCPU() * 2,
			MinConcurrentDownloads:  2,
			DownloadTimeout:         30 * time.Minute,
			RetryDelay:             5 * time.Minute,
			MaxBandwidthKBPS:       10240, // 10 MB/s
			MemoryLimitMB:          256,
			AdaptiveScaling:        true,
			PriorityQueueSize:      10000,
			ProgressUpdateInterval: 1 * time.Second,
			EnableMetrics:          true,
			ChunkSize:              64 * 1024, // 64KB chunks
		}
	}

	return &OptimizedManager{
		downloadRepo:        downloadRepo,
		userPrefRepo:        userPrefRepo,
		fileManager:         fileManager,
		logger:              logger,
		config:              config,
		bandwidthManager:    NewBandwidthManager(config.MaxBandwidthKBPS),
		priorityQueue:       NewPriorityQueue(config.PriorityQueueSize),
		memoryManager:       NewMemoryManager(config.MemoryLimitMB),
		performanceMonitor:  NewDownloadPerformanceMonitor(logger, config.EnableMetrics),
		activeDownloads:     NewActiveDownloadTracker(),
		downloadQueue:       make(chan *models.DownloadQueueItem, config.PriorityQueueSize),
		stopChan:           make(chan struct{}),
		progressBroadcaster: NewProgressBroadcaster(config.ProgressUpdateInterval),
		workerController:    NewWorkerController(config),
	}
}

// Start begins optimized download processing
func (dm *OptimizedManager) Start(ctx context.Context) {
	dm.logger.Info("Starting optimized download manager")
	
	// Start progress broadcaster
	dm.wg.Add(1)
	go dm.progressBroadcaster.Start(ctx, &dm.wg)
	
	// Start bandwidth manager
	dm.wg.Add(1)
	go dm.bandwidthManager.Start(ctx, &dm.wg)
	
	// Start memory manager
	dm.wg.Add(1)
	go dm.memoryManager.Start(ctx, &dm.wg)
	
	// Start queue feeder
	dm.wg.Add(1)
	go dm.queueFeeder(ctx)
	
	// Start performance monitoring
	if dm.config.EnableMetrics {
		dm.wg.Add(1)
		go dm.performanceMonitor.Start(ctx, &dm.wg)
	}
	
	// Start initial workers
	initialWorkers := dm.config.MinConcurrentDownloads
	if !dm.config.AdaptiveScaling {
		initialWorkers = dm.config.MaxConcurrentDownloads
	}
	
	for i := 0; i < initialWorkers; i++ {
		dm.wg.Add(1)
		go dm.optimizedDownloadWorker(ctx, i)
	}
	
	// Start worker controller for adaptive scaling
	if dm.config.AdaptiveScaling {
		dm.wg.Add(1)
		go dm.workerController.Start(ctx, &dm.wg, dm)
	}
}

// AddDownload adds a download with enhanced prioritization
func (dm *OptimizedManager) AddDownload(ctx context.Context, request *models.DownloadCreateRequest, userID int64) (*models.DownloadQueueItem, error) {
	// Create download queue item
	item := &models.DownloadQueueItem{
		UserID:               userID,
		BookID:               request.BookID,
		IndexerID:            request.IndexerID,
		Title:                request.Title,
		AuthorName:           request.AuthorName,
		DownloadURL:          request.DownloadURL,
		FileFormat:           request.FileFormat,
		FileSizeBytes:        request.FileSizeBytes,
		Priority:             request.Priority,
		Status:               models.DownloadStatusPending,
		ProgressPercentage:   0,
		QualityProfileID:     request.QualityProfileID,
		RetryCount:           0,
		MaxRetries:           3,
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}
	
	// Enhanced priority calculation
	priority := dm.calculateEnhancedPriority(item, userID)
	
	// Estimate download time for queue optimization
	estimatedTime := dm.estimateDownloadTime(item)
	
	// Set default priority if not specified
	if item.Priority == 0 {
		item.Priority = 5
	}
	
	// Determine optimized download path
	downloadPath, err := dm.determineOptimizedDownloadPath(ctx, userID, request)
	if err != nil {
		return nil, fmt.Errorf("failed to determine download path: %w", err)
	}
	item.DownloadPath = &downloadPath
	
	// Save to database
	if err := dm.downloadRepo.CreateQueueItem(ctx, item); err != nil {
		return nil, fmt.Errorf("failed to create queue item: %w", err)
	}
	
	// Add to priority queue
	queueItem := &QueueItem{
		Download:     item,
		Priority:     priority,
		UserPriority: item.Priority,
		TimePriority: time.Now().Unix(),
		QueuedAt:     time.Now(),
		EstimatedETASeconds: estimatedTime,
	}
	
	dm.priorityQueue.Push(queueItem)
	
	dm.logger.Infof("Added download to optimized queue: %s (ID: %d, Priority: %d, ETA: %ds)", 
		item.Title, item.ID, priority, estimatedTime)
	
	return item, nil
}

// optimizedDownloadWorker processes downloads with enhanced performance
func (dm *OptimizedManager) optimizedDownloadWorker(ctx context.Context, workerID int) {
	defer dm.wg.Done()
	
	dm.logger.Infof("Optimized download worker %d started", workerID)
	atomic.AddInt32(&dm.workerController.currentWorkers, 1)
	
	defer func() {
		atomic.AddInt32(&dm.workerController.currentWorkers, -1)
		dm.logger.Infof("Optimized download worker %d stopped", workerID)
	}()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-dm.stopChan:
			return
		case item := <-dm.downloadQueue:
			if item != nil {
				dm.processOptimizedDownload(ctx, item, workerID)
			}
		case <-time.After(5 * time.Second):
			// Check for priority queue items
			if queueItem := dm.priorityQueue.Pop(); queueItem != nil {
				dm.processOptimizedDownload(ctx, queueItem.Download, workerID)
			}
		}
	}
}

// processOptimizedDownload handles optimized download processing
func (dm *OptimizedManager) processOptimizedDownload(ctx context.Context, item *models.DownloadQueueItem, workerID int) {
	startTime := time.Now()
	dm.logger.Infof("Worker %d starting optimized download: %s (ID: %d)", workerID, item.Title, item.ID)
	
	// Get bandwidth token
	bandwidthToken := dm.bandwidthManager.AcquireToken()
	defer dm.bandwidthManager.ReleaseToken(bandwidthToken)
	
	// Allocate memory buffer
	memoryBuffer, err := dm.memoryManager.AllocateBuffer(item.ID, dm.config.ChunkSize)
	if err != nil {
		dm.logger.Errorf("Failed to allocate memory buffer: %v", err)
		dm.handleDownloadError(ctx, item, err)
		return
	}
	defer dm.memoryManager.ReleaseBuffer(item.ID)
	
	// Create download context with timeout
	downloadCtx, cancel := context.WithTimeout(ctx, dm.config.DownloadTimeout)
	defer cancel()
	
	// Create optimized worker
	worker := &OptimizedDownloadWorker{
		item:            item,
		httpClient:      dm.createOptimizedHTTPClient(),
		cancelFunc:      cancel,
		progressChan:    make(chan *models.DownloadProgress, 10),
		startTime:       startTime,
		memoryBuffer:    memoryBuffer,
		bandwidthToken:  bandwidthToken,
	}
	
	// Register worker
	dm.activeDownloads.Add(item.ID, worker)
	defer dm.activeDownloads.Remove(item.ID)
	
	// Update status
	if err := dm.downloadRepo.SetStatus(downloadCtx, item.ID, models.DownloadStatusDownloading, nil); err != nil {
		dm.logger.Errorf("Failed to update download status: %v", err)
		return
	}
	
	// Start progress reporting
	go dm.reportOptimizedProgress(worker)
	
	// Perform optimized download
	err = dm.performOptimizedDownload(downloadCtx, worker)
	
	// Record performance metrics
	duration := time.Since(startTime)
	dm.performanceMonitor.RecordDownload(item, duration, err)
	
	if err != nil {
		dm.handleDownloadError(ctx, item, err)
	} else {
		dm.handleDownloadSuccess(ctx, item, worker)
	}
}

// performOptimizedDownload executes the download with performance optimizations
func (dm *OptimizedManager) performOptimizedDownload(ctx context.Context, worker *OptimizedDownloadWorker) error {
	item := worker.item
	
	// Create download directory
	if item.DownloadPath != nil {
		dir := filepath.Dir(*item.DownloadPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create download directory: %w", err)
		}
	}
	
	// Create HTTP request with optimizations
	req, err := http.NewRequestWithContext(ctx, "GET", item.DownloadURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	
	// Set headers for optimization
	req.Header.Set("User-Agent", "FolioFox/1.0 (Optimized)")
	req.Header.Set("Accept-Encoding", "gzip, deflate")
	req.Header.Set("Connection", "keep-alive")
	
	// Check for resume support
	var resumeOffset int64
	if _, err := os.Stat(*item.DownloadPath); err == nil {
		if stat, err := os.Stat(*item.DownloadPath); err == nil {
			resumeOffset = stat.Size()
			req.Header.Set("Range", fmt.Sprintf("bytes=%d-", resumeOffset))
		}
	}
	
	// Execute request
	resp, err := worker.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()
	
	// Handle response codes
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}
	
	// Get content length
	contentLength := resp.ContentLength
	if resumeOffset > 0 {
		contentLength += resumeOffset
	}
	
	if contentLength > 0 && item.FileSizeBytes == nil {
		item.FileSizeBytes = &contentLength
	}
	
	// Create/open output file
	var outFile *os.File
	if resumeOffset > 0 {
		outFile, err = os.OpenFile(*item.DownloadPath, os.O_APPEND|os.O_WRONLY, 0644)
	} else {
		outFile, err = os.Create(*item.DownloadPath)
	}
	if err != nil {
		return fmt.Errorf("failed to create output file: %w", err)
	}
	defer outFile.Close()
	
	// Create optimized progress reader with bandwidth control
	progressReader := &OptimizedProgressReader{
		Reader:           resp.Body,
		TotalBytes:       contentLength,
		ReadBytes:        resumeOffset,
		OnProgress:       worker.updateOptimizedProgress,
		BandwidthManager: dm.bandwidthManager,
		ChunkSize:        dm.config.ChunkSize,
		Buffer:           worker.memoryBuffer,
	}
	
	// Perform optimized copy
	_, err = dm.copyWithOptimizations(outFile, progressReader, ctx)
	if err != nil {
		return fmt.Errorf("optimized download copy failed: %w", err)
	}
	
	return nil
}

// copyWithOptimizations performs optimized file copying
func (dm *OptimizedManager) copyWithOptimizations(dst io.Writer, src *OptimizedProgressReader, ctx context.Context) (int64, error) {
	var written int64
	
	for {
		select {
		case <-ctx.Done():
			return written, ctx.Err()
		default:
			// Read chunk with bandwidth control
			n, err := src.Read(src.Buffer[:dm.config.ChunkSize])
			if n > 0 {
				nw, ew := dst.Write(src.Buffer[:n])
				if nw > 0 {
					written += int64(nw)
				}
				if ew != nil {
					return written, ew
				}
				if n != nw {
					return written, io.ErrShortWrite
				}
			}
			if err != nil {
				if err == io.EOF {
					return written, nil
				}
				return written, err
			}
		}
	}
}

// NewBandwidthManager creates a new bandwidth manager
func NewBandwidthManager(maxKBPS int64) *BandwidthManager {
	return &BandwidthManager{
		maxBandwidthKBPS: maxKBPS,
		downloadTokens:   make(chan struct{}, 100), // Token bucket
		lastUpdate:       time.Now(),
		usageHistory:     make([]int64, 60), // 1 minute history
		windowSize:       60,
	}
}

// Start begins bandwidth management
func (bm *BandwidthManager) Start(ctx context.Context, wg *sync.WaitGroup) {
	defer wg.Done()
	
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	
	// Fill initial tokens
	for i := 0; i < cap(bm.downloadTokens); i++ {
		select {
		case bm.downloadTokens <- struct{}{}:
		default:
			break
		}
	}
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			bm.refillTokens()
			bm.updateUsageHistory()
		}
	}
}

// refillTokens replenishes bandwidth tokens based on current usage
func (bm *BandwidthManager) refillTokens() {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	
	// Calculate available bandwidth
	currentUsagePercent := float64(bm.currentUsageKBPS) / float64(bm.maxBandwidthKBPS)
	availableTokens := int(float64(cap(bm.downloadTokens)) * (1.0 - currentUsagePercent))
	
	// Refill tokens up to available bandwidth
	for i := 0; i < availableTokens; i++ {
		select {
		case bm.downloadTokens <- struct{}{}:
		default:
			break // Channel full
		}
	}
}

// AcquireToken acquires a bandwidth token for download
func (bm *BandwidthManager) AcquireToken() chan struct{} {
	token := make(chan struct{}, 1)
	go func() {
		<-bm.downloadTokens // Wait for available bandwidth
		token <- struct{}{}
	}()
	return token
}

// ReleaseToken releases a bandwidth token
func (bm *BandwidthManager) ReleaseToken(token chan struct{}) {
	select {
	case <-token:
		// Token consumed
	default:
		// Token not yet acquired
	}
}

// NewPriorityQueue creates a new priority queue
func NewPriorityQueue(capacity int) *PriorityQueue {
	return &PriorityQueue{
		items:    make([]*QueueItem, 0, capacity),
		capacity: capacity,
	}
}

// Push adds an item to the priority queue
func (pq *PriorityQueue) Push(item *QueueItem) {
	pq.mu.Lock()
	defer pq.mu.Unlock()
	
	if len(pq.items) >= pq.capacity {
		// Remove lowest priority item
		pq.removeLowestPriority()
	}
	
	pq.items = append(pq.items, item)
	pq.heapifyUp(len(pq.items) - 1)
}

// Pop removes and returns the highest priority item
func (pq *PriorityQueue) Pop() *QueueItem {
	pq.mu.Lock()
	defer pq.mu.Unlock()
	
	if len(pq.items) == 0 {
		return nil
	}
	
	item := pq.items[0]
	lastIndex := len(pq.items) - 1
	pq.items[0] = pq.items[lastIndex]
	pq.items = pq.items[:lastIndex]
	
	if len(pq.items) > 0 {
		pq.heapifyDown(0)
	}
	
	return item
}

// heapifyUp maintains heap property upward
func (pq *PriorityQueue) heapifyUp(index int) {
	parentIndex := (index - 1) / 2
	if parentIndex >= 0 && pq.items[parentIndex].Priority < pq.items[index].Priority {
		pq.items[parentIndex], pq.items[index] = pq.items[index], pq.items[parentIndex]
		pq.heapifyUp(parentIndex)
	}
}

// heapifyDown maintains heap property downward
func (pq *PriorityQueue) heapifyDown(index int) {
	leftChild := 2*index + 1
	rightChild := 2*index + 2
	largest := index
	
	if leftChild < len(pq.items) && pq.items[leftChild].Priority > pq.items[largest].Priority {
		largest = leftChild
	}
	
	if rightChild < len(pq.items) && pq.items[rightChild].Priority > pq.items[largest].Priority {
		largest = rightChild
	}
	
	if largest != index {
		pq.items[index], pq.items[largest] = pq.items[largest], pq.items[index]
		pq.heapifyDown(largest)
	}
}

// removeLowestPriority removes the item with lowest priority
func (pq *PriorityQueue) removeLowestPriority() {
	if len(pq.items) == 0 {
		return
	}
	
	minIndex := 0
	minPriority := pq.items[0].Priority
	
	for i, item := range pq.items {
		if item.Priority < minPriority {
			minIndex = i
			minPriority = item.Priority
		}
	}
	
	// Remove item at minIndex
	lastIndex := len(pq.items) - 1
	pq.items[minIndex] = pq.items[lastIndex]
	pq.items = pq.items[:lastIndex]
}

// OptimizedProgressReader provides bandwidth-controlled reading with progress tracking
type OptimizedProgressReader struct {
	Reader           io.Reader
	TotalBytes       int64
	ReadBytes        int64
	OnProgress       func(int64, int64, int64) // readBytes, totalBytes, speed
	BandwidthManager *BandwidthManager
	ChunkSize        int64
	Buffer           []byte
	lastReadTime     time.Time
	speedCalculator  *SpeedCalculator
}

// SpeedCalculator calculates download speed
type SpeedCalculator struct {
	samples []SpeedSample
	mu      sync.Mutex
}

// SpeedSample represents a speed measurement sample
type SpeedSample struct {
	Bytes     int64
	Timestamp time.Time
}

// Read implements optimized reading with bandwidth control
func (opr *OptimizedProgressReader) Read(p []byte) (int, error) {
	// Apply bandwidth throttling
	if !opr.lastReadTime.IsZero() {
		elapsed := time.Since(opr.lastReadTime)
		if elapsed < 10*time.Millisecond { // Minimum read interval
			time.Sleep(10*time.Millisecond - elapsed)
		}
	}
	
	n, err := opr.Reader.Read(p)
	opr.ReadBytes += int64(n)
	opr.lastReadTime = time.Now()
	
	if opr.OnProgress != nil && n > 0 {
		// Calculate current speed
		speed := opr.calculateSpeed(int64(n))
		opr.OnProgress(opr.ReadBytes, opr.TotalBytes, speed)
	}
	
	return n, err
}

// calculateSpeed calculates current download speed
func (opr *OptimizedProgressReader) calculateSpeed(bytesRead int64) int64 {
	if opr.speedCalculator == nil {
		opr.speedCalculator = &SpeedCalculator{
			samples: make([]SpeedSample, 0, 10),
		}
	}
	
	now := time.Now()
	opr.speedCalculator.mu.Lock()
	defer opr.speedCalculator.mu.Unlock()
	
	// Add new sample
	opr.speedCalculator.samples = append(opr.speedCalculator.samples, SpeedSample{
		Bytes:     bytesRead,
		Timestamp: now,
	})
	
	// Remove old samples (keep last 10 seconds)
	cutoff := now.Add(-10 * time.Second)
	for i := 0; i < len(opr.speedCalculator.samples); i++ {
		if opr.speedCalculator.samples[i].Timestamp.After(cutoff) {
			opr.speedCalculator.samples = opr.speedCalculator.samples[i:]
			break
		}
	}
	
	// Calculate average speed
	if len(opr.speedCalculator.samples) < 2 {
		return 0
	}
	
	totalBytes := int64(0)
	for _, sample := range opr.speedCalculator.samples {
		totalBytes += sample.Bytes
	}
	
	duration := now.Sub(opr.speedCalculator.samples[0].Timestamp)
	if duration.Seconds() == 0 {
		return 0
	}
	
	return int64(float64(totalBytes) / duration.Seconds())
}

// Helper methods for optimization

// calculateEnhancedPriority calculates priority based on multiple factors
func (dm *OptimizedManager) calculateEnhancedPriority(item *models.DownloadQueueItem, userID int64) int64 {
	basePriority := int64(item.Priority)
	
	// User priority boost (premium users get higher priority)
	userBoost := int64(0) // Would be determined by user tier/subscription
	
	// File size priority (smaller files get slight boost for quick completion)
	sizeBoost := int64(0)
	if item.FileSizeBytes != nil {
		sizeMB := *item.FileSizeBytes / (1024 * 1024)
		if sizeMB < 10 {
			sizeBoost = 2
		} else if sizeMB > 100 {
			sizeBoost = -1
		}
	}
	
	// Age priority (older requests get gradual boost)
	ageBoost := time.Since(item.CreatedAt).Minutes() / 60 // 1 point per hour
	
	return basePriority*10 + userBoost + sizeBoost + int64(ageBoost)
}

// estimateDownloadTime estimates download completion time
func (dm *OptimizedManager) estimateDownloadTime(item *models.DownloadQueueItem) int64 {
	if item.FileSizeBytes == nil {
		return 300 // 5 minute default
	}
	
	// Estimate based on file size and average speed
	fileSizeKB := *item.FileSizeBytes / 1024
	avgSpeedKBPS := dm.bandwidthManager.getAverageSpeedKBPS()
	
	if avgSpeedKBPS == 0 {
		avgSpeedKBPS = 1024 // 1 MB/s default
	}
	
	estimatedSeconds := fileSizeKB / avgSpeedKBPS
	return estimatedSeconds
}

// getAverageSpeedKBPS calculates average download speed
func (bm *BandwidthManager) getAverageSpeedKBPS() int64 {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	
	total := int64(0)
	count := int64(0)
	
	for _, usage := range bm.usageHistory {
		if usage > 0 {
			total += usage
			count++
		}
	}
	
	if count == 0 {
		return 0
	}
	
	return total / count
}

// updateUsageHistory updates bandwidth usage history
func (bm *BandwidthManager) updateUsageHistory() {
	bm.mu.Lock()
	defer bm.mu.Unlock()
	
	// Shift history window
	copy(bm.usageHistory[:len(bm.usageHistory)-1], bm.usageHistory[1:])
	bm.usageHistory[len(bm.usageHistory)-1] = bm.currentUsageKBPS
}

// Additional helper methods for memory management, progress broadcasting, etc.
// [Implementation continues with remaining components...]

// NewMemoryManager creates a new memory manager
func NewMemoryManager(maxMemoryMB int) *MemoryManager {
	return &MemoryManager{
		maxMemoryMB:     maxMemoryMB,
		downloadBuffers: make(map[int64][]byte),
		gcTriggerMB:     maxMemoryMB * 8 / 10, // Trigger GC at 80%
	}
}

// AllocateBuffer allocates a memory buffer for a download
func (mm *MemoryManager) AllocateBuffer(downloadID int64, size int64) ([]byte, error) {
	mm.mu.Lock()
	defer mm.mu.Unlock()
	
	// Check memory limit
	if mm.currentUsageMB > int64(mm.maxMemoryMB) {
		return nil, fmt.Errorf("memory limit exceeded")
	}
	
	buffer := make([]byte, size)
	mm.downloadBuffers[downloadID] = buffer
	mm.currentUsageMB += size / (1024 * 1024)
	
	return buffer, nil
}

// ReleaseBuffer releases a memory buffer
func (mm *MemoryManager) ReleaseBuffer(downloadID int64) {
	mm.mu.Lock()
	defer mm.mu.Unlock()
	
	if buffer, exists := mm.downloadBuffers[downloadID]; exists {
		size := int64(len(buffer))
		delete(mm.downloadBuffers, downloadID)
		mm.currentUsageMB -= size / (1024 * 1024)
	}
}

// Start begins memory management
func (mm *MemoryManager) Start(ctx context.Context, wg *sync.WaitGroup) {
	defer wg.Done()
	
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if mm.currentUsageMB > int64(mm.gcTriggerMB) {
				runtime.GC()
			}
		}
	}
}

// updateOptimizedProgress updates progress with bandwidth tracking
func (worker *OptimizedDownloadWorker) updateOptimizedProgress(bytesRead, totalBytes, speed int64) {
	worker.mu.Lock()
	defer worker.mu.Unlock()
	
	worker.bytesDownloaded = bytesRead
	worker.downloadSpeed = speed
	worker.lastProgressTime = time.Now()
	
	var progressPercentage int
	if totalBytes > 0 {
		progressPercentage = int((bytesRead * 100) / totalBytes)
	}
	
	// Calculate ETA
	var etaSeconds *int
	if speed > 0 && totalBytes > 0 {
		remaining := totalBytes - bytesRead
		eta := int(remaining / speed)
		etaSeconds = &eta
	}
	
	speedKBPS := float64(speed) / 1024.0
	
	progress := &models.DownloadProgress{
		DownloadID:         worker.item.ID,
		Status:             models.DownloadStatusDownloading,
		ProgressPercentage: progressPercentage,
		BytesDownloaded:    bytesRead,
		TotalBytes:         &totalBytes,
		DownloadSpeedKBPS:  &speedKBPS,
		ETASeconds:         etaSeconds,
		UpdatedAt:          time.Now(),
	}
	
	// Send to progress channel (non-blocking)
	select {
	case worker.progressChan <- progress:
	default:
		// Channel full, skip this update
	}
}

// Additional implementations for remaining components...
// [The implementation would continue with remaining methods]