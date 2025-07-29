package downloads

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/foliofox/foliofox/internal/models"
	"github.com/foliofox/foliofox/internal/repositories"
)

// Manager handles download queue processing and concurrent downloads
type Manager struct {
	downloadRepo     repositories.DownloadRepository
	userPrefRepo     repositories.UserPreferencesRepository
	fileManager      *FileManager
	logger           *logrus.Logger
	
	// Configuration
	maxConcurrentDownloads int
	downloadTimeout        time.Duration
	retryDelay            time.Duration
	
	// State management
	activeDownloads   map[int64]*DownloadWorker
	downloadQueue     chan *models.DownloadQueueItem
	stopChan          chan struct{}
	wg                sync.WaitGroup
	mu                sync.RWMutex
	
	// Progress tracking
	progressCallbacks map[int64]func(*models.DownloadProgress)
	progressMu        sync.RWMutex
}

// DownloadWorker represents an active download
type DownloadWorker struct {
	item           *models.DownloadQueueItem
	httpClient     *http.Client
	cancelFunc     context.CancelFunc
	progressChan   chan *models.DownloadProgress
	lastProgress   *models.DownloadProgress
	startTime      time.Time
	bytesDownloaded int64
	mu             sync.RWMutex
}

// NewManager creates a new download manager
func NewManager(
	downloadRepo repositories.DownloadRepository,
	userPrefRepo repositories.UserPreferencesRepository,
	fileManager *FileManager,
	logger *logrus.Logger,
	maxConcurrent int,
) *Manager {
	return &Manager{
		downloadRepo:           downloadRepo,
		userPrefRepo:          userPrefRepo,
		fileManager:           fileManager,
		logger:                logger,
		maxConcurrentDownloads: maxConcurrent,
		downloadTimeout:       30 * time.Minute,
		retryDelay:           5 * time.Minute,
		activeDownloads:       make(map[int64]*DownloadWorker),
		downloadQueue:        make(chan *models.DownloadQueueItem, 1000),
		stopChan:             make(chan struct{}),
		progressCallbacks:     make(map[int64]func(*models.DownloadProgress)),
	}
}

// Start begins the download processing
func (dm *Manager) Start(ctx context.Context) {
	dm.logger.Info("Starting download manager")
	
	// Start worker goroutines
	for i := 0; i < dm.maxConcurrentDownloads; i++ {
		dm.wg.Add(1)
		go dm.downloadWorker(ctx, i)
	}
	
	// Start queue feeder
	dm.wg.Add(1)
	go dm.queueFeeder(ctx)
	
	// Start progress broadcaster
	dm.wg.Add(1)
	go dm.progressBroadcaster(ctx)
}

// Stop stops the download manager
func (dm *Manager) Stop() {
	dm.logger.Info("Stopping download manager")
	
	// Cancel all active downloads
	dm.mu.Lock()
	for _, worker := range dm.activeDownloads {
		worker.cancelFunc()
	}
	dm.mu.Unlock()
	
	close(dm.stopChan)
	dm.wg.Wait()
	
	dm.logger.Info("Download manager stopped")
}

// AddDownload adds a new download to the queue
func (dm *Manager) AddDownload(ctx context.Context, request *models.DownloadCreateRequest, userID int64) (*models.DownloadQueueItem, error) {
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
	
	// Set default priority if not specified
	if item.Priority == 0 {
		item.Priority = 5
	}
	
	// Determine download path
	downloadPath, err := dm.determineDownloadPath(ctx, userID, request)
	if err != nil {
		return nil, fmt.Errorf("failed to determine download path: %w", err)
	}
	item.DownloadPath = &downloadPath
	
	// Save to database
	if err := dm.downloadRepo.CreateQueueItem(ctx, item); err != nil {
		return nil, fmt.Errorf("failed to create queue item: %w", err)
	}
	
	dm.logger.Infof("Added download to queue: %s (ID: %d, Priority: %d)", item.Title, item.ID, item.Priority)
	return item, nil
}

