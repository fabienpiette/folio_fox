/**
 * Load Testing Suite
 * 
 * Tests concurrent user load, database query performance,
 * memory usage patterns, and WebSocket connection scaling.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils/test-utils'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchPage } from '@/components/search/SearchPage'
import { DownloadsPage } from '@/components/downloads/DownloadsPage'
import { api } from '@/services/api'
import { searchApi } from '@/services/searchApi'
import { SearchResponse, DownloadQueueResponse } from '@/types'

// Performance monitoring utilities
interface PerformanceMetrics {
  startTime: number
  endTime: number
  duration: number
  memoryUsage?: {
    start: number
    end: number
    peak: number
    increase: number
  }
  networkRequests: number
  domNodes: number
}

const collectPerformanceMetrics = (): {
  startTime: number
  startMemory: number
  networkRequests: number
} => {
  const startTime = performance.now()
  const startMemory = (performance as any).memory?.usedJSHeapSize || 0
  const networkRequests = 0 // Will be tracked separately

  return { startTime, startMemory, networkRequests }
}

const finishPerformanceMetrics = (
  start: { startTime: number; startMemory: number; networkRequests: number },
  networkRequests: number
): PerformanceMetrics => {
  const endTime = performance.now()
  const endMemory = (performance as any).memory?.usedJSHeapSize || 0
  const peakMemory = Math.max(start.startMemory, endMemory)
  
  return {
    startTime: start.startTime,
    endTime,
    duration: endTime - start.startTime,
    memoryUsage: {
      start: start.startMemory,
      end: endMemory,
      peak: peakMemory,
      increase: endMemory - start.startMemory,
    },
    networkRequests,
    domNodes: document.querySelectorAll('*').length,
  }
}

// Load test data generators
const generateLargeSearchResults = (count: number) => {
  return Array.from({ length: count }, (_, index) => ({
    indexer_id: (index % 10) + 1,
    indexer_name: `Load Test Indexer ${(index % 10) + 1}`,
    title: `Load Test Book ${index + 1} - ${Math.random().toString(36).substring(7)}`,
    author: `Load Test Author ${(index % 50) + 1}`,
    description: `This is a comprehensive description for load test book ${index + 1}. `.repeat(5),
    format: ['epub', 'pdf', 'mobi', 'azw3', 'djvu'][index % 5],
    file_size_bytes: (Math.random() * 50 + 1) * 1024 * 1024, // 1-50MB
    file_size_human: `${(Math.random() * 50 + 1).toFixed(1)} MB`,
    quality_score: Math.floor(Math.random() * 100),
    download_url: `https://loadtest.example.com/download/${index + 1}`,
    source_url: `https://loadtest.example.com/source/${index + 1}`,
    language: ['en', 'es', 'fr', 'de', 'it'][index % 5],
    publication_year: 1900 + Math.floor(Math.random() * 124),
    isbn: `978-${String(index).padStart(10, '0')}`,
    cover_url: `https://loadtest.example.com/cover/${index + 1}.jpg`,
    tags: [`tag${index % 20}`, `category${index % 10}`, `genre${index % 15}`],
    metadata: {
      loadTest: true,
      index,
      randomData: Math.random().toString(36).substring(7),
    },
    found_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
  }))
}

const generateLargeDownloadQueue = (count: number) => {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    user: { id: (index % 100) + 1, username: `user${(index % 100) + 1}` },
    book_id: Math.random() > 0.5 ? (index % 1000) + 1 : null,
    indexer: { id: (index % 10) + 1, name: `Indexer ${(index % 10) + 1}` },
    title: `Load Test Download ${index + 1}`,
    author_name: `Author ${(index % 200) + 1}`,
    download_url: `https://loadtest.example.com/download/${index + 1}`,
    file_format: ['epub', 'pdf', 'mobi', 'azw3'][index % 4],
    file_size_bytes: (Math.random() * 100 + 1) * 1024 * 1024,
    file_size_human: `${(Math.random() * 100 + 1).toFixed(1)} MB`,
    priority: Math.floor(Math.random() * 10) + 1,
    status: ['pending', 'downloading', 'completed', 'failed', 'paused'][index % 5] as any,
    progress_percentage: index % 5 === 1 ? Math.floor(Math.random() * 100) : 0,
    download_path: index % 5 === 2 ? `/downloads/book${index + 1}.epub` : null,
    quality_profile: { id: (index % 3) + 1, name: ['Standard', 'High', 'Maximum'][index % 3] },
    retry_count: Math.floor(Math.random() * 3),
    max_retries: 3,
    error_message: index % 5 === 3 ? `Error message ${index + 1}` : null,
    estimated_completion: index % 5 === 1 ? new Date(Date.now() + Math.random() * 3600000).toISOString() : null,
    started_at: index % 5 !== 0 ? new Date(Date.now() - Math.random() * 3600000).toISOString() : null,
    completed_at: index % 5 === 2 ? new Date(Date.now() - Math.random() * 86400000).toISOString() : null,
    created_at: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
    updated_at: new Date(Date.now() - Math.random() * 3600000).toISOString(),
  }))
}

describe('Load Testing Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Concurrent User Load Testing', () => {
    it('should handle 100 concurrent search requests', async () => {
      let requestCount = 0
      const requestTimes: number[] = []

      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const requestStart = performance.now()
          requestCount++
          
          // Simulate processing delay
          return new Promise(resolve => {
            setTimeout(() => {
              const requestEnd = performance.now()
              requestTimes.push(requestEnd - requestStart)
              
              const response: SearchResponse = {
                query: 'concurrent test',
                results: generateLargeSearchResults(50),
                total_results: 50,
                indexers_searched: [
                  { indexer_id: 1, indexer_name: 'Load Indexer 1', result_count: 25, response_time_ms: 200, error: null },
                  { indexer_id: 2, indexer_name: 'Load Indexer 2', result_count: 25, response_time_ms: 250, error: null },
                ],
                search_duration_ms: 250,
                cached: false,
                cache_expires_at: null,
              }
              
              resolve(HttpResponse.json(response))
            }, 100 + Math.random() * 100) // 100-200ms processing time
          })
        })
      )

      const startMetrics = collectPerformanceMetrics()

      // Execute 100 concurrent search requests
      const concurrentSearches = Array.from({ length: 100 }, (_, index) =>
        searchApi.search(`concurrent test ${index}`, {})
      )

      const results = await Promise.all(concurrentSearches)
      
      const finalMetrics = finishPerformanceMetrics(startMetrics, requestCount)

      // Verify all requests completed
      expect(results).toHaveLength(100)
      expect(requestCount).toBe(100)
      
      // Performance assertions
      expect(finalMetrics.duration).toBeLessThan(5000) // All requests within 5 seconds
      
      // Average response time should be reasonable
      const avgResponseTime = requestTimes.reduce((sum, time) => sum + time, 0) / requestTimes.length
      expect(avgResponseTime).toBeLessThan(1000) // Average less than 1 second
      
      // Memory usage should be reasonable
      if (finalMetrics.memoryUsage) {
        expect(finalMetrics.memoryUsage.increase).toBeLessThan(100 * 1024 * 1024) // Less than 100MB increase
      }
    })

    it('should maintain UI responsiveness under heavy load', async () => {
      const largeResults = generateLargeSearchResults(5000)
      
      server.use(
        http.get('/api/v1/search', () => {
          const response: SearchResponse = {
            query: 'ui responsiveness test',
            results: largeResults,
            total_results: largeResults.length,
            indexers_searched: [
              { indexer_id: 1, indexer_name: 'Heavy Load Indexer', result_count: largeResults.length, response_time_ms: 2000, error: null },
            ],
            search_duration_ms: 2000,
            cached: false,
            cache_expires_at: null,
          }
          
          return HttpResponse.json(response)
        })
      )

      const startMetrics = collectPerformanceMetrics()
      const { user } = renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      
      // Measure interaction responsiveness
      const interactionStart = performance.now()
      await user.type(searchInput, 'ui responsiveness test')
      const typingEnd = performance.now()
      
      await user.click(screen.getByRole('button', { name: /search/i }))
      const searchStart = performance.now()

      // UI should remain responsive during data loading
      await waitFor(() => {
        expect(screen.getByText(/searching/i)).toBeInTheDocument()
      }, { timeout: 1000 })

      await waitFor(() => {
        expect(screen.getByText(/5000 results/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      const searchEnd = performance.now()
      const finalMetrics = finishPerformanceMetrics(startMetrics, 1)

      // Typing should be responsive (< 100ms per character)
      const typingDuration = typingEnd - interactionStart
      expect(typingDuration).toBeLessThan(2500) // 25 characters * 100ms

      // Search should complete in reasonable time
      const searchDuration = searchEnd - searchStart
      expect(searchDuration).toBeLessThan(10000)

      // DOM should be manageable
      expect(finalMetrics.domNodes).toBeLessThan(10000) // Virtual scrolling should limit DOM nodes
    })

    it('should handle concurrent download queue operations', async () => {
      const largeQueue = generateLargeDownloadQueue(1000)
      let operationCount = 0

      server.use(
        http.get('/api/v1/downloads/queue', ({ request }) => {
          operationCount++
          const url = new URL(request.url)
          const page = parseInt(url.searchParams.get('page') || '1')
          const limit = parseInt(url.searchParams.get('limit') || '50')
          
          const startIndex = (page - 1) * limit
          const endIndex = startIndex + limit
          const paginatedData = largeQueue.slice(startIndex, endIndex)
          
          const response: DownloadQueueResponse = {
            downloads: paginatedData,
            pagination: {
              current_page: page,
              per_page: limit,
              total_pages: Math.ceil(largeQueue.length / limit),
              total_items: largeQueue.length,
              has_next: endIndex < largeQueue.length,
              has_prev: page > 1,
              next_page: endIndex < largeQueue.length ? page + 1 : null,
              prev_page: page > 1 ? page - 1 : null,
            },
            queue_stats: {
              total_items: largeQueue.length,
              pending_count: largeQueue.filter(d => d.status === 'pending').length,
              downloading_count: largeQueue.filter(d => d.status === 'downloading').length,
              completed_count: largeQueue.filter(d => d.status === 'completed').length,
              failed_count: largeQueue.filter(d => d.status === 'failed').length,
              total_size_bytes: largeQueue.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: new Date(Date.now() + 3600000).toISOString(),
            }
          }
          
          return HttpResponse.json(response)
        }),
        
        http.post('/api/v1/downloads/queue/batch', async ({ request }) => {
          operationCount++
          const body = await request.json() as any
          
          // Simulate batch processing time
          await new Promise(resolve => setTimeout(resolve, 50))
          
          return HttpResponse.json({
            message: `${body.action} applied to ${body.ids.length} downloads`,
            affected_downloads: body.ids.length,
          })
        })
      )

      const startMetrics = collectPerformanceMetrics()
      const { user } = renderWithProviders(<DownloadsPage />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText(/1000 downloads/i)).toBeInTheDocument()
      })

      // Simulate concurrent operations
      const operations = [
        // Multiple page loads
        ...Array.from({ length: 10 }, async (_, i) => {
          const pageButton = screen.getByLabelText(`Page ${i + 2}`)
          if (pageButton) {
            await user.click(pageButton)
          }
        }),
        // Batch operations
        ...Array.from({ length: 5 }, async () => {
          const selectAllCheckbox = screen.getByLabelText(/select all/i)
          await user.click(selectAllCheckbox)
          
          const pauseButton = screen.getByRole('button', { name: /pause selected/i })
          await user.click(pauseButton)
        }),
      ]

      await Promise.allSettled(operations)
      
      const finalMetrics = finishPerformanceMetrics(startMetrics, operationCount)

      // Should handle multiple concurrent operations
      expect(operationCount).toBeGreaterThan(10)
      
      // Overall operation time should be reasonable
      expect(finalMetrics.duration).toBeLessThan(10000)
      
      // Memory usage should be controlled
      if (finalMetrics.memoryUsage) {
        expect(finalMetrics.memoryUsage.increase).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
      }
    })
  })

  describe('Database Query Performance', () => {
    it('should handle complex search queries efficiently', async () => {
      const complexQueryResults = generateLargeSearchResults(2000)
      let queryComplexity = 0

      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')
          const filters = url.searchParams

          // Calculate query complexity based on filters
          queryComplexity = 1
          if (filters.get('format')) queryComplexity++
          if (filters.get('author')) queryComplexity++
          if (filters.get('yearFrom') || filters.get('yearTo')) queryComplexity++
          if (filters.get('language')) queryComplexity++
          if (filters.get('tags')) queryComplexity++

          // Simulate database query time based on complexity
          const queryTime = queryComplexity * 50 + 100 // Base 100ms + 50ms per filter
          
          return new Promise(resolve => {
            setTimeout(() => {
              const response: SearchResponse = {
                query: query || '',
                results: complexQueryResults.slice(0, 100), // Limit results for performance
                total_results: complexQueryResults.length,
                indexers_searched: [
                  { 
                    indexer_id: 1, 
                    indexer_name: 'Complex Query Indexer', 
                    result_count: 100, 
                    response_time_ms: queryTime, 
                    error: null 
                  },
                ],
                search_duration_ms: queryTime,
                cached: false,
                cache_expires_at: null,
              }
              
              resolve(HttpResponse.json(response))
            }, queryTime)
          })
        })
      )

      const startTime = performance.now()

      // Execute complex search with multiple filters
      const complexSearch = await searchApi.search('complex query test', {
        format: 'epub',
        author: 'Test Author',
        yearFrom: 2000,
        yearTo: 2023,
        language: 'en',
        tags: ['fiction', 'classic'],
      })

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(complexSearch.results).toHaveLength(100)
      expect(complexSearch.total_results).toBe(2000)
      expect(queryComplexity).toBe(6) // Base + 5 filters
      
      // Complex query should complete within reasonable time
      expect(duration).toBeLessThan(1000)
      expect(complexSearch.search_duration_ms).toBeLessThan(500)
    })

    it('should optimize pagination queries', async () => {
      const totalBooks = 10000
      const pageSize = 50
      let queryCount = 0
      const queryTimes: number[] = []

      server.use(
        http.get('/api/v1/books', ({ request }) => {
          const queryStart = performance.now()
          queryCount++
          
          const url = new URL(request.url)
          const page = parseInt(url.searchParams.get('page') || '1')
          const limit = parseInt(url.searchParams.get('limit') || '50')
          
          // Simulate database pagination optimization
          const baseQueryTime = 50 // Base query time
          const paginationOverhead = Math.min(page * 2, 100) // Overhead increases with page but caps at 100ms
          const totalQueryTime = baseQueryTime + paginationOverhead
          
          return new Promise(resolve => {
            setTimeout(() => {
              const queryEnd = performance.now()
              queryTimes.push(queryEnd - queryStart)
              
              const startIndex = (page - 1) * limit
              const endIndex = startIndex + limit
              
              const books = Array.from({ length: Math.min(limit, totalBooks - startIndex) }, (_, i) => ({
                id: startIndex + i + 1,
                title: `Book ${startIndex + i + 1}`,
                subtitle: null,
                description: `Description for book ${startIndex + i + 1}`,
                authors: [{ id: 1, name: 'Test Author', role: 'author' as const }],
                genres: [{ id: 1, name: 'Fiction' }],
                tags: ['test'],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }))
              
              const response = {
                books,
                pagination: {
                  current_page: page,
                  per_page: limit,
                  total_pages: Math.ceil(totalBooks / limit),
                  total_items: totalBooks,
                  has_next: endIndex < totalBooks,
                  has_prev: page > 1,
                  next_page: endIndex < totalBooks ? page + 1 : null,
                  prev_page: page > 1 ? page - 1 : null,
                },
                total_count: totalBooks,
              }
              
              resolve(HttpResponse.json(response))
            }, totalQueryTime)
          })
        })
      )

      const startTime = performance.now()

      // Test pagination performance across different pages
      const pageTests = [1, 10, 50, 100, 200] // Different page positions
      const paginationResults = await Promise.all(
        pageTests.map(page => api.get(`/books?page=${page}&limit=${pageSize}`))
      )

      const endTime = performance.now()
      const totalDuration = endTime - startTime

      expect(paginationResults).toHaveLength(5)
      expect(queryCount).toBe(5)

      // All pagination queries should complete efficiently
      expect(totalDuration).toBeLessThan(2000)
      
      // Individual query times should be reasonable
      const avgQueryTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length
      expect(avgQueryTime).toBeLessThan(500)
      
      // Later pages shouldn't be dramatically slower (good indexing)
      const firstPageTime = queryTimes[0]
      const lastPageTime = queryTimes[queryTimes.length - 1]
      expect(lastPageTime / firstPageTime).toBeLessThan(3) // No more than 3x slower
    })
  })

  describe('Memory Usage and Garbage Collection', () => {
    it('should manage memory efficiently with large datasets', async () => {
      if (!(performance as any).memory) {
        console.warn('Memory measurement not available in test environment')
        return
      }

      const initialMemory = (performance as any).memory.usedJSHeapSize
      const memorySnapshots: number[] = [initialMemory]

      // Generate and process multiple large datasets
      for (let iteration = 0; iteration < 5; iteration++) {
        const largeDataset = generateLargeSearchResults(5000)
        
        server.use(
          http.get('/api/v1/search', () => {
            const response: SearchResponse = {
              query: `memory test ${iteration}`,
              results: largeDataset,
              total_results: largeDataset.length,
              indexers_searched: [
                { indexer_id: 1, indexer_name: 'Memory Test Indexer', result_count: largeDataset.length, response_time_ms: 500, error: null },
              ],
              search_duration_ms: 500,
              cached: false,
              cache_expires_at: null,
            }
            
            return HttpResponse.json(response)
          })
        )

        // Process the large dataset
        const response = await searchApi.search(`memory test ${iteration}`, {})
        expect(response.results).toHaveLength(5000)

        // Take memory snapshot
        const currentMemory = (performance as any).memory.usedJSHeapSize
        memorySnapshots.push(currentMemory)

        // Clear references to allow garbage collection
        response.results.length = 0
        
        // Force garbage collection if available
        if ((global as any).gc) {
          (global as any).gc()
        }
        
        // Wait for potential cleanup
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const finalMemory = (performance as any).memory.usedJSHeapSize
      const totalMemoryIncrease = finalMemory - initialMemory

      // Memory increase should be reasonable (less than 200MB for 25k objects)
      expect(totalMemoryIncrease).toBeLessThan(200 * 1024 * 1024)

      // Memory shouldn't grow linearly with each iteration (GC should work)
      const memoryGrowthRate = (finalMemory - initialMemory) / memorySnapshots.length
      expect(memoryGrowthRate).toBeLessThan(50 * 1024 * 1024) // Less than 50MB per iteration on average
    })

    it('should handle memory pressure gracefully', async () => {
      if (!(performance as any).memory) {
        console.warn('Memory measurement not available in test environment')
        return
      }

      const initialMemory = (performance as any).memory.usedJSHeapSize
      let memoryPressureDetected = false

      // Simulate high memory usage scenario
      const veryLargeDataset = generateLargeSearchResults(50000) // 50k results
      
      server.use(
        http.get('/api/v1/search', () => {
          const response: SearchResponse = {
            query: 'memory pressure test',
            results: veryLargeDataset,
            total_results: veryLargeDataset.length,
            indexers_searched: [
              { indexer_id: 1, indexer_name: 'Memory Pressure Indexer', result_count: veryLargeDataset.length, response_time_ms: 2000, error: null },
            ],
            search_duration_ms: 2000,
            cached: false,
            cache_expires_at: null,
          }
          
          return HttpResponse.json(response)
        })
      )

      try {
        const response = await searchApi.search('memory pressure test', {})
        
        const currentMemory = (performance as any).memory.usedJSHeapSize
        const memoryIncrease = currentMemory - initialMemory
        
        // If memory increase is very high, pressure handling should activate
        if (memoryIncrease > 100 * 1024 * 1024) { // 100MB threshold
          memoryPressureDetected = true
        }

        // Should still return results (graceful degradation)
        expect(response.results.length).toBeGreaterThan(0)
        
        // Memory usage should be monitored and controlled
        if (memoryPressureDetected) {
          // In memory pressure scenarios, results might be paginated or limited
          expect(response.results.length).toBeLessThanOrEqual(1000) // Limit for memory protection
        }
        
      } catch (error) {
        // Should not crash due to memory issues
        expect(error).toBeUndefined()
      }
    })
  })

  describe('WebSocket Connection Scaling', () => {
    it('should handle multiple WebSocket connections efficiently', async () => {
      const connectionCount = 50
      const connections: any[] = []
      let totalMessagesReceived = 0

      // Mock WebSocket to track connections
      const originalWebSocket = window.WebSocket
      const mockWebSocketClass = vi.fn()
      
      mockWebSocketClass.mockImplementation(() => {
        const mockWS = {
          readyState: 1, // OPEN
          send: vi.fn(),
          close: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }
        connections.push(mockWS)
        return mockWS
      })
      
      Object.defineProperty(window, 'WebSocket', {
        value: mockWebSocketClass,
        writable: true,
      })

      try {
        // Create multiple WebSocket connections
        const wsPromises = Array.from({ length: connectionCount }, async (_, index) => {
          return new Promise<void>((resolve) => {
            const ws = new WebSocket(`ws://localhost:8080/ws/user${index}`)
            
            // Simulate message handling
            const messageHandler = (event: any) => {
              totalMessagesReceived++
            }
            
            ws.addEventListener('message', messageHandler)
            
            // Simulate connection open
            setTimeout(() => {
              if (ws.addEventListener) {
                const openHandler = ws.addEventListener.mock.calls.find(
                  call => call[0] === 'open'
                )?.[1]
                if (openHandler) openHandler()
              }
              resolve()
            }, 10)
          })
        })

        await Promise.all(wsPromises)

        expect(connections).toHaveLength(connectionCount)
        expect(mockWebSocketClass).toHaveBeenCalledTimes(connectionCount)

        // Simulate broadcasting messages to all connections
        const broadcastMessage = {
          type: 'system_announcement',
          data: { message: 'System maintenance in 10 minutes' },
          timestamp: new Date().toISOString(),
        }

        // Simulate each connection receiving the broadcast
        connections.forEach(connection => {
          const messageHandler = connection.addEventListener.mock.calls.find(
            (call: any) => call[0] === 'message'
          )?.[1]
          
          if (messageHandler) {
            messageHandler({ data: JSON.stringify(broadcastMessage) })
          }
        })

        expect(totalMessagesReceived).toBe(connectionCount)

      } finally {
        // Restore original WebSocket
        Object.defineProperty(window, 'WebSocket', {
          value: originalWebSocket,
          writable: true,
        })
      }
    })

    it('should handle WebSocket message throughput efficiently', async () => {
      const messageCount = 1000
      const messagesReceived: any[] = []
      let processingTimes: number[] = []

      // Mock high-throughput WebSocket
      const mockWebSocket = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        addEventListener: vi.fn((event, handler) => {
          if (event === 'message') {
            // Simulate rapid message sending
            for (let i = 0; i < messageCount; i++) {
              const processingStart = performance.now()
              
              const message = {
                type: 'download_progress',
                data: {
                  download_id: (i % 100) + 1,
                  progress_percentage: Math.floor(Math.random() * 100),
                  download_speed_kbps: Math.floor(Math.random() * 1000),
                },
                timestamp: new Date().toISOString(),
              }

              handler({ data: JSON.stringify(message) })
              messagesReceived.push(message)
              
              const processingEnd = performance.now()
              processingTimes.push(processingEnd - processingStart)
            }
          }
        }),
        removeEventListener: vi.fn(),
      }

      const startTime = performance.now()

      // Simulate WebSocket message processing
      const messageHandler = (event: any) => {
        try {
          const message = JSON.parse(event.data)
          // Simulate message processing
          if (message.type === 'download_progress') {
            // Update UI state
            document.getElementById('progress')?.setAttribute('value', message.data.progress_percentage)
          }
        } catch (error) {
          console.error('Message processing error:', error)
        }
      }

      mockWebSocket.addEventListener('message', messageHandler)

      const endTime = performance.now()
      const totalProcessingTime = endTime - startTime

      expect(messagesReceived).toHaveLength(messageCount)
      
      // Should process all messages efficiently
      expect(totalProcessingTime).toBeLessThan(5000) // 5 seconds for 1000 messages
      
      // Average message processing time should be minimal
      const avgProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      expect(avgProcessingTime).toBeLessThan(10) // Less than 10ms per message
      
      // No messages should take excessively long to process
      const maxProcessingTime = Math.max(...processingTimes)
      expect(maxProcessingTime).toBeLessThan(100) // No single message > 100ms
    })
  })

  afterAll(() => {
    server.resetHandlers()
  })
})