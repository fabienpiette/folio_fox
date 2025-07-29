import { useEffect, useRef, RefObject } from 'react'

interface IntersectionObserverOptions {
  threshold?: number | number[]
  rootMargin?: string
  root?: Element | null
}

/**
 * Custom hook for intersection observer functionality
 * Optimized for performance with proper cleanup and modern API usage
 */
export function useIntersectionObserver<T extends Element>(
  elementRef: RefObject<T>,
  callback: (entry: IntersectionObserverEntry) => void,
  options: IntersectionObserverOptions = {}
) {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const callbackRef = useRef(callback)

  // Keep callback reference up to date
  callbackRef.current = callback

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    // Create intersection observer with optimized settings
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          callbackRef.current(entry)
        })
      },
      {
        threshold: options.threshold ?? 0.1,
        rootMargin: options.rootMargin ?? '0px',
        root: options.root ?? null,
      }
    )

    // Start observing
    observerRef.current.observe(element)

    // Cleanup function
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [elementRef, options.threshold, options.rootMargin, options.root])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])
}