import { useQuery } from '@tanstack/react-query'
import { dashboardService } from '@/services/dashboard'

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardService.getStats,
    
    // Cache for 30 seconds as requested
    staleTime: 30 * 1000,
    
    // Background refresh every 30 seconds
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: true,
    
    // Keep data longer in cache for better UX
    gcTime: 5 * 60 * 1000, // 5 minutes
    
    // Enhanced retry logic
    retry: (failureCount, error) => {
      const errorResponse = (error as {response?: {status?: number}})?.response
      
      // Don't retry on client errors
      if (errorResponse?.status && errorResponse.status >= 400 && errorResponse.status < 500) {
        return false
      }
      
      return failureCount < 3
    },
    
    retryDelay: (attemptIndex) => {
      const baseDelay = Math.min(1000 * (2 ** attemptIndex), 10000)
      const jitter = Math.random() * 0.3 * baseDelay
      return baseDelay + jitter
    },
    
    // Optimized data transformation
    select: (data) => ({
      ...data,
      hasData: data.totalBooks > 0 || data.activeDownloads > 0 || data.queueItems > 0,
      totalActivity: data.activeDownloads + data.queueItems + data.failedDownloads,
      totalDownloads: data.completed_downloads + data.activeDownloads + data.queueItems + data.failedDownloads
    }),
    
    // Performance optimizations
    notifyOnChangeProps: ['data', 'error', 'isLoading', 'isRefetching'],
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    
    meta: {
      errorMessage: 'Failed to load dashboard statistics',
      component: 'DashboardStats'
    }
  })
}

export const useRecentDownloads = () => {
  return useQuery({
    queryKey: ['dashboard', 'recent-downloads'],
    queryFn: dashboardService.getRecentDownloads,
    
    // Cache for 5 seconds as requested (real-time updates preferred)
    staleTime: 5 * 1000,
    
    // Background refresh every 15 seconds
    refetchInterval: 15 * 1000,
    refetchIntervalInBackground: true,
    
    // Keep data cached for better UX
    gcTime: 3 * 60 * 1000, // 3 minutes
    
    // Enhanced retry logic
    retry: (failureCount, error) => {
      const errorResponse = (error as {response?: {status?: number}})?.response
      
      // Don't retry on client errors
      if (errorResponse?.status && errorResponse.status >= 400 && errorResponse.status < 500) {
        return false
      }
      
      return failureCount < 3
    },
    
    retryDelay: (attemptIndex) => {
      const baseDelay = Math.min(1000 * (2 ** attemptIndex), 15000)
      const jitter = Math.random() * 0.3 * baseDelay
      return baseDelay + jitter
    },
    
    // Enhanced data transformation with analytics
    select: (data) => {
      const downloads = data || []
      const statusCounts = downloads.reduce((acc, download) => {
        acc[download.status] = (acc[download.status] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      return {
        downloads,
        hasData: Array.isArray(downloads) && downloads.length > 0,
        totalCount: downloads.length,
        statusCounts,
        recentActivity: downloads.filter(d => {
          const updatedAt = new Date(d.created_at)
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
          return updatedAt > fiveMinutesAgo
        }).length
      }
    },
    
    // Performance optimizations
    notifyOnChangeProps: ['data', 'error', 'isLoading', 'isRefetching'],
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    
    meta: {
      errorMessage: 'Failed to load recent downloads',
      component: 'RecentDownloads'
    }
  })
}

export const useSystemStatus = () => {
  return useQuery({
    queryKey: ['dashboard', 'system-status'],
    queryFn: dashboardService.getSystemStatus,
    
    // Cache for 10 seconds as requested (frequent updates)
    staleTime: 10 * 1000,
    
    // Background refresh every 10 seconds for real-time status
    refetchInterval: 10 * 1000,
    refetchIntervalInBackground: true,
    
    // Shorter cache time for system status since it changes frequently
    gcTime: 2 * 60 * 1000, // 2 minutes
    
    // More aggressive retry for system status
    retry: (failureCount, error) => {
      const errorResponse = (error as {response?: {status?: number}})?.response
      
      // Don't retry on client errors
      if (errorResponse?.status && errorResponse.status >= 400 && errorResponse.status < 500) {
        return false
      }
      
      return failureCount < 2 // Fewer retries for faster failure detection
    },
    
    retryDelay: (attemptIndex) => {
      // Faster retry for system status
      const baseDelay = Math.min(500 * (2 ** attemptIndex), 5000)
      const jitter = Math.random() * 0.2 * baseDelay
      return baseDelay + jitter
    },
    
    // Enhanced data transformation with health scoring
    select: (data) => {
      const dbHealthy = data?.database?.status === 'healthy'
      const indexersHealthy = data?.indexers?.status === 'healthy'
      const downloadsHealthy = data?.downloadService?.status === 'active'
      
      const healthScore = [dbHealthy, indexersHealthy, downloadsHealthy].filter(Boolean).length
      
      return {
        ...data,
        isHealthy: dbHealthy && indexersHealthy && downloadsHealthy,
        healthScore,
        maxHealthScore: 3,
        healthPercentage: Math.round((healthScore / 3) * 100),
        criticalIssues: !dbHealthy ? ['database'] : [],
        warnings: data?.indexers?.status === 'degraded' ? ['indexers'] : []
      }
    },
    
    // Performance optimizations
    notifyOnChangeProps: ['data', 'error', 'isLoading', 'isRefetching'],
    refetchOnWindowFocus: true, // Refetch on focus for status updates
    refetchOnReconnect: true,
    
    meta: {
      errorMessage: 'Failed to load system status',
      component: 'SystemStatus'
    }
  })
}