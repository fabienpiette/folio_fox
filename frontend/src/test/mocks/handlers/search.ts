import { http, HttpResponse } from 'msw'
import { SearchResponse, SearchResult } from '@/types'

const mockSearchResults: SearchResult[] = [
  {
    indexer_id: 1,
    indexer_name: 'Test Indexer 1',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    description: 'A classic American novel',
    format: 'epub',
    file_size_bytes: 1048576,
    file_size_human: '1.0 MB',
    quality_score: 95,
    download_url: 'https://example.com/download/1',
    source_url: 'https://example.com/source/1',
    language: 'en',
    publication_year: 1925,
    isbn: '978-0123456789',
    cover_url: 'https://example.com/cover/1.jpg',
    tags: ['classic', 'american literature'],
    metadata: {},
    found_at: new Date().toISOString(),
  },
  {
    indexer_id: 2,
    indexer_name: 'Test Indexer 2',
    title: 'To Kill a Mockingbird',
    author: 'Harper Lee',
    description: 'A novel about racial injustice',
    format: 'pdf',
    file_size_bytes: 2097152,
    file_size_human: '2.0 MB',
    quality_score: 88,
    download_url: 'https://example.com/download/2',
    source_url: 'https://example.com/source/2',
    language: 'en',
    publication_year: 1960,
    isbn: '978-0987654321',
    cover_url: 'https://example.com/cover/2.jpg',
    tags: ['classic', 'social issues'],
    metadata: {},
    found_at: new Date().toISOString(),
  },
]

export const searchHandlers = [
  // Main search endpoint
  http.get('/api/v1/search', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('query')
    const timeout = parseInt(url.searchParams.get('timeout') || '10000')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    
    // Simulate search timeout
    if (query === 'timeout') {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Request Timeout',
          status: 408,
          detail: 'Search request timed out',
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 408 }
      )
    }
    
    // Simulate no results
    if (query === 'noresults') {
      const response: SearchResponse = {
        query: query!,
        results: [],
        total_results: 0,
        indexers_searched: [
          {
            indexer_id: 1,
            indexer_name: 'Test Indexer 1',
            result_count: 0,
            response_time_ms: 150,
            error: null,
          }
        ],
        search_duration_ms: 150,
        cached: false,
        cache_expires_at: null,
      }
      return HttpResponse.json(response)
    }
    
    // Filter results based on query
    let filteredResults = mockSearchResults
    if (query) {
      filteredResults = mockSearchResults.filter(result =>
        result.title.toLowerCase().includes(query.toLowerCase()) ||
        result.author.toLowerCase().includes(query.toLowerCase())
      )
    }
    
    // Apply limit
    filteredResults = filteredResults.slice(0, limit)
    
    const response: SearchResponse = {
      query: query || '',
      results: filteredResults,
      total_results: filteredResults.length,
      indexers_searched: [
        {
          indexer_id: 1,
          indexer_name: 'Test Indexer 1',
          result_count: Math.floor(filteredResults.length / 2),
          response_time_ms: 250,
          error: null,
        },
        {
          indexer_id: 2,
          indexer_name: 'Test Indexer 2',
          result_count: Math.ceil(filteredResults.length / 2),
          response_time_ms: 300,
          error: null,
        }
      ],
      search_duration_ms: 300,
      cached: false,
      cache_expires_at: null,
    }
    
    return HttpResponse.json(response)
  }),

  // Search suggestions
  http.get('/api/v1/search/suggestions', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('query') || ''
    const type = url.searchParams.get('type') || 'all'
    const limit = parseInt(url.searchParams.get('limit') || '10')
    
    const suggestions = [
      { text: 'The Great Gatsby', type: 'title' as const, count: 15 },
      { text: 'F. Scott Fitzgerald', type: 'author' as const, count: 8 },
      { text: 'To Kill a Mockingbird', type: 'title' as const, count: 12 },
      { text: 'Harper Lee', type: 'author' as const, count: 5 },
      { text: 'Classic Literature', type: 'genre' as const, count: 25 },
    ].filter(suggestion => 
      suggestion.text.toLowerCase().includes(query.toLowerCase()) &&
      (type === 'all' || suggestion.type === type)
    ).slice(0, limit)
    
    return HttpResponse.json({ suggestions })
  }),

  // Search history
  http.get('/api/v1/search/history', ({ request }) => {
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const days = parseInt(url.searchParams.get('days') || '30')
    
    const history = [
      {
        id: 1,
        query: 'gatsby',
        filters: {},
        results_count: 5,
        indexers_searched: [1, 2],
        search_duration_ms: 250,
        searched_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      },
      {
        id: 2,
        query: 'mockingbird',
        filters: { format: 'epub' },
        results_count: 3,
        indexers_searched: [1],
        search_duration_ms: 180,
        searched_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      },
    ].slice(0, limit)
    
    return HttpResponse.json({
      history,
      total_searches: history.length,
      unique_queries: history.length,
    })
  }),

  // Clear search history
  http.delete('/api/v1/search/history', () => {
    return HttpResponse.json({ message: 'Search history cleared successfully' })
  }),
]