import { useRef, useCallback, useMemo } from 'react'
import { QueryClient } from '@tanstack/react-query'

// Debounce utility for search and other frequent API calls
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>()

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args)
      }, delay)
    },
    [callback, delay]
  ) as T

  return debouncedCallback
}

// Throttle utility for high-frequency events
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef<number>(0)

  const throttledCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now()
      
      if (now - lastRun.current >= delay) {
        lastRun.current = now
        callback(...args)
      }
    },
    [callback, delay]
  ) as T

  return throttledCallback
}

// Request deduplication cache
class RequestDeduplicationCache {
  private pendingRequests = new Map<string, Promise<any>>()
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>()


  // Get or create a deduplicated request
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 5000 // 5 second TTL by default
  ): Promise<T> {
    // Check if we have a cached result that's still valid
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data
    }

    // Check if there's already a pending request for this key
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!
    }

    // Create new request
    const request = fetcher()
      .then((data) => {
        // Cache the result
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          ttl
        })
        return data
      })
      .finally(() => {
        // Remove from pending requests when done
        this.pendingRequests.delete(key)
      })

    // Store the pending request
    this.pendingRequests.set(key, request)
    
    return request
  }

  // Clear cache entries that have exceeded their TTL
  cleanup(): void {
    const now = Date.now()
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp >= cached.ttl) {
        this.cache.delete(key)
      }
    }
  }

  // Clear specific cache entry
  invalidate(key: string): void {
    this.cache.delete(key)
    this.pendingRequests.delete(key)
  }

  // Clear all cache
  clear(): void {
    this.cache.clear()
    this.pendingRequests.clear()
  }
}

// Global instance of request deduplication cache
const requestCache = new RequestDeduplicationCache()

// Cleanup cache every 30 seconds
if (typeof window !== 'undefined') {
  setInterval(() => {
    requestCache.cleanup()
  }, 30000)
}

export { requestCache }

// Hook for debounced search
export function useSearchDebounce(
  searchFunction: (query: string) => void,
  delay: number = 300
) {
  return useDebounce(searchFunction, delay)
}

// Hook for request deduplication
export function useRequestDeduplication() {
  return useMemo(() => ({
    getOrFetch: requestCache.getOrFetch.bind(requestCache),
    invalidate: requestCache.invalidate.bind(requestCache),
    clear: requestCache.clear.bind(requestCache)
  }), [])
}

// Performance measurement utilities
export interface PerformanceMetrics {
  requestCount: number
  averageResponseTime: number
  cacheHitRate: number
  errorRate: number
  lastMeasurement: number
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    requestCount: 0,
    averageResponseTime: 0,
    cacheHitRate: 0,
    errorRate: 0,
    lastMeasurement: Date.now()
  }

  private responseTimes: number[] = []
  private cacheHits = 0
  private cacheMisses = 0
  private errors = 0

  // Record a request
  recordRequest(responseTime: number, isCacheHit: boolean = false, isError: boolean = false): void {
    this.metrics.requestCount++
    
    if (isError) {
      this.errors++
    } else {
      this.responseTimes.push(responseTime)
      
      // Keep only last 100 response times for rolling average
      if (this.responseTimes.length > 100) {
        this.responseTimes.shift()
      }
      
      // Update average response time
      this.metrics.averageResponseTime = 
        this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
    }

    if (isCacheHit) {
      this.cacheHits++
    } else {
      this.cacheMisses++
    }

    // Update rates
    const totalRequests = this.cacheHits + this.cacheMisses
    this.metrics.cacheHitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0
    this.metrics.errorRate = this.metrics.requestCount > 0 ? (this.errors / this.metrics.requestCount) * 100 : 0
    this.metrics.lastMeasurement = Date.now()
  }

  // Get current metrics
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  // Reset metrics
  reset(): void {
    this.metrics = {
      requestCount: 0,
      averageResponseTime: 0,
      cacheHitRate: 0,
      errorRate: 0,
      lastMeasurement: Date.now()
    }
    this.responseTimes = []
    this.cacheHits = 0
    this.cacheMisses = 0
    this.errors = 0
  }
}

// Global performance monitor instance
const performanceMonitor = new PerformanceMonitor()

export { performanceMonitor }

// Hook for performance monitoring
export function usePerformanceMetrics() {
  return useMemo(() => ({
    recordRequest: performanceMonitor.recordRequest.bind(performanceMonitor),
    getMetrics: performanceMonitor.getMetrics.bind(performanceMonitor),
    reset: performanceMonitor.reset.bind(performanceMonitor)
  }), [])
}

// Prefetching utilities
export function prefetchQuery(
  queryClient: QueryClient,
  queryKey: any[],
  queryFn: () => Promise<any>,
  staleTime: number = 5 * 60 * 1000
) {
  return queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime,
  })
}

// Background sync utilities
export function scheduleBackgroundSync(
  queryClient: QueryClient,
  queries: Array<{
    queryKey: any[]
    interval: number
  }>
) {
  const intervals: NodeJS.Timeout[] = []

  queries.forEach(({ queryKey, interval }) => {
    const intervalId = setInterval(() => {
      // Only sync if user is active and online
      if (document.visibilityState === 'visible' && navigator.onLine) {
        queryClient.invalidateQueries({ queryKey })
      }
    }, interval)

    intervals.push(intervalId)
  })

  // Return cleanup function
  return () => {
    intervals.forEach(clearInterval)
  }
}

// React Query optimizations
export const queryDefaults = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  retry: 3,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
}

// Memoization utilities for expensive computations
export function useMemoizedComputation<T>(
  computation: () => T,
  dependencies: any[]
): T {
  return useMemo(computation, dependencies)
}

// Component memoization helper
export function shouldMemoize(
  prevProps: Record<string, any>,
  nextProps: Record<string, any>,
  keys?: string[]
): boolean {
  const keysToCheck = keys || Object.keys(nextProps)
  
  return keysToCheck.every(key => {
    const prevValue = prevProps[key]
    const nextValue = nextProps[key]
    
    // Deep equality check for objects and arrays
    if (typeof prevValue === 'object' && typeof nextValue === 'object') {
      return JSON.stringify(prevValue) === JSON.stringify(nextValue)
    }
    
    return prevValue === nextValue
  })
}