import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { BrowserRouter } from 'react-router-dom'

import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { SearchPage } from '@/components/search/SearchPage'
import { useAuthStore } from '@/stores/auth'

// Mock server for API testing
const server = setupServer()

// Test wrapper component
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

describe('Real Data Flows Integration Tests', () => {
  beforeEach(() => {
    server.listen()
    // Mock authenticated user
    useAuthStore.setState({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      token: 'mock-token',
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

  describe('Dashboard Data Loading', () => {
    it('loads real dashboard statistics successfully', async () => {
      // Mock API response with real data structure
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: 156,
            activeDownloads: 2,
            queueItems: 5,
            failedDownloads: 1,
          })
        }),
        http.get('/api/v1/downloads/queue', () => {
          return HttpResponse.json({
            downloads: [
              {
                id: '1',
                title: 'The Foundation',
                author: 'Isaac Asimov',
                status: 'downloading',
                progress_percentage: 75,
                created_at: '2024-01-15T10:30:00Z',
                updated_at: '2024-01-15T10:35:00Z',
              },
              {
                id: '2', 
                title: 'Dune',
                author: 'Frank Herbert',
                status: 'completed',
                progress_percentage: 100,
                created_at: '2024-01-15T09:15:00Z',
                updated_at: '2024-01-15T09:45:00Z',
              },
            ],
          })
        }),
        http.get('/api/v1/system/status', () => {
          return HttpResponse.json({
            database: {
              status: 'healthy',
              response_ms: 15,
              connections: 5,
            },
            indexers: {
              total: 3,
              online: 3,
              status: 'healthy',
            },
            downloadService: {
              status: 'active',
              activeDownloads: 2,
            },
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
      })

      // Verify real data is displayed
      expect(screen.getByText('156')).toBeInTheDocument() // totalBooks
      expect(screen.getByText('2')).toBeInTheDocument() // activeDownloads
      expect(screen.getByText('5')).toBeInTheDocument() // queueItems
      expect(screen.getByText('1')).toBeInTheDocument() // failedDownloads

      // Verify recent downloads show real data
      expect(screen.getByText('The Foundation')).toBeInTheDocument()
      expect(screen.getByText('Isaac Asimov')).toBeInTheDocument()
      expect(screen.getByText('Dune')).toBeInTheDocument()
      expect(screen.getByText('Frank Herbert')).toBeInTheDocument()

      // Verify system status shows real health data
      expect(screen.getByText('healthy')).toBeInTheDocument()
      expect(screen.getByText('3/3 online')).toBeInTheDocument()
    })

    it('handles empty dashboard data gracefully', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: 0,
            activeDownloads: 0,
            queueItems: 0,
            failedDownloads: 0,
          })
        }),
        http.get('/api/v1/downloads/queue', () => {
          return HttpResponse.json({ downloads: [] })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
      })

      // Verify empty state displays
      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByText(/no recent downloads/i)).toBeInTheDocument()
      expect(screen.getByText(/get started/i)).toBeInTheDocument()
    })
  })

  describe('Error Scenario Tests', () => {
    it('handles network failure gracefully', async () => {
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
        expect(screen.getByText(/unable to connect/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/try again/i)).toBeInTheDocument()
    })

    it('handles 401 authentication errors', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(
            { error: 'Authentication required' },
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
      })
    })

    it('handles 500 server errors with retry functionality', async () => {
      let callCount = 0
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          callCount++
          if (callCount === 1) {
            return HttpResponse.json(
              { error: 'Internal server error' },
              { status: 500 }
            )
          }
          return HttpResponse.json({
            totalBooks: 25,
            activeDownloads: 1,
            queueItems: 3,
            failedDownloads: 0,
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument()
      })

      // Click retry button
      const retryButton = screen.getByText(/try again/i)
      fireEvent.click(retryButton)

      // Wait for successful retry
      await waitFor(() => {
        expect(screen.getByText('25')).toBeInTheDocument()
      })

      expect(callCount).toBe(2)
    })

    it('handles rate limiting responses', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(
            { error: 'Rate limit exceeded' },
            { 
              status: 429,
              headers: {
                'Retry-After': '60'
              }
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
        expect(screen.getByText(/try again in 60 seconds/i)).toBeInTheDocument()
      })
    })
  })

  describe('Search Functionality', () => {
    it('performs real search with backend integration', async () => {
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')
          
          if (query === 'foundation') {
            return HttpResponse.json({
              results: [
                {
                  indexer_id: 1,
                  indexer_name: 'Test Indexer',
                  title: 'Foundation',
                  author: 'Isaac Asimov',
                  format: 'epub',
                  file_size_bytes: 1048576,
                  file_size_human: '1.0 MB',
                  quality_score: 95,
                  download_url: 'https://example.com/download/1',
                  source_url: 'https://example.com/source/1',
                  language: 'en',
                  found_at: '2024-01-15T10:30:00Z',
                },
              ],
              total_results: 1,
              search_duration_ms: 150,
              indexers_searched: ['Test Indexer'],
              cached: false,
            })
          }
          
          return HttpResponse.json({
            results: [],
            total_results: 0,
            search_duration_ms: 50,
            indexers_searched: [],
            cached: false,
          })
        })
      )

      render(
        <TestWrapper>
          <SearchPage />
        </TestWrapper>
      )

      // Enter search query
      const searchInput = screen.getByPlaceholderText(/search for books/i)
      fireEvent.change(searchInput, { target: { value: 'foundation' } })
      
      const searchButton = screen.getByText(/search/i)
      fireEvent.click(searchButton)

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText('Foundation')).toBeInTheDocument()
        expect(screen.getByText('Isaac Asimov')).toBeInTheDocument()
        expect(screen.getByText('1.0 MB')).toBeInTheDocument()
      })

      // Verify search metadata
      expect(screen.getByText(/1 results/i)).toBeInTheDocument()
      expect(screen.getByText(/150ms/i)).toBeInTheDocument()
    })
  })

  describe('Performance Tests', () => {
    it('meets response time targets for dashboard load', async () => {
      const startTime = performance.now()
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          // Simulate 200ms API response time
          await new Promise(resolve => setTimeout(resolve, 200))
          return HttpResponse.json({
            totalBooks: 100,
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

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
      })

      const endTime = performance.now()
      const totalTime = endTime - startTime
      
      // Should complete within 1 second including React rendering
      expect(totalTime).toBeLessThan(1000)
    })

    it('handles rapid user interactions without UI flicker', async () => {
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: 50,
            activeDownloads: 0,
            queueItems: 1,
            failedDownloads: 0,
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Simulate rapid refresh clicks
      const refreshButton = await screen.findByLabelText(/refresh/i)
      
      for (let i = 0; i < 5; i++) {
        fireEvent.click(refreshButton)
      }

      // Should not cause UI errors or flicker
      await waitFor(() => {
        expect(screen.getByText('50')).toBeInTheDocument()
      })
    })
  })

  describe('Real-time Updates', () => {
    it('updates download progress in real-time', async () => {
      let progressValue = 25
      
      server.use(
        http.get('/api/v1/downloads/queue', () => {
          return HttpResponse.json({
            downloads: [
              {
                id: '1',
                title: 'Test Book',
                author: 'Test Author',
                status: 'downloading',
                progress_percentage: progressValue,
                created_at: '2024-01-15T10:30:00Z',
                updated_at: new Date().toISOString(),
              },
            ],
          })
        })
      )

      render(
        <TestWrapper>
          <DashboardPage />
        </TestWrapper>
      )

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('25%')).toBeInTheDocument()
      })

      // Simulate progress update
      progressValue = 50
      
      // Trigger refresh (simulating WebSocket update)
      const refreshButton = screen.getByLabelText(/refresh/i)
      fireEvent.click(refreshButton)

      await waitFor(() => {
        expect(screen.getByText('50%')).toBeInTheDocument()
      })
    })
  })
})