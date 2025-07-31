import React from 'react'
import { cn } from '@/utils/cn'
import { LoadingStateConfig } from '@/types/errors'
import { LoadingSpinner } from './LoadingSpinner'

interface LoadingStateDisplayProps {
  config?: LoadingStateConfig
  className?: string
}

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
}

function Skeleton({ 
  className, 
  variant = 'rectangular',
  width,
  height 
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-dark-600'
  
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded'
  }

  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  return (
    <div 
      className={cn(baseClasses, variantClasses[variant], className)}
      style={style}
      aria-hidden="true"
    />
  )
}

export function LoadingStateDisplay({ 
  config = {}, 
  className 
}: LoadingStateDisplayProps) {
  const {
    message = 'Loading...',
    size = 'md',
    variant = 'spinner',
    showMessage = true
  } = config

  const renderContent = () => {
    switch (variant) {
      case 'skeleton':
        return <SkeletonLoader />
      case 'pulse':
        return <PulseLoader message={showMessage ? message : undefined} />
      case 'spinner':
      default:
        return (
          <div className="flex flex-col items-center justify-center space-y-4">
            <LoadingSpinner size={size} />
            {showMessage && (
              <p className="text-dark-400 text-sm font-medium" role="status" aria-live="polite">
                {message}
              </p>
            )}
          </div>
        )
    }
  }

  return (
    <div className={cn(
      'flex items-center justify-center py-12',
      className
    )}>
      {renderContent()}
    </div>
  )
}

// Skeleton loader for list items
function SkeletonLoader() {
  return (
    <div className="w-full max-w-md space-y-4" aria-hidden="true">
      {[1, 2, 3].map(i => (
        <div key={i} className="space-y-3">
          <div className="flex items-center space-x-3">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" height={16} width="75%" />
              <Skeleton variant="text" height={12} width="50%" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Pulse loader with optional message
function PulseLoader({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="relative">
        <div className="w-12 h-12 bg-primary-600 rounded-full animate-pulse-slow"></div>
        <div className="absolute inset-0 w-12 h-12 bg-primary-400 rounded-full animate-pulse-slow animation-delay-200"></div>
        <div className="absolute inset-0 w-12 h-12 bg-primary-200 rounded-full animate-pulse-slow animation-delay-400"></div>
      </div>
      {message && (
        <p className="text-dark-400 text-sm font-medium" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  )
}

// Specific loading components for different scenarios
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-4 gap-4 items-center py-3">
          <Skeleton height={16} />
          <Skeleton height={16} width="80%" />
          <Skeleton height={16} width="60%" />
          <Skeleton height={24} width={60} />
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-6 space-y-4">
          <Skeleton height={20} width="70%" />
          <Skeleton height={16} />
          <Skeleton height={16} width="85%" />
          <div className="flex justify-between items-center pt-2">
            <Skeleton height={14} width="40%" />
            <Skeleton height={32} width={80} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function StatCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-6">
          <div className="flex items-center">
            <Skeleton variant="circular" width={48} height={48} />
            <div className="ml-4 space-y-2 flex-1">
              <Skeleton height={14} width="60%" />
              <Skeleton height={24} width="40%" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ 
  items = 5, 
  showAvatar = true,
  showSecondaryText = true 
}: { 
  items?: number
  showAvatar?: boolean
  showSecondaryText?: boolean
}) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3 py-2">
          {showAvatar && (
            <Skeleton variant="circular" width={32} height={32} />
          )}
          <div className="flex-1 space-y-1">
            <Skeleton height={16} width="70%" />
            {showSecondaryText && (
              <Skeleton height={12} width="50%" />
            )}
          </div>
          <Skeleton height={20} width={60} />
        </div>
      ))}
    </div>
  )
}

// Loading states for specific dashboard components
export function DashboardStatsLoading() {
  return <StatCardSkeleton count={4} />
}

export function RecentDownloadsLoading() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <Skeleton height={20} width={140} />
        <Skeleton height={16} width={60} />
      </div>
      <ListSkeleton items={5} showAvatar={false} />
    </div>
  )
}

export function SystemStatusLoading() {
  return (
    <div className="card">
      <div className="mb-4">
        <Skeleton height={20} width={120} />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton height={16} width={80} />
            <div className="flex items-center space-x-2">
              <Skeleton variant="circular" width={12} height={12} />
              <Skeleton height={12} width={50} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Inline loading components
export function InlineSpinner({ 
  size = 'sm',
  message,
  className 
}: {
  size?: 'sm' | 'md' | 'lg'
  message?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <LoadingSpinner size={size} />
      {message && (
        <span className="text-dark-400 text-sm">{message}</span>
      )}
    </div>
  )
}

export function ButtonSpinner({ 
  children,
  isLoading,
  loadingText = 'Loading...',
  className,
  ...props
}: {
  children: React.ReactNode
  isLoading: boolean
  loadingText?: string
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center',
        className
      )}
      disabled={isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size="sm" className="mr-2" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  )
}

// Loading overlay for content areas
export function LoadingOverlay({ 
  isLoading,
  children,
  message = 'Loading...',
  className
}: {
  isLoading: boolean
  children: React.ReactNode
  message?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-dark-900/50 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="flex flex-col items-center space-y-4 text-center">
            <LoadingSpinner size="lg" />
            <p className="text-dark-200 font-medium">{message}</p>
          </div>
        </div>
      )}
    </div>
  )
}