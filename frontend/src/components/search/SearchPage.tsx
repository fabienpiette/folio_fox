import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ClockIcon, TrashIcon } from '@heroicons/react/24/outline'

import { searchApi } from '@/services/searchApi'
import { SearchInput } from '@/components/ui/forms/SearchInput'
import { SearchFilters } from './SearchFilters'
import { SearchResults } from './SearchResults'
import { SearchFilters as SearchFiltersType, SearchResult } from '@/types'
import { useAuthStore } from '@/stores/auth'

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFiltersType>({})
  const [searchTriggered, setSearchTriggered] = useState(false)
  const { isAuthenticated, isLoading: authLoading } = useAuthStore()

  // Search history query - only fetch if user is authenticated
  const { data: historyData } = useQuery({
    queryKey: ['search-history'],
    queryFn: () => searchApi.getHistory(10, 30),
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated && !authLoading, // Only fetch when authenticated
    retry: (failureCount, error: unknown) => {
      // Don't retry on auth errors to prevent logout loops
      if ((error as {response?: {status?: number}})?.response?.status === 401) {
        return false
      }
      return failureCount < 3
    }
  })

  // Main search query
  const {
    data: searchData,
    isLoading: isSearching,
    error: searchError,
    refetch: performSearch,
  } = useQuery({
    queryKey: ['search', query, filters],
    queryFn: () => searchApi.search({ query, ...filters }),
    enabled: false, // Manual trigger only
    retry: (failureCount, error: unknown) => {
      // Don't retry on auth errors
      if ((error as {response?: {status?: number}})?.response?.status === 401) {
        return false
      }
      return failureCount < 3
    }
  })

  const handleSearch = (searchQuery: string) => {
    if (!isAuthenticated) {
      toast.error('Please log in to search')
      return
    }
    
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query')
      return
    }
    
    setQuery(searchQuery)
    setSearchTriggered(true)
    performSearch()
  }

  const handleDownload = (result: SearchResult) => {
    // This will be implemented when we create the download API
    console.log('Download:', result)
    toast.success(`Added "${result.title}" to download queue`)
  }

  const handlePreview = (result: SearchResult) => {
    // This will be implemented with a modal
    console.log('Preview:', result)
  }

  const clearHistory = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to clear history')
      return
    }
    
    try {
      await searchApi.clearHistory()
      toast.success('Search history cleared')
    } catch (error: unknown) {
      if ((error as {response?: {status?: number}})?.response?.status === 401) {
        toast.error('Session expired. Please log in again.')
      } else {
        toast.error('Failed to clear search history')
      }
    }
  }

  const searchResults = searchData?.results || []
  const recentSearches = historyData?.history || []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-dark-50">Search</h1>
        <p className="mt-2 text-dark-400">
          Search for books across multiple indexers
        </p>
      </div>

      {/* Search interface */}
      <div className="space-y-4">
        <div className="flex space-x-4">
          <div className="flex-1">
            <SearchInput
              value={query}
              onChange={setQuery}
              onSearch={handleSearch}
              placeholder="Search for books by title, author, or ISBN..."
            />
          </div>
          <SearchFilters
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Search stats */}
        {searchTriggered && searchData && (
          <div className="flex items-center justify-between text-sm text-dark-400 p-4 bg-dark-800 rounded-lg">
            <div className="flex items-center space-x-6">
              <span>
                {searchData.total_results} results from {searchData.indexers_searched.length} indexers
              </span>
              <span>
                Search took {searchData.search_duration_ms}ms
              </span>
              {searchData.cached && (
                <span className="text-primary-400">
                  (Cached result)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Search results */}
        <div className="lg:col-span-3">
          {searchTriggered ? (
            <SearchResults
              results={searchResults}
              isLoading={isSearching}
              error={(searchError as {message?: string})?.message}
              onDownload={handleDownload}
              onPreview={handlePreview}
            />
          ) : (
            <div className="text-center py-12">
              <div className="text-dark-500 mb-4">
                <svg className="h-16 w-16 mx-auto" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
              </div>
              <h3 className="text-lg font-medium text-dark-300 mb-2">
                Ready to search
              </h3>
              <p className="text-dark-500">
                Enter a search query to find books across all configured indexers
              </p>
            </div>
          )}
        </div>

        {/* Sidebar - Recent searches */}
        <div className="space-y-6">
          {recentSearches.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-dark-50 flex items-center">
                  <ClockIcon className="h-5 w-5 mr-2" />
                  Recent Searches
                </h3>
                <button
                  onClick={clearHistory}
                  className="text-dark-400 hover:text-dark-200 p-1"
                  title="Clear history"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {recentSearches.slice(0, 5).map((search) => (
                  <button
                    key={search.id}
                    onClick={() => handleSearch(search.query)}
                    className="w-full text-left p-2 rounded-md hover:bg-dark-700 transition-colors group"
                  >
                    <div className="text-sm text-dark-200 group-hover:text-dark-50">
                      {search.query}
                    </div>
                    <div className="text-xs text-dark-500 flex items-center justify-between mt-1">
                      <span>{search.results_count} results</span>
                      <span>{new Date(search.searched_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search tips */}
          <div className="card">
            <h3 className="text-lg font-semibold text-dark-50 mb-4">
              Search Tips
            </h3>
            <div className="space-y-3 text-sm text-dark-400">
              <div>
                <span className="font-medium text-dark-300">Exact phrases:</span>
                <br />
                Use quotes for exact matches: "Foundation series"
              </div>
              <div>
                <span className="font-medium text-dark-300">Multiple terms:</span>
                <br />
                Use + for required terms: Asimov +Foundation
              </div>
              <div>
                <span className="font-medium text-dark-300">Exclude terms:</span>
                <br />
                Use - to exclude: science fiction -fantasy
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}