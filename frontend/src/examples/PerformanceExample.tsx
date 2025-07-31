/**
 * Performance Optimization Implementation Example
 * 
 * This file demonstrates how to use the new performance optimization features
 * in the FolioFox frontend application.
 */

import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { 
  useOptimizedSearch, 
  useSearchSuggestions,
  usePrefetchPopularSearches
} from '@/hooks/useSearchOptimized'
import { 
  useDashboardStats, 
  useRecentDownloads, 
  useSystemStatus 
} from '@/hooks/useDashboard'
import { 
  useEnhancedPerformanceMonitor,
  useMemoryMonitor 
} from '@/hooks/usePerformanceMonitor'
import { 
  useDebounce, 
  useRequestDeduplication,
  usePerformanceMetrics,
  scheduleBackgroundSync
} from '@/utils/performance'
import { OptimizedDashboardPage } from '@/components/dashboard/OptimizedDashboard'

// Example 1: Optimized Dashboard with Performance Monitoring
export function ExampleOptimizedDashboard() {
  const performanceMonitor = useEnhancedPerformanceMonitor('ExampleDashboard')
  const memoryMonitor = useMemoryMonitor('ExampleDashboard', 30000) // Check every 30s
  
  // Use optimized dashboard hooks with enhanced caching
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: systemStatus, isLoading: statusLoading } = useSystemStatus()
  const { data: downloads, isLoading: downloadsLoading } = useRecentDownloads()
  
  // Export performance metrics for monitoring
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const exportMetrics = () => {
        const metrics = performanceMonitor.exportMetrics()
        console.log('Dashboard Performance Metrics:', metrics)
        
        // Example: Send to monitoring service
        // sendMetricsToService(metrics)
      }
      
      // Export metrics every minute
      const interval = setInterval(exportMetrics, 60000)
      return () => clearInterval(interval)
    }
  }, [performanceMonitor])
  
  return (
    <div className="space-y-4">
      <OptimizedDashboardPage />
      
      {/* Development Performance Display */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-dark-800 border border-dark-600 rounded-lg p-4 text-xs">
          <h4 className="font-medium text-warning-300 mb-2">Performance Stats</h4>
          <div className="space-y-1 text-dark-300">
            <div>Render: {performanceMonitor.metrics.renderTime.toFixed(1)}ms</div>
            <div>Re-renders: {performanceMonitor.metrics.reRenders}</div>
            <div>Cache Hit: {performanceMonitor.metrics.queryStats.cacheHitRate.toFixed(1)}%</div>
            <div>Avg Response: {performanceMonitor.metrics.queryStats.averageResponseTime.toFixed(0)}ms</div>
            <div>Memory: {((memoryMonitor.getCurrentMemoryUsage() / 1024 / 1024) || 0).toFixed(1)}MB</div>
          </div>
        </div>
      )}
    </div>
  )
}

