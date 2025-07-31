import { apiClient } from './api'

export interface DashboardStats {
  totalBooks: number
  completed_downloads: number
  activeDownloads: number
  queueItems: number
  failedDownloads: number
}

export interface RecentDownload {
  id: string
  title: string
  author: string
  status: 'completed' | 'downloading' | 'queued' | 'failed'
  created_at: string
}

export interface SystemStatus {
  database: {
    status: 'healthy' | 'unhealthy' | 'unknown'
    message?: string
  }
  indexers: {
    total: number
    online: number
    status: 'healthy' | 'degraded' | 'unhealthy'
  }
  downloadService: {
    status: 'active' | 'idle' | 'error'
    activeDownloads: number
  }
}

export interface DownloadQueueItem {
  id: string
  title: string
  author: string
  status: string
  priority: number
  progress?: number
  created_at: string
  updated_at: string
}

export const dashboardService = {
  async getStats(): Promise<DashboardStats> {
    try {
      // Use the new unified dashboard stats endpoint
      const response = await apiClient.get<{
        totalBooks: number
        completed_downloads: number
        activeDownloads: number
        queueItems: number
        failedDownloads: number
      }>('/downloads/dashboard-stats')

      return {
        totalBooks: response.totalBooks,
        completed_downloads: response.completed_downloads,
        activeDownloads: response.activeDownloads,
        queueItems: response.queueItems,
        failedDownloads: response.failedDownloads
      }
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
      // Return empty stats instead of fake data
      return {
        totalBooks: 0,
        completed_downloads: 0,
        activeDownloads: 0,
        queueItems: 0,
        failedDownloads: 0
      }
    }
  },

  async getRecentDownloads(): Promise<RecentDownload[]> {
    try {
      const response = await apiClient.get<{ downloads: DownloadQueueItem[] }>('/downloads/queue', {
        params: {
          limit: 10,
          sort_by: 'updated_at',
          sort_order: 'desc'
        }
      })

      if (response.downloads && Array.isArray(response.downloads)) {
        return response.downloads.map(download => ({
          id: download.id,
          title: download.title || 'Unknown Title',
          author: download.author || 'Unknown Author',
          status: mapDownloadStatus(download.status),
          created_at: download.created_at
        }))
      }

      // Return empty array instead of fake data
      return []
    } catch (error) {
      console.error('Failed to fetch recent downloads:', error)
      // Return empty array instead of fake data
      return []
    }
  },

  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const response = await apiClient.get<{
        database: {
          status: 'healthy' | 'unhealthy' | 'unknown'
          message?: string
          response_ms: number
          connections: number
        }
        indexers: {
          total: number
          online: number
          status: 'healthy' | 'degraded' | 'unhealthy'
        }
        downloadService: {
          status: 'active' | 'idle' | 'error'
          activeDownloads: number
        }
      }>('/system/status')
      
      return {
        database: {
          status: response.database.status,
          message: response.database.message
        },
        indexers: {
          total: response.indexers.total,
          online: response.indexers.online,
          status: response.indexers.status
        },
        downloadService: {
          status: response.downloadService.status,
          activeDownloads: response.downloadService.activeDownloads
        }
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error)
      // Return unknown status instead of fake data
      return {
        database: {
          status: 'unknown',
          message: 'Unable to connect to system status endpoint'
        },
        indexers: {
          total: 0,
          online: 0,
          status: 'unhealthy'
        },
        downloadService: {
          status: 'error',
          activeDownloads: 0
        }
      }
    }
  }
}

// Helper function to map backend download status to frontend status
function mapDownloadStatus(backendStatus: string): 'completed' | 'downloading' | 'queued' | 'failed' {
  switch (backendStatus?.toLowerCase()) {
    case 'completed':
    case 'finished':
    case 'done':
      return 'completed'
    case 'downloading':
    case 'processing':
    case 'active':
      return 'downloading'
    case 'queued':
    case 'pending':
    case 'waiting':
      return 'queued'
    case 'failed':
    case 'error':
    case 'cancelled':
      return 'failed'
    default:
      return 'queued'
  }
}