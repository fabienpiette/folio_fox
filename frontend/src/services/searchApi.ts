import { apiClient } from './api'
import {
  SearchResponse,
  SearchSuggestion,
  SearchHistoryEntry,
  SearchFilters,
} from '@/types'

export interface SearchParams extends SearchFilters {
  timeout?: number
  limit?: number
  use_cache?: boolean
}

export const searchApi = {
  // Main search function
  search: async (params: SearchParams): Promise<SearchResponse> => {
    const queryParams = new URLSearchParams()
    
    if (params.query) queryParams.append('query', params.query)
    if (params.indexers?.length) {
      queryParams.append('indexers', params.indexers.join(','))
    }
    if (params.format) queryParams.append('formats', params.format)
    if (params.language) queryParams.append('languages', params.language)
    if (params.min_quality) queryParams.append('min_quality', params.min_quality.toString())
    if (params.max_size_mb) queryParams.append('max_size_mb', params.max_size_mb.toString())
    if (params.timeout) queryParams.append('timeout', params.timeout.toString())
    if (params.limit) queryParams.append('limit', params.limit.toString())
    if (params.use_cache !== undefined) {
      queryParams.append('use_cache', params.use_cache.toString())
    }

    return apiClient.get<SearchResponse>(`/search?${queryParams.toString()}`)
  },

  // Get search suggestions for autocomplete
  getSuggestions: async (
    query: string,
    type: 'all' | 'title' | 'author' | 'series' | 'genre' = 'all',
    limit: number = 10
  ): Promise<{ suggestions: SearchSuggestion[] }> => {
    const queryParams = new URLSearchParams({
      query,
      type,
      limit: limit.toString(),
    })

    return apiClient.get<{ suggestions: SearchSuggestion[] }>(
      `/search/suggestions?${queryParams.toString()}`
    )
  },

  // Get search history
  getHistory: async (
    limit: number = 20,
    days: number = 30
  ): Promise<{
    history: SearchHistoryEntry[]
    total_searches: number
    unique_queries: number
  }> => {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      days: days.toString(),
    })

    return apiClient.get(`/search/history?${queryParams.toString()}`)
  },

  // Clear search history
  clearHistory: async (days?: number): Promise<void> => {
    const queryParams = new URLSearchParams()
    if (days) queryParams.append('days', days.toString())
    
    return apiClient.delete(`/search/history?${queryParams.toString()}`)
  },
}