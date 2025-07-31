import React, { memo, useMemo, useCallback } from 'react'
import { useDashboardStats, useRecentDownloads, useSystemStatus } from '@/hooks/useDashboard'
import { useEnhancedPerformanceMonitor } from '@/hooks/usePerformanceMonitor'
import { 
  ApiErrorDisplay, 
  NoRecentActivity, 
  DashboardStatsLoading,
  RecentDownloadsLoading,
  SystemStatusLoading,
  createApiError
} from '@/components/ui/feedback'

// Memoized StatCard component
interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  bgColor: string
  isLoading: boolean
}

const StatCard = memo(({ icon, label, value, bgColor, isLoading }: StatCardProps) => {
  return (
    <div className="card">
      <div className="flex items-center">
        <div className={`p-2 ${bgColor} rounded-lg`}>
          {icon}
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-dark-400">{label}</p>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-6 bg-dark-600 rounded w-16"></div>
            </div>
          ) : (
            <p className="text-2xl font-bold text-dark-50">{value}</p>
          )}
        </div>
      </div>
    </div>
  )
})

StatCard.displayName = 'StatCard'

// Memoized StatusBadge component
interface StatusBadgeProps {
  status: string
}

const StatusBadge = memo(({ status }: StatusBadgeProps) => {
  const statusStyles = useMemo(() => {
    switch (status) {
      case 'completed':
        return 'bg-success-500/20 text-success-300'
      case 'downloading':
        return 'bg-primary-500/20 text-primary-300'
      case 'queued':
        return 'bg-warning-500/20 text-warning-300'
      case 'failed':
        return 'bg-error-500/20 text-error-300'
      default:
        return 'bg-dark-500/20 text-dark-300'
    }
  }, [status])

  const statusText = useMemo(() => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'downloading':
        return 'Downloading'
      case 'queued':
        return 'Queued'
      case 'failed':
        return 'Failed'
      default:
        return 'Unknown'
    }
  }, [status])

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles}`}>
      {statusText}
    </span>
  )
})

StatusBadge.displayName = 'StatusBadge'

// Memoized DownloadItem component
interface DownloadItemProps {
  download: {
    id: string
    title: string
    author: string
    status: string
  }
}

const DownloadItem = memo(({ download }: DownloadItemProps) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-dark-200">{download.title}</p>
        <p className="text-xs text-dark-400">{download.author}</p>
      </div>
      <StatusBadge status={download.status} />
    </div>
  )
})

DownloadItem.displayName = 'DownloadItem'

// Memoized SystemStatusItem component
interface SystemStatusItemProps {
  label: string
  status: string
  statusText: string
  isHealthy: boolean
}

const SystemStatusItem = memo(({ label, status, statusText, isHealthy }: SystemStatusItemProps) => {
  const statusDotClass = useMemo(() => {
    if (isHealthy) return 'status-online'
    if (status === 'active') return 'status-processing'
    return 'status-error'
  }, [isHealthy, status])

  const textClass = useMemo(() => {
    if (isHealthy) return 'text-success-400'
    if (status === 'active') return 'text-primary-400'
    return 'text-error-400'
  }, [isHealthy, status])

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-dark-300">{label}</span>
      <div className="flex items-center space-x-2">
        <div className={`status-dot ${statusDotClass}`}></div>
        <span className={`text-xs ${textClass}`}>
          {statusText}
        </span>
      </div>
    </div>
  )
})

SystemStatusItem.displayName = 'SystemStatusItem'

// Memoized StatsGrid component
interface StatsGridProps {
  stats: any
  statsLoading: boolean
  statsError: any
  refetchStats: () => void
}

const StatsGrid = memo(({ stats, statsLoading, statsError, refetchStats }: StatsGridProps) => {
  const statItems = useMemo(() => [
    {
      key: 'totalBooks',
      icon: (
        <svg className="w-6 h-6 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      label: 'Total Books',
      value: stats?.totalBooks?.toLocaleString() || '0',
      bgColor: 'bg-primary-500/20'
    },
    {
      key: 'activeDownloads',
      icon: (
        <svg className="w-6 h-6 text-success-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
        </svg>
      ),
      label: 'Active Downloads',
      value: stats?.activeDownloads?.toString() || '0',
      bgColor: 'bg-success-500/20'
    },
    {
      key: 'queueItems',
      icon: (
        <svg className="w-6 h-6 text-warning-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
        </svg>
      ),
      label: 'Queue Items',
      value: stats?.queueItems?.toString() || '0',
      bgColor: 'bg-warning-500/20'
    },
    {
      key: 'failedDownloads',
      icon: (
        <svg className="w-6 h-6 text-error-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
        </svg>
      ),
      label: 'Failed Downloads',
      value: stats?.failedDownloads?.toString() || '0',
      bgColor: 'bg-error-500/20'
    }
  ], [stats])

  if (statsLoading) {
    return <DashboardStatsLoading />
  }

  if (statsError) {
    return (
      <div className="col-span-full">
        <ApiErrorDisplay
          error={createApiError(statsError)}
          onRetry={refetchStats}
          variant="banner"
          size="sm"
        />
      </div>
    )
  }

  return (
    <>
      {statItems.map(item => (
        <StatCard
          key={item.key}
          icon={item.icon}
          label={item.label}
          value={item.value}
          bgColor={item.bgColor}
          isLoading={false}
        />
      ))}
    </>
  )
})

StatsGrid.displayName = 'StatsGrid'

// Main optimized dashboard component
export const OptimizedDashboardPage = memo(() => {
  const performanceMonitor = useEnhancedPerformanceMonitor('DashboardPage')
  
  const { 
    data: stats, 
    isLoading: statsLoading, 
    error: statsError, 
    refetch: refetchStats 
  } = useDashboardStats()
  
  const { 
    data: recentDownloadsData, 
    isLoading: downloadsLoading, 
    error: downloadsError, 
    refetch: refetchDownloads 
  } = useRecentDownloads()
  
  const { 
    data: systemStatus, 
    isLoading: statusLoading, 
    error: statusError, 
    refetch: refetchStatus 
  } = useSystemStatus()

  // Memoize computed values
  const recentDownloads = useMemo(() => {
    return recentDownloadsData?.downloads || []
  }, [recentDownloadsData?.downloads])

  const systemStatusItems = useMemo(() => {
    if (!systemStatus) return []
    
    return [
      {
        key: 'database',
        label: 'Database',
        status: systemStatus.database.status,
        statusText: systemStatus.database.status === 'healthy' ? 'Healthy' : 'Unhealthy',
        isHealthy: systemStatus.database.status === 'healthy'
      },
      {
        key: 'indexers',
        label: 'Indexers',
        status: systemStatus.indexers.status,
        statusText: `${systemStatus.indexers.online || 0}/${systemStatus.indexers.total || 0} Online`,
        isHealthy: systemStatus.indexers.status === 'healthy'
      },
      {
        key: 'downloadService',
        label: 'Download Service',
        status: systemStatus.downloadService.status,
        statusText: systemStatus.downloadService.status === 'active' ? 'Active' : 'Inactive',
        isHealthy: systemStatus.downloadService.status === 'active'
      }
    ]
  }, [systemStatus])

  // Memoized callbacks
  const handleRefetchStats = useCallback(() => {
    refetchStats()
  }, [refetchStats])

  const handleRefetchDownloads = useCallback(() => {
    refetchDownloads()
  }, [refetchDownloads])

  const handleRefetchStatus = useCallback(() => {
    refetchStatus()
  }, [refetchStatus])

  // Track memory usage periodically
  React.useEffect(() => {
    const interval = setInterval(() => {
      performanceMonitor.trackMemoryUsage()
    }, 30000) // Every 30 seconds

    return () => clearInterval(interval)
  }, [performanceMonitor])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-dark-50">Dashboard</h1>
        <p className="mt-2 text-dark-400">
          Overview of your eBook library and download activity
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsGrid
          stats={stats}
          statsLoading={statsLoading}
          statsError={statsError}
          refetchStats={handleRefetchStats}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Downloads */}
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">Recent Downloads</h3>
          {downloadsLoading ? (
            <RecentDownloadsLoading />
          ) : downloadsError ? (
            <ApiErrorDisplay
              error={createApiError(downloadsError)}
              onRetry={handleRefetchDownloads}
              variant="inline"
              size="sm"
            />
          ) : recentDownloads?.length ? (
            <div className="space-y-3">
              {recentDownloads.map(download => (
                <DownloadItem key={download.id} download={download} />
              ))}
            </div>
          ) : (
            <NoRecentActivity />
          )}
        </div>

        {/* System Status */}
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">System Status</h3>
          {statusLoading ? (
            <SystemStatusLoading />
          ) : statusError ? (
            <ApiErrorDisplay
              error={createApiError(statusError)}
              onRetry={handleRefetchStatus}
              variant="inline"
              size="sm"
            />
          ) : (
            <div className="space-y-3">
              {systemStatusItems.map(item => (
                <SystemStatusItem
                  key={item.key}
                  label={item.label}
                  status={item.status}
                  statusText={item.statusText}
                  isHealthy={item.isHealthy}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Performance Debug (Development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="card bg-dark-700/50 border-warning-500/20">
          <h4 className="text-sm font-medium text-warning-300 mb-2">Performance Metrics</h4>
          <div className="text-xs text-dark-400 space-y-1">
            <div>Render Time: {performanceMonitor.metrics.renderTime.toFixed(2)}ms</div>
            <div>Re-renders: {performanceMonitor.metrics.reRenders}</div>
            <div>Cache Hit Rate: {performanceMonitor.metrics.queryStats.cacheHitRate.toFixed(1)}%</div>
            <div>Error Rate: {performanceMonitor.metrics.queryStats.errorRate.toFixed(1)}%</div>
          </div>
        </div>
      )}
    </div>
  )
})

OptimizedDashboardPage.displayName = 'OptimizedDashboardPage'