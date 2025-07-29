import { beforeEach, afterEach } from 'vitest'

// Performance test specific setup
beforeEach(() => {
  // Clear performance marks and measures
  if (typeof performance !== 'undefined') {
    performance.clearMarks()
    performance.clearMeasures()
  }
  
  // Ensure garbage collection before performance tests (if available)
  if (global.gc) {
    global.gc()
  }
})

afterEach(() => {
  // Log performance metrics if needed
  if (typeof performance !== 'undefined') {
    const marks = performance.getEntriesByType('mark')
    const measures = performance.getEntriesByType('measure')
    
    if (marks.length > 0 || measures.length > 0) {
      console.log('Performance metrics:', { marks, measures })
    }
  }
})