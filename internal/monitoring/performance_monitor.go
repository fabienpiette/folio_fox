package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"runtime"
	"runtime/debug"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/foliofox/foliofox/internal/repositories"
)

// PerformanceMonitor provides comprehensive system performance monitoring
type PerformanceMonitor struct {
	metricsRepo repositories.MetricsRepository
	logger      *logrus.Logger
	config      *MonitorConfig
	
	// Metrics collection
	systemMetrics   *SystemMetrics
	appMetrics      *ApplicationMetrics
	dbMetrics       *DatabaseMetrics
	networkMetrics  *NetworkMetrics
	
	// State management
	isRunning    bool
	stopChan     chan struct{}
	mu           sync.RWMutex
	
	// Performance alerts
	alertManager *AlertManager
	
	// Data retention
	metricsHistory []MetricsSnapshot
	maxHistory     int
}

// MonitorConfig holds monitoring configuration
type MonitorConfig struct {
	CollectionInterval  time.Duration `json:"collection_interval"`
	RetentionPeriod    time.Duration `json:"retention_period"` 
	AlertThresholds    *AlertThresholds `json:"alert_thresholds"`
	EnableDetailedLogs bool          `json:"enable_detailed_logs"`
	MetricsEndpoint    string        `json:"metrics_endpoint"`
	ExportInterval     time.Duration `json:"export_interval"`
}

// SystemMetrics tracks system-level performance
type SystemMetrics struct {
	CPU            CPUMetrics    `json:"cpu"`
	Memory         MemoryMetrics `json:"memory"`
	Disk           DiskMetrics   `json:"disk"`
	Network        NetworkMetrics `json:"network"`
	GarbageCollector GCMetrics   `json:"gc"`
	Goroutines     int           `json:"goroutines"`
	Timestamp      time.Time     `json:"timestamp"`
}

// CPUMetrics tracks CPU utilization
type CPUMetrics struct {
	Usage          float64 `json:"usage_percent"`
	UserTime       float64 `json:"user_time"`
	SystemTime     float64 `json:"system_time"`
	IdleTime       float64 `json:"idle_time"`
	LoadAverage1m  float64 `json:"load_avg_1m"`
	LoadAverage5m  float64 `json:"load_avg_5m"`
	LoadAverage15m float64 `json:"load_avg_15m"`
	NumCPU         int     `json:"num_cpu"`
}

// MemoryMetrics tracks memory usage
type MemoryMetrics struct {
	// Go runtime memory stats
	Alloc         uint64  `json:"alloc_bytes"`
	TotalAlloc    uint64  `json:"total_alloc_bytes"`
	Sys           uint64  `json:"sys_bytes"`
	Lookups       uint64  `json:"lookups"`
	Mallocs       uint64  `json:"mallocs"`
	Frees         uint64  `json:"frees"`
	HeapAlloc     uint64  `json:"heap_alloc_bytes"`
	HeapSys       uint64  `json:"heap_sys_bytes"`
	HeapIdle      uint64  `json:"heap_idle_bytes"`
	HeapInuse     uint64  `json:"heap_inuse_bytes"`
	HeapReleased  uint64  `json:"heap_released_bytes"`
	HeapObjects   uint64  `json:"heap_objects"`
	StackInuse    uint64  `json:"stack_inuse_bytes"`
	StackSys      uint64  `json:"stack_sys_bytes"`
	
	// System memory
	SystemTotal   uint64  `json:"system_total_bytes"`
	SystemFree    uint64  `json:"system_free_bytes"`
	SystemUsed    uint64  `json:"system_used_bytes"`
	UsagePercent  float64 `json:"usage_percent"`
}

// DiskMetrics tracks disk I/O and usage
type DiskMetrics struct {
	ReadBytes      uint64  `json:"read_bytes"`
	WriteBytes     uint64  `json:"write_bytes"`
	ReadOps        uint64  `json:"read_ops"`
	WriteOps       uint64  `json:"write_ops"`
	TotalSpace     uint64  `json:"total_space_bytes"`
	FreeSpace      uint64  `json:"free_space_bytes"`
	UsedSpace      uint64  `json:"used_space_bytes"`
	UsagePercent   float64 `json:"usage_percent"`
	Inodes         uint64  `json:"inodes"`
	InodesFree     uint64  `json:"inodes_free"`
}

