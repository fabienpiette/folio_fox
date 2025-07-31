/**
 * Search Performance Testing Suite
 * 
 * Tests search performance, response times, memory usage,
 * concurrent search handling, and optimization validation.
 */

import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { searchApi } from '@/services/searchApi'
import { SearchResult, SearchResponse } from '@/types'

// Performance metrics collection
interface PerformanceMetrics {
  startTime: number
  endTime: number
  duration: number
  memoryUsage?: number
}

const collectPerformanceMetrics = (): PerformanceMetrics => {
  const startTime = performance.now()
  const memoryUsage = (performance as any).memory?.usedJSHeapSize

  return {
    startTime,
    endTime: 0,
    duration: 0,
    memoryUsage,
  }
}

const finishPerformanceMetrics = (metrics: PerformanceMetrics): PerformanceMetrics => {
  const endTime = performance.now()
  const finalMemoryUsage = (performance as any).memory?.usedJSHeapSize

  return {
    ...metrics,
    endTime,
    duration: endTime - metrics.startTime,
    memoryUsage: finalMemoryUsage || metrics.memoryUsage,
  }
}

// Generate test data
const generateLargeResultSet = (count: number): SearchResult[] => {
  return Array.from({ length: count }, (_, index) => ({
    indexer_id: (index % 5) + 1,
    indexer_name: `Performance Indexer ${(index % 5) + 1}`,
    title: `Performance Test Book ${index + 1} - ${Math.random().toString(36).substring(7)}`,
    author: `Performance Author ${index + 1}`,
    description: `This is a detailed description for performance test book ${index + 1}. `.repeat(10),
    format: ['epub', 'pdf', 'mobi', 'azw3'][index % 4],
    file_size_bytes: (index + 1) * 1024 * 1024 + Math.floor(Math.random() * 1024 * 1024),
    file_size_human: `${((index + 1) + Math.random()).toFixed(1)} MB`,
    quality_score: Math.floor(Math.random() * 100),
    download_url: `https://performance.example.com/download/${index + 1}`,
    source_url: `https://performance.example.com/source/${index + 1}`,
    language: ['en', 'es', 'fr', 'de'][index % 4],
    publication_year: 1950 + (index % 74),
    isbn: `978-${String(index).padStart(10, '0')}`,
    cover_url: `https://performance.example.com/cover/${index + 1}.jpg`,
    tags: [`tag${index % 10}`, `category${index % 5}`, `genre${index % 8}`],
    metadata: {
      performanceTest: true,
      index,
      randomData: Math.random().toString(36).substring(7),
    },
    found_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
  }))
}

