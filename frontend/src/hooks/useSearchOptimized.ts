import { useState, useCallback, useMemo } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { searchApi, SearchParams } from '@/services/searchApi'
import { useDebounce, useRequestDeduplication, usePerformanceMetrics } from '@/utils/performance'
import { SearchResponse } from '@/types'

// Optimized search hook with debouncing and caching
export function useOptimizedSearch(initialParams?: Partial<SearchParams>) {
  const [searchParams, setSearchParams] = useState<SearchParams>({
    query: '',
    limit: 20,
    use_cache: true,
    ...initialParams
  })
  
  const { getOrFetch } = useRequestDeduplication()
  const { recordRequest } = usePerformanceMetrics()

  // Debounced search function
  const debouncedSearch = useDebounce((params: SearchParams) => {
    setSearchParams(params)
  }, 300)

  // Main search query with optimized caching
  const searchQuery = useQuery({
    queryKey: ['search', searchParams],
    queryFn: async () => {
      const startTime = Date.now()
      
      try {
        const cacheKey = `search-${JSON.stringify(searchParams)}`
        const result = await getOrFetch(
          cacheKey,
          () => searchApi.search(searchParams),
          30000 // 30 second cache for search results
        )
        
        const responseTime = Date.now() - startTime
        recordRequest(responseTime, false, false)
        
        return result
      } catch (error) {
        const responseTime = Date.now() - startTime
        recordRequest(responseTime, false, true)
        throw error
      }
    },
    
    enabled: !!searchParams.query && searchParams.query.length > 2,
    
    // Cache search results for 30 seconds
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    
    // Don't refetch on window focus for search results
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    
    // Retry configuration
    retry: (failureCount, error) => {
      const errorResponse = (error as {response?: {status?: number}})?.response
      
      // Don't retry on client errors or rate limits
      if (errorResponse?.status && (
        (errorResponse.status >= 400 && errorResponse.status < 500) ||
        errorResponse.status === 429
      )) {
        return false
      }
      
      return failureCount < 2 // Limited retries for search
    },
    
    retryDelay: (attemptIndex) => Math.min(1000 * (2 ** attemptIndex), 5000),
    
    // Optimize data structure
    select: (data: SearchResponse) => ({
      ...data,
      hasResults: data.results && data.results.length > 0,
      resultCount: data.total_results || 0,
      pageCount: Math.ceil((data.total_results || 0) / (searchParams.limit || 20)),
      searchTime: data.search_duration_ms || 0
    }),
    
    meta: {
      errorMessage: 'Search failed. Please try again.',
      component: 'Search'
    }
  })

  // Infinite search for pagination
  const infiniteSearchQuery = useInfiniteQuery({
    queryKey: ['search', 'infinite', searchParams],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const params = {
        ...searchParams,
        offset: pageParam * (searchParams.limit || 20)
      }
      
      const startTime = Date.now()
      
      try {
        const result = await searchApi.search(params)
        const responseTime = Date.now() - startTime
        recordRequest(responseTime, false, false)
        return result
      } catch (error) {
        const responseTime = Date.now() - startTime
        recordRequest(responseTime, false, true)
        throw error
      }
    },
    
    initialPageParam: 0,
    enabled: !!searchParams.query && searchParams.query.length > 2,
    
    getNextPageParam: (lastPage: SearchResponse, allPages: SearchResponse[]) => {
      const totalResults = lastPage.total_results || 0
      const currentResultCount = allPages.reduce((sum, page) => sum + (page.results?.length || 0), 0)
      
      return currentResultCount < totalResults ? allPages.length : undefined
    },
    
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      allResults: data.pages.flatMap((page: SearchResponse) => page.results || []),
      totalResults: data.pages[0]?.total_results || 0,
      hasNextPage: data.pages.length > 0 && data.pages[data.pages.length - 1]?.results?.length === (searchParams.limit || 20)
    })
  })

  // Search function with debouncing
  const search = useCallback((params: Partial<SearchParams>) => {
    const newParams = { ...searchParams, ...params }
    debouncedSearch(newParams)
  }, [searchParams, debouncedSearch])

  // Immediate search without debouncing
  const searchImmediate = useCallback((params: Partial<SearchParams>) => {
    const newParams = { ...searchParams, ...params }
    setSearchParams(newParams)
  }, [searchParams])

  return {
    // Query results
    ...searchQuery,
    
    // Infinite query
    infiniteQuery: infiniteSearchQuery,
    
    // Search functions
    search,
    searchImmediate,
    
    // Current params
    searchParams,
    
    // Utility functions
    clearSearch: () => setSearchParams({ ...searchParams, query: '' }),
    resetSearch: () => setSearchParams({ query: '', limit: 20, use_cache: true })
  }
}