// NetworkMetrics tracks network I/O
type NetworkMetrics struct {
	BytesReceived   uint64 `json:"bytes_received"`
	BytesSent       uint64 `json:"bytes_sent"`
	PacketsReceived uint64 `json:"packets_received"`
	PacketsSent     uint64 `json:"packets_sent"`
	Errors          uint64 `json:"errors"`
	Drops           uint64 `json:"drops"`
}

// GCMetrics tracks garbage collection performance
type GCMetrics struct {
	NumGC          uint32  `json:"num_gc"`
	PauseTotal     uint64  `json:"pause_total_ns"`
	PauseAvg       uint64  `json:"pause_avg_ns"`
	PauseMax       uint64  `json:"pause_max_ns"`
	GCCPUFraction  float64 `json:"gc_cpu_fraction"`
	NextGC         uint64  `json:"next_gc_bytes"`
	LastGC         time.Time `json:"last_gc"`
}

// ApplicationMetrics tracks application-specific performance
type ApplicationMetrics struct {
	ActiveConnections int               `json:"active_connections"`
	RequestsPerSecond float64          `json:"requests_per_second"`
	ResponseTimes     ResponseTimeMetrics `json:"response_times"`
	ErrorRates        ErrorRateMetrics   `json:"error_rates"`
	CacheHitRatio     float64           `json:"cache_hit_ratio"`
	QueueSizes        QueueMetrics      `json:"queue_sizes"`
	ActiveDownloads   int               `json:"active_downloads"`
	SearchLatency     time.Duration     `json:"search_latency"`
	DatabaseConnections int             `json:"database_connections"`
}

// ResponseTimeMetrics tracks HTTP response times
type ResponseTimeMetrics struct {
	Mean   time.Duration `json:"mean"`
	P50    time.Duration `json:"p50"`
	P90    time.Duration `json:"p90"`
	P95    time.Duration `json:"p95"`
	P99    time.Duration `json:"p99"`
	Max    time.Duration `json:"max"`
}

// ErrorRateMetrics tracks error rates
type ErrorRateMetrics struct {
	HTTP5xx       float64 `json:"http_5xx_rate"`
	HTTP4xx       float64 `json:"http_4xx_rate"`
	DatabaseErrors float64 `json:"database_error_rate"`
	SearchErrors   float64 `json:"search_error_rate"`
	DownloadErrors float64 `json:"download_error_rate"`
}

// QueueMetrics tracks queue sizes and processing
type QueueMetrics struct {
	DownloadQueue   int `json:"download_queue_size"`
	SearchQueue     int `json:"search_queue_size"`
	ProcessingQueue int `json:"processing_queue_size"`
}

// DatabaseMetrics tracks database performance
type DatabaseMetrics struct {
	ConnectionPool     PoolMetrics     `json:"connection_pool"`
	QueryPerformance   QueryMetrics    `json:"query_performance"`
	CacheMetrics       CacheMetrics    `json:"cache_metrics"`
	TransactionMetrics TxMetrics       `json:"transaction_metrics"`
}

// PoolMetrics tracks connection pool stats
type PoolMetrics struct {
	MaxConnections    int `json:"max_connections"`
	ActiveConnections int `json:"active_connections"`
	IdleConnections   int `json:"idle_connections"`
	WaitingConnections int `json:"waiting_connections"`
}

// QueryMetrics tracks database query performance
type QueryMetrics struct {
	SlowQueries      int           `json:"slow_queries"`
	AverageTime      time.Duration `json:"average_time"`
	TotalQueries     int64         `json:"total_queries"`
	QueriesPerSecond float64       `json:"queries_per_second"`
}

// CacheMetrics tracks caching performance
type CacheMetrics struct {
	HitRatio        float64 `json:"hit_ratio"`
	MissRatio       float64 `json:"miss_ratio"`
	Evictions       int64   `json:"evictions"`
	MemoryUsage     int64   `json:"memory_usage_bytes"`
	EntryCount      int64   `json:"entry_count"`
}

