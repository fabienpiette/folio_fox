import { useState, useCallback } from 'react'
import { cn } from '@/utils/cn'
import { ApiError, RetryOptions } from '@/types/errors'
import { LoadingSpinner } from './LoadingSpinner'

interface ApiErrorDisplayProps {
  error: ApiError
  onRetry?: () => Promise<any> | void
  retryOptions?: RetryOptions
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'inline' | 'card' | 'banner'
  showDetails?: boolean
  onDismiss?: () => void
}

const ErrorIcons = {
  network: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  ),
  authentication: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  authorization: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
  validation: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  server: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  timeout: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  unknown: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  )
}

export function ApiErrorDisplay({ 
  error, 
  onRetry, 
  retryOptions,
  className,
  size = 'md',
  variant = 'card',
  showDetails = false,
  onDismiss
}: ApiErrorDisplayProps) {
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [showFullDetails, setShowFullDetails] = useState(false)

  const maxRetries = retryOptions?.maxRetries ?? 3
  const canRetry = error.retryable && onRetry && retryCount < maxRetries

  const handleRetry = useCallback(async () => {
    if (!onRetry || isRetrying) return

    setIsRetrying(true)
    try {
      await new Promise(resolve => setTimeout(resolve, retryOptions?.retryDelay ?? 1000))
      await onRetry()
      setRetryCount(prev => prev + 1)
    } catch (retryError) {
      console.error('Retry failed:', retryError)
      setRetryCount(prev => prev + 1)
    } finally {
      setIsRetrying(false)
    }
  }, [onRetry, isRetrying, retryOptions?.retryDelay])

  const getVariantStyles = () => {
    switch (variant) {
      case 'inline':
        return 'p-3 bg-error-500/10 border border-error-500/20 rounded-lg'
      case 'banner':
        return 'p-4 bg-error-500/10 border-l-4 border-error-500'
      case 'card':
      default:
        return 'p-6 bg-dark-800 border border-dark-700 rounded-lg shadow-lg'
    }
  }

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return 'text-sm'
      case 'lg':
        return 'text-lg'
      case 'md':
      default:
        return 'text-base'
    }
  }

  const icon = ErrorIcons[error.type] || ErrorIcons.unknown

  return (
    <div className={cn(
      getVariantStyles(),
      getSizeStyles(),
      className
    )}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <div className="text-error-400" aria-hidden="true">
            {icon}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-error-300 font-semibold">
                {error.title}
              </h3>
              <p className="mt-1 text-dark-300">
                {error.message}
              </p>

              {error.status && (
                <p className="mt-1 text-sm text-dark-400">
                  Error Code: {error.status}
                </p>
              )}

              {(showDetails || showFullDetails) && (error.details || error.requestId || error.timestamp) && (
                <div className="mt-3 space-y-2">
                  {error.requestId && (
                    <div className="text-xs text-dark-400">
                      <span className="font-medium">Request ID:</span> {error.requestId}
                    </div>
                  )}
                  {error.timestamp && (
                    <div className="text-xs text-dark-400">
                      <span className="font-medium">Time:</span> {new Date(error.timestamp).toLocaleString()}
                    </div>
                  )}
                  {error.details && (
                    <div className="text-xs text-dark-400">
                      <span className="font-medium">Details:</span>
                      <pre className="mt-1 bg-dark-900 p-2 rounded text-xs overflow-x-auto">
                        {error.details}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="flex-shrink-0 ml-4 text-dark-500 hover:text-dark-400 transition-colors focus:outline-none focus:ring-2 focus:ring-dark-500 rounded"
                aria-label="Dismiss error"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {canRetry && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="inline-flex items-center px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-800"
              >
                {isRetrying ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry ({retryCount}/{maxRetries})
                  </>
                )}
              </button>
            )}

            {showDetails && (error.details || error.requestId || error.timestamp) && (
              <button
                onClick={() => setShowFullDetails(!showFullDetails)}
                className="text-sm text-dark-400 hover:text-dark-300 transition-colors focus:outline-none focus:ring-2 focus:ring-dark-500 rounded"
              >
                {showFullDetails ? 'Hide Details' : 'Show Details'}
              </button>
            )}

            {error.type === 'network' && (
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-dark-400 hover:text-dark-300 transition-colors focus:outline-none focus:ring-2 focus:ring-dark-500 rounded"
              >
                Refresh Page
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Utility component for inline error messages
export function InlineError({ 
  message, 
  className 
}: { 
  message: string
  className?: string 
}) {
  return (
    <div className={cn(
      'flex items-center space-x-2 text-error-400 text-sm',
      className
    )}>
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{message}</span>
    </div>
  )
}

// Hook for managing API error state
export function useApiError() {
  const [error, setError] = useState<ApiError | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const clearError = useCallback(() => {
    setError(null)
    setRetryCount(0)
  }, [])

  const handleError = useCallback((err: any) => {
    // Convert error to ApiError format
    const apiError: ApiError = err.isApiError ? err : {
      type: 'unknown',
      title: 'Error',
      message: err.message || 'An unexpected error occurred',
      retryable: false
    }
    
    setError(apiError)
  }, [])

  const incrementRetry = useCallback(() => {
    setRetryCount(prev => prev + 1)
  }, [])

  return {
    error,
    retryCount,
    clearError,
    handleError,
    incrementRetry,
    hasError: error !== null
  }
}