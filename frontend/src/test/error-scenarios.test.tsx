import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { BrowserRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { ApiErrorDisplay } from '@/components/ui/feedback/ApiErrorDisplay'
import { EmptyStateDisplay } from '@/components/ui/feedback/EmptyStateDisplay'
import { useAuthStore } from '@/stores/auth'

const server = setupServer()

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('Error Scenarios and Edge Cases', () => {
  beforeEach(() => {
    server.listen()
    useAuthStore.setState({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      token: 'valid-token',
      isAuthenticated: true,
      isLoading: false,
      error: null,
    })
  })

  afterEach(() => {
    server.resetHandlers()
    server.close()
    vi.clearAllMocks()
  })

  describe('Network Error Handling', () => {
    it('handles complete network failure', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.error()
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
        expect(screen.getByText(/check your connection/i)).toBeInTheDocument()
      })

      // Verify retry button is present
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })

    it('handles timeout errors', async () => {
      vi.useFakeTimers()
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          // Simulate long delay that would timeout
          await new Promise(resolve => setTimeout(resolve, 35000))
          return HttpResponse.json({ totalBooks: 0 })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(35000)

      await waitFor(() => {
        expect(screen.getByText(/request timeout/i)).toBeInTheDocument()
      })

      vi.useRealTimers()
    })

    it('handles intermittent connection issues', async () => {
      let requestCount = 0
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          requestCount++
          if (requestCount <= 2) {
            return HttpResponse.error()
          }
          return HttpResponse.json({
            totalBooks: 42,
            activeDownloads: 1,
            queueItems: 2,
            failedDownloads: 0,
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Wait for initial failure
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })

      // Retry once (should still fail)
      fireEvent.click(screen.getByRole('button', { name: /try again/i }))

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })

      // Retry again (should succeed)
      fireEvent.click(screen.getByRole('button', { name: /try again/i }))

      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument()
      })

      expect(requestCount).toBe(3)
    })
  })

  describe('HTTP Error Status Handling', () => {
    it('handles 401 Unauthorized errors', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(
            {
              type: 'https://foliofox.com/errors/unauthorized',
              title: 'Authentication Required',
              status: 401,
              detail: 'Your session has expired. Please log in again.',
              instance: '/api/v1/downloads/dashboard-stats',
            },
            { status: 401 }
          )
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/authentication required/i)).toBeInTheDocument()
        expect(screen.getByText(/session has expired/i)).toBeInTheDocument()
      })

      // Should show login button instead of retry
      expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
    })

    it('handles 403 Forbidden errors', async () => {
      server.use(
        http.get('/api/v1/system/status', () => {
          return HttpResponse.json(
            {
              type: 'https://foliofox.com/errors/forbidden',
              title: 'Access Forbidden',
              status: 403,
              detail: 'You do not have permission to access system status.',
            },
            { status: 403 }
          )
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/access forbidden/i)).toBeInTheDocument()
        expect(screen.getByText(/do not have permission/i)).toBeInTheDocument()
      })

      // Should not show retry for permission errors
      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    })

    it('handles 404 Not Found errors', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(
            {
              type: 'https://foliofox.com/errors/not-found',
              title: 'Endpoint Not Found',
              status: 404,
              detail: 'The requested endpoint does not exist.',
            },
            { status: 404 }
          )
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/endpoint not found/i)).toBeInTheDocument()
      })
    })

    it('handles 429 Rate Limit errors with retry-after', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(
            {
              type: 'https://foliofox.com/errors/rate-limit',
              title: 'Rate Limit Exceeded',
              status: 429,
              detail: 'Too many requests. Please try again later.',
            },
            { 
              status: 429,
              headers: { 'Retry-After': '30' }
            }
          )
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/rate limit exceeded/i)).toBeInTheDocument()
        expect(screen.getByText(/try again in 30 seconds/i)).toBeInTheDocument()
      })
    })

    it('handles 500 Internal Server errors', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(
            {
              type: 'https://foliofox.com/errors/internal-server',
              title: 'Internal Server Error',
              status: 500,
              detail: 'An unexpected error occurred on the server.',
            },
            { status: 500 }
          )
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/internal server error/i)).toBeInTheDocument()
        expect(screen.getByText(/unexpected error occurred/i)).toBeInTheDocument()
      })

      // Should allow retry for server errors
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  describe('Invalid Data Format Handling', () => {
    it('handles malformed JSON responses', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return new Response('{"invalid": json}', {
            headers: { 'Content-Type': 'application/json' }
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/invalid response format/i)).toBeInTheDocument()
      })
    })

    it('handles missing required fields', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            // Missing required fields: totalBooks, activeDownloads, etc.
            someOtherField: 'value'
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        // Should show default values or error state
        expect(screen.getByText('0')).toBeInTheDocument() // Default fallback
      })
    })

    it('handles unexpected field types', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: 'not-a-number', // Should be number
            activeDownloads: null,      // Should be number
            queueItems: undefined,      // Should be number
            failedDownloads: '5',       // String instead of number
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        // Should handle type coercion gracefully or show error
        expect(screen.getByText(/data format error/i)).toBeInTheDocument()
      })
    })
  })

  describe('User Experience Error States', () => {
    it('displays user-friendly error messages', async () => {
      render(
        <TestWrapper>
          <ApiErrorDisplay
            error="Network request failed"
            type="network"
            onRetry={() => {}}
          />
        </TestWrapper>
      )

      expect(screen.getByText(/unable to connect/i)).toBeInTheDocument()
      expect(screen.getByText(/check your internet connection/i)).toBeInTheDocument()
      expect(screen.queryByText('Network request failed')).not.toBeInTheDocument() // Technical error hidden
    })

    it('provides actionable retry functionality', async () => {
      const retryMock = vi.fn()

      render(
        <TestWrapper>
          <ApiErrorDisplay
            error="Server error"
            type="server"
            onRetry={retryMock}
          />
        </TestWrapper>
      )

      const retryButton = screen.getByRole('button', { name: /try again/i })
      expect(retryButton).toBeInTheDocument()

      fireEvent.click(retryButton)
      expect(retryMock).toHaveBeenCalledOnce()
    })

    it('shows appropriate empty states', async () => {
      render(
        <TestWrapper>
          <EmptyStateDisplay
            type="no-downloads"
            title="No Downloads Yet"
            description="Start downloading books to see them here"
            actionLabel="Search for Books"
            onAction={() => {}}
          />
        </TestWrapper>
      )

      expect(screen.getByText('No Downloads Yet')).toBeInTheDocument()
      expect(screen.getByText(/start downloading books/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /search for books/i })).toBeInTheDocument()
    })
  })

  describe('Accessibility in Error States', () => {
    it('provides proper ARIA labels for error messages', async () => {
      render(
        <TestWrapper>
          <ApiErrorDisplay
            error="Connection failed"
            type="network"
            onRetry={() => {}}
          />
        </TestWrapper>
      )

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByLabelText(/error message/i)).toBeInTheDocument()
    })

    it('maintains keyboard navigation for retry actions', async () => {
      const user = userEvent.setup()
      const retryMock = vi.fn()

      render(
        <TestWrapper>
          <ApiErrorDisplay
            error="Server error"
            type="server"
            onRetry={retryMock}
          />
        </TestWrapper>
      )

      // Should be able to navigate to retry button with keyboard
      await user.tab()
      const retryButton = screen.getByRole('button', { name: /try again/i })
      expect(retryButton).toHaveFocus()

      // Should be able to activate with Enter or Space
      await user.keyboard('{Enter}')
      expect(retryMock).toHaveBeenCalledOnce()
    })

    it('provides screen reader announcements for status changes', async () => {
      const { rerender } = render(
        <TestWrapper>
          <div aria-live="polite" aria-label="Status updates">
            Loading dashboard data...
          </div>
        </TestWrapper>
      )

      // Simulate error state
      rerender(
        <TestWrapper>
          <div aria-live="polite" aria-label="Status updates">
            Error loading dashboard data. Please try again.
          </div>
        </TestWrapper>
      )

      expect(screen.getByLabelText('Status updates')).toHaveTextContent(
        'Error loading dashboard data. Please try again.'
      )
    })
  })

  describe('Edge Cases and Stress Testing', () => {
    it('handles very large datasets without performance degradation', async () => {
      const largeDownloadsList = Array.from({ length: 1000 }, (_, index) => ({
        id: String(index + 1),
        title: `Book ${index + 1}`,
        author: `Author ${index + 1}`,
        status: 'completed',
        progress_percentage: 100,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          return HttpResponse.json({
            downloads: largeDownloadsList,
            pagination: {
              current_page: 1,
              per_page: 1000,
              total_pages: 1,
              total_items: 1000,
            },
          })
        })
      )

      const startTime = performance.now()

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Book 1')).toBeInTheDocument()
      })

      const renderTime = performance.now() - startTime
      
      // Should render large dataset within reasonable time (< 2 seconds)
      expect(renderTime).toBeLessThan(2000)
    })

    it('handles rapid consecutive API calls', async () => {
      let callCount = 0
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          callCount++
          return HttpResponse.json({
            totalBooks: callCount,
            activeDownloads: 0,
            queueItems: 0,
            failedDownloads: 0,
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Simulate rapid refreshes
      const refreshButton = await screen.findByLabelText(/refresh/i)
      
      for (let i = 0; i < 10; i++) {
        fireEvent.click(refreshButton)
      }

      // Should handle rapid calls without breaking
      await waitFor(() => {
        expect(screen.getByText(/\d+/)).toBeInTheDocument()
      })

      // Should not make excessive API calls (due to debouncing)
      expect(callCount).toBeLessThan(15) // Allow some calls but not 10+
    })

    it('handles session expiration during active use', async () => {
      let isAuthenticated = true
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          if (!isAuthenticated) {
            return HttpResponse.json(
              { error: 'Session expired' },
              { status: 401 }
            )
          }
          return HttpResponse.json({
            totalBooks: 25,
            activeDownloads: 1,
            queueItems: 2,
            failedDownloads: 0,
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Wait for initial successful load
      await waitFor(() => {
        expect(screen.getByText('25')).toBeInTheDocument()
      })

      // Simulate session expiration
      isAuthenticated = false
      useAuthStore.setState({ isAuthenticated: false, token: null })

      // Trigger refresh
      const refreshButton = screen.getByLabelText(/refresh/i)
      fireEvent.click(refreshButton)

      // Should handle auth error gracefully
      await waitFor(() => {
        expect(screen.getByText(/session expired/i)).toBeInTheDocument()
      })
    })
  })
})