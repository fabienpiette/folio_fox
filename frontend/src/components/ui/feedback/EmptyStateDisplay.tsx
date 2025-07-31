import React from 'react'
import { cn } from '@/utils/cn'
import { EmptyStateConfig } from '@/types/errors'

interface EmptyStateDisplayProps {
  config: EmptyStateConfig
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const EmptyStateIllustrations = {
  search: (
    <svg className="w-24 h-24 mx-auto text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  downloads: (
    <svg className="w-24 h-24 mx-auto text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
    </svg>
  ),
  library: (
    <svg className="w-24 h-24 mx-auto text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  error: (
    <svg className="w-24 h-24 mx-auto text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  empty: (
    <svg className="w-24 h-24 mx-auto text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

export function EmptyStateDisplay({ 
  config, 
  className,
  size = 'md'
}: EmptyStateDisplayProps) {
  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          container: 'py-8',
          title: 'text-lg',
          description: 'text-sm',
          button: 'px-3 py-1.5 text-sm'
        }
      case 'lg':
        return {
          container: 'py-16',
          title: 'text-3xl',
          description: 'text-lg',
          button: 'px-6 py-3 text-lg'
        }
      case 'md':
      default:
        return {
          container: 'py-12',
          title: 'text-xl',
          description: 'text-base',
          button: 'px-4 py-2 text-base'
        }
    }
  }

  const styles = getSizeStyles()
  const illustration = config.illustration && EmptyStateIllustrations[config.illustration]

  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      styles.container,
      className
    )}>
      {/* Icon or Illustration */}
      <div className="mb-6">
        {config.icon || illustration || EmptyStateIllustrations.empty}
      </div>

      {/* Title */}
      <h3 className={cn(
        'font-semibold text-dark-200 mb-2',
        styles.title
      )}>
        {config.title}
      </h3>

      {/* Description */}
      {config.description && (
        <p className={cn(
          'text-dark-400 mb-6 max-w-md',
          styles.description
        )}>
          {config.description}
        </p>
      )}

      {/* Action Button */}
      {config.action && (
        <button
          onClick={config.action.onClick}
          className={cn(
            'font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-800',
            styles.button,
            config.action.variant === 'secondary'
              ? 'bg-dark-700 hover:bg-dark-600 text-dark-200 focus:ring-dark-500'
              : 'bg-primary-600 hover:bg-primary-700 text-white focus:ring-primary-500'
          )}
        >
          {config.action.label}
        </button>
      )}
    </div>
  )
}

// Preset empty state configurations
export const EmptyStatePresets = {
  noSearchResults: (query?: string): EmptyStateConfig => ({
    title: 'No results found',
    description: query 
      ? `We couldn't find any books matching "${query}". Try adjusting your search terms or filters.`
      : 'Try searching for books using the search bar above.',
    illustration: 'search',
    action: {
      label: 'Clear Filters',
      onClick: () => window.location.search = '',
      variant: 'secondary' as const
    }
  }),

  noDownloads: (): EmptyStateConfig => ({
    title: 'No downloads yet',
    description: 'Your download queue is empty. Start by searching for books and adding them to your queue.',
    illustration: 'downloads',
    action: {
      label: 'Browse Library',
      onClick: () => window.location.href = '/search',
      variant: 'primary' as const
    }
  }),

  emptyLibrary: (): EmptyStateConfig => ({
    title: 'Your library is empty',
    description: 'Start building your digital library by searching for and downloading books.',
    illustration: 'library',
    action: {
      label: 'Search Books',
      onClick: () => window.location.href = '/search',
      variant: 'primary' as const
    }
  }),

  noRecentActivity: (): EmptyStateConfig => ({
    title: 'No recent activity',
    description: 'When you download books or use the search feature, your recent activity will appear here.',
    illustration: 'empty'
  }),

  connectionError: (onRetry?: () => void): EmptyStateConfig => ({
    title: 'Unable to load data',
    description: 'There was a problem connecting to the server. Please check your internet connection and try again.',
    illustration: 'error',
    action: onRetry ? {
      label: 'Try Again',
      onClick: onRetry,
      variant: 'primary' as const
    } : undefined
  }),

  noIndexers: (): EmptyStateConfig => ({
    title: 'No indexers configured',
    description: 'Add indexers to start searching for books. Go to settings to configure your first indexer.',
    illustration: 'error',
    action: {
      label: 'Configure Indexers',
      onClick: () => window.location.href = '/config',
      variant: 'primary' as const
    }
  }),

  maintenanceMode: (): EmptyStateConfig => ({
    title: 'System maintenance',
    description: 'The system is currently undergoing maintenance. Please try again later.',
    illustration: 'error'
  })
}

// Convenience components for common empty states
export function NoSearchResults({ query, onClearFilters }: { 
  query?: string
  onClearFilters?: () => void 
}) {
  const config = EmptyStatePresets.noSearchResults(query)
  if (onClearFilters) {
    config.action!.onClick = onClearFilters
  }
  return <EmptyStateDisplay config={config} />
}

export function NoDownloads() {
  return <EmptyStateDisplay config={EmptyStatePresets.noDownloads()} />
}

export function EmptyLibrary() {
  return <EmptyStateDisplay config={EmptyStatePresets.emptyLibrary()} />
}

export function NoRecentActivity() {
  return <EmptyStateDisplay config={EmptyStatePresets.noRecentActivity()} />
}

export function ConnectionError({ onRetry }: { onRetry?: () => void }) {
  return <EmptyStateDisplay config={EmptyStatePresets.connectionError(onRetry)} />
}

export function NoIndexers() {
  return <EmptyStateDisplay config={EmptyStatePresets.noIndexers()} />
}

export function MaintenanceMode() {
  return <EmptyStateDisplay config={EmptyStatePresets.maintenanceMode()} />
}