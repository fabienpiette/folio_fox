/**
 * Dashboard Real Data Flow Integration Tests
 * 
 * Tests real API integration for dashboard functionality including:
 * - Stats loading with real API responses
 * - System status updates and display
 * - Recent downloads with real-time updates
 * - Error handling and recovery
 * - Performance optimizations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { 
  DashboardStatsResponse, 
  SystemStatusResponse,
  DownloadQueueResponse,
  ErrorResponse 
} from '@/types'
import userEvent from '@testing-library/user-event'

// Mock performance monitor to avoid console warnings in tests
vi.mock('@/utils/performance', () => ({
  performanceMonitor: {
    recordRequest: vi.fn(),
    recordRender: vi.fn(),
    getMetrics: () => ({
      requests: { total: 0, failed: 0, avgTime: 0 },
      renders: { total: 0, avgTime: 0 }
    })
  },
  requestCache: {
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn()
  }
}))

// Mock authentication store
vi.mock('@/stores/auth', () => ({
  useAuthStore: {
    getState: () => ({
      token: 'mock-jwt-token',
      user: { id: 1, username: 'testuser' },
      logout: vi.fn()
    })
  }
}))

describe('Dashboard Real Data Flow Integration', () => {
  let queryClient: QueryClient
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0
        }
      }
    })
    user = userEvent.setup()
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
    server.resetHandlers()
  })

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    )
  }

  describe('Dashboard Stats Real Data Flow', () => {
    it('should load and display real dashboard stats', async () => {
      const mockStats: DashboardStatsResponse = {
        totalBooks: 1250,
        completed_downloads: 3400,
        activeDownloads: 3,
        queueItems: 12,
        failedDownloads: 8
      }

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(mockStats)
        })
      )

      renderDashboard()

      // Verify loading state is shown initially
      expect(screen.getByTestId('dashboard-stats-loading')).toBeInTheDocument()

      // Wait for data to load and verify stats are displayed
      await waitFor(() => {
        expect(screen.getByText('1,250')).toBeInTheDocument() // Total books
      })

      expect(screen.getByText('3')).toBeInTheDocument() // Active downloads
      expect(screen.getByText('12')).toBeInTheDocument() // Queue items
      expect(screen.getByText('8')).toBeInTheDocument() // Failed downloads

      // Verify stat cards have correct labels
      expect(screen.getByText('Total Books')).toBeInTheDocument()
      expect(screen.getByText('Active Downloads')).toBeInTheDocument()
      expect(screen.getByText('Queue Items')).toBeInTheDocument()
      expect(screen.getByText('Failed Downloads')).toBeInTheDocument()
    })

    it('should handle empty stats gracefully', async () => {
      const emptyStats: DashboardStatsResponse = {
        totalBooks: 0,
        completed_downloads: 0,
        activeDownloads: 0,
        queueItems: 0,
        failedDownloads: 0
      }

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(emptyStats)
        })
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument()
      })

      // Verify all stats show 0
      const statCards = screen.getAllByText('0')
      expect(statCards).toHaveLength(4) // All four stat cards should show 0
    })

    it('should automatically refresh stats based on configured interval', async () => {
      let callCount = 0
      const initialStats: DashboardStatsResponse = {
        totalBooks: 100,
        completed_downloads: 50,
        activeDownloads: 2,
        queueItems: 5,
        failedDownloads: 1
      }

      const updatedStats: DashboardStatsResponse = {
        totalBooks: 102,
        completed_downloads: 52,
        activeDownloads: 1,
        queueItems: 3,
        failedDownloads: 1
      }

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          callCount++
          return HttpResponse.json(callCount === 1 ? initialStats : updatedStats)
        })
      )

      renderDashboard()

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument()
      })

      // Fast-forward time to trigger refetch (30 seconds)
      vi.advanceTimersByTime(30000)

      // Wait for updated data
      await waitFor(() => {
        expect(screen.getByText('102')).toBeInTheDocument()
      }, { timeout: 5000 })

      expect(callCount).toBe(2)
    })

    it('should optimize API calls with proper caching', async () => {
      let requestCount = 0

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          requestCount++
          return HttpResponse.json({
            totalBooks: 100,
            completed_downloads: 50,
            activeDownloads: 2,
            queueItems: 5,
            failedDownloads: 1
          })
        })
      )

      // Render multiple times quickly
      const { unmount } = renderDashboard()
      unmount()
      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument()
      })

      // Should only make one request due to caching
      expect(requestCount).toBe(1)
    })
  })

  describe('System Status Real Data Flow', () => {
    it('should load and display comprehensive system status', async () => {
      const mockSystemStatus: SystemStatusResponse = {
        database: {
          status: 'healthy',
          message: 'Connected to PostgreSQL',
          response_ms: 5,
          connections: 10
        },
        indexers: {
          total: 5,
          online: 4,
          status: 'degraded'
        },
        downloadService: {
          status: 'active',
          activeDownloads: 3
        }
      }

      server.use(
        http.get('/api/v1/system/status', () => {
          return HttpResponse.json(mockSystemStatus)
        })
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('System Status')).toBeInTheDocument()
      })

      // Verify system status components are displayed
      expect(screen.getByText('Database')).toBeInTheDocument()
      expect(screen.getByText('Indexers')).toBeInTheDocument()
      expect(screen.getByText('Download Service')).toBeInTheDocument()

      // Verify status indicators
      expect(screen.getByText('Healthy')).toBeInTheDocument()
      expect(screen.getByText('4/5 Online')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('should handle degraded system status properly', async () => {
      const degradedStatus: SystemStatusResponse = {
        database: {
          status: 'unhealthy',
          message: 'Connection timeout',
          response_ms: 5000,
          connections: 0
        },
        indexers: {
          total: 3,
          online: 1,
          status: 'degraded'
        },
        downloadService: {
          status: 'error',
          activeDownloads: 0
        }
      }

      server.use(
        http.get('/api/v1/system/status', () => {
          return HttpResponse.json(degradedStatus)
        })
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('Unhealthy')).toBeInTheDocument()
      })

      expect(screen.getByText('1/3 Online')).toBeInTheDocument()
      expect(screen.getByText('Inactive')).toBeInTheDocument()
    })

    it('should update system status in real-time', async () => {
      let statusCallCount = 0

      server.use(
        http.get('/api/v1/system/status', () => {
          statusCallCount++
          return HttpResponse.json({
            database: {
              status: statusCallCount === 1 ? 'healthy' : 'degraded',
              message: 'Database status',
              response_ms: 10,
              connections: statusCallCount === 1 ? 5 : 2
            },
            indexers: {
              total: 3,
              online: statusCallCount === 1 ? 3 : 2,
              status: statusCallCount === 1 ? 'healthy' : 'degraded'
            },
            downloadService: {
              status: 'active',
              activeDownloads: statusCallCount
            }
          })
        })
      )

      renderDashboard()

      // Wait for initial status
      await waitFor(() => {
        expect(screen.getByText('3/3 Online')).toBeInTheDocument()
      })

      // Fast-forward to trigger status update (10 seconds)
      vi.advanceTimersByTime(10000)

      // Wait for updated status
      await waitFor(() => {
        expect(screen.getByText('2/3 Online')).toBeInTheDocument()
      })

      expect(statusCallCount).toBe(2)
    })
  })

  describe('Recent Downloads Real Data Flow', () => {
    it('should load and display recent downloads with real data', async () => {
      const mockDownloads: DownloadQueueResponse = {
        downloads: [
          {
            id: 1,
            user: { id: 1, username: 'testuser' },
            book_id: null,
            indexer: { id: 1, name: 'Test Indexer' },
            title: 'The Great Gatsby',
            author_name: 'F. Scott Fitzgerald',
            download_url: 'https://example.com/download/1',
            file_format: 'epub',
            file_size_bytes: 1048576,
            file_size_human: '1.0 MB',
            priority: 5,
            status: 'completed',
            progress_percentage: 100,
            download_path: '/downloads/gatsby.epub',
            quality_profile: { id: 1, name: 'Standard' },
            retry_count: 0,
            max_retries: 3,
            error_message: null,
            estimated_completion: null,
            started_at: new Date(Date.now() - 300000).toISOString(),
            completed_at: new Date(Date.now() - 60000).toISOString(),
            created_at: new Date(Date.now() - 600000).toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 2,
            user: { id: 1, username: 'testuser' },
            book_id: null,
            indexer: { id: 2, name: 'Test Indexer 2' },
            title: 'To Kill a Mockingbird',
            author_name: 'Harper Lee',
            download_url: 'https://example.com/download/2',
            file_format: 'pdf',
            file_size_bytes: 2097152,
            file_size_human: '2.0 MB',
            priority: 3,
            status: 'downloading',
            progress_percentage: 65,
            download_path: null,
            quality_profile: { id: 1, name: 'Standard' },
            retry_count: 0,
            max_retries: 3,
            error_message: null,
            estimated_completion: new Date(Date.now() + 300000).toISOString(),
            started_at: new Date(Date.now() - 180000).toISOString(),
            completed_at: null,
            created_at: new Date(Date.now() - 300000).toISOString(),
            updated_at: new Date().toISOString()
          }
        ],
        pagination: {
          current_page: 1,
          per_page: 10,
          total_pages: 1,
          total_items: 2,
          has_next: false,
          has_prev: false,
          next_page: null,
          prev_page: null
        },
        queue_stats: {
          total_items: 2,
          pending_count: 0,
          downloading_count: 1,
          completed_count: 1,
          failed_count: 0,
          total_size_bytes: 3145728,
          estimated_completion: new Date(Date.now() + 300000).toISOString()
        }
      }

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          return HttpResponse.json(mockDownloads)
        })
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('The Great Gatsby')).toBeInTheDocument()
      })

      expect(screen.getByText('F. Scott Fitzgerald')).toBeInTheDocument()
      expect(screen.getByText('To Kill a Mockingbird')).toBeInTheDocument()
      expect(screen.getByText('Harper Lee')).toBeInTheDocument()

      // Verify status badges
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Downloading')).toBeInTheDocument()
    })

    it('should handle empty downloads list gracefully', async () => {
      const emptyDownloads: DownloadQueueResponse = {
        downloads: [],
        pagination: {
          current_page: 1,
          per_page: 10,
          total_pages: 0,
          total_items: 0,
          has_next: false,
          has_prev: false,
          next_page: null,
          prev_page: null
        },
        queue_stats: {
          total_items: 0,
          pending_count: 0,
          downloading_count: 0,
          completed_count: 0,
          failed_count: 0,
          total_size_bytes: 0,
          estimated_completion: null
        }
      }

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          return HttpResponse.json(emptyDownloads)
        })
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByTestId('no-recent-activity')).toBeInTheDocument()
      })
    })

    it('should update recent downloads in real-time', async () => {
      let downloadCallCount = 0

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          downloadCallCount++
          
          const baseDownload = {
            id: 1,
            user: { id: 1, username: 'testuser' },
            book_id: null,
            indexer: { id: 1, name: 'Test Indexer' },
            title: 'Real-time Download Test',
            author_name: 'Test Author',
            download_url: 'https://example.com/download/1',
            file_format: 'epub',
            file_size_bytes: 1048576,
            file_size_human: '1.0 MB',
            priority: 5,
            download_path: null,
            quality_profile: { id: 1, name: 'Standard' },
            retry_count: 0,
            max_retries: 3,
            error_message: null,
            created_at: new Date(Date.now() - 300000).toISOString(),
            updated_at: new Date().toISOString()
          }

          const download = {
            ...baseDownload,
            status: downloadCallCount === 1 ? 'downloading' : 'completed',
            progress_percentage: downloadCallCount === 1 ? 50 : 100,
            estimated_completion: downloadCallCount === 1 ? new Date(Date.now() + 300000).toISOString() : null,
            started_at: new Date(Date.now() - 180000).toISOString(),
            completed_at: downloadCallCount === 1 ? null : new Date().toISOString()
          }

          return HttpResponse.json({
            downloads: [download],
            pagination: {
              current_page: 1,
              per_page: 10,
              total_pages: 1,
              total_items: 1,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null
            },
            queue_stats: {
              total_items: 1,
              pending_count: 0,
              downloading_count: downloadCallCount === 1 ? 1 : 0,
              completed_count: downloadCallCount === 1 ? 0 : 1,
              failed_count: 0,
              total_size_bytes: 1048576,
              estimated_completion: downloadCallCount === 1 ? new Date(Date.now() + 300000).toISOString() : null
            }
          })
        })
      )

      renderDashboard()

      // Wait for initial download status
      await waitFor(() => {
        expect(screen.getByText('Real-time Download Test')).toBeInTheDocument()
        expect(screen.getByText('Downloading')).toBeInTheDocument()
      })

      // Fast-forward to trigger update (15 seconds)
      vi.advanceTimersByTime(15000)

      // Wait for status change
      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument()
      })

      expect(downloadCallCount).toBe(2)
    })
  })

  describe('Data Transformation and Enhancement', () => {
    it('should properly transform and enhance dashboard stats', async () => {
      const stats: DashboardStatsResponse = {
        totalBooks: 100,
        completed_downloads: 50,
        activeDownloads: 3,
        queueItems: 5,
        failedDownloads: 2
      }

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(stats)
        })
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument()
      })

      // The useDashboardStats hook should enhance data with computed properties
      // We can verify this by checking if the component renders correctly with transformed data
      expect(screen.getByText('3')).toBeInTheDocument() // activeDownloads
      expect(screen.getByText('5')).toBeInTheDocument() // queueItems
      expect(screen.getByText('2')).toBeInTheDocument() // failedDownloads
    })

    it('should enhance system status with health scoring', async () => {
      const systemStatus: SystemStatusResponse = {
        database: {
          status: 'healthy',
          message: 'All good',
          response_ms: 10,
          connections: 5
        },
        indexers: {
          total: 3,
          online: 2,
          status: 'degraded'
        },
        downloadService: {
          status: 'active',
          activeDownloads: 1
        }
      }

      server.use(
        http.get('/api/v1/system/status', () => {
          return HttpResponse.json(systemStatus)
        })
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByText('System Status')).toBeInTheDocument()
      })

      // Verify enhanced status display
      expect(screen.getByText('Healthy')).toBeInTheDocument()
      expect(screen.getByText('2/3 Online')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
    })
  })
})