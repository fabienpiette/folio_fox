import { useEffect, useRef, useCallback } from 'react'

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
    const memoryUsage = (performance as any).memory?.usedJSHeapSize

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
    if (!(performance as any).memory) {
      console.warn('Memory monitoring not available in this browser')
      return
    }

    const checkMemory = () => {
      const memoryUsage = (performance as any).memory.usedJSHeapSize
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
    getCurrentMemoryUsage: () => (performance as any).memory?.usedJSHeapSize || 0,
  }
}