// TxMetrics tracks transaction performance
type TxMetrics struct {
	CommittedTx     int64 `json:"committed_transactions"`
	RolledBackTx    int64 `json:"rolled_back_transactions"`
	ActiveTx        int   `json:"active_transactions"`
	DeadlockCount   int64 `json:"deadlock_count"`
}

// AlertThresholds defines performance alert thresholds
type AlertThresholds struct {
	CPUUsage          float64       `json:"cpu_usage_percent"`
	MemoryUsage       float64       `json:"memory_usage_percent"`
	DiskUsage         float64       `json:"disk_usage_percent"`
	ResponseTime      time.Duration `json:"response_time"`
	ErrorRate         float64       `json:"error_rate_percent"`
	QueueSize         int           `json:"queue_size"`
	DatabaseSlowQuery time.Duration `json:"database_slow_query"`
}

// AlertManager handles performance alerts
type AlertManager struct {
	thresholds    *AlertThresholds
	alertHandlers []AlertHandler
	mu            sync.RWMutex
}

// AlertHandler defines alert handling interface
type AlertHandler interface {
	HandleAlert(alert *PerformanceAlert) error
}

// PerformanceAlert represents a performance alert
type PerformanceAlert struct {
	ID          string      `json:"id"`
	Type        string      `json:"type"`
	Severity    string      `json:"severity"`
	Message     string      `json:"message"`
	Metric      string      `json:"metric"`
	Value       interface{} `json:"value"`
	Threshold   interface{} `json:"threshold"`
	Timestamp   time.Time   `json:"timestamp"`
	Resolved    bool        `json:"resolved"`
	ResolvedAt  *time.Time  `json:"resolved_at,omitempty"`
}

// MetricsSnapshot represents a point-in-time metrics snapshot
type MetricsSnapshot struct {
	SystemMetrics      *SystemMetrics      `json:"system_metrics"`
	ApplicationMetrics *ApplicationMetrics `json:"application_metrics"`
	DatabaseMetrics    *DatabaseMetrics    `json:"database_metrics"`
	Timestamp          time.Time           `json:"timestamp"`
}

// NewPerformanceMonitor creates a new performance monitor
func NewPerformanceMonitor(
	metricsRepo repositories.MetricsRepository,
	logger *logrus.Logger,
	config *MonitorConfig,
) *PerformanceMonitor {
	if config == nil {
		config = &MonitorConfig{
			CollectionInterval:  10 * time.Second,
			RetentionPeriod:    24 * time.Hour,
			EnableDetailedLogs: false,
			ExportInterval:     1 * time.Minute,
			AlertThresholds: &AlertThresholds{
				CPUUsage:          80.0,
				MemoryUsage:       85.0,
				DiskUsage:         90.0,
				ResponseTime:      2 * time.Second,
				ErrorRate:         5.0,
				QueueSize:         1000,
				DatabaseSlowQuery: 1 * time.Second,
			},
		}
	}

	return &PerformanceMonitor{
		metricsRepo:    metricsRepo,
		logger:         logger,
		config:         config,
		systemMetrics:  &SystemMetrics{},
		appMetrics:     &ApplicationMetrics{},
		dbMetrics:      &DatabaseMetrics{},
		networkMetrics: &NetworkMetrics{},
		stopChan:       make(chan struct{}),
		alertManager:   NewAlertManager(config.AlertThresholds),
		maxHistory:     8640, // 24 hours at 10-second intervals
	}
}

// Start begins performance monitoring
func (pm *PerformanceMonitor) Start(ctx context.Context) error {
	pm.mu.Lock()
	if pm.isRunning {
		pm.mu.Unlock()
		return fmt.Errorf("performance monitor is already running")
	}
	pm.isRunning = true
	pm.mu.Unlock()

	pm.logger.Info("Starting performance monitor")

	// Start metrics collection goroutine
	go pm.metricsCollectionLoop(ctx)

	// Start metrics export goroutine
	go pm.metricsExportLoop(ctx)

	// Start alert processing goroutine
	go pm.alertProcessingLoop(ctx)

	return nil
}