// Example 2: Optimized Search with Debouncing and Caching
export function ExampleOptimizedSearch() {
  const [query, setQuery] = React.useState('')
  const [showSuggestions, setShowSuggestions] = React.useState(false)
  
  // Use optimized search with automatic debouncing and caching
  const {
    search,
    data: searchResults,
    isLoading: searchLoading,
    searchParams
  } = useOptimizedSearch()
  
  // Get search suggestions with caching
  const {
    data: suggestions,
    isLoading: suggestionsLoading
  } = useSearchSuggestions(query, showSuggestions)
  
  // Debounced search function
  const debouncedSearch = useDebounce((searchQuery: string) => {
    if (searchQuery.length > 2) {
      search({ query: searchQuery })
    }
  }, 300)
  
  const handleInputChange = (value: string) => {
    setQuery(value)
    setShowSuggestions(value.length > 1)
    
    // Trigger debounced search
    debouncedSearch(value)
  }
  
  const handleSuggestionSelect = (suggestion: string) => {
    setQuery(suggestion)
    setShowSuggestions(false)
    search({ query: suggestion })
  }
  
  return (
    <div className="space-y-4">
      {/* Search Input with Suggestions */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search for books..."
          className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100"
        />
        
        {/* Search Suggestions Dropdown */}
        {showSuggestions && suggestions?.hasResults && (
          <div className="absolute top-full left-0 right-0 bg-dark-700 border border-dark-600 rounded-lg mt-1 z-10">
            {suggestionsLoading ? (
              <div className="p-4 text-dark-400">Loading suggestions...</div>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {suggestions.suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionSelect(suggestion.value)}
                    className="w-full px-4 py-2 text-left hover:bg-dark-600 text-dark-200"
                  >
                    <span className="font-medium">{suggestion.value}</span>
                    <span className="text-dark-400 ml-2">({suggestion.type})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Search Results */}
      <div>
        {searchLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
            <p className="mt-2 text-dark-400">Searching...</p>
          </div>
        ) : searchResults?.hasResults ? (
          <div className="space-y-4">
            <p className="text-dark-300">
              Found {searchResults.resultCount} results in {searchResults.searchTime}ms
            </p>
            <div className="grid gap-4">
              {searchResults.results?.map((result: any) => (
                <div key={result.id} className="card">
                  <h3 className="font-medium text-dark-100">{result.title}</h3>
                  <p className="text-dark-400">{result.author}</p>
                </div>
              ))}
            </div>
          </div>
        ) : query.length > 2 ? (
          <div className="text-center py-8 text-dark-400">
            No results found for "{query}"
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Example 3: Background Sync Setup
export function ExampleBackgroundSync() {
  const queryClient = useQueryClient()
  const { prefetchPopular } = usePrefetchPopularSearches(queryClient)
  
  React.useEffect(() => {
    // Set up background sync for critical data
    const cleanup = scheduleBackgroundSync(queryClient, [
      {
        queryKey: ['dashboard', 'stats'],
        queryFn: () => import('@/services/dashboard').then(m => m.dashboardService.getStats()),
        interval: 60000 // Every minute
      },
      {
        queryKey: ['dashboard', 'system-status'],
        queryFn: () => import('@/services/dashboard').then(m => m.dashboardService.getSystemStatus()),
        interval: 30000 // Every 30 seconds
      }
    ])
    
    // Prefetch popular searches on app load
    prefetchPopular()
    
    return cleanup
  }, [queryClient, prefetchPopular])
  
  return (
    <div className="text-center py-8">
      <p className="text-dark-400">Background sync initialized</p>
      <p className="text-sm text-dark-500 mt-2">
        Dashboard data and system status will be synced automatically
      </p>
    </div>
  )
}

// Example 4: Request Deduplication Demo
export function ExampleRequestDeduplication() {
  const [requestCount, setRequestCount] = React.useState(0)
  const [responseCount, setResponseCount] = React.useState(0)
  const { getOrFetch } = useRequestDeduplication()
  const { getMetrics } = usePerformanceMetrics()
  
  const makeMultipleRequests = async () => {
    setRequestCount(0)
    setResponseCount(0)
    
    // Simulate multiple concurrent identical requests
    const requests = Array.from({ length: 5 }, (_, i) => {
      setRequestCount(prev => prev + 1)
      
      return getOrFetch(
        'demo-request',
        async () => {
          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 1000))
          return { data: `Response ${Date.now()}`, id: i }
        },
        10000 // 10 second cache
      ).then(result => {
        setResponseCount(prev => prev + 1)
        return result
      })
    })
    
    const results = await Promise.all(requests)
    console.log('Deduplication Results:', results)
    
    // All results should be identical due to deduplication
    const allIdentical = results.every(result => result.data === results[0].data)
    console.log('All responses identical:', allIdentical)
  }
  
  const metrics = getMetrics()
  
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-medium text-dark-100 mb-4">Request Deduplication Demo</h3>
        <p className="text-dark-400 mb-4">
          This demo shows how multiple concurrent identical requests are deduplicated
          into a single network call.
        </p>
        
        <button
          onClick={makeMultipleRequests}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Make 5 Concurrent Requests
        </button>
        
        <div className="mt-4 text-sm">
          <p className="text-dark-300">Requests made: {requestCount}</p>
          <p className="text-dark-300">Responses received: {responseCount}</p>
        </div>
      </div>
      
      <div className="card">
        <h4 className="font-medium text-dark-100 mb-2">Performance Metrics</h4>
        <div className="text-sm space-y-1 text-dark-300">
          <p>Total Requests: {metrics.requestCount}</p>
          <p>Avg Response Time: {metrics.averageResponseTime.toFixed(0)}ms</p>
          <p>Cache Hit Rate: {metrics.cacheHitRate.toFixed(1)}%</p>
          <p>Error Rate: {metrics.errorRate.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  )
}

// Example 5: Complete Performance Dashboard
export function ExamplePerformanceDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-dark-50">Performance Examples</h1>
        <p className="text-dark-400 mt-2">
          Demonstrations of the performance optimization features
        </p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-4">Optimized Dashboard</h2>
          <ExampleOptimizedDashboard />
        </div>
        
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-4">Optimized Search</h2>
          <ExampleOptimizedSearch />
        </div>
        
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-4">Request Deduplication</h2>
          <ExampleRequestDeduplication />
        </div>
        
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-4">Background Sync</h2>
          <ExampleBackgroundSync />
        </div>
      </div>
    </div>
  )
}

// Example Usage in App.tsx:
/*
import { ExamplePerformanceDashboard } from '@/examples/PerformanceExample'

function App() {
  return (
    <Routes>
      <Route path="/performance-demo" element={<ExamplePerformanceDashboard />} />
      // ... other routes
    </Routes>
  )
}
*/