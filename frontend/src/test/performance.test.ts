import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import React from 'react'

import { useDashboard } from '@/hooks/useDashboard'
import { useOptimizedSearch } from '@/hooks/useSearchOptimized'
import { dashboardService } from '@/services/dashboard'

const server = setupServer()

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('Performance Tests', () => {
  beforeEach(() => {
    server.listen()
    vi.clearAllTimers()
    vi.useFakeTimers()
  })

  afterEach(() => {
    server.resetHandlers()
    server.close()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('API Response Time Requirements', () => {
    it('dashboard stats API responds within 500ms target', async () => {
      let responseTime = 0
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          const start = performance.now()
          // Simulate typical backend processing time
          await new Promise(resolve => setTimeout(resolve, 150))
          responseTime = performance.now() - start
          
          return HttpResponse.json({
            totalBooks: 100,
            activeDownloads: 2,
            queueItems: 5,
            failedDownloads: 1,
          })
        })
      )

      const start = performance.now()
      const result = await dashboardService.getStats()
      const totalTime = performance.now() - start

      expect(result.totalBooks).toBe(100)
      expect(totalTime).toBeLessThan(500) // 500ms target
      expect(responseTime).toBeLessThan(200) // Backend should respond quickly
    })

    it('system status API responds within 200ms target', async () => {
      server.use(
        http.get('/api/v1/system/status', async () => {
          // System status should be very fast
          await new Promise(resolve => setTimeout(resolve, 50))
          
          return HttpResponse.json({
            database: { status: 'healthy', response_ms: 15, connections: 5 },
            indexers: { total: 3, online: 3, status: 'healthy' },
            downloadService: { status: 'active', activeDownloads: 2 },
          })
        })
      )

      const start = performance.now()
      const result = await dashboardService.getSystemStatus()
      const totalTime = performance.now() - start

      expect(result.database.status).toBe('healthy')
      expect(totalTime).toBeLessThan(200) // 200ms target for health checks
    })
  })

  describe('Caching Effectiveness', () => {
    it('reduces API calls through proper caching', async () => {
      let apiCallCount = 0
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          apiCallCount++
          return HttpResponse.json({
            totalBooks: 50,
            activeDownloads: 1,
            queueItems: 2,
            failedDownloads: 0,
          })
        })
      )

      const wrapper = createWrapper()
      
      // First call
      const { result: result1 } = renderHook(() => useDashboard(), { wrapper })
      
      await waitFor(() => {
        expect(result1.current.stats.data?.totalBooks).toBe(50)
      })
      
      expect(apiCallCount).toBe(1)

      // Second call within cache time should use cache
      const { result: result2 } = renderHook(() => useDashboard(), { wrapper })
      
      await waitFor(() => {
        expect(result2.current.stats.data?.totalBooks).toBe(50)
      })
      
      // Should still be 1 due to caching
      expect(apiCallCount).toBe(1)

      // After cache expires (30 seconds), should make new call
      vi.advanceTimersByTime(31000)
      
      // Trigger refetch
      result2.current.stats.refetch()
      
      await waitFor(() => {
        expect(result2.current.stats.data?.totalBooks).toBe(50)
      })
      
      expect(apiCallCount).toBe(2)
    })

    it('implements proper cache invalidation', async () => {
      let dataVersion = 1
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: dataVersion * 10,
            activeDownloads: dataVersion,
            queueItems: dataVersion * 2,
            failedDownloads: 0,
          })
        })
      )

      const wrapper = createWrapper()
      const { result } = renderHook(() => useDashboard(), { wrapper })
      
      await waitFor(() => {
        expect(result.current.stats.data?.totalBooks).toBe(10)
      })

      // Simulate data change on backend
      dataVersion = 2
      
      // Force refetch (simulate real-time update)
      result.current.stats.refetch()
      
      await waitFor(() => {
        expect(result.current.stats.data?.totalBooks).toBe(20)
      })
    })
  })

  describe('Search Performance Optimization', () => {
    it('debounces search queries effectively', async () => {
      let searchCallCount = 0
      
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          searchCallCount++
          const url = new URL(request.url)
          const query = url.searchParams.get('query')
          
          return HttpResponse.json({
            results: [{
              title: `Result for ${query}`,
              author: 'Test Author',
            }],
            total_results: 1,
          })
        })
      )

      const wrapper = createWrapper()
      const { result } = renderHook(() => useOptimizedSearch(), { wrapper })
      
      // Simulate rapid typing
      result.current.search('f')
      vi.advanceTimersByTime(100)
      result.current.search('fo')
      vi.advanceTimersByTime(100)
      result.current.search('fou')
      vi.advanceTimersByTime(100)
      result.current.search('foun')
      vi.advanceTimersByTime(100)
      result.current.search('found')
      
      // Wait for debounce delay (300ms)
      vi.advanceTimersByTime(300)
      
      await waitFor(() => {
        expect(result.current.data?.results).toHaveLength(1)
      })
      
      // Should only make one API call due to debouncing
      expect(searchCallCount).toBe(1)
    })

    it('deduplicates concurrent identical requests', async () => {
      let requestCount = 0
      
      server.use(
        http.get('/api/v1/search', async ({ request }) => {
          requestCount++
          const url = new URL(request.url)
          const query = url.searchParams.get('query')
          
          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 100))
          
          return HttpResponse.json({
            results: [{ title: `Result for ${query}` }],
            total_results: 1,
          })
        })
      )

      const wrapper = createWrapper()
      
      // Make multiple identical requests simultaneously
      const hook1 = renderHook(() => useOptimizedSearch(), { wrapper })
      const hook2 = renderHook(() => useOptimizedSearch(), { wrapper })
      const hook3 = renderHook(() => useOptimizedSearch(), { wrapper })
      
      // All search for the same term
      hook1.result.current.search('foundation')
      hook2.result.current.search('foundation')
      hook3.result.current.search('foundation')
      
      vi.advanceTimersByTime(300) // Wait for debounce
      
      await waitFor(() => {
        expect(hook1.result.current.data?.results).toHaveLength(1)
      })
      
      // Should only make one request due to deduplication
      expect(requestCount).toBe(1)
    })
  })

  describe('Component Re-render Optimization', () => {
    it('minimizes unnecessary re-renders with memoization', async () => {
      let renderCount = 0
      
      const TestComponent = () => {
        renderCount++
        const { stats } = useDashboard()
        return <div>{stats.data?.totalBooks}</div>
      }

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: 25,
            activeDownloads: 1,
            queueItems: 2,
            failedDownloads: 0,
          })
        })
      )

      const wrapper = createWrapper()
      const { rerender } = renderHook(() => <TestComponent />, { wrapper })
      
      await waitFor(() => {
        expect(renderCount).toBeGreaterThan(0)
      })
      
      const initialRenderCount = renderCount
      
      // Rerender with same data should not cause additional renders
      rerender()
      rerender()
      rerender()
      
      // Should not significantly increase render count due to memoization
      expect(renderCount - initialRenderCount).toBeLessThan(5)
    })
  })

  describe('Memory Usage Monitoring', () => {
    it('maintains stable memory usage during extended use', async () => {
      // Mock memory API for testing
      const mockMemory = {
        usedJSHeapSize: 50000000, // 50MB
        totalJSHeapSize: 100000000,
        jsHeapSizeLimit: 2000000000,
      }
      
      // Simulate memory growth over time
      let memoryGrowth = 0
      
      Object.defineProperty(performance, 'memory', {
        get: () => ({
          ...mockMemory,
          usedJSHeapSize: mockMemory.usedJSHeapSize + memoryGrowth,
        }),
        configurable: true,
      })

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          // Simulate slight memory increase per request
          memoryGrowth += 1000000 // 1MB
          
          return HttpResponse.json({
            totalBooks: 30,
            activeDownloads: 1,
            queueItems: 1,
            failedDownloads: 0,
          })
        })
      )

      const wrapper = createWrapper()
      const { result } = renderHook(() => useDashboard(), { wrapper })
      
      // Simulate extended usage
      for (let i = 0; i < 10; i++) {
        result.current.stats.refetch()
        await waitFor(() => {
          expect(result.current.stats.isLoading).toBe(false)
        })
        vi.advanceTimersByTime(1000)
      }
      
      // Memory growth should be reasonable (less than 50MB)
      const finalMemoryUsage = (performance as any).memory.usedJSHeapSize
      expect(finalMemoryUsage - mockMemory.usedJSHeapSize).toBeLessThan(50000000)
    })

    it('cleans up resources properly on unmount', async () => {
      let activeListeners = 0
      
      // Mock addEventListener/removeEventListener to track listeners
      const originalAddEventListener = global.addEventListener
      const originalRemoveEventListener = global.removeEventListener
      
      global.addEventListener = vi.fn(() => {
        activeListeners++
      })
      
      global.removeEventListener = vi.fn(() => {
        activeListeners--
      })

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json({
            totalBooks: 40,
            activeDownloads: 0,
            queueItems: 0,
            failedDownloads: 0,
          })
        })
      )

      const wrapper = createWrapper()
      const { unmount } = renderHook(() => useDashboard(), { wrapper })
      
      await waitFor(() => {
        expect(activeListeners).toBeGreaterThan(0)
      })
      
      const listenersBeforeUnmount = activeListeners
      
      // Unmount should clean up listeners
      unmount()
      
      expect(activeListeners).toBeLessThan(listenersBeforeUnmount)
      
      // Restore original functions
      global.addEventListener = originalAddEventListener
      global.removeEventListener = originalRemoveEventListener
    })
  })

  describe('Background Refresh Performance', () => {
    it('performs background updates without blocking UI', async () => {
      let backgroundUpdateCount = 0
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          backgroundUpdateCount++
          return HttpResponse.json({
            totalBooks: backgroundUpdateCount * 5,
            activeDownloads: 1,
            queueItems: 1,
            failedDownloads: 0,
          })
        })
      )

      const wrapper = createWrapper()
      const { result } = renderHook(() => useDashboard(), { wrapper })
      
      // Wait for initial load
      await waitFor(() => {
        expect(result.current.stats.data?.totalBooks).toBe(5)
      })
      
      expect(backgroundUpdateCount).toBe(1)
      
      // Advance time to trigger background refresh (30 seconds)
      vi.advanceTimersByTime(30000)
      
      await waitFor(() => {
        expect(result.current.stats.data?.totalBooks).toBe(10)
      })
      
      expect(backgroundUpdateCount).toBe(2)
      
      // UI should not show loading state during background refresh
      expect(result.current.stats.isLoading).toBe(false)
    })
  })

  describe('Network Request Optimization', () => {
    it('handles concurrent requests efficiently', async () => {
      const requestTiming: number[] = []
      
      server.use(
        http.get('/api/v1/downloads/dashboard-stats', async () => {
          const start = performance.now()
          await new Promise(resolve => setTimeout(resolve, 100))
          requestTiming.push(performance.now() - start)
          
          return HttpResponse.json({
            totalBooks: 60,
            activeDownloads: 2,
            queueItems: 3,
            failedDownloads: 1,
          })
        }),
        
        http.get('/api/v1/system/status', async () => {
          const start = performance.now()
          await new Promise(resolve => setTimeout(resolve, 50))
          requestTiming.push(performance.now() - start)
          
          return HttpResponse.json({
            database: { status: 'healthy', response_ms: 10, connections: 3 },
            indexers: { total: 2, online: 2, status: 'healthy' },
            downloadService: { status: 'active', activeDownloads: 2 },
          })
        })
      )

      const wrapper = createWrapper()
      
      // Make concurrent requests
      const { result: dashboardResult } = renderHook(() => useDashboard(), { wrapper })
      
      await waitFor(() => {
        expect(dashboardResult.current.stats.data?.totalBooks).toBe(60)
        expect(dashboardResult.current.systemStatus.data?.database.status).toBe('healthy')
      })
      
      // Both requests should complete in reasonable time
      expect(requestTiming).toHaveLength(2)
      expect(Math.max(...requestTiming)).toBeLessThan(200)
    })
  })
})