// Stop stops performance monitoring
func (pm *PerformanceMonitor) Stop() error {
	pm.mu.Lock()
	if !pm.isRunning {
		pm.mu.Unlock()
		return fmt.Errorf("performance monitor is not running")
	}
	pm.isRunning = false
	pm.mu.Unlock()

	pm.logger.Info("Stopping performance monitor")
	close(pm.stopChan)

	return nil
}

// metricsCollectionLoop continuously collects performance metrics
func (pm *PerformanceMonitor) metricsCollectionLoop(ctx context.Context) {
	ticker := time.NewTicker(pm.config.CollectionInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-pm.stopChan:
			return
		case <-ticker.C:
			pm.collectMetrics()
		}
	}
}

// collectMetrics collects all performance metrics
func (pm *PerformanceMonitor) collectMetrics() {
	start := time.Now()

	// Collect system metrics
	pm.collectSystemMetrics()
	
	// Collect application metrics
	pm.collectApplicationMetrics()
	
	// Collect database metrics
	pm.collectDatabaseMetrics()

	// Create snapshot
	snapshot := MetricsSnapshot{
		SystemMetrics:      pm.systemMetrics,
		ApplicationMetrics: pm.appMetrics,
		DatabaseMetrics:    pm.dbMetrics,
		Timestamp:          time.Now(),
	}

	// Add to history
	pm.addToHistory(snapshot)

	// Check for alerts
	pm.checkAlerts(&snapshot)

	collectionTime := time.Since(start)
	if pm.config.EnableDetailedLogs {
		pm.logger.Debugf("Metrics collection completed in %v", collectionTime)
	}
}

// collectSystemMetrics collects system-level metrics
func (pm *PerformanceMonitor) collectSystemMetrics() {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	// Update memory metrics
	pm.systemMetrics.Memory = MemoryMetrics{
		Alloc:         m.Alloc,
		TotalAlloc:    m.TotalAlloc,
		Sys:           m.Sys,
		Lookups:       m.Lookups,
		Mallocs:       m.Mallocs,
		Frees:         m.Frees,
		HeapAlloc:     m.HeapAlloc,
		HeapSys:       m.HeapSys,
		HeapIdle:      m.HeapIdle,
		HeapInuse:     m.HeapInuse,
		HeapReleased:  m.HeapReleased,
		HeapObjects:   m.HeapObjects,
		StackInuse:    m.StackInuse,
		StackSys:      m.StackSys,
		UsagePercent:  float64(m.HeapInuse) / float64(m.HeapSys) * 100,
	}

	// Update GC metrics
	pm.systemMetrics.GarbageCollector = GCMetrics{
		NumGC:         m.NumGC,
		PauseTotal:    m.PauseTotalNs,
		GCCPUFraction: m.GCCPUFraction,
		NextGC:        m.NextGC,
	}

	if m.NumGC > 0 {
		pm.systemMetrics.GarbageCollector.PauseAvg = m.PauseTotalNs / uint64(m.NumGC)
		pm.systemMetrics.GarbageCollector.LastGC = time.Unix(0, int64(m.LastGC))
		
		// Calculate max pause time from recent pauses
		maxPause := uint64(0)
		for _, pause := range m.PauseNs[:] {
			if pause > maxPause {
				maxPause = pause
			}
		}
		pm.systemMetrics.GarbageCollector.PauseMax = maxPause
	}

	// Update CPU metrics
	pm.systemMetrics.CPU = CPUMetrics{
		NumCPU: runtime.NumCPU(),
		// Note: Additional CPU metrics would require platform-specific code
		// or external libraries like gopsutil
	}

	// Update goroutine count
	pm.systemMetrics.Goroutines = runtime.NumGoroutine()
	pm.systemMetrics.Timestamp = time.Now()
}

