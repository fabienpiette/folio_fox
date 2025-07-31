import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePerformanceMetrics } from '@/utils/performance'

interface PerformanceMetrics {
  renderTime: number
  memoryUsage?: number
  componentName: string
  timestamp: number
}

interface PerformanceMonitorOptions {
  enabled?: boolean
  threshold?: number // Log slow renders above this threshold (ms)
  sampleRate?: number // Sample rate for performance tracking (0-1)
}

/**
 * Custom hook for monitoring component performance
 * Tracks render times, memory usage, and provides debugging information
 */
export function usePerformanceMonitor(
  componentName: string,
  options: PerformanceMonitorOptions = {}
) {
  const {
    enabled = process.env.NODE_ENV === 'development',
    threshold = 16, // 16ms = 60fps
    sampleRate = 0.1, // Sample 10% of renders
  } = options

  const renderStartRef = useRef<number>(0)
  const renderCountRef = useRef<number>(0)
  const slowRendersRef = useRef<number>(0)

  // Start performance measurement
  const startMeasurement = useCallback(() => {
    if (!enabled || Math.random() > sampleRate) return

    renderStartRef.current = performance.now()
  }, [enabled, sampleRate])

  // End performance measurement and log if needed
  const endMeasurement = useCallback(() => {
    if (!enabled || renderStartRef.current === 0) return

    const renderTime = performance.now() - renderStartRef.current
    renderCountRef.current++

    if (renderTime > threshold) {
      slowRendersRef.current++
    }

    // Get memory usage if available
    const memoryUsage = (performance as Performance & {memory?: {usedJSHeapSize: number}}).memory?.usedJSHeapSize

    const metrics: PerformanceMetrics = {
      renderTime,
      memoryUsage,
      componentName,
      timestamp: Date.now(),
    }

    // Log slow renders
    if (renderTime > threshold) {
      console.warn(
        `🐌 Slow render detected in ${componentName}: ${renderTime.toFixed(2)}ms`,
        metrics
      )
    }

    // Log performance summary every 100 renders
    if (renderCountRef.current % 100 === 0) {
      const slowRenderPercentage = (slowRendersRef.current / renderCountRef.current) * 100
      console.info(
        `📊 Performance summary for ${componentName}:`,
        {
          totalRenders: renderCountRef.current,
          slowRenders: slowRendersRef.current,
          slowRenderPercentage: `${slowRenderPercentage.toFixed(1)}%`,
          lastRenderTime: `${renderTime.toFixed(2)}ms`,
          memoryUsage: memoryUsage ? `${(memoryUsage / 1024 / 1024).toFixed(1)}MB` : 'N/A',
        }
      )
    }

    renderStartRef.current = 0
  }, [enabled, threshold, componentName])

  // Measure render performance
  useEffect(() => {
    startMeasurement()
    return endMeasurement
  })

  // Return performance utilities
  return {
    startMeasurement,
    endMeasurement,
    getRenderCount: () => renderCountRef.current,
    getSlowRenderCount: () => slowRendersRef.current,
    getSlowRenderPercentage: () => (slowRendersRef.current / renderCountRef.current) * 100,
  }
}

/**
 * Higher-order component for automatic performance monitoring
 */
export function withPerformanceMonitor<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
) {
  const PerformanceMonitoredComponent = (props: P) => {
    const name = componentName || Component.displayName || Component.name || 'Unknown'
    usePerformanceMonitor(name)
    
    return <Component {...props} />
  }

  PerformanceMonitoredComponent.displayName = `withPerformanceMonitor(${
    componentName || Component.displayName || Component.name
  })`

  return PerformanceMonitoredComponent
}

/**
 * Hook for measuring specific operations within components
 */
export function useOperationTimer(operationName: string) {
  const timersRef = useRef<Map<string, number>>(new Map())

  const startOperation = useCallback((id: string = 'default') => {
    const key = `${operationName}:${id}`
    timersRef.current.set(key, performance.now())
  }, [operationName])

  const endOperation = useCallback((id: string = 'default') => {
    const key = `${operationName}:${id}`
    const startTime = timersRef.current.get(key)
    
    if (startTime !== undefined) {
      const duration = performance.now() - startTime
      timersRef.current.delete(key)
      
      // Log slow operations
      if (duration > 100) { // 100ms threshold
        console.warn(
          `⏱️ Slow operation: ${operationName} (${id}) took ${duration.toFixed(2)}ms`
        )
      }
      
      return duration
    }
    
    return 0
  }, [operationName])

  return {
    startOperation,
    endOperation,
  }
}

