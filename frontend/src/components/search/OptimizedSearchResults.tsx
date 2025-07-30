import React, { memo, useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { FixedSizeList as List } from 'react-window'
import { FixedSizeGrid as Grid } from 'react-window'
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
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
// import { useVirtualizer } from '@tanstack/react-virtual'

interface OptimizedSearchResultsProps {
  results: SearchResult[]
  isLoading: boolean
  error?: string
  onDownload: (result: SearchResult) => void
  onPreview?: (result: SearchResult) => void
  viewMode?: 'list' | 'grid'
  pageSize?: number
  hasNextPage?: boolean
  fetchNextPage?: () => void
  isFetchingNextPage?: boolean
}

// Memoized search result card component
const SearchResultCard = memo<{
  result: SearchResult
  onDownload: (result: SearchResult) => void
  onPreview?: (result: SearchResult) => void
  style?: React.CSSProperties
  index: number
}>(({ result, onDownload, onPreview, style, index }) => {
  const [imageError, setImageError] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Use intersection observer for lazy loading
  useIntersectionObserver(
    cardRef,
    useCallback(() => setIsVisible(true), []),
    {
      threshold: 0.1,
      rootMargin: '50px',
    }
  )

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDownload(result)
  }, [onDownload, result])

  const handlePreview = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onPreview?.(result)
  }, [onPreview, result])

  const qualityColor = useMemo(() => {
    if (result.quality_score >= 80) return 'text-success-400'
    if (result.quality_score >= 60) return 'text-warning-400'
    return 'text-error-400'
  }, [result.quality_score])

  const formatColor = useMemo(() => {
    const colors: Record<string, string> = {
      epub: 'bg-primary-500/20 text-primary-300',
      pdf: 'bg-error-500/20 text-error-300',
      mobi: 'bg-warning-500/20 text-warning-300',
      azw3: 'bg-success-500/20 text-success-300',
      txt: 'bg-dark-500/20 text-dark-300',
    }
    return colors[result.format.toLowerCase()] || 'bg-dark-500/20 text-dark-300'
  }, [result.format])

  // Optimize image loading with lazy loading
  const coverImage = useMemo(() => {
    if (!isVisible || !result.cover_url || imageError) {
      return (
        <div className="w-16 h-20 bg-dark-700 rounded border border-dark-600 flex items-center justify-center">
          <DocumentIcon className="h-8 w-8 text-dark-500" />
        </div>
      )
    }

    return (
      <img
        src={result.cover_url}
        alt={result.title}
        className="w-16 h-20 object-cover rounded border border-dark-600"
        onError={() => setImageError(true)}
        loading="lazy"
        decoding="async"
      />
    )
  }, [isVisible, result.cover_url, result.title, imageError])

  return (
    <div 
      ref={cardRef}
      className="card card-hover p-4 space-y-4 group"
      style={style}
      data-index={index}
    >
      <div className="flex space-x-4">
        {/* Book cover with lazy loading */}
        <div className="flex-shrink-0">
          {coverImage}
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
                  aria-label={`Preview ${result.title}`}
                >
                  <EyeIcon className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={handleDownload}
                className="btn btn-primary px-3 py-2 text-sm"
                title="Add to download queue"
                aria-label={`Download ${result.title}`}
              >
                <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                Download
              </button>
            </div>
          </div>

          {/* Description with lazy loading */}
          {isVisible && result.description && (
            <p className="text-dark-400 text-sm line-clamp-2 mb-3">
              {result.description}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex items-center space-x-4 text-sm">
            {/* Format */}
            <span className={cn(
              'px-2 py-1 rounded-full text-xs font-medium uppercase',
              formatColor
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
              <span className={qualityColor}>
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

          {/* Tags with lazy loading */}
          {isVisible && result.tags && result.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {result.tags.slice(0, 3).map((tag, tagIndex) => (
                <span
                  key={tagIndex}
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
})

SearchResultCard.displayName = 'SearchResultCard'

// Grid item component for grid view
const GridResultCard = memo<{
  result: SearchResult
  onDownload: (result: SearchResult) => void
  onPreview?: (result: SearchResult) => void
  style?: React.CSSProperties
}>(({ result, onDownload, onPreview, style }) => {
  const [imageError, setImageError] = useState(false)

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDownload(result)
  }, [onDownload, result])

  const handlePreview = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onPreview?.(result)
  }, [onPreview, result])

  return (
    <div className="card card-hover p-3 h-full flex flex-col" style={style}>
      {/* Cover image */}
      <div className="flex-shrink-0 mb-3">
        {result.cover_url && !imageError ? (
          <img
            src={result.cover_url}
            alt={result.title}
            className="w-full h-32 object-cover rounded"
            onError={() => setImageError(true)}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-32 bg-dark-700 rounded flex items-center justify-center">
            <DocumentIcon className="h-12 w-12 text-dark-500" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col">
        <h3 className="text-sm font-semibold text-dark-50 line-clamp-2 mb-1">
          {result.title}
        </h3>
        
        {result.author && (
          <p className="text-xs text-dark-300 mb-2 line-clamp-1">
            by {result.author}
          </p>
        )}

        <div className="flex-1" />

        {/* Metadata */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="px-2 py-1 rounded text-xs font-medium uppercase bg-primary-500/20 text-primary-300">
              {result.format}
            </span>
            <span className="text-dark-400">
              {result.quality_score}%
            </span>
          </div>

          {result.file_size_bytes && (
            <div className="text-dark-400">
              {formatFileSize(result.file_size_bytes)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex space-x-1 mt-3">
          {onPreview && (
            <button
              onClick={handlePreview}
              className="flex-1 p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-700 rounded transition-colors"
              title="Preview"
            >
              <EyeIcon className="h-4 w-4 mx-auto" />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="flex-1 btn btn-primary p-2 text-xs"
            title="Download"
          >
            <ArrowDownTrayIcon className="h-4 w-4 mx-auto" />
          </button>
        </div>
      </div>
    </div>
  )
})

GridResultCard.displayName = 'GridResultCard'

// Virtual list item renderer
const ListItemRenderer = memo<{
  index: number
  style: React.CSSProperties
  data: {
    results: SearchResult[]
    onDownload: (result: SearchResult) => void
    onPreview?: (result: SearchResult) => void
  }
}>(({ index, style, data }) => {
  const { results, onDownload, onPreview } = data

  if (index >= results.length) {
    return null
  }

  return (
    <SearchResultCard
      result={results[index]}
      onDownload={onDownload}
      onPreview={onPreview}
      style={style}
      index={index}
    />
  )
})

ListItemRenderer.displayName = 'ListItemRenderer'

// Virtual grid item renderer
const GridItemRenderer = memo<{
  columnIndex: number
  rowIndex: number
  style: React.CSSProperties
  data: {
    results: SearchResult[]
    onDownload: (result: SearchResult) => void
    onPreview?: (result: SearchResult) => void
    columnsPerRow: number
  }
}>(({ columnIndex, rowIndex, style, data }) => {
  const { results, onDownload, onPreview, columnsPerRow } = data
  const index = rowIndex * columnsPerRow + columnIndex

  if (index >= results.length) {
    return <div style={style} />
  }

  return (
    <div style={{ ...style, padding: '8px' }}>
      <GridResultCard
        result={results[index]}
        onDownload={onDownload}
        onPreview={onPreview}
      />
    </div>
  )
})

GridItemRenderer.displayName = 'GridItemRenderer'

// Infinite loading indicator
const LoadMoreIndicator = memo<{
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  fetchNextPage?: () => void
}>(({ hasNextPage, isFetchingNextPage, fetchNextPage }) => {
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useIntersectionObserver(
    loadMoreRef,
    useCallback(() => {
      if (hasNextPage && !isFetchingNextPage && fetchNextPage) {
        fetchNextPage()
      }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]),
    {
      threshold: 0.1,
      rootMargin: '100px',
    }
  )

  if (!hasNextPage && !isFetchingNextPage) {
    return null
  }

  return (
    <div ref={loadMoreRef} className="flex justify-center py-8">
      {isFetchingNextPage ? (
        <div className="flex items-center space-x-2">
          <LoadingSpinner size="sm" />
          <span className="text-dark-400">Loading more results...</span>
        </div>
      ) : (
        <button
          onClick={fetchNextPage}
          className="btn btn-secondary"
          disabled={!hasNextPage}
        >
          Load More Results
        </button>
      )}
    </div>
  )
})

LoadMoreIndicator.displayName = 'LoadMoreIndicator'

// Main optimized search results component
export const OptimizedSearchResults = memo<OptimizedSearchResultsProps>(({
  results,
  isLoading,
  error,
  onDownload,
  onPreview,
  viewMode = 'list',
  pageSize: _pageSize = 50,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setContainerSize({ width, height })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Memoize item data for virtual renderers
  const listItemData = useMemo(() => ({
    results,
    onDownload,
    onPreview,
  }), [results, onDownload, onPreview])

  const gridItemData = useMemo(() => {
    const columnsPerRow = Math.floor(containerSize.width / 280) || 1
    return {
      results,
      onDownload,
      onPreview,
      columnsPerRow,
    }
  }, [results, onDownload, onPreview, containerSize.width])

  // Calculate grid dimensions
  const { columnCount, rowCount } = useMemo(() => {
    const columnsPerRow = Math.floor(containerSize.width / 280) || 1
    const totalRows = Math.ceil(results.length / columnsPerRow)
    return {
      columnCount: columnsPerRow,
      rowCount: totalRows,
    }
  }, [results.length, containerSize.width])

  if (isLoading && results.length === 0) {
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

  if (results.length === 0 && !isLoading) {
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
    <div ref={containerRef} className="space-y-4 h-full">
      {/* Results header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-dark-300">
          {results.length} result{results.length !== 1 ? 's' : ''} found
          {hasNextPage && ' (showing first batch)'}
        </p>
      </div>

      {/* Virtual results */}
      {containerSize.width > 0 && (
        <div className="flex-1" style={{ height: 'calc(100vh - 300px)' }}>
          {viewMode === 'list' ? (
            <List
              height={containerSize.height || 600}
              itemCount={results.length}
              itemSize={180}
              itemData={listItemData}
              width="100%"
              overscanCount={5}
            >
              {ListItemRenderer}
            </List>
          ) : (
            <Grid
              height={containerSize.height || 600}
              width={containerSize.width}
              columnCount={columnCount}
              rowCount={rowCount}
              columnWidth={280}
              rowHeight={400}
              itemData={gridItemData}
              overscanRowCount={2}
              overscanColumnCount={2}
            >
              {GridItemRenderer}
            </Grid>
          )}
        </div>
      )}

      {/* Infinite loading */}
      <LoadMoreIndicator
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    </div>
  )
})

OptimizedSearchResults.displayName = 'OptimizedSearchResults'