// collectApplicationMetrics collects application-specific metrics
func (pm *PerformanceMonitor) collectApplicationMetrics() {
	// This would collect metrics from various application components
	// Implementation would depend on specific metric collection points
	
	pm.appMetrics.ActiveConnections = pm.getActiveConnections()
	pm.appMetrics.RequestsPerSecond = pm.getRequestsPerSecond()
	pm.appMetrics.ResponseTimes = pm.getResponseTimes()
	pm.appMetrics.ErrorRates = pm.getErrorRates()
	pm.appMetrics.CacheHitRatio = pm.getCacheHitRatio()
	pm.appMetrics.QueueSizes = pm.getQueueSizes()
	pm.appMetrics.ActiveDownloads = pm.getActiveDownloads()
	pm.appMetrics.SearchLatency = pm.getSearchLatency()
	pm.appMetrics.DatabaseConnections = pm.getDatabaseConnections()
}

// collectDatabaseMetrics collects database performance metrics
func (pm *PerformanceMonitor) collectDatabaseMetrics() {
	// This would collect metrics from database connection pools and query performance
	// Implementation would depend on specific database driver instrumentation
	
	pm.dbMetrics.ConnectionPool = pm.getConnectionPoolMetrics()
	pm.dbMetrics.QueryPerformance = pm.getQueryMetrics()
	pm.dbMetrics.CacheMetrics = pm.getDatabaseCacheMetrics()
	pm.dbMetrics.TransactionMetrics = pm.getTransactionMetrics()
}

// addToHistory adds a metrics snapshot to the history
func (pm *PerformanceMonitor) addToHistory(snapshot MetricsSnapshot) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	pm.metricsHistory = append(pm.metricsHistory, snapshot)

	// Maintain history size limit
	if len(pm.metricsHistory) > pm.maxHistory {
		pm.metricsHistory = pm.metricsHistory[1:]
	}
}

// checkAlerts checks metrics against alert thresholds
func (pm *PerformanceMonitor) checkAlerts(snapshot *MetricsSnapshot) {
	thresholds := pm.config.AlertThresholds

	// Check CPU usage
	if snapshot.SystemMetrics.CPU.Usage > thresholds.CPUUsage {
		alert := &PerformanceAlert{
			ID:        fmt.Sprintf("cpu_high_%d", time.Now().Unix()),
			Type:      "system",
			Severity:  "warning",
			Message:   "High CPU usage detected",
			Metric:    "cpu_usage",
			Value:     snapshot.SystemMetrics.CPU.Usage,
			Threshold: thresholds.CPUUsage,
			Timestamp: time.Now(),
		}
		pm.alertManager.TriggerAlert(alert)
	}

	// Check memory usage
	if snapshot.SystemMetrics.Memory.UsagePercent > thresholds.MemoryUsage {
		alert := &PerformanceAlert{
			ID:        fmt.Sprintf("memory_high_%d", time.Now().Unix()),
			Type:      "system",
			Severity:  "warning",
			Message:   "High memory usage detected",
			Metric:    "memory_usage",
			Value:     snapshot.SystemMetrics.Memory.UsagePercent,
			Threshold: thresholds.MemoryUsage,
			Timestamp: time.Now(),
		}
		pm.alertManager.TriggerAlert(alert)
	}

	// Check response time
	if snapshot.ApplicationMetrics.ResponseTimes.P95 > thresholds.ResponseTime {
		alert := &PerformanceAlert{
			ID:        fmt.Sprintf("response_time_high_%d", time.Now().Unix()),
			Type:      "application",
			Severity:  "warning",
			Message:   "High response time detected",
			Metric:    "response_time_p95",
			Value:     snapshot.ApplicationMetrics.ResponseTimes.P95,
			Threshold: thresholds.ResponseTime,
			Timestamp: time.Now(),
		}
		pm.alertManager.TriggerAlert(alert)
	}

	// Check error rates
	totalErrorRate := snapshot.ApplicationMetrics.ErrorRates.HTTP5xx + 
					 snapshot.ApplicationMetrics.ErrorRates.HTTP4xx
	if totalErrorRate > thresholds.ErrorRate {
		alert := &PerformanceAlert{
			ID:        fmt.Sprintf("error_rate_high_%d", time.Now().Unix()),
			Type:      "application",
			Severity:  "critical",
			Message:   "High error rate detected",
			Metric:    "error_rate",
			Value:     totalErrorRate,
			Threshold: thresholds.ErrorRate,
			Timestamp: time.Now(),
		}
		pm.alertManager.TriggerAlert(alert)
	}
}