/**
 * Hook for monitoring memory usage
 */
export function useMemoryMonitor(componentName: string, interval: number = 10000) {
  const memoryHistoryRef = useRef<number[]>([])

  useEffect(() => {
    if (!(performance as Performance & {memory?: {usedJSHeapSize: number}}).memory) {
      console.warn('Memory monitoring not available in this browser')
      return
    }

    const checkMemory = () => {
      const memoryUsage = (performance as Performance & {memory?: {usedJSHeapSize: number}}).memory!.usedJSHeapSize
      memoryHistoryRef.current.push(memoryUsage)
      
      // Keep only last 10 samples
      if (memoryHistoryRef.current.length > 10) {
        memoryHistoryRef.current.shift()
      }
      
      // Check for memory leaks (consistent increase over time)
      if (memoryHistoryRef.current.length >= 5) {
        const recent = memoryHistoryRef.current.slice(-5)
        const isIncreasing = recent.every((value, index) => 
          index === 0 || value >= recent[index - 1]
        )
        
        if (isIncreasing) {
          const increase = recent[recent.length - 1] - recent[0]
          const increaseMB = increase / 1024 / 1024
          
          if (increaseMB > 10) { // 10MB increase threshold
            console.warn(
              `🚨 Potential memory leak detected in ${componentName}: ${increaseMB.toFixed(1)}MB increase`
            )
          }
        }
      }
    }

    const intervalId = setInterval(checkMemory, interval)
    checkMemory() // Initial check

    return () => clearInterval(intervalId)
  }, [componentName, interval])

  return {
    getMemoryHistory: () => [...memoryHistoryRef.current],
    getCurrentMemoryUsage: () => (performance as Performance & {memory?: {usedJSHeapSize: number}}).memory?.usedJSHeapSize || 0,
  }
}

/**
 * Enhanced performance monitor with query statistics and recommendations
 */
