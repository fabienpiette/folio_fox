// Error handling types for FolioFox frontend

export interface ErrorInfo {
  componentStack: string
  errorBoundary?: string
  errorBoundaryStack?: string
}

export interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

export type ErrorType = 
  | 'network'
  | 'authentication' 
  | 'authorization'
  | 'validation'
  | 'server'
  | 'timeout'
  | 'unknown'

export interface ApiError {
  type: ErrorType
  title: string
  message: string
  status?: number
  details?: string
  timestamp?: string
  requestId?: string
  retryable?: boolean
}

export interface RetryOptions {
  maxRetries?: number
  retryDelay?: number
  retryCallback?: () => Promise<void> | void
}

export interface EmptyStateConfig {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary'
  }
  illustration?: 'search' | 'downloads' | 'library' | 'error' | 'empty'
}

export interface LoadingStateConfig {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'spinner' | 'skeleton' | 'pulse'
  showMessage?: boolean
}

// Utility function to convert axios error to ApiError
export function createApiError(error: any): ApiError {
  if (error?.response) {
    const status = error.response.status
    const data = error.response.data
    
    return {
      type: getErrorType(status),
      title: data?.title || getDefaultTitle(status),
      message: data?.detail || data?.message || error.message || 'An unexpected error occurred',
      status,
      details: data?.errors ? JSON.stringify(data.errors) : undefined,
      timestamp: data?.timestamp || new Date().toISOString(),
      requestId: data?.request_id,
      retryable: isRetryable(status)
    }
  }

  if (error?.request) {
    return {
      type: 'network',
      title: 'Network Error',
      message: 'Unable to connect to the server. Please check your internet connection.',
      retryable: true
    }
  }

  return {
    type: 'unknown',
    title: 'Unexpected Error',
    message: error?.message || 'An unexpected error occurred',
    retryable: false
  }
}

function getErrorType(status: number): ErrorType {
  if (status === 401) return 'authentication'
  if (status === 403) return 'authorization'
  if (status === 408 || status === 504) return 'timeout'
  if (status >= 400 && status < 500) return 'validation'
  if (status >= 500) return 'server'
  return 'unknown'
}

function getDefaultTitle(status: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Authentication Required',
    403: 'Access Denied',
    404: 'Not Found',
    408: 'Request Timeout',
    422: 'Validation Error',
    429: 'Too Many Requests',
    500: 'Server Error',
    502: 'Service Unavailable',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  }
  
  return titles[status] || 'Error'
}

function isRetryable(status: number): boolean {
  // Retry on server errors, timeouts, and rate limits
  return status >= 500 || status === 408 || status === 429
}