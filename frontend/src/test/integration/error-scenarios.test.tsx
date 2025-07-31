/**
 * Error Scenario Integration Tests
 * 
 * Tests comprehensive error handling for:
 * - Network failures (offline, timeouts, connection errors)
 * - API error responses (401, 403, 404, 500, etc.)
 * - Invalid data format handling
 * - Rate limiting responses
 * - Partial data loading scenarios
 * - Recovery mechanisms and retry logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { SearchPage } from '@/components/search/SearchPage'
import { DownloadsPage } from '@/components/downloads/DownloadsPage'
import { useAuthStore } from '@/stores/auth'
import { ErrorResponse } from '@/types'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'

// Mock dependencies
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

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn()
  }
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: {
    getState: () => ({
      token: 'mock-jwt-token',
      user: { id: 1, username: 'testuser' },
      logout: vi.fn()
    })
  }
}))

describe('Error Scenario Integration Tests', () => {
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

  const renderWithQueryClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    )
  }

  describe('Network Failure Scenarios', () => {
    it('should handle complete network failure gracefully', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.error()
        }),
        http.get('/api/v1/system/status', () => {
          return HttpResponse.error()
        }),
        http.get('/api/v1/downloads/queue', () => {
          return HttpResponse.error()
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Verify error displays are shown
      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard statistics/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/Failed to load system status/i)).toBeInTheDocument()
      expect(screen.getByText(/Failed to load recent downloads/i)).toBeInTheDocument()

      // Verify retry buttons are available
      const retryButtons = screen.getAllByText(/retry/i)
      expect(retryButtons.length).toBeGreaterThan(0)
    })

    it('should handle timeout errors with proper messaging', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          // Simulate timeout by delaying response indefinitely
          await new Promise(resolve => setTimeout(resolve, 35000)) // Longer than 30s timeout
          return HttpResponse.json({})
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Wait for timeout error to occur
      await waitFor(() => {
        expect(screen.getByText(/timeout/i)).toBeInTheDocument()
      }, { timeout: 35000 })
    })

    it('should handle intermittent network issues with retry logic', async () => {
      let attemptCount = 0

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          attemptCount++
          
          if (attemptCount < 3) {
            return HttpResponse.error()
          }
          
          return HttpResponse.json({
            totalBooks: 100,
            completed_downloads: 50,
            activeDownloads: 2,
            queueItems: 5,
            failedDownloads: 1
          })
        })
      )

      // Enable retry for this test
      queryClient.setDefaultOptions({
        queries: {
          retry: 3,
          retryDelay: 100 // Fast retry for testing
        }
      })

      renderWithQueryClient(<DashboardPage />)

      // Should eventually succeed after retries
      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument()
      }, { timeout: 5000 })

      expect(attemptCount).toBe(3)
    })

    it('should handle partial API availability', async () => {
      server.use(
        // Dashboard stats succeed
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: 100,
            completed_downloads: 50,
            activeDownloads: 2,
            queueItems: 5,
            failedDownloads: 1
          })
        }),
        // System status fails
        http.get('/api/v1/system/status', () => {
          return HttpResponse.error()
        }),
        // Downloads succeed
        http.get('/api/v1/downloads/queue', () => {
          return HttpResponse.json({
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
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Dashboard stats should load successfully
      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument()
      })

      // System status should show error
      expect(screen.getByText(/Failed to load system status/i)).toBeInTheDocument()

      // Downloads section should show empty state
      expect(screen.getByTestId('no-recent-activity')).toBeInTheDocument()
    })
  })

  describe('HTTP Error Responses', () => {
    it('should handle 401 Unauthorized errors', async () => {
      const mockLogout = vi.fn()
      vi.mocked(useAuthStore.getState).mockReturnValue({
        token: 'expired-token',
        user: { id: 1, username: 'testuser' },
        logout: mockLogout
      })

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          const errorResponse: ErrorResponse = {
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            detail: 'Token has expired',
            timestamp: new Date().toISOString(),
            request_id: 'test-' + Math.random().toString(36).substr(2, 9)
          }
          return HttpResponse.json(errorResponse, { status: 401 })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled()
      })

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Session expired. Please log in again.')
    })

    it('should handle 403 Forbidden errors', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          const errorResponse: ErrorResponse = {
            type: 'about:blank',
            title: 'Forbidden',
            status: 403,
            detail: 'Insufficient permissions',
            timestamp: new Date().toISOString(),
            request_id: 'test-' + Math.random().toString(36).substr(2, 9)
          }
          return HttpResponse.json(errorResponse, { status: 403 })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
          'Access denied. You do not have permission to perform this action.'
        )
      })
    })

    it('should handle 404 Not Found errors', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          const errorResponse: ErrorResponse = {
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            detail: 'Endpoint not found',
            timestamp: new Date().toISOString(),
            request_id: 'test-' + Math.random().toString(36).substr(2, 9)
          }
          return HttpResponse.json(errorResponse, { status: 404 })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard statistics/i)).toBeInTheDocument()
      })

      // 404 errors should show specific error message
      expect(screen.getByText(/not found/i)).toBeInTheDocument()
    })

    it('should handle 429 Rate Limiting errors', async () => {
      let requestCount = 0

      server.use(
        http.get('/api/v1/search', () => {
          requestCount++
          
          if (requestCount <= 2) {
            return HttpResponse.json(
              {
                error: 'Rate limit exceeded',
                retry_after: 1
              },
              {
                status: 429,
                headers: {
                  'Retry-After': '1',
                  'X-RateLimit-Limit': '100',
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60)
                }
              }
            )
          }
          
          return HttpResponse.json({
            query: 'test',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null
          })
        })
      )

      renderWithQueryClient(<SearchPage />)

      // Trigger a search
      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'test query')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
          'Rate limit exceeded. Please try again later.'
        )
      })
    })

    it('should handle 500 Server Error responses', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          const errorResponse: ErrorResponse = {
            type: 'about:blank',
            title: 'Internal Server Error',
            status: 500,
            detail: 'Database connection failed',
            timestamp: new Date().toISOString(),
            request_id: 'test-' + Math.random().toString(36).substr(2, 9)
          }
          return HttpResponse.json(errorResponse, { status: 500 })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
          'Server error. Please try again later.'
        )
      })
    })
  })

  describe('Invalid Data Format Scenarios', () => {
    it('should handle malformed JSON responses', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return new Response('invalid json{', {
            headers: { 'Content-Type': 'application/json' }
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard statistics/i)).toBeInTheDocument()
      })
    })

    it('should handle missing required fields in API response', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          // Missing required fields
          return HttpResponse.json({
            totalBooks: 100
            // Missing: completed_downloads, activeDownloads, queueItems, failedDownloads
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument()
      })

      // Should handle missing fields gracefully by showing 0 or default values
      expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('should handle unexpected data types in API response', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: "not a number", // Should be number
            completed_downloads: null, // Should be number
            activeDownloads: 3,
            queueItems: 5,
            failedDownloads: 1
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Should handle gracefully without crashing
      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument()
      })
    })

    it('should handle empty response body', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return new Response('', {
            headers: { 'Content-Type': 'application/json' }
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard statistics/i)).toBeInTheDocument()
      })
    })
  })

  describe('Data Consistency and Recovery', () => {
    it('should handle stale data during API failures', async () => {
      // First load with good data
      let isFirstCall = true

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          if (isFirstCall) {
            isFirstCall = false
            return HttpResponse.json({
              totalBooks: 100,
              completed_downloads: 50,
              activeDownloads: 2,
              queueItems: 5,
              failedDownloads: 1
            })
          }
          
          // Subsequent calls fail
          return HttpResponse.error()
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Initial load should succeed
      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument()
      })

      // Force a refetch
      const refetchButton = screen.getByText(/refresh/i)
      await user.click(refetchButton)

      // Should show error but keep stale data visible
      await waitFor(() => {
        expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
      })

      // Stale data should still be visible
      expect(screen.getByText('100')).toBeInTheDocument()
    })

    it('should handle recovery from error states', async () => {
      let callCount = 0

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          callCount++
          
          if (callCount <= 2) {
            return HttpResponse.error()
          }
          
          return HttpResponse.json({
            totalBooks: 150,
            completed_downloads: 75,
            activeDownloads: 3,
            queueItems: 8,
            failedDownloads: 2
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Should show error initially
      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard statistics/i)).toBeInTheDocument()
      })

      // Click retry
      const retryButton = screen.getByText(/retry/i)
      await user.click(retryButton)

      // Should still show error
      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard statistics/i)).toBeInTheDocument()
      })

      // Click retry again
      await user.click(retryButton)

      // Should now succeed
      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument()
      })

      expect(callCount).toBe(3)
    })
  })

  describe('User-Friendly Error Messages', () => {
    it('should display contextual error messages for different scenarios', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          const errorResponse: ErrorResponse = {
            type: 'about:blank',
            title: 'Service Unavailable',
            status: 503,
            detail: 'Database is temporarily unavailable for maintenance',
            timestamp: new Date().toISOString(),
            request_id: 'test-' + Math.random().toString(36).substr(2, 9)
          }
          return HttpResponse.json(errorResponse, { status: 503 })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/maintenance/i)).toBeInTheDocument()
      })
    })

    it('should provide actionable error messages with next steps', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          const errorResponse: ErrorResponse = {
            type: 'about:blank',
            title: 'Configuration Error',
            status: 422,
            detail: 'Invalid configuration detected. Please check your settings.',
            errors: [{
              field: 'download_path',
              code: 'invalid_path',
              message: 'Download path does not exist or is not writable'
            }],
            timestamp: new Date().toISOString(),
            request_id: 'test-' + Math.random().toString(36).substr(2, 9)
          }
          return HttpResponse.json(errorResponse, { status: 422 })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/configuration/i)).toBeInTheDocument()
        expect(screen.getByText(/settings/i)).toBeInTheDocument()
      })
    })
  })
})