// GetCurrentMetrics returns the current metrics snapshot
func (pm *PerformanceMonitor) GetCurrentMetrics() *MetricsSnapshot {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	if len(pm.metricsHistory) == 0 {
		return nil
	}

	return &pm.metricsHistory[len(pm.metricsHistory)-1]
}

// GetMetricsHistory returns historical metrics
func (pm *PerformanceMonitor) GetMetricsHistory(duration time.Duration) []MetricsSnapshot {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	cutoff := time.Now().Add(-duration)
	var filtered []MetricsSnapshot

	for _, snapshot := range pm.metricsHistory {
		if snapshot.Timestamp.After(cutoff) {
			filtered = append(filtered, snapshot)
		}
	}

	return filtered
}

// metricsExportLoop exports metrics to external systems
func (pm *PerformanceMonitor) metricsExportLoop(ctx context.Context) {
	ticker := time.NewTicker(pm.config.ExportInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-pm.stopChan:
			return
		case <-ticker.C:
			pm.exportMetrics()
		}
	}
}

// exportMetrics exports current metrics to repository
func (pm *PerformanceMonitor) exportMetrics() {
	current := pm.GetCurrentMetrics()
	if current == nil {
		return
	}

	// Export to metrics repository
	if err := pm.metricsRepo.StoreMetrics(context.Background(), current); err != nil {
		pm.logger.Errorf("Failed to export metrics: %v", err)
	}
}

// alertProcessingLoop processes alerts
func (pm *PerformanceMonitor) alertProcessingLoop(ctx context.Context) {
	// Implementation for processing and managing alerts
	// This would handle alert notifications, escalations, etc.
}

// Placeholder methods for metric collection (would be implemented based on specific requirements)

func (pm *PerformanceMonitor) getActiveConnections() int              { return 0 }
func (pm *PerformanceMonitor) getRequestsPerSecond() float64          { return 0 }
func (pm *PerformanceMonitor) getResponseTimes() ResponseTimeMetrics  { return ResponseTimeMetrics{} }
func (pm *PerformanceMonitor) getErrorRates() ErrorRateMetrics        { return ErrorRateMetrics{} }
func (pm *PerformanceMonitor) getCacheHitRatio() float64              { return 0 }
func (pm *PerformanceMonitor) getQueueSizes() QueueMetrics            { return QueueMetrics{} }
func (pm *PerformanceMonitor) getActiveDownloads() int                { return 0 }
func (pm *PerformanceMonitor) getSearchLatency() time.Duration        { return 0 }
func (pm *PerformanceMonitor) getDatabaseConnections() int            { return 0 }
func (pm *PerformanceMonitor) getConnectionPoolMetrics() PoolMetrics  { return PoolMetrics{} }
func (pm *PerformanceMonitor) getQueryMetrics() QueryMetrics          { return QueryMetrics{} }
func (pm *PerformanceMonitor) getDatabaseCacheMetrics() CacheMetrics  { return CacheMetrics{} }
func (pm *PerformanceMonitor) getTransactionMetrics() TxMetrics       { return TxMetrics{} }

// NewAlertManager creates a new alert manager
func NewAlertManager(thresholds *AlertThresholds) *AlertManager {
	return &AlertManager{
		thresholds:    thresholds,
		alertHandlers: make([]AlertHandler, 0),
	}
}

// TriggerAlert triggers a performance alert
func (am *AlertManager) TriggerAlert(alert *PerformanceAlert) {
	am.mu.RLock()
	handlers := make([]AlertHandler, len(am.alertHandlers))
	copy(handlers, am.alertHandlers)
	am.mu.RUnlock()

	for _, handler := range handlers {
		go func(h AlertHandler) {
			if err := h.HandleAlert(alert); err != nil {
				// Log error handling failure
			}
		}(handler)
	}
}

// AddAlertHandler adds an alert handler
func (am *AlertManager) AddAlertHandler(handler AlertHandler) {
	am.mu.Lock()
	defer am.mu.Unlock()
	am.alertHandlers = append(am.alertHandlers, handler)
}