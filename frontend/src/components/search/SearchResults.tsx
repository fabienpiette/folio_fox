import { useState } from 'react'
import { 
  ArrowDownTrayIcon,
  StarIcon,
  ClockIcon,
  ServerIcon,
  DocumentIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import { SearchResult } from '@/types'
import { formatFileSize, formatRelativeTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import { LoadingSpinner } from '@/components/ui/feedback/LoadingSpinner'

interface SearchResultsProps {
  results: SearchResult[]
  isLoading: boolean
  error?: string
  onDownload: (result: SearchResult) => void
  onPreview?: (result: SearchResult) => void
}

interface SearchResultCardProps {
  result: SearchResult
  onDownload: (result: SearchResult) => void
  onPreview?: (result: SearchResult) => void
}

function SearchResultCard({ result, onDownload, onPreview }: SearchResultCardProps) {
  const [imageError, setImageError] = useState(false)

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDownload(result)
  }

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation()
    onPreview?.(result)
  }

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-success-400'
    if (score >= 60) return 'text-warning-400'
    return 'text-error-400'
  }

  const getFormatColor = (format: string) => {
    const colors: Record<string, string> = {
      epub: 'bg-primary-500/20 text-primary-300',
      pdf: 'bg-error-500/20 text-error-300',
      mobi: 'bg-warning-500/20 text-warning-300',
      azw3: 'bg-success-500/20 text-success-300',
      txt: 'bg-dark-500/20 text-dark-300',
    }
    return colors[format.toLowerCase()] || 'bg-dark-500/20 text-dark-300'
  }

  return (
    <div className="card card-hover p-4 space-y-4 group">
      <div className="flex space-x-4">
        {/* Book cover */}
        <div className="flex-shrink-0">
          {result.cover_url && !imageError ? (
            <img
              src={result.cover_url}
              alt={result.title}
              className="w-16 h-20 object-cover rounded border border-dark-600"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-16 h-20 bg-dark-700 rounded border border-dark-600 flex items-center justify-center">
              <DocumentIcon className="h-8 w-8 text-dark-500" />
            </div>
          )}
        </div>

        {/* Book details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-dark-50 line-clamp-2 mb-1">
                {result.title}
              </h3>
              {result.author && (
                <p className="text-dark-300 text-sm mb-2">
                  by {result.author}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2 ml-4">
              {onPreview && (
                <button
                  onClick={handlePreview}
                  className="p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded-md transition-colors"
                  title="Preview details"
                >
                  <EyeIcon className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={handleDownload}
                className="btn btn-primary px-3 py-2 text-sm"
                title="Add to download queue"
              >
                <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                Download
              </button>
            </div>
          </div>

          {/* Description */}
          {result.description && (
            <p className="text-dark-400 text-sm line-clamp-2 mb-3">
              {result.description}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex items-center space-x-4 text-sm">
            {/* Format */}
            <span className={cn(
              'px-2 py-1 rounded-full text-xs font-medium uppercase',
              getFormatColor(result.format)
            )}>
              {result.format}
            </span>

            {/* File size */}
            {result.file_size_bytes && (
              <span className="text-dark-400">
                {formatFileSize(result.file_size_bytes)}
              </span>
            )}

            {/* Quality */}
            <div className="flex items-center space-x-1">
              <StarIcon className="h-4 w-4 text-dark-500" />
              <span className={getQualityColor(result.quality_score)}>
                {result.quality_score}%
              </span>
            </div>

            {/* Language */}
            {result.language && (
              <span className="text-dark-400 uppercase">
                {result.language}
              </span>
            )}

            {/* Publication year */}
            {result.publication_year && (
              <span className="text-dark-400">
                {result.publication_year}
              </span>
            )}
          </div>

          {/* Bottom row - indexer and time */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-700">
            <div className="flex items-center space-x-2 text-xs text-dark-500">
              <ServerIcon className="h-4 w-4" />
              <span>{result.indexer_name}</span>
            </div>
            <div className="flex items-center space-x-1 text-xs text-dark-500">
              <ClockIcon className="h-4 w-4" />
              <span>{formatRelativeTime(result.found_at)}</span>
            </div>
          </div>

          {/* Tags */}
          {result.tags && result.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {result.tags.slice(0, 3).map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 text-xs bg-dark-700 text-dark-300 rounded"
                >
                  {tag}
                </span>
              ))}
              {result.tags.length > 3 && (
                <span className="px-2 py-1 text-xs text-dark-500">
                  +{result.tags.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function SearchResults({
  results,
  isLoading,
  error,
  onDownload,
  onPreview,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mb-4" />
          <p className="text-dark-400">Searching across indexers...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-error-400 mb-2">Search Error</div>
        <p className="text-dark-400">{error}</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <DocumentIcon className="h-12 w-12 text-dark-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-dark-300 mb-2">No results found</h3>
        <p className="text-dark-500">
          Try adjusting your search terms or filters
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Results header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-dark-300">
          {results.length} result{results.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Results list */}
      <div className="space-y-4">
        {results.map((result, index) => (
          <SearchResultCard
            key={`${result.indexer_id}-${index}`}
            result={result}
            onDownload={onDownload}
            onPreview={onPreview}
          />
        ))}
      </div>
    </div>
  )
}