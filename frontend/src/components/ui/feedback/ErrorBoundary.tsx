import React, { Component, ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { ErrorBoundaryState, ErrorInfo } from '@/types/errors'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  className?: string
  showDetails?: boolean
}

interface ErrorDisplayProps {
  error: Error
  errorInfo: ErrorInfo | null
  onReset: () => void
  showDetails: boolean
  className?: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error, errorInfo)
    
    this.setState({
      errorInfo
    })

    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo)

    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: sendErrorToReportingService(error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <ErrorDisplay
          error={this.state.error!}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
          showDetails={this.props.showDetails ?? process.env.NODE_ENV === 'development'}
          className={this.props.className}
        />
      )
    }

    return this.props.children
  }
}

function ErrorDisplay({ error, errorInfo, onReset, showDetails, className }: ErrorDisplayProps) {
  const [showFullDetails, setShowFullDetails] = React.useState(false)

  return (
    <div className={cn(
      'min-h-[400px] flex items-center justify-center p-6',
      className
    )}>
      <div className="max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-error-500/20 rounded-full flex items-center justify-center mb-4">
            <svg 
              className="w-8 h-8 text-error-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" 
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-dark-50 mb-2">
            Something went wrong
          </h2>
          <p className="text-dark-400 mb-6">
            An unexpected error occurred while rendering this component. 
            Please try refreshing the page or contact support if the problem persists.
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={onReset}
            className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-800"
          >
            Try Again
          </button>

          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2 bg-dark-700 hover:bg-dark-600 text-dark-200 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-dark-500 focus:ring-offset-2 focus:ring-offset-dark-800"
          >
            Refresh Page
          </button>

          {showDetails && (
            <div className="border-t border-dark-700 pt-4">
              <button
                onClick={() => setShowFullDetails(!showFullDetails)}
                className="text-sm text-dark-400 hover:text-dark-300 transition-colors focus:outline-none focus:ring-2 focus:ring-dark-500 rounded"
                aria-expanded={showFullDetails}
                aria-controls="error-details"
              >
                {showFullDetails ? 'Hide' : 'Show'} Error Details
              </button>

              {showFullDetails && (
                <div id="error-details" className="mt-3 space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-dark-300 mb-1">
                      Error Message
                    </h4>
                    <div className="bg-dark-800 rounded-lg p-3 text-sm text-error-300 font-mono overflow-x-auto">
                      {error.message}
                    </div>
                  </div>

                  {error.stack && (
                    <div>
                      <h4 className="text-sm font-medium text-dark-300 mb-1">
                        Stack Trace
                      </h4>
                      <div className="bg-dark-800 rounded-lg p-3 text-xs text-dark-400 font-mono overflow-x-auto max-h-48 overflow-y-auto">
                        <pre className="whitespace-pre-wrap">{error.stack}</pre>
                      </div>
                    </div>
                  )}

                  {errorInfo?.componentStack && (
                    <div>
                      <h4 className="text-sm font-medium text-dark-300 mb-1">
                        Component Stack
                      </h4>
                      <div className="bg-dark-800 rounded-lg p-3 text-xs text-dark-400 font-mono overflow-x-auto max-h-48 overflow-y-auto">
                        <pre className="whitespace-pre-wrap">{errorInfo.componentStack}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Higher-order component for easy wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  
  return WrappedComponent
}