export function useEnhancedPerformanceMonitor(componentName: string) {
  const [metrics, setMetrics] = useState<{
    renderTime: number
    componentMounts: number
    reRenders: number
    memoryUsage?: number
    queryStats: {
      successRate: number
      averageResponseTime: number
      cacheHitRate: number
      totalRequests: number
      errorRate: number
    }
    lastUpdated: number
  }>({
    renderTime: 0,
    componentMounts: 0,
    reRenders: 0,
    queryStats: {
      successRate: 0,
      averageResponseTime: 0,
      cacheHitRate: 0,
      totalRequests: 0,
      errorRate: 0
    },
    lastUpdated: Date.now()
  })

  const renderStart = useRef(performance.now())
  const renderCount = useRef(0)
  const mountTime = useRef(Date.now())
  const queryClient = useQueryClient()
  const { getMetrics } = usePerformanceMetrics()

  // Track component lifecycle and render performance
  useEffect(() => {
    const renderEnd = performance.now()
    const renderDuration = renderEnd - renderStart.current
    renderCount.current += 1

    setMetrics(prev => ({
      ...prev,
      componentMounts: prev.componentMounts + (renderCount.current === 1 ? 1 : 0),
      reRenders: renderCount.current,
      renderTime: renderDuration,
      lastUpdated: Date.now()
    }))

    // Reset render start time for next render
    renderStart.current = performance.now()
  })

  // Update query statistics
  useEffect(() => {
    const updateQueryStats = () => {
      const performanceMetrics = getMetrics()
      
      setMetrics(prev => ({
        ...prev,
        queryStats: {
          successRate: performanceMetrics.requestCount > 0 
            ? ((performanceMetrics.requestCount - (performanceMetrics.requestCount * performanceMetrics.errorRate / 100)) / performanceMetrics.requestCount) * 100
            : 0,
          averageResponseTime: performanceMetrics.averageResponseTime,
          cacheHitRate: performanceMetrics.cacheHitRate,
          totalRequests: performanceMetrics.requestCount,
          errorRate: performanceMetrics.errorRate
        },
        lastUpdated: Date.now()
      }))
    }

    // Update stats every 5 seconds
    const interval = setInterval(updateQueryStats, 5000)
    updateQueryStats() // Initial update

    return () => clearInterval(interval)
  }, [getMetrics])

  // Memory usage tracking
  const trackMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      setMetrics(prev => ({
        ...prev,
        memoryUsage: memory.usedJSHeapSize,
        lastUpdated: Date.now()
      }))
    }
  }, [])

  // Get React Query cache statistics
  const getQueryCacheStats = useCallback(() => {
    const queryCache = queryClient.getQueryCache()
    const queries = queryCache.getAll()
    
    const stats = queries.reduce((acc, query) => {
      acc.total++
      
      if (query.state.status === 'success') {
        acc.successful++
      } else if (query.state.status === 'error') {
        acc.failed++
      }
      
      if (query.state.dataUpdatedAt > 0) {
        acc.cached++
      }
      
      return acc
    }, { total: 0, successful: 0, failed: 0, cached: 0 })

    return {
      totalQueries: stats.total,
      successfulQueries: stats.successful,
      failedQueries: stats.failed,
      cachedQueries: stats.cached,
      cacheEfficiency: stats.total > 0 ? (stats.cached / stats.total) * 100 : 0
    }
  }, [queryClient])

  // Performance analysis
  const analyzePerformance = useCallback(() => {
    const analysis = {
      isPerformant: metrics.renderTime < 16, // 60fps = 16ms per frame
      renderEfficiency: metrics.reRenders > 0 ? metrics.componentMounts / metrics.reRenders : 1,
      memoryEfficient: metrics.memoryUsage ? metrics.memoryUsage < 50 * 1024 * 1024 : true, // < 50MB
      queryPerformance: {
        isHealthy: metrics.queryStats.errorRate < 5 && metrics.queryStats.averageResponseTime < 1000,
        cacheEffective: metrics.queryStats.cacheHitRate > 70
      }
    }

    return analysis
  }, [metrics])

  // Generate performance recommendations
  const getRecommendations = useCallback(() => {
    const analysis = analyzePerformance()
    const recommendations: string[] = []

    if (!analysis.isPerformant) {
      recommendations.push('Consider memoizing expensive computations with useMemo')
      recommendations.push('Use React.memo for component memoization')
    }

    if (analysis.renderEfficiency < 0.5) {
      recommendations.push('Reduce unnecessary re-renders with useCallback')
      recommendations.push('Check for proper dependency arrays in useEffect')
    }

    if (metrics.queryStats.cacheHitRate < 50) {
      recommendations.push('Increase staleTime for frequently accessed queries')
      recommendations.push('Consider implementing request deduplication')
    }

    if (metrics.queryStats.errorRate > 5) {
      recommendations.push('Implement better error handling and retry logic')
      recommendations.push('Add circuit breaker pattern for failing APIs')
    }

    if (metrics.queryStats.averageResponseTime > 1000) {
      recommendations.push('Optimize API endpoints or add pagination')
      recommendations.push('Consider implementing progressive loading')
    }

    return recommendations
  }, [analyzePerformance, metrics.queryStats])

  // Export comprehensive performance data
  const exportMetrics = useCallback(() => {
    const cacheStats = getQueryCacheStats()
    const analysis = analyzePerformance()
    const recommendations = getRecommendations()
    
    return {
      component: componentName,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - mountTime.current,
      metrics,
      cacheStats,
      analysis,
      recommendations
    }
  }, [componentName, metrics, getQueryCacheStats, analyzePerformance, getRecommendations])

  // Log performance issues in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const analysis = analyzePerformance()
      
      if (!analysis.isPerformant) {
        console.warn(`[${componentName}] Slow render detected: ${metrics.renderTime.toFixed(2)}ms`)
      }
      
      if (metrics.reRenders > 10 && analysis.renderEfficiency < 0.5) {
        console.warn(`[${componentName}] Excessive re-renders: ${metrics.reRenders}`)
      }
      
      if (metrics.queryStats.errorRate > 10) {
        console.warn(`[${componentName}] High query error rate: ${metrics.queryStats.errorRate.toFixed(1)}%`)
      }
    }
  }, [componentName, metrics, analyzePerformance])

  return {
    metrics,
    trackMemoryUsage,
    getQueryCacheStats,
    analyzePerformance,
    getRecommendations,
    exportMetrics
  }
}