// Optimized search suggestions hook
export function useSearchSuggestions(query: string, enabled: boolean = true) {
  const { getOrFetch } = useRequestDeduplication()
  const { recordRequest } = usePerformanceMetrics()

  // Debounced query for suggestions
  const debouncedQuery = useDebounce((q: string) => q, 150)
  const debouncedQueryValue = useMemo(() => debouncedQuery(query), [query, debouncedQuery])

  return useQuery({
    queryKey: ['search', 'suggestions', debouncedQueryValue],
    queryFn: async () => {
      const startTime = Date.now()
      
      try {
        const cacheKey = `suggestions-${debouncedQueryValue}`
        const result = await getOrFetch(
          cacheKey,
          () => searchApi.getSuggestions(debouncedQueryValue, 'all', 8),
          5 * 60 * 1000 // 5 minute cache for suggestions
        )
        
        const responseTime = Date.now() - startTime
        recordRequest(responseTime, false, false)
        
        return result
      } catch (error) {
        const responseTime = Date.now() - startTime
        recordRequest(responseTime, false, true)
        throw error
      }
    },
    
    enabled: enabled && !!debouncedQueryValue && debouncedQueryValue.length > 1,
    
    // Cache suggestions for 5 minutes as requested
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    
    // Don't refetch suggestions frequently
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    
    // Minimal retries for suggestions
    retry: 1,
    retryDelay: 1000,
    
    // Transform suggestions data
    select: (data) => ({
      suggestions: data.suggestions || [],
      hasResults: data.suggestions && data.suggestions.length > 0,
      query: debouncedQueryValue
    }),
    
    meta: {
      errorMessage: 'Failed to load search suggestions',
      component: 'SearchSuggestions'
    }
  })
}

// Search history hook with caching
export function useSearchHistory(limit: number = 20, days: number = 30) {
  const { getOrFetch } = useRequestDeduplication()

  return useQuery({
    queryKey: ['search', 'history', limit, days],
    queryFn: async () => {
      const cacheKey = `search-history-${limit}-${days}`
      return getOrFetch(
        cacheKey,
        () => searchApi.getHistory(limit, days),
        2 * 60 * 1000 // 2 minute cache for history
      )
    },
    
    // Cache history for 2 minutes
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    
    refetchOnWindowFocus: false,
    retry: 2,
    
    select: (data) => ({
      ...data,
      hasHistory: data.history && data.history.length > 0,
      recentQueries: data.history?.slice(0, 10) || []
    }),
    
    meta: {
      errorMessage: 'Failed to load search history',
      component: 'SearchHistory'
    }
  })
}

// Hook for prefetching popular searches
export function usePrefetchPopularSearches(queryClient: any) {
  const prefetchPopular = useCallback(async () => {
    const popularQueries = [
      'programming',
      'javascript',
      'react',
      'python',
      'typescript'
    ]

    // Prefetch popular search results
    const prefetchPromises = popularQueries.map(query =>
      queryClient.prefetchQuery({
        queryKey: ['search', { query, limit: 20, use_cache: true }],
        queryFn: () => searchApi.search({ query, limit: 20, use_cache: true }),
        staleTime: 10 * 60 * 1000 // 10 minutes for popular searches
      })
    )

    await Promise.allSettled(prefetchPromises)
  }, [queryClient])

  return { prefetchPopular }
}