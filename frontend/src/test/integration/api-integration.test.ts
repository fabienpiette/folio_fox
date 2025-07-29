/**
 * API Integration Testing Suite
 * 
 * Tests Prowlarr/Jackett API integration, database operations,
 * authentication flows, and frontend-backend communication.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { api } from '@/services/api'
import { searchApi } from '@/services/searchApi'
import { AuthResponse, ErrorResponse, SearchResponse, DownloadQueueResponse, SystemHealth } from '@/types'

// Mock environment variables
vi.mock('@/config/env', () => ({
  API_BASE_URL: 'http://localhost:8080/api/v1',
  WS_BASE_URL: 'ws://localhost:8080/ws',
}))

describe('API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear any stored auth tokens
    localStorage.clear()
  })

  describe('Authentication Integration', () => {
    it('should authenticate with valid credentials', async () => {
      const mockAuthResponse: AuthResponse = {
        access_token: 'test-jwt-token',
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          is_active: true,
          is_admin: false,
          last_login: null,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
        }
      }

      server.use(
        http.post('/api/v1/auth/login', async ({ request }) => {
          const body = await request.json() as any
          
          if (body.username === 'testuser' && body.password === 'testpass') {
            return HttpResponse.json(mockAuthResponse)
          }
          
          const errorResponse: ErrorResponse = {
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            detail: 'Invalid username or password',
            timestamp: new Date().toISOString(),
            request_id: 'test-' + Math.random().toString(36).substr(2, 9),
          }
          
          return HttpResponse.json(errorResponse, { status: 401 })
        })
      )

      const response = await api.post('/auth/login', {
        username: 'testuser',
        password: 'testpass',
      })

      expect(response.data).toEqual(mockAuthResponse)
      expect(response.data.access_token).toBe('test-jwt-token')
      expect(response.data.user.username).toBe('testuser')
    })

    it('should handle authentication errors', async () => {
      server.use(
        http.post('/api/v1/auth/login', () => {
          const errorResponse: ErrorResponse = {
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            detail: 'Invalid username or password',
            timestamp: new Date().toISOString(),
            request_id: 'test-' + Math.random().toString(36).substr(2, 9),
          }
          
          return HttpResponse.json(errorResponse, { status: 401 })
        })
      )

      await expect(
        api.post('/auth/login', {
          username: 'wronguser',
          password: 'wrongpass',
        })
      ).rejects.toThrow()
    })

    it('should include authentication headers in subsequent requests', async () => {
      const token = 'test-auth-token'
      localStorage.setItem('foliofox_token', token)

      let capturedHeaders: Record<string, string> = {}

      server.use(
        http.get('/api/v1/downloads/queue', ({ request }) => {
          request.headers.forEach((value, key) => {
            capturedHeaders[key.toLowerCase()] = value
          })
          
          const response: DownloadQueueResponse = {
            downloads: [],
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 0,
              total_items: 0,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: 0,
              pending_count: 0,
              downloading_count: 0,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: 0,
              estimated_completion: null,
            }
          }
          
          return HttpResponse.json(response)
        })
      )

      await api.get('/downloads/queue')

      expect(capturedHeaders['authorization']).toBe(`Bearer ${token}`)
    })

    it('should refresh token when expired', async () => {
      const expiredToken = 'expired-token'
      const newToken = 'new-fresh-token'
      
      localStorage.setItem('foliofox_token', expiredToken)

      let requestCount = 0

      server.use(
        http.get('/api/v1/downloads/queue', ({ request }) => {
          requestCount++
          const authHeader = request.headers.get('authorization')
          
          // First request with expired token
          if (requestCount === 1 && authHeader === `Bearer ${expiredToken}`) {
            const errorResponse: ErrorResponse = {
              type: 'about:blank',
              title: 'Unauthorized',
              status: 401,
              detail: 'Token has expired',
              timestamp: new Date().toISOString(),
              request_id: 'test-' + Math.random().toString(36).substr(2, 9),
            }
            
            return HttpResponse.json(errorResponse, { status: 401 })
          }
          
          // Second request with new token after refresh
          if (requestCount === 2 && authHeader === `Bearer ${newToken}`) {
            const response: DownloadQueueResponse = {
              downloads: [],
              pagination: {
                current_page: 1,
                per_page: 20,
                total_pages: 0,
                total_items: 0,
                has_next: false,
                has_prev: false,
                next_page: null,
                prev_page: null,
              },
              queue_stats: {
                total_items: 0,
                pending_count: 0,
                downloading_count: 0,
                completed_count: 0,
                failed_count: 0,
                total_size_bytes: 0,
                estimated_completion: null,
              }
            }
            
            return HttpResponse.json(response)
          }
          
          return HttpResponse.json({ error: 'Unexpected request' }, { status: 500 })
        }),
        http.post('/api/v1/auth/refresh', () => {
          const refreshResponse: AuthResponse = {
            access_token: newToken,
            token_type: 'Bearer',
            expires_in: 3600,
            user: {
              id: 1,
              username: 'testuser',
              email: 'test@example.com',
              is_active: true,
              is_admin: false,
              last_login: new Date().toISOString(),
              created_at: '2023-01-01T00:00:00Z',
              updated_at: new Date().toISOString(),
            }
          }
          
          return HttpResponse.json(refreshResponse)
        })
      )

      const response = await api.get('/downloads/queue')

      expect(requestCount).toBe(2) // Initial request + retry after refresh
      expect(localStorage.getItem('foliofox_token')).toBe(newToken)
      expect(response.data).toBeDefined()
    })
  })

  describe('Prowlarr/Jackett Integration', () => {
    it('should search across multiple indexers', async () => {
      const mockSearchResponse: SearchResponse = {
        query: 'test query',
        results: [
          {
            indexer_id: 1,
            indexer_name: 'Prowlarr Indexer',
            title: 'Test Book from Prowlarr',
            author: 'Test Author',
            description: 'Book from Prowlarr indexer',
            format: 'epub',
            file_size_bytes: 1048576,
            file_size_human: '1.0 MB',
            quality_score: 95,
            download_url: 'https://prowlarr.example.com/download/1',
            source_url: 'https://prowlarr.example.com/source/1',
            language: 'en',
            publication_year: 2023,
            isbn: '978-0123456789',
            cover_url: 'https://prowlarr.example.com/cover/1.jpg',
            tags: ['fiction'],
            metadata: { indexer_type: 'prowlarr' },
            found_at: new Date().toISOString(),
          },
          {
            indexer_id: 2,
            indexer_name: 'Jackett Indexer',
            title: 'Test Book from Jackett',
            author: 'Test Author',
            description: 'Book from Jackett indexer',
            format: 'pdf',
            file_size_bytes: 2097152,
            file_size_human: '2.0 MB',
            quality_score: 88,
            download_url: 'https://jackett.example.com/download/1',
            source_url: 'https://jackett.example.com/source/1',
            language: 'en',
            publication_year: 2023,
            isbn: '978-0987654321',
            cover_url: 'https://jackett.example.com/cover/1.jpg',
            tags: ['fiction'],
            metadata: { indexer_type: 'jackett' },
            found_at: new Date().toISOString(),
          }
        ],
        total_results: 2,
        indexers_searched: [
          {
            indexer_id: 1,
            indexer_name: 'Prowlarr Indexer',
            result_count: 1,
            response_time_ms: 250,
            error: null,
          },
          {
            indexer_id: 2,
            indexer_name: 'Jackett Indexer',
            result_count: 1,
            response_time_ms: 300,
            error: null,
          }
        ],
        search_duration_ms: 350,
        cached: false,
        cache_expires_at: null,
      }

      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')
          
          if (query === 'test query') {
            return HttpResponse.json(mockSearchResponse)
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

      const response = await searchApi.search('test query', {})

      expect(response.results).toHaveLength(2)
      expect(response.results[0].indexer_name).toBe('Prowlarr Indexer')
      expect(response.results[1].indexer_name).toBe('Jackett Indexer')
      expect(response.indexers_searched).toHaveLength(2)
      expect(response.search_duration_ms).toBe(350)
    })

    it('should handle indexer failures gracefully', async () => {
      const mockSearchResponse: SearchResponse = {
        query: 'test query',
        results: [
          {
            indexer_id: 1,
            indexer_name: 'Working Indexer',
            title: 'Test Book',
            author: 'Test Author',
            description: 'Book from working indexer',
            format: 'epub',
            file_size_bytes: 1048576,
            file_size_human: '1.0 MB',
            quality_score: 95,
            download_url: 'https://working.example.com/download/1',
            source_url: 'https://working.example.com/source/1',
            language: 'en',
            publication_year: 2023,
            isbn: '978-0123456789',
            cover_url: 'https://working.example.com/cover/1.jpg',
            tags: ['fiction'],
            metadata: {},
            found_at: new Date().toISOString(),
          }
        ],
        total_results: 1,
        indexers_searched: [
          {
            indexer_id: 1,
            indexer_name: 'Working Indexer',
            result_count: 1,
            response_time_ms: 250,
            error: null,
          },
          {
            indexer_id: 2,
            indexer_name: 'Failed Indexer',
            result_count: 0,
            response_time_ms: 0,
            error: 'Connection timeout: indexer unreachable',
          },
          {
            indexer_id: 3,
            indexer_name: 'Auth Failed Indexer',
            result_count: 0,
            response_time_ms: 150,
            error: 'Authentication failed: invalid API key',
          }
        ],
        search_duration_ms: 5000, // Limited by timeout
        cached: false,
        cache_expires_at: null,
      }

      server.use(
        http.get('/api/v1/search', () => {
          return HttpResponse.json(mockSearchResponse)
        })
      )

      const response = await searchApi.search('test query', {})

      expect(response.results).toHaveLength(1)
      expect(response.results[0].indexer_name).toBe('Working Indexer')
      
      // Verify error handling
      const failedIndexers = response.indexers_searched.filter(indexer => indexer.error !== null)
      expect(failedIndexers).toHaveLength(2)
      expect(failedIndexers[0].error).toContain('Connection timeout')
      expect(failedIndexers[1].error).toContain('Authentication failed')
    })

    it('should validate indexer configuration', async () => {
      server.use(
        http.get('/api/v1/indexers', () => {
          return HttpResponse.json([
            {
              id: 1,
              name: 'Prowlarr Main',
              type: 'prowlarr',
              base_url: 'http://prowlarr:9696',
              api_key: 'prowlarr-api-key',
              is_enabled: true,
              priority: 1,
              categories: ['ebooks'],
              supported_formats: ['epub', 'pdf', 'mobi'],
              rate_limit_per_hour: 100,
              timeout_seconds: 30,
              health_status: 'healthy',
              last_health_check: new Date().toISOString(),
              created_at: '2023-01-01T00:00:00Z',
              updated_at: new Date().toISOString(),
            },
            {
              id: 2,
              name: 'Jackett Local',
              type: 'jackett',
              base_url: 'http://jackett:9117',
              api_key: 'jackett-api-key',
              is_enabled: true,
              priority: 2,
              categories: ['ebooks'],
              supported_formats: ['epub', 'pdf'],
              rate_limit_per_hour: 50,
              timeout_seconds: 60,
              health_status: 'degraded',
              last_health_check: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
              created_at: '2023-01-01T00:00:00Z',
              updated_at: new Date().toISOString(),
            }
          ])
        }),
        http.post('/api/v1/indexers/:id/test', ({ params }) => {
          const id = parseInt(params.id as string)
          
          if (id === 1) {
            return HttpResponse.json({
              success: true,
              response_time_ms: 150,
              test_search_results: 25,
              message: 'Indexer is working correctly',
            })
          } else if (id === 2) {
            return HttpResponse.json({
              success: false,
              response_time_ms: 0,
              test_search_results: 0,
              message: 'Connection failed: unable to reach indexer',
              error: 'ECONNREFUSED: Connection refused',
            })
          }
          
          return HttpResponse.json({ error: 'Indexer not found' }, { status: 404 })
        })
      )

      // Get indexer list
      const indexersResponse = await api.get('/indexers')
      expect(indexersResponse.data).toHaveLength(2)
      
      const prowlarrIndexer = indexersResponse.data[0]
      const jackettIndexer = indexersResponse.data[1]
      
      expect(prowlarrIndexer.type).toBe('prowlarr')
      expect(prowlarrIndexer.health_status).toBe('healthy')
      expect(jackettIndexer.type).toBe('jackett')
      expect(jackettIndexer.health_status).toBe('degraded')

      // Test indexer connections
      const prowlarrTest = await api.post(`/indexers/${prowlarrIndexer.id}/test`)
      expect(prowlarrTest.data.success).toBe(true)
      expect(prowlarrTest.data.test_search_results).toBe(25)

      const jackettTest = await api.post(`/indexers/${jackettIndexer.id}/test`)
      expect(jackettTest.data.success).toBe(false)
      expect(jackettTest.data.error).toContain('ECONNREFUSED')
    })
  })

  describe('Database Operations', () => {
    it('should handle CRUD operations for books', async () => {
      const newBook = {
        title: 'Test Book',
        subtitle: 'A Test Subtitle',
        description: 'This is a test book description',
        isbn_13: '978-0123456789',
        publication_date: '2023-01-01',
        page_count: 300,
        language_id: 1,
        publisher_id: 1,
        authors: [{ id: 1, role: 'author' }],
        genres: [{ id: 1 }],
        tags: ['fiction', 'test'],
      }

      const createdBook = {
        id: 1,
        ...newBook,
        authors: [{ id: 1, name: 'Test Author', role: 'author' }],
        genres: [{ id: 1, name: 'Fiction' }],
        language: { id: 1, code: 'en', name: 'English' },
        publisher: { id: 1, name: 'Test Publisher' },
        series: null,
        series_position: null,
        rating_average: null,
        rating_count: 0,
        cover_url: null,
        cover_local_path: null,
        available_formats: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      server.use(
        // Create book
        http.post('/api/v1/books', async ({ request }) => {
          const body = await request.json() as any
          expect(body.title).toBe('Test Book')
          return HttpResponse.json(createdBook, { status: 201 })
        }),
        
        // Get book
        http.get('/api/v1/books/:id', ({ params }) => {
          const id = parseInt(params.id as string)
          if (id === 1) {
            return HttpResponse.json(createdBook)
          }
          return HttpResponse.json({ error: 'Book not found' }, { status: 404 })
        }),
        
        // Update book
        http.patch('/api/v1/books/:id', async ({ params, request }) => {
          const id = parseInt(params.id as string)
          const body = await request.json() as any
          
          if (id === 1) {
            const updatedBook = {
              ...createdBook,
              ...body,
              updated_at: new Date().toISOString(),
            }
            return HttpResponse.json(updatedBook)
          }
          return HttpResponse.json({ error: 'Book not found' }, { status: 404 })
        }),
        
        // Delete book
        http.delete('/api/v1/books/:id', ({ params }) => {
          const id = parseInt(params.id as string)
          if (id === 1) {
            return HttpResponse.json({ message: 'Book deleted successfully' })
          }
          return HttpResponse.json({ error: 'Book not found' }, { status: 404 })
        })
      )

      // Test Create
      const createResponse = await api.post('/books', newBook)
      expect(createResponse.data.id).toBe(1)
      expect(createResponse.data.title).toBe('Test Book')

      // Test Read
      const readResponse = await api.get('/books/1')
      expect(readResponse.data.id).toBe(1)
      expect(readResponse.data.title).toBe('Test Book')

      // Test Update
      const updateData = { description: 'Updated description' }
      const updateResponse = await api.patch('/books/1', updateData)
      expect(updateResponse.data.description).toBe('Updated description')

      // Test Delete
      const deleteResponse = await api.delete('/books/1')
      expect(deleteResponse.data.message).toBe('Book deleted successfully')
    })

    it('should handle database transactions correctly', async () => {
      let transactionId = ''
      let operationCount = 0

      server.use(
        http.post('/api/v1/transactions/begin', () => {
          transactionId = 'tx_' + Math.random().toString(36).substr(2, 9)
          return HttpResponse.json({ transaction_id: transactionId })
        }),
        
        http.post('/api/v1/books', async ({ request }) => {
          const headers = Object.fromEntries(request.headers.entries())
          expect(headers['x-transaction-id']).toBe(transactionId)
          
          operationCount++
          
          // Simulate database operation
          const body = await request.json() as any
          return HttpResponse.json({
            id: operationCount,
            ...body,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { status: 201 })
        }),
        
        http.post('/api/v1/transactions/:id/commit', ({ params }) => {
          const id = params.id as string
          expect(id).toBe(transactionId)
          return HttpResponse.json({ 
            message: 'Transaction committed successfully',
            operations_count: operationCount 
          })
        }),
        
        http.post('/api/v1/transactions/:id/rollback', ({ params }) => {
          const id = params.id as string
          expect(id).toBe(transactionId)
          return HttpResponse.json({ 
            message: 'Transaction rolled back successfully',
            operations_count: operationCount 
          })
        })
      )

      // Begin transaction
      const beginResponse = await api.post('/transactions/begin')
      const txId = beginResponse.data.transaction_id

      // Perform operations within transaction
      const book1Response = await api.post('/books', 
        { 
          title: 'Book 1',
          authors: [{ id: 1, role: 'author' }],
          genres: [{ id: 1 }],
        },
        { 
          headers: { 'X-Transaction-ID': txId } 
        }
      )
      
      const book2Response = await api.post('/books', 
        { 
          title: 'Book 2',
          authors: [{ id: 2, role: 'author' }],
          genres: [{ id: 2 }],
        },
        { 
          headers: { 'X-Transaction-ID': txId } 
        }
      )

      expect(book1Response.data.id).toBe(1)
      expect(book2Response.data.id).toBe(2)

      // Commit transaction
      const commitResponse = await api.post(`/transactions/${txId}/commit`)
      expect(commitResponse.data.operations_count).toBe(2)
    })

    it('should handle database connection failures', async () => {
      server.use(
        http.get('/api/v1/books', () => {
          const errorResponse: ErrorResponse = {
            type: 'about:blank',
            title: 'Internal Server Error',
            status: 500,
            detail: 'Database connection failed',
            timestamp: new Date().toISOString(),
            request_id: 'test-' + Math.random().toString(36).substr(2, 9),
          }
          
          return HttpResponse.json(errorResponse, { status: 500 })
        })
      )

      await expect(api.get('/books')).rejects.toThrow()
    })
  })

  describe('System Health Integration', () => {
    it('should report comprehensive system health', async () => {
      const mockSystemHealth: SystemHealth = {
        status: 'healthy',
        version: '1.0.0',
        uptime_seconds: 86400,
        timestamp: new Date().toISOString(),
        components: {
          database: {
            status: 'healthy',
            message: 'Connected to PostgreSQL',
            response_time_ms: 5,
            last_check: new Date().toISOString(),
          },
          redis: {
            status: 'healthy',
            message: 'Connected to Redis cache',
            response_time_ms: 2,
            last_check: new Date().toISOString(),
          },
          indexers: {
            status: 'degraded',
            message: '2 of 3 indexers healthy',
            response_time_ms: 150,
            last_check: new Date().toISOString(),
          },
          filesystem: {
            status: 'healthy',
            message: 'Download directory accessible, 500GB free',
            last_check: new Date().toISOString(),
          },
          downloads: {
            status: 'healthy',
            message: '3 active downloads, queue processing normally',
            last_check: new Date().toISOString(),
          },
          scheduler: {
            status: 'healthy',
            message: 'Background tasks running',
            last_check: new Date().toISOString(),
          },
        }
      }

      server.use(
        http.get('/api/v1/system/health', () => {
          return HttpResponse.json(mockSystemHealth)
        })
      )

      const response = await api.get('/system/health')
      
      expect(response.data.status).toBe('healthy')
      expect(response.data.version).toBe('1.0.0')
      expect(response.data.uptime_seconds).toBe(86400)
      
      // Verify all components are present
      expect(response.data.components.database.status).toBe('healthy')
      expect(response.data.components.redis.status).toBe('healthy')
      expect(response.data.components.indexers.status).toBe('degraded')
      expect(response.data.components.filesystem.status).toBe('healthy')
      expect(response.data.components.downloads.status).toBe('healthy')
      expect(response.data.components.scheduler.status).toBe('healthy')
    })

    it('should handle unhealthy system status', async () => {
      const mockUnhealthySystem: SystemHealth = {
        status: 'unhealthy',
        version: '1.0.0',
        uptime_seconds: 3600,
        timestamp: new Date().toISOString(),
        components: {
          database: {
            status: 'unhealthy',
            message: 'Connection pool exhausted',
            response_time_ms: 5000,
            last_check: new Date().toISOString(),
          },
          redis: {
            status: 'unhealthy',
            message: 'Redis server unreachable',
            last_check: new Date(Date.now() - 60000).toISOString(),
          },
          indexers: {
            status: 'unhealthy',
            message: 'All indexers offline',
            last_check: new Date().toISOString(),
          },
          filesystem: {
            status: 'unhealthy',
            message: 'Download directory full',
            last_check: new Date().toISOString(),
          },
          downloads: {
            status: 'degraded',
            message: 'Download queue paused due to errors',
            last_check: new Date().toISOString(),
          },
          scheduler: {
            status: 'unhealthy',
            message: 'Background tasks failing',
            last_check: new Date().toISOString(),
          },
        }
      }

      server.use(
        http.get('/api/v1/system/health', () => {
          return HttpResponse.json(mockUnhealthySystem, { status: 503 })
        })
      )

      try {
        await api.get('/system/health')
      } catch (error: any) {
        expect(error.response.status).toBe(503)
        expect(error.response.data.status).toBe('unhealthy')
        expect(error.response.data.components.database.status).toBe('unhealthy')
        expect(error.response.data.components.redis.status).toBe('unhealthy')
      }
    })
  })

  describe('Error Handling and Resilience', () => {
    it('should implement request retry logic', async () => {
      let attemptCount = 0
      
      server.use(
        http.get('/api/v1/system/health', () => {
          attemptCount++
          
          if (attemptCount < 3) {
            // Simulate network error for first 2 attempts
            return HttpResponse.json(
              { error: 'Network error' }, 
              { status: 500 }
            )
          }
          
          // Success on 3rd attempt
          return HttpResponse.json({
            status: 'healthy',
            version: '1.0.0',
            uptime_seconds: 3600,
            timestamp: new Date().toISOString(),
            components: {
              database: { status: 'healthy', last_check: new Date().toISOString() },
              redis: { status: 'healthy', last_check: new Date().toISOString() },
              indexers: { status: 'healthy', last_check: new Date().toISOString() },
              filesystem: { status: 'healthy', last_check: new Date().toISOString() },
              downloads: { status: 'healthy', last_check: new Date().toISOString() },
              scheduler: { status: 'healthy', last_check: new Date().toISOString() },
            }
          })
        })
      )

      const response = await api.get('/system/health')
      
      expect(attemptCount).toBe(3)
      expect(response.data.status).toBe('healthy')
    })

    it('should handle rate limiting gracefully', async () => {
      let requestCount = 0
      
      server.use(
        http.get('/api/v1/search', () => {
          requestCount++
          
          if (requestCount <= 2) {
            return HttpResponse.json(
              { 
                error: 'Rate limit exceeded',
                retry_after: 1 // 1 second
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
          
          // Success after rate limit period
          return HttpResponse.json({
            query: 'test',
            results: [],
            total_results: 0,
            indexers_searched: [],
            search_duration_ms: 0,
            cached: false,
            cache_expires_at: null,
          })
        })
      )

      const response = await searchApi.search('test', {})
      
      expect(requestCount).toBeGreaterThan(1)
      expect(response.results).toEqual([])
    })
  })

  afterAll(() => {
    server.resetHandlers()
  })
})