// PauseDownload pauses an active download
func (dm *Manager) PauseDownload(ctx context.Context, downloadID int64) error {
	dm.mu.Lock()
	worker, exists := dm.activeDownloads[downloadID]
	dm.mu.Unlock()
	
	if !exists {
		return dm.downloadRepo.SetStatus(ctx, downloadID, models.DownloadStatusPaused, nil)
	}
	
	// Cancel the download
	worker.cancelFunc()
	
	// Update status
	return dm.downloadRepo.SetStatus(ctx, downloadID, models.DownloadStatusPaused, nil)
}

// ResumeDownload resumes a paused download
func (dm *Manager) ResumeDownload(ctx context.Context, downloadID int64) error {
	item, err := dm.downloadRepo.GetQueueItemByID(ctx, downloadID)
	if err != nil {
		return err
	}
	
	if item.Status != models.DownloadStatusPaused {
		return fmt.Errorf("download is not paused")
	}
	
	// Reset status to pending so it gets picked up by workers
	return dm.downloadRepo.SetStatus(ctx, downloadID, models.DownloadStatusPending, nil)
}

// CancelDownload cancels a download
func (dm *Manager) CancelDownload(ctx context.Context, downloadID int64, deletePartial bool) error {
	dm.mu.Lock()
	worker, exists := dm.activeDownloads[downloadID]
	dm.mu.Unlock()
	
	if exists {
		worker.cancelFunc()
	}
	
	// Delete partial file if requested
	if deletePartial {
		item, err := dm.downloadRepo.GetQueueItemByID(ctx, downloadID)
		if err == nil && item.DownloadPath != nil {
			os.Remove(*item.DownloadPath)
		}
	}
	
	return dm.downloadRepo.SetStatus(ctx, downloadID, models.DownloadStatusCancelled, nil)
}

// RetryDownload retries a failed download
func (dm *Manager) RetryDownload(ctx context.Context, downloadID int64) error {
	item, err := dm.downloadRepo.GetQueueItemByID(ctx, downloadID)
	if err != nil {
		return err
	}
	
	if item.Status != models.DownloadStatusFailed {
		return fmt.Errorf("download is not failed")
	}
	
	if item.RetryCount >= item.MaxRetries {
		return fmt.Errorf("maximum retries exceeded")
	}
	
	// Reset status and increment retry count
	item.Status = models.DownloadStatusPending
	item.RetryCount++
	item.ErrorMessage = nil
	item.ProgressPercentage = 0
	
	return dm.downloadRepo.UpdateQueueItem(ctx, item)
}

// RegisterProgressCallback registers a callback for download progress updates
func (dm *Manager) RegisterProgressCallback(downloadID int64, callback func(*models.DownloadProgress)) {
	dm.progressMu.Lock()
	defer dm.progressMu.Unlock()
	dm.progressCallbacks[downloadID] = callback
}

// UnregisterProgressCallback removes a progress callback
func (dm *Manager) UnregisterProgressCallback(downloadID int64) {
	dm.progressMu.Lock()
	defer dm.progressMu.Unlock()
	delete(dm.progressCallbacks, downloadID)
}

// queueFeeder continuously feeds the download queue with pending items
func (dm *Manager) queueFeeder(ctx context.Context) {
	defer dm.wg.Done()
	
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-dm.stopChan:
			return
		case <-ticker.C:
			dm.feedQueue(ctx)
		}
	}
}

// feedQueue gets pending downloads and adds them to the queue
func (dm *Manager) feedQueue(ctx context.Context) {
	// Get pending downloads ordered by priority
	filters := &repositories.DownloadQueueFilters{
		Status:    &[]models.DownloadStatus{models.DownloadStatusPending}[0],
		SortBy:    "priority",
		SortOrder: "asc",
		Limit:     50,
	}
	
	items, _, err := dm.downloadRepo.ListQueueItems(ctx, filters)
	if err != nil {
		dm.logger.Errorf("Failed to get pending downloads: %v", err)
		return
	}
	
	for _, item := range items {
		select {
		case dm.downloadQueue <- item:
			dm.logger.Debugf("Queued download: %s (ID: %d)", item.Title, item.ID)
		case <-ctx.Done():
			return
		case <-dm.stopChan:
			return
		default:
			// Queue full, will try again on next tick
			return
		}
	}
}

