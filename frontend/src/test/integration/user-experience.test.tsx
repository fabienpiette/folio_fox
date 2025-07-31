/**
 * User Experience Integration Tests
 * 
 * Tests comprehensive UX scenarios including:
 * - Loading states display correctly during API calls
 * - Error messages are user-friendly and actionable
 * - Retry functionality works as expected
 * - Empty states show appropriate guidance
 * - Real-time updates don't cause UI flicker
 * - Accessibility compliance for all states
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { SearchPage } from '@/components/search/SearchPage'
import { DownloadsPage } from '@/components/downloads/DownloadsPage'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

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

vi.mock('@/stores/auth', () => ({
  useAuthStore: {
    getState: () => ({
      token: 'mock-jwt-token',
      user: { id: 1, username: 'testuser' },
      logout: vi.fn()
    })
  }
}))

describe('User Experience Integration Tests', () => {
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

  describe('Loading States and Indicators', () => {
    it('should display proper loading states for dashboard components', async () => {
      // Add delay to API responses to observe loading states
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          await new Promise(resolve => setTimeout(resolve, 1000))
          return HttpResponse.json({
            totalBooks: 100,
            completed_downloads: 50,
            activeDownloads: 2,
            queueItems: 5,
            failedDownloads: 1
          })
        }),
        http.get('/api/v1/system/status', async () => {
          await new Promise(resolve => setTimeout(resolve, 800))
          return HttpResponse.json({
            database: {
              status: 'healthy',
              message: 'Connected',
              response_ms: 5,
              connections: 10
            },
            indexers: {
              total: 3,
              online: 3,
              status: 'healthy'
            },
            downloadService: {
              status: 'active',
              activeDownloads: 2
            }
          })
        }),
        http.get('/api/v1/downloads/queue', async () => {
          await new Promise(resolve => setTimeout(resolve, 600))
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

      // Check for loading states
      expect(screen.getByTestId('dashboard-stats-loading')).toBeInTheDocument()
      expect(screen.getByTestId('system-status-loading')).toBeInTheDocument()
      expect(screen.getByTestId('recent-downloads-loading')).toBeInTheDocument()

      // Verify loading states have proper ARIA labels
      const statsLoading = screen.getByTestId('dashboard-stats-loading')
      expect(statsLoading).toHaveAttribute('aria-label', 'Loading dashboard statistics')

      const statusLoading = screen.getByTestId('system-status-loading')
      expect(statusLoading).toHaveAttribute('aria-label', 'Loading system status')

      const downloadsLoading = screen.getByTestId('recent-downloads-loading')
      expect(downloadsLoading).toHaveAttribute('aria-label', 'Loading recent downloads')

      // Wait for all loading states to complete
      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument()
      }, { timeout: 2000 })

      await waitFor(() => {
        expect(screen.getByText('Healthy')).toBeInTheDocument()
      }, { timeout: 2000 })

      await waitFor(() => {
        expect(screen.getByTestId('no-recent-activity')).toBeInTheDocument()
      }, { timeout: 2000 })

      // Verify loading states are removed
      expect(screen.queryByTestId('dashboard-stats-loading')).not.toBeInTheDocument()
      expect(screen.queryByTestId('system-status-loading')).not.toBeInTheDocument()
      expect(screen.queryByTestId('recent-downloads-loading')).not.toBeInTheDocument()
    })

    it('should show skeleton loaders with proper structure', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          await new Promise(resolve => setTimeout(resolve, 500))
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

      const loadingElement = screen.getByTestId('dashboard-stats-loading')
      
      // Verify skeleton has proper structure for screen readers
      expect(loadingElement).toHaveClass('animate-pulse')
      expect(within(loadingElement).getAllByRole('generic')).toHaveLength(4) // 4 stat cards

      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument()
      })
    })

    it('should maintain layout stability during loading transitions', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          await new Promise(resolve => setTimeout(resolve, 300))
          return HttpResponse.json({
            totalBooks: 200,
            completed_downloads: 100,
            activeDownloads: 4,
            queueItems: 10,
            failedDownloads: 3
          })
        })
      )

      const { container } = renderWithQueryClient(<DashboardPage />)

      // Get initial layout measurements
      const initialHeight = container.offsetHeight
      const initialWidth = container.offsetWidth

      await waitFor(() => {
        expect(screen.getByText('200')).toBeInTheDocument()
      })

      // Layout should remain stable (no cumulative layout shift)
      expect(container.offsetHeight).toBeGreaterThanOrEqual(initialHeight - 50) // Allow small variance
      expect(container.offsetWidth).toBe(initialWidth)
    })
  })

  describe('Error States and Messages', () => {
    it('should display user-friendly error messages with clear actions', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(
            {
              type: 'about:blank',
              title: 'Service Unavailable',
              status: 503,
              detail: 'The dashboard service is temporarily unavailable. Please try again in a few minutes.',
              timestamp: new Date().toISOString(),
              request_id: 'test-123'
            },
            { status: 503 }
          )
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
      })

      // Verify error message is accessible
      const errorMessage = screen.getByRole('alert')
      expect(errorMessage).toBeInTheDocument()
      expect(errorMessage).toHaveAttribute('aria-live', 'polite')

      // Verify retry button is available and accessible
      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toBeInTheDocument()
      expect(retryButton).toHaveAttribute('aria-describedby')
    })

    it('should provide contextual error guidance for different error types', async () => {
      const scenarios = [
        {
          status: 401,
          title: 'Authentication Required',
          detail: 'Your session has expired. Please log in again.',
          expectedGuidance: /log in again/i
        },
        {
          status: 403,
          title: 'Access Denied',
          detail: 'You do not have permission to view dashboard statistics.',
          expectedGuidance: /permission/i
        },
        {
          status: 404,
          title: 'Not Found',
          detail: 'The dashboard statistics endpoint was not found.',
          expectedGuidance: /not found/i
        },
        {
          status: 429,
          title: 'Rate Limited',
          detail: 'Too many requests. Please wait 60 seconds before trying again.',
          expectedGuidance: /wait.*seconds/i
        }
      ]

      for (const scenario of scenarios) {
        server.use(
          http.get('/api/v1/downloads/dashboard-stats', () => {
            return HttpResponse.json(
              {
                type: 'about:blank',
                title: scenario.title,
                status: scenario.status,
                detail: scenario.detail,
                timestamp: new Date().toISOString(),
                request_id: 'test-' + Math.random().toString(36).substr(2, 9)
              },
              { status: scenario.status }
            )
          })
        )

        const { unmount } = renderWithQueryClient(<DashboardPage />)

        await waitFor(() => {
          expect(screen.getByText(scenario.expectedGuidance)).toBeInTheDocument()
        })

        unmount()
        server.resetHandlers()
      }
    })

    it('should handle multiple simultaneous errors gracefully', async () => {
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

      // All sections should show appropriate error states
      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard statistics/i)).toBeInTheDocument()
        expect(screen.getByText(/Failed to load system status/i)).toBeInTheDocument()
        expect(screen.getByText(/Failed to load recent downloads/i)).toBeInTheDocument()
      })

      // Should have multiple retry buttons, each properly labeled
      const retryButtons = screen.getAllByRole('button', { name: /retry|try again/i })
      expect(retryButtons.length).toBeGreaterThanOrEqual(3)

      // Each retry button should be properly associated with its error
      retryButtons.forEach(button => {
        expect(button).toHaveAttribute('aria-describedby')
      })
    })
  })

  describe('Retry Functionality', () => {
    it('should enable successful retry after error resolution', async () => {
      let callCount = 0

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          callCount++
          
          if (callCount === 1) {
            return HttpResponse.error()
          }
          
          return HttpResponse.json({
            totalBooks: 300,
            completed_downloads: 150,
            activeDownloads: 5,
            queueItems: 15,
            failedDownloads: 4
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Wait for initial error
      await waitFor(() => {
        expect(screen.getByText(/Failed to load dashboard statistics/i)).toBeInTheDocument()
      })

      // Click retry button
      const retryButton = screen.getByRole('button', { name: /retry/i })
      await user.click(retryButton)

      // Should show loading state during retry
      expect(screen.getByTestId('dashboard-stats-loading')).toBeInTheDocument()

      // Should successfully load data after retry
      await waitFor(() => {
        expect(screen.getByText('300')).toBeInTheDocument()
      })

      expect(callCount).toBe(2)
    })

    it('should provide visual feedback during retry attempts', async () => {
      let retryCount = 0

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          retryCount++
          await new Promise(resolve => setTimeout(resolve, 500))
          
          if (retryCount < 3) {
            return HttpResponse.error()
          }
          
          return HttpResponse.json({
            totalBooks: 400,
            completed_downloads: 200,
            activeDownloads: 6,
            queueItems: 20,
            failedDownloads: 5
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Wait for initial error
      await waitFor(() => {
        expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
      })

      // Click retry
      const retryButton = screen.getByRole('button', { name: /retry/i })
      await user.click(retryButton)

      // Should show loading state
      expect(screen.getByTestId('dashboard-stats-loading')).toBeInTheDocument()

      // Wait for second error
      await waitFor(() => {
        expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
      })

      // Retry again
      await user.click(retryButton)

      // Should eventually succeed
      await waitFor(() => {
        expect(screen.getByText('400')).toBeInTheDocument()
      }, { timeout: 3000 })

      expect(retryCount).toBe(3)
    })

    it('should disable retry button during retry attempt', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          await new Promise(resolve => setTimeout(resolve, 1000))
          return HttpResponse.error()
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
      })

      const retryButton = screen.getByRole('button', { name: /retry/i })
      
      // Button should be enabled initially
      expect(retryButton).not.toBeDisabled()

      // Click retry
      await user.click(retryButton)

      // Button should be disabled during retry
      expect(retryButton).toBeDisabled()
      expect(retryButton).toHaveAttribute('aria-disabled', 'true')

      // Wait for retry to complete
      await waitFor(() => {
        expect(retryButton).not.toBeDisabled()
      }, { timeout: 2000 })
    })
  })

  describe('Empty States', () => {
    it('should display helpful empty state for new users', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: 0,
            completed_downloads: 0,
            activeDownloads: 0,
            queueItems: 0,
            failedDownloads: 0
          })
        }),
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

      await waitFor(() => {
        expect(screen.getByTestId('no-recent-activity')).toBeInTheDocument()
      })

      // Empty state should provide guidance
      expect(screen.getByText(/get started/i)).toBeInTheDocument()
      expect(screen.getByText(/search for books/i)).toBeInTheDocument()

      // Should include actionable button
      const searchButton = screen.getByRole('button', { name: /start searching/i })
      expect(searchButton).toBeInTheDocument()
    })

    it('should provide contextual empty states for different sections', async () => {
      server.use(
        http.get('/api/v1/downloads/queue', ({ request }) => {
          const url = new URL(request.url)
          const status = url.searchParams.get('status')
          
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

      renderWithQueryClient(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument()
      })

      // Should provide relevant guidance for downloads page
      expect(screen.getByText(/add books to your download queue/i)).toBeInTheDocument()
      
      // Should include link to search
      const searchLink = screen.getByRole('link', { name: /browse library/i })
      expect(searchLink).toBeInTheDocument()
    })
  })

  describe('Real-time Updates and UI Stability', () => {
    it('should update data without causing UI flicker', async () => {
      let updateCount = 0

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          updateCount++
          return HttpResponse.json({
            totalBooks: 100 + updateCount,
            completed_downloads: 50 + updateCount,
            activeDownloads: Math.max(0, 3 - updateCount),
            queueItems: Math.max(0, 5 - updateCount),
            failedDownloads: Math.min(10, updateCount)
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('101')).toBeInTheDocument()
      })

      // Enable automatic refetching
      queryClient.setDefaultOptions({
        queries: {
          refetchInterval: 1000,
          refetchIntervalInBackground: true
        }
      })

      // Wait for first update
      await waitFor(() => {
        expect(screen.getByText('102')).toBeInTheDocument()
      }, { timeout: 2000 })

      // Verify no loading states are shown during background updates
      expect(screen.queryByTestId('dashboard-stats-loading')).not.toBeInTheDocument()

      // Wait for second update
      await waitFor(() => {
        expect(screen.getByText('103')).toBeInTheDocument()
      }, { timeout: 2000 })

      expect(updateCount).toBeGreaterThanOrEqual(3)
    })

    it('should handle rapid data changes smoothly', async () => {
      let callCount = 0
      const rapidUpdates = [
        { activeDownloads: 1, queueItems: 10 },
        { activeDownloads: 2, queueItems: 9 },
        { activeDownloads: 3, queueItems: 8 },
        { activeDownloads: 2, queueItems: 9 },
        { activeDownloads: 1, queueItems: 10 }
      ]

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          const update = rapidUpdates[callCount % rapidUpdates.length]
          callCount++
          
          return HttpResponse.json({
            totalBooks: 100,
            completed_downloads: 50,
            activeDownloads: update.activeDownloads,
            queueItems: update.queueItems,
            failedDownloads: 1
          })
        })
      )

      renderWithQueryClient(<DashboardPage />)

      // Enable rapid updates
      queryClient.setDefaultOptions({
        queries: {
          refetchInterval: 200,
          refetchIntervalInBackground: true
        }
      })

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument() // activeDownloads
      })

      // Wait for several rapid updates
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Verify UI remained stable and responsive
      expect(screen.getByText('100')).toBeInTheDocument() // totalBooks should remain stable
      expect(callCount).toBeGreaterThan(5)
    })
  })

  describe('Accessibility Compliance', () => {
    it('should maintain accessibility standards in all states', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          await new Promise(resolve => setTimeout(resolve, 300))
          return HttpResponse.json({
            totalBooks: 100,
            completed_downloads: 50,
            activeDownloads: 2,
            queueItems: 5,
            failedDownloads: 1
          })
        })
      )

      const { container } = renderWithQueryClient(<DashboardPage />)

      // Test loading state accessibility
      const results = await axe(container)
      expect(results).toHaveNoViolations()

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument()
      })

      // Test loaded state accessibility
      const loadedResults = await axe(container)
      expect(loadedResults).toHaveNoViolations()
    })

    it('should maintain accessibility standards in error states', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.error()
        })
      )

      const { container } = renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
      })

      // Test error state accessibility
      const results = await axe(container)
      expect(results).toHaveNoViolations()

      // Verify error has proper ARIA attributes
      const errorAlert = screen.getByRole('alert')
      expect(errorAlert).toHaveAttribute('aria-live', 'polite')

      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toHaveAttribute('aria-describedby')
    })

    it('should provide proper keyboard navigation for interactive elements', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.error()
        })
      )

      renderWithQueryClient(<DashboardPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
      })

      const retryButton = screen.getByRole('button', { name: /retry/i })
      
      // Test keyboard navigation
      retryButton.focus()
      expect(document.activeElement).toBe(retryButton)

      // Test keyboard activation
      await user.keyboard('{Enter}')
      expect(retryButton).toHaveAttribute('aria-pressed')
    })
  })
})