describe('Search Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Response Time Performance', () => {
    it('should complete simple searches within 500ms', async () => {
      const metrics = collectPerformanceMetrics()

      const response = await searchApi.search('simple query', {})
      
      const finalMetrics = finishPerformanceMetrics(metrics)

      expect(finalMetrics.duration).toBeLessThan(500)
      expect(response.results).toBeDefined()
    })

    it('should handle complex queries within 1000ms', async () => {
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'complex query with filters') {
            // Simulate processing delay
            return new Promise(resolve => {
              setTimeout(() => {
                const response: SearchResponse = {
                  query: query!,
                  results: generateLargeResultSet(100),
                  total_results: 100,
                  indexers_searched: [
                    { indexer_id: 1, indexer_name: 'Complex Indexer 1', result_count: 50, response_time_ms: 400, error: null },
                    { indexer_id: 2, indexer_name: 'Complex Indexer 2', result_count: 50, response_time_ms: 450, error: null },
                  ],
                  search_duration_ms: 450,
                  cached: false,
                  cache_expires_at: null,
                }
                resolve(HttpResponse.json(response))
              }, 400) // Simulate 400ms processing time
            })
          }

          return HttpResponse.json({
            query: query || '',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      const metrics = collectPerformanceMetrics()

      const response = await searchApi.search('complex query with filters', {
        format: 'epub',
        yearFrom: 2000,
        yearTo: 2023,
      })
      
      const finalMetrics = finishPerformanceMetrics(metrics)

      expect(finalMetrics.duration).toBeLessThan(1000)
      expect(response.results).toHaveLength(100)
    })

    it('should maintain performance with large result sets (5000+ results)', async () => {
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'large result set') {
            const response: SearchResponse = {
              query: query!,
              results: generateLargeResultSet(5000),
              total_results: 5000,
              indexers_searched: [
                { indexer_id: 1, indexer_name: 'Large Indexer', result_count: 5000, response_time_ms: 800, error: null },
              ],
              search_duration_ms: 800,
              cached: false,
              cache_expires_at: null,
            }

            return HttpResponse.json(response)
          }

          return HttpResponse.json({
            query: query || '',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      const metrics = collectPerformanceMetrics()

      const response = await searchApi.search('large result set', {})
      
      const finalMetrics = finishPerformanceMetrics(metrics)

      expect(finalMetrics.duration).toBeLessThan(2000)
      expect(response.results).toHaveLength(5000)
      expect(response.total_results).toBe(5000)
    })
  })

  describe('Memory Usage Performance', () => {
    it('should maintain reasonable memory usage with large datasets', async () => {
      if (!(performance as any).memory) {
        console.warn('Memory measurement not available in this environment')
        return
      }

      const initialMemory = (performance as any).memory.usedJSHeapSize

      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'memory test') {
            const response: SearchResponse = {
              query: query!,
              results: generateLargeResultSet(10000),
              total_results: 10000,
              indexers_searched: [
                { indexer_id: 1, indexer_name: 'Memory Test Indexer', result_count: 10000, response_time_ms: 1000, error: null },
              ],
              search_duration_ms: 1000,
              cached: false,
              cache_expires_at: null,
            }

            return HttpResponse.json(response)
          }

          return HttpResponse.json({
            query: query || '',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      const response = await searchApi.search('memory test', {})
      
      const finalMemory = (performance as any).memory.usedJSHeapSize
      const memoryIncrease = finalMemory - initialMemory

      expect(response.results).toHaveLength(10000)
      // Memory increase should be reasonable (less than 50MB for 10k results)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
    })

    it('should properly clean up memory after search completion', async () => {
      if (!(performance as any).memory) {
        console.warn('Memory measurement not available in this environment')
        return
      }

      const initialMemory = (performance as any).memory.usedJSHeapSize

      // Perform multiple searches
      for (let i = 0; i < 5; i++) {
        await searchApi.search(`memory cleanup test ${i}`, {})
      }

      // Force garbage collection if available
      if ((global as any).gc) {
        (global as any).gc()
      }

      // Wait for potential cleanup
      await new Promise(resolve => setTimeout(resolve, 100))

      const finalMemory = (performance as any).memory.usedJSHeapSize
      const memoryIncrease = finalMemory - initialMemory

      // Memory should not increase significantly after cleanup
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024) // Less than 10MB
    })
  })

  describe('Concurrent Search Performance', () => {
    it('should handle multiple concurrent searches efficiently', async () => {
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query?.startsWith('concurrent')) {
            return new Promise(resolve => {
              setTimeout(() => {
                const response: SearchResponse = {
                  query: query!,
                  results: generateLargeResultSet(100),
                  total_results: 100,
                  indexers_searched: [
                    { indexer_id: 1, indexer_name: 'Concurrent Indexer', result_count: 100, response_time_ms: 200, error: null },
                  ],
                  search_duration_ms: 200,
                  cached: false,
                  cache_expires_at: null,
                }
                resolve(HttpResponse.json(response))
              }, 200)
            })
          }

          return HttpResponse.json({
            query: query || '',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      const metrics = collectPerformanceMetrics()

      // Execute 10 concurrent searches
      const searchPromises = Array.from({ length: 10 }, (_, index) =>
        searchApi.search(`concurrent search ${index}`, {})
      )

      const results = await Promise.all(searchPromises)
      
      const finalMetrics = finishPerformanceMetrics(metrics)

      expect(results).toHaveLength(10)
      results.forEach(result => {
        expect(result.results).toHaveLength(100)
      })

      // Should complete all 10 searches in reasonable time (less than 1 second)
      expect(finalMetrics.duration).toBeLessThan(1000)
    })

    it('should prevent search request flooding', async () => {
      const searchRequests: string[] = []

      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')
          searchRequests.push(query || '')

          return HttpResponse.json({
            query: query || '',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      // Attempt to flood with rapid searches
      const rapidSearches = Array.from({ length: 100 }, (_, index) =>
        searchApi.search(`flood test ${index}`, {}).catch(() => null)
      )

      await Promise.allSettled(rapidSearches)

      // Should have throttling/debouncing in place
      expect(searchRequests.length).toBeLessThan(100)
    })
  })

  describe('Cache Performance', () => {
    it('should serve cached results significantly faster', async () => {
      let requestCount = 0

      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')
          requestCount++

          if (query === 'cache performance test') {
            // First request - simulate slow response
            if (requestCount === 1) {
              return new Promise(resolve => {
                setTimeout(() => {
                  const response: SearchResponse = {
                    query: query!,
                    results: generateLargeResultSet(100),
                    total_results: 100,
                    indexers_searched: [
                      { indexer_id: 1, indexer_name: 'Cache Test Indexer', result_count: 100, response_time_ms: 800, error: null },
                    ],
                    search_duration_ms: 800,
                    cached: false,
                    cache_expires_at: new Date(Date.now() + 300000).toISOString(),
                  }
                  resolve(HttpResponse.json(response))
                }, 800)
              })
            } else {
              // Subsequent requests - serve from cache (fast)
              const response: SearchResponse = {
                query: query!,
                results: generateLargeResultSet(100),
                total_results: 100,
                indexers_searched: [],
                search_duration_ms: 5,
                cached: true,
                cache_expires_at: new Date(Date.now() + 300000).toISOString(),
              }
              return HttpResponse.json(response)
            }
          }

          return HttpResponse.json({
            query: query || '',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      // First request (should be slow)
      const firstMetrics = collectPerformanceMetrics()
      const firstResponse = await searchApi.search('cache performance test', {})
      const firstFinalMetrics = finishPerformanceMetrics(firstMetrics)

      expect(firstResponse.cached).toBe(false)
      expect(firstFinalMetrics.duration).toBeGreaterThan(800)

      // Second request (should be fast from cache)
      const secondMetrics = collectPerformanceMetrics()
      const secondResponse = await searchApi.search('cache performance test', {})
      const secondFinalMetrics = finishPerformanceMetrics(secondMetrics)

      expect(secondResponse.cached).toBe(true)
      expect(secondFinalMetrics.duration).toBeLessThan(100)
      expect(secondFinalMetrics.duration).toBeLessThan(firstFinalMetrics.duration / 5)
    })
  })

  describe('Search Optimization Validation', () => {
    it('should optimize queries before sending to indexers', async () => {
      const capturedQueries: string[] = []

      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')
          capturedQueries.push(query || '')

          return HttpResponse.json({
            query: query || '',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      // Test various optimization scenarios
      await searchApi.search('  multiple   spaces   ', {})
      await searchApi.search('UPPERCASE QUERY', {})
      await searchApi.search('query with "quotes" and symbols!@#', {})

      expect(capturedQueries).toContain('multiple spaces') // Trimmed spaces
      expect(capturedQueries).toContain('uppercase query') // Lowercased
      expect(capturedQueries).toContain('query with quotes and symbols') // Cleaned symbols
    })

    it('should implement search result deduplication efficiently', async () => {
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'deduplication test') {
            // Return results with duplicates
            const baseResults = generateLargeResultSet(1000)
            const duplicateResults = [
              ...baseResults,
              ...baseResults.slice(0, 100), // Add 100 duplicates
            ]

            const response: SearchResponse = {
              query: query!,
              results: duplicateResults,
              total_results: duplicateResults.length,
              indexers_searched: [
                { indexer_id: 1, indexer_name: 'Dedup Test Indexer', result_count: duplicateResults.length, response_time_ms: 500, error: null },
              ],
              search_duration_ms: 500,
              cached: false,
              cache_expires_at: null,
            }

            return HttpResponse.json(response)
          }

          return HttpResponse.json({
            query: query || '',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      const metrics = collectPerformanceMetrics()
      const response = await searchApi.search('deduplication test', {})
      const finalMetrics = finishPerformanceMetrics(metrics)

      // Should deduplicate efficiently
      expect(response.results.length).toBeLessThan(1100) // Less than original with duplicates
      expect(finalMetrics.duration).toBeLessThan(2000) // Should be reasonably fast
    })
  })

  describe('Error Handling Performance', () => {
    it('should handle indexer timeouts without blocking other indexers', async () => {
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'timeout performance test') {
            const response: SearchResponse = {
              query: query!,
              results: generateLargeResultSet(50),
              total_results: 50,
              indexers_searched: [
                { indexer_id: 1, indexer_name: 'Fast Indexer', result_count: 50, response_time_ms: 200, error: null },
                { indexer_id: 2, indexer_name: 'Slow Indexer', result_count: 0, response_time_ms: 0, error: 'Timeout after 5000ms' },
                { indexer_id: 3, indexer_name: 'Another Fast Indexer', result_count: 25, response_time_ms: 300, error: null },
              ],
              search_duration_ms: 5000, // Limited by timeout
              cached: false,
              cache_expires_at: null,
            }

            return HttpResponse.json(response)
          }

          return HttpResponse.json({
            query: query || '',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      const metrics = collectPerformanceMetrics()
      const response = await searchApi.search('timeout performance test', {})
      const finalMetrics = finishPerformanceMetrics(metrics)

      // Should get results from working indexers
      expect(response.results.length).toBeGreaterThan(0)
      expect(response.indexers_searched).toHaveLength(3)
      
      // Should complete within timeout + buffer time
      expect(finalMetrics.duration).toBeLessThan(6000)
    })
  })

  afterAll(() => {
    server.resetHandlers()
  })
})