// downloadWorker processes downloads from the queue
func (dm *Manager) downloadWorker(ctx context.Context, workerID int) {
	defer dm.wg.Done()
	
	dm.logger.Infof("Download worker %d started", workerID)
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-dm.stopChan:
			return
		case item := <-dm.downloadQueue:
			if item != nil {
				dm.processDownload(ctx, item, workerID)
			}
		}
	}
}

// processDownload handles the actual download process
func (dm *Manager) processDownload(ctx context.Context, item *models.DownloadQueueItem, workerID int) {
	startTime := time.Now()
	dm.logger.Infof("Worker %d starting download: %s (ID: %d)", workerID, item.Title, item.ID)
	
	// Create download context with timeout
	downloadCtx, cancel := context.WithTimeout(ctx, dm.downloadTimeout)
	defer cancel()
	
	// Create worker
	worker := &DownloadWorker{
		item:         item,
		httpClient:   &http.Client{Timeout: dm.downloadTimeout},
		cancelFunc:   cancel,
		progressChan: make(chan *models.DownloadProgress, 10),
		startTime:    startTime,
	}
	
	// Register worker
	dm.mu.Lock()
	dm.activeDownloads[item.ID] = worker
	dm.mu.Unlock()
	
	// Cleanup worker on completion
	defer func() {
		dm.mu.Lock()
		delete(dm.activeDownloads, item.ID)
		dm.mu.Unlock()
		close(worker.progressChan)
	}()
	
	// Update status to downloading
	if err := dm.downloadRepo.SetStatus(downloadCtx, item.ID, models.DownloadStatusDownloading, nil); err != nil {
		dm.logger.Errorf("Failed to update download status: %v", err)
		return
	}
	
	// Start progress reporting
	go dm.reportProgress(worker)
	
	// Perform the download
	err := dm.performDownload(downloadCtx, worker)
	
	if err != nil {
		dm.handleDownloadError(ctx, item, err)
	} else {
		dm.handleDownloadSuccess(ctx, item, worker)
	}
}

// performDownload executes the actual file download
func (dm *Manager) performDownload(ctx context.Context, worker *DownloadWorker) error {
	item := worker.item
	
	// Create download directory if it doesn't exist
	if item.DownloadPath != nil {
		dir := filepath.Dir(*item.DownloadPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create download directory: %w", err)
		}
	}
	
	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "GET", item.DownloadURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	
	// Set user agent
	req.Header.Set("User-Agent", "FolioFox/1.0")
	
	// Execute request
	resp, err := worker.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}
	
	// Get content length for progress tracking
	contentLength := resp.ContentLength
	if contentLength > 0 && item.FileSizeBytes == nil {
		item.FileSizeBytes = &contentLength
	}
	
	// Create output file
	outFile, err := os.Create(*item.DownloadPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %w", err)
	}
	defer outFile.Close()
	
	// Create progress reader
	progressReader := &ProgressReader{
		Reader:      resp.Body,
		TotalBytes:  contentLength,
		OnProgress:  worker.updateProgress,
	}
	
	// Copy with progress tracking
	_, err = io.Copy(outFile, progressReader)
	if err != nil {
		return fmt.Errorf("download copy failed: %w", err)
	}
	
	return nil
}

// reportProgress sends progress updates for a download
func (dm *Manager) reportProgress(worker *DownloadWorker) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case progress, ok := <-worker.progressChan:
			if !ok {
				return
			}
			
			// Update database
			dm.downloadRepo.UpdateProgress(context.Background(), worker.item.ID, progress.ProgressPercentage, progress.BytesDownloaded)
			
			// Call registered callbacks
			dm.progressMu.RLock()
			if callback, exists := dm.progressCallbacks[worker.item.ID]; exists {
				callback(progress)
			}
			dm.progressMu.RUnlock()
			
		case <-ticker.C:
			// Send periodic heartbeat even if no progress update
			worker.mu.RLock()
			if worker.lastProgress != nil {
				dm.progressMu.RLock()
				if callback, exists := dm.progressCallbacks[worker.item.ID]; exists {
					callback(worker.lastProgress)
				}
				dm.progressMu.RUnlock()
			}
			worker.mu.RUnlock()
		}
	}
}

