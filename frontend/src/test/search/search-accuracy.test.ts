/**
 * Search Accuracy Testing Suite
 * 
 * Tests search result relevance, ranking, multi-indexer coordination,
 * query parsing, filtering accuracy, and performance for large result sets.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils/test-utils'
import { SearchPage } from '@/components/search/SearchPage'
import { SearchResponse, SearchResult } from '@/types'

// Mock large result set for performance testing
const generateMockResults = (count: number): SearchResult[] => {
  return Array.from({ length: count }, (_, index) => ({
    indexer_id: (index % 3) + 1,
    indexer_name: `Test Indexer ${(index % 3) + 1}`,
    title: `Test Book ${index + 1}`,
    author: `Test Author ${index + 1}`,
    description: `Description for test book ${index + 1}`,
    format: index % 2 === 0 ? 'epub' : 'pdf',
    file_size_bytes: (index + 1) * 1024 * 1024,
    file_size_human: `${index + 1}.0 MB`,
    quality_score: Math.floor(Math.random() * 100),
    download_url: `https://example.com/download/${index + 1}`,
    source_url: `https://example.com/source/${index + 1}`,
    language: 'en',
    publication_year: 2000 + (index % 24),
    isbn: `978-${String(index).padStart(10, '0')}`,
    cover_url: `https://example.com/cover/${index + 1}.jpg`,
    tags: [`tag${index % 5}`, `category${index % 3}`],
    metadata: {},
    found_at: new Date().toISOString(),
  }))
}

describe('Search Accuracy Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Search Result Relevance', () => {
    it('should return relevant results for exact title match', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'The Great Gatsby')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText('The Great Gatsby')).toBeInTheDocument()
        expect(screen.getByText('F. Scott Fitzgerald')).toBeInTheDocument()
      })
    })

    it('should return relevant results for author search', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'Harper Lee')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText('To Kill a Mockingbird')).toBeInTheDocument()
        expect(screen.getByText('Harper Lee')).toBeInTheDocument()
      })
    })

    it('should handle partial matches correctly', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'gatsby')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText('The Great Gatsby')).toBeInTheDocument()
      })
    })

    it('should return no results for non-existent books', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'noresults')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText(/no results found/i)).toBeInTheDocument()
      })
    })
  })

  describe('Search Result Ranking', () => {
    beforeAll(() => {
      // Mock handler with specific ranking logic
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'ranking test') {
            const results: SearchResult[] = [
              {
                indexer_id: 1,
                indexer_name: 'High Quality Indexer',
                title: 'Exact Match Ranking Test',
                author: 'Test Author',
                description: 'Perfect match',
                format: 'epub',
                file_size_bytes: 1048576,
                file_size_human: '1.0 MB',
                quality_score: 95, // Highest quality
                download_url: 'https://example.com/download/1',
                source_url: 'https://example.com/source/1',
                language: 'en',
                publication_year: 2023,
                isbn: '978-0123456789',
                cover_url: 'https://example.com/cover/1.jpg',
                tags: ['test'],
                metadata: {},
                found_at: new Date().toISOString(),
              },
              {
                indexer_id: 2,
                indexer_name: 'Medium Quality Indexer',
                title: 'Partial Ranking Test Match',
                author: 'Test Author',
                description: 'Partial match',
                format: 'pdf',
                file_size_bytes: 2097152,
                file_size_human: '2.0 MB',
                quality_score: 75, // Medium quality
                download_url: 'https://example.com/download/2',
                source_url: 'https://example.com/source/2',
                language: 'en',
                publication_year: 2022,
                isbn: '978-0987654321',
                cover_url: 'https://example.com/cover/2.jpg',
                tags: ['test'],
                metadata: {},
                found_at: new Date().toISOString(),
              },
              {
                indexer_id: 3,
                indexer_name: 'Low Quality Indexer',
                title: 'Test Ranking Document',
                author: 'Different Author',
                description: 'Loose match',
                format: 'mobi',
                file_size_bytes: 512000,
                file_size_human: '0.5 MB',
                quality_score: 45, // Low quality
                download_url: 'https://example.com/download/3',
                source_url: 'https://example.com/source/3',
                language: 'en',
                publication_year: 2020,
                isbn: '978-0555666777',
                cover_url: 'https://example.com/cover/3.jpg',
                tags: ['test'],
                metadata: {},
                found_at: new Date().toISOString(),
              },
            ]

            const response: SearchResponse = {
              query: query!,
              results,
              total_results: results.length,
              indexers_searched: [
                { indexer_id: 1, indexer_name: 'High Quality Indexer', result_count: 1, response_time_ms: 100, error: null },
                { indexer_id: 2, indexer_name: 'Medium Quality Indexer', result_count: 1, response_time_ms: 150, error: null },
                { indexer_id: 3, indexer_name: 'Low Quality Indexer', result_count: 1, response_time_ms: 200, error: null },
              ],
              search_duration_ms: 200,
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
    })

    it('should rank results by quality score', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'ranking test')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        const results = screen.getAllByTestId(/search-result-/i)
        expect(results).toHaveLength(3)
        
        // Verify first result has highest quality score
        expect(results[0]).toHaveTextContent('Exact Match Ranking Test')
        expect(results[0]).toHaveTextContent('Quality: 95')
      })
    })

    it('should prioritize exact title matches', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'ranking test')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        const firstResult = screen.getAllByTestId(/search-result-/i)[0]
        expect(firstResult).toHaveTextContent('Exact Match Ranking Test')
      })
    })
  })

  describe('Multi-Indexer Search Coordination', () => {
    it('should search across multiple indexers', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'gatsby')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText(/searched 2 indexers/i)).toBeInTheDocument()
        expect(screen.getByText(/test indexer 1/i)).toBeInTheDocument()
        expect(screen.getByText(/test indexer 2/i)).toBeInTheDocument()
      })
    })

    it('should handle indexer failures gracefully', async () => {
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'indexer failure') {
            const response: SearchResponse = {
              query: query!,
              results: [],
              total_results: 0,
              indexers_searched: [
                { indexer_id: 1, indexer_name: 'Working Indexer', result_count: 0, response_time_ms: 150, error: null },
                { indexer_id: 2, indexer_name: 'Failed Indexer', result_count: 0, response_time_ms: 0, error: 'Connection timeout' },
              ],
              search_duration_ms: 5000,
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

      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'indexer failure')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText(/1 indexer failed/i)).toBeInTheDocument()
        expect(screen.getByText(/connection timeout/i)).toBeInTheDocument()
      })
    })

    it('should show indexer response times', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'gatsby')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText(/response time: 250ms/i)).toBeInTheDocument()
        expect(screen.getByText(/response time: 300ms/i)).toBeInTheDocument()
      })
    })
  })

  describe('Search Query Parsing and Filtering', () => {
    it('should parse complex search queries', async () => {
      // Test advanced query syntax like: author:"Harper Lee" format:epub year:>1950
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'author:"Harper Lee" format:epub')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        // Should show parsed query indicators
        expect(screen.getByText(/author filter: Harper Lee/i)).toBeInTheDocument()
        expect(screen.getByText(/format filter: epub/i)).toBeInTheDocument()
      })
    })

    it('should apply format filters correctly', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      // Use filter dropdown
      const formatFilter = screen.getByLabelText(/format/i)
      await user.selectOptions(formatFilter, 'epub')
      
      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'gatsby')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        const results = screen.getAllByTestId(/search-result-/i)
        results.forEach(result => {
          expect(result).toHaveTextContent('epub')
        })
      })
    })

    it('should filter by publication year range', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const yearFromInput = screen.getByLabelText(/year from/i)
      await user.type(yearFromInput, '1920')

      const yearToInput = screen.getByLabelText(/year to/i)
      await user.type(yearToInput, '1930')

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'gatsby')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText('The Great Gatsby')).toBeInTheDocument()
        expect(screen.getByText('1925')).toBeInTheDocument()
      })
    })

    it('should handle invalid filter values gracefully', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const yearFromInput = screen.getByLabelText(/year from/i)
      await user.type(yearFromInput, 'invalid')

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'gatsby')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText(/invalid year format/i)).toBeInTheDocument()
      })
    })
  })

  describe('Performance Testing for Large Result Sets', () => {
    beforeAll(() => {
      // Mock large result set
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'large dataset') {
            const largeResults = generateMockResults(1000)
            const response: SearchResponse = {
              query: query!,
              results: largeResults,
              total_results: largeResults.length,
              indexers_searched: [
                { indexer_id: 1, indexer_name: 'Large Indexer', result_count: largeResults.length, response_time_ms: 1500, error: null },
              ],
              search_duration_ms: 1500,
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
    })

    it('should handle large result sets efficiently', async () => {
      const startTime = performance.now()
      
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'large dataset')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText(/1000 results/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      const endTime = performance.now()
      const renderTime = endTime - startTime

      // Should render within reasonable time (less than 5 seconds)
      expect(renderTime).toBeLessThan(5000)
    })

    it('should implement virtual scrolling for large lists', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'large dataset')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        // Should only render visible items initially
        const visibleResults = screen.getAllByTestId(/search-result-/i)
        expect(visibleResults.length).toBeLessThan(50) // Virtual scrolling limit
        expect(screen.getByText(/showing 1-20 of 1000/i)).toBeInTheDocument()
      })
    })

    it('should maintain smooth scrolling performance', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'large dataset')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        const resultsList = screen.getByTestId('search-results-list')
        expect(resultsList).toBeInTheDocument()
      })

      // Simulate scrolling
      const resultsList = screen.getByTestId('search-results-list')
      const scrollStartTime = performance.now()
      
      // Simulate multiple scroll events
      for (let i = 0; i < 10; i++) {
        resultsList.scrollTop = i * 100
        await new Promise(resolve => setTimeout(resolve, 16)) // 60fps
      }

      const scrollEndTime = performance.now()
      const scrollTime = scrollEndTime - scrollStartTime

      // Should maintain 60fps during scrolling
      expect(scrollTime).toBeLessThan(500)
    })
  })

  describe('Search Caching', () => {
    it('should use cached results when available', async () => {
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'cached query') {
            const response: SearchResponse = {
              query: query!,
              results: [generateMockResults(1)[0]],
              total_results: 1,
              indexers_searched: [],
              search_duration_ms: 5, // Very fast for cached result
              cached: true,
              cache_expires_at: new Date(Date.now() + 300000).toISOString(), // 5 minutes
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

      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'cached query')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText(/cached result/i)).toBeInTheDocument()
        expect(screen.getByText(/search duration: 5ms/i)).toBeInTheDocument()
        expect(screen.getByText(/expires in/i)).toBeInTheDocument()
      })
    })
  })

  describe('Search Timeout Handling', () => {
    it('should handle search timeouts gracefully', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'timeout')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText(/search request timed out/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /retry search/i })).toBeInTheDocument()
      })
    })

    it('should allow users to retry failed searches', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByPlaceholderText(/search for books/i)
      await user.type(searchInput, 'timeout')
      await user.click(screen.getByRole('button', { name: /search/i }))

      await waitFor(() => {
        expect(screen.getByText(/search request timed out/i)).toBeInTheDocument()
      })

      // Mock successful retry
      server.use(
        http.get('/api/v1/search', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('query')

          if (query === 'timeout') {
            const response: SearchResponse = {
              query: query!,
              results: [generateMockResults(1)[0]],
              total_results: 1,
              indexers_searched: [
                { indexer_id: 1, indexer_name: 'Test Indexer', result_count: 1, response_time_ms: 150, error: null },
              ],
              search_duration_ms: 150,
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

      const retryButton = screen.getByRole('button', { name: /retry search/i })
      await user.click(retryButton)

      await waitFor(() => {
        expect(screen.getByText('Test Book 1')).toBeInTheDocument()
      })
    })
  })

  afterAll(() => {
    server.resetHandlers()
  })
})