// handleDownloadError handles download failures
func (dm *Manager) handleDownloadError(ctx context.Context, item *models.DownloadQueueItem, err error) {
	dm.logger.Errorf("Download failed for %s (ID: %d): %v", item.Title, item.ID, err)
	
	errorMsg := err.Error()
	
	// Check if we should retry
	if item.RetryCount < item.MaxRetries {
		// Schedule retry after delay
		go func() {
			time.Sleep(dm.retryDelay)
			item.RetryCount++
			item.Status = models.DownloadStatusPending
			dm.downloadRepo.UpdateQueueItem(context.Background(), item)
		}()
		
		dm.logger.Infof("Scheduling retry %d/%d for download %d", item.RetryCount+1, item.MaxRetries, item.ID)
	} else {
		// Mark as failed
		dm.downloadRepo.SetStatus(ctx, item.ID, models.DownloadStatusFailed, &errorMsg)
		
		// Create history entry
		dm.createHistoryEntry(ctx, item, models.DownloadStatusFailed, &errorMsg)
	}
}

// handleDownloadSuccess handles successful downloads
func (dm *Manager) handleDownloadSuccess(ctx context.Context, item *models.DownloadQueueItem, worker *DownloadWorker) {
	dm.logger.Infof("Download completed successfully: %s (ID: %d)", item.Title, item.ID)
	
	// Verify file exists and has content
	if item.DownloadPath != nil {
		if stat, err := os.Stat(*item.DownloadPath); err != nil || stat.Size() == 0 {
			dm.handleDownloadError(ctx, item, fmt.Errorf("downloaded file is missing or empty"))
			return
		}
	}
	
	// Mark as completed
	dm.downloadRepo.CompleteDownload(ctx, item.ID, *item.DownloadPath)
	
	// Create history entry
	dm.createHistoryEntry(ctx, item, models.DownloadStatusCompleted, nil)
	
	// File organization (if enabled)
	if dm.fileManager != nil {
		go dm.fileManager.OrganizeDownload(ctx, item)
	}
}

// createHistoryEntry creates a download history entry
func (dm *Manager) createHistoryEntry(ctx context.Context, item *models.DownloadQueueItem, finalStatus models.DownloadStatus, errorMessage *string) {
	duration := int(time.Since(time.Now()).Seconds()) // This should be calculated properly from actual start time
	
	historyItem := &models.DownloadHistoryItem{
		QueueID:                 item.ID,
		UserID:                  item.UserID,
		BookID:                  item.BookID,
		IndexerID:               item.IndexerID,
		Title:                   item.Title,
		AuthorName:              item.AuthorName,
		FileFormat:              item.FileFormat,
		FileSizeBytes:           item.FileSizeBytes,
		DownloadDurationSeconds: &duration,
		FinalStatus:             string(finalStatus),
		ErrorMessage:            errorMessage,
		DownloadPath:            item.DownloadPath,
		CompletedAt:             time.Now(),
	}
	
	if err := dm.downloadRepo.CreateHistoryItem(ctx, historyItem); err != nil {
		dm.logger.Errorf("Failed to create history entry: %v", err)
	}
}

// determineDownloadPath determines where to save the downloaded file
func (dm *Manager) determineDownloadPath(ctx context.Context, userID int64, request *models.DownloadCreateRequest) (string, error) {
	// Get user's download folders
	folders, err := dm.userPrefRepo.GetDownloadFolders(ctx, userID)
	if err != nil {
		return "", err
	}
	
	var targetFolder *models.DownloadFolder
	
	// Use specified folder or default
	if request.DownloadFolderID != nil {
		for _, folder := range folders {
			if folder.ID == *request.DownloadFolderID {
				targetFolder = folder
				break
			}
		}
	}
	
	// Fallback to default folder
	if targetFolder == nil {
		for _, folder := range folders {
			if folder.IsDefault {
				targetFolder = folder
				break
			}
		}
	}
	
	// Fallback to first folder
	if targetFolder == nil && len(folders) > 0 {
		targetFolder = folders[0]
	}
	
	if targetFolder == nil {
		return "", fmt.Errorf("no download folder configured")
	}
	
	// Generate filename
	filename := dm.generateFilename(request)
	
	// Apply folder pattern if auto-organize is enabled
	if targetFolder.AutoOrganize {
		subPath := dm.applyFolderPattern(targetFolder.FolderPattern, request)
		return filepath.Join(targetFolder.Path, subPath, filename), nil
	}
	
	return filepath.Join(targetFolder.Path, filename), nil
}

// generateFilename generates a safe filename for the download
func (dm *Manager) generateFilename(request *models.DownloadCreateRequest) string {
	// Sanitize title for filename
	title := strings.ReplaceAll(request.Title, "/", "-")
	title = strings.ReplaceAll(title, "\\", "-")
	title = strings.ReplaceAll(title, ":", "-")
	title = strings.ReplaceAll(title, "*", "-")
	title = strings.ReplaceAll(title, "?", "-")
	title = strings.ReplaceAll(title, "\"", "-")
	title = strings.ReplaceAll(title, "<", "-")
	title = strings.ReplaceAll(title, ">", "-")
	title = strings.ReplaceAll(title, "|", "-")
	
	return fmt.Sprintf("%s.%s", title, request.FileFormat)
}

// applyFolderPattern applies the folder organization pattern
func (dm *Manager) applyFolderPattern(pattern string, request *models.DownloadCreateRequest) string {
	result := pattern
	
	// Replace placeholders
	if request.AuthorName != nil {
		result = strings.ReplaceAll(result, "{author}", *request.AuthorName)
	} else {
		result = strings.ReplaceAll(result, "{author}", "Unknown Author")
	}
	
	result = strings.ReplaceAll(result, "{title}", request.Title)
	result = strings.ReplaceAll(result, "{format}", strings.ToUpper(request.FileFormat))
	
	// For now, we don't have series info in the request, so use a placeholder
	result = strings.ReplaceAll(result, "{series}", "Unsorted")
	
	return result
}

// progressBroadcaster handles broadcasting progress updates
func (dm *Manager) progressBroadcaster(ctx context.Context) {
	defer dm.wg.Done()
	
	// This could be enhanced to broadcast via WebSocket
	// For now, it's just a placeholder
	<-ctx.Done()
}

// ProgressReader wraps an io.Reader to track download progress
type ProgressReader struct {
	Reader      io.Reader
	TotalBytes  int64
	ReadBytes   int64
	OnProgress  func(int64, int64)
}

func (pr *ProgressReader) Read(p []byte) (int, error) {
	n, err := pr.Reader.Read(p)
	pr.ReadBytes += int64(n)
	
	if pr.OnProgress != nil {
		pr.OnProgress(pr.ReadBytes, pr.TotalBytes)
	}
	
	return n, err
}

// updateProgress updates the download progress
func (worker *DownloadWorker) updateProgress(bytesRead, totalBytes int64) {
	worker.mu.Lock()
	defer worker.mu.Unlock()
	
	worker.bytesDownloaded = bytesRead
	
	var progressPercentage int
	if totalBytes > 0 {
		progressPercentage = int((bytesRead * 100) / totalBytes)
	}
	
	// Calculate speed and ETA
	elapsed := time.Since(worker.startTime)
	var speedKBPS *float64
	var etaSeconds *int
	
	if elapsed.Seconds() > 0 {
		speed := float64(bytesRead) / elapsed.Seconds() / 1024 // KB/s
		speedKBPS = &speed
		
		if totalBytes > 0 && speed > 0 {
			remaining := totalBytes - bytesRead
			eta := int(float64(remaining) / (speed * 1024))
			etaSeconds = &eta
		}
	}
	
	progress := &models.DownloadProgress{
		DownloadID:         worker.item.ID,
		Status:             models.DownloadStatusDownloading,
		ProgressPercentage: progressPercentage,
		BytesDownloaded:    bytesRead,
		TotalBytes:         &totalBytes,
		DownloadSpeedKBPS:  speedKBPS,
		ETASeconds:         etaSeconds,
		UpdatedAt:          time.Now(),
	}
	
	worker.lastProgress = progress
	
	// Send to progress channel (non-blocking)
	select {
	case worker.progressChan <- progress:
	default:
		// Channel full, skip this update
	}
}