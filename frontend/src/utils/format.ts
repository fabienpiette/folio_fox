import { format, formatDistance, parseISO } from 'date-fns'

/**
 * Format file size in bytes to human readable format
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return '0 B'
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

/**
 * Format download speed in bytes per second to human readable format
 */
export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (!bytesPerSecond || bytesPerSecond === 0) return '0 B/s'
  
  const speeds = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(1024))
  
  return `${(bytesPerSecond / Math.pow(1024, i)).toFixed(1)} ${speeds[i]}`
}

/**
 * Format duration in seconds to human readable format
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '0s'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  } else {
    return `${remainingSeconds}s`
  }
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date
  return formatDistance(parsedDate, new Date(), { addSuffix: true })
}

/**
 * Format date to absolute time (e.g., "Dec 25, 2023 at 3:45 PM")
 */
export function formatAbsoluteTime(date: string | Date): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date
  return format(parsedDate, 'MMM d, yyyy \'at\' h:mm a')
}

/**
 * Format date to short format (e.g., "Dec 25, 2023")
 */
export function formatDate(date: string | Date): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date
  return format(parsedDate, 'MMM d, yyyy')
}

/**
 * Format progress percentage
 */
export function formatProgress(progress: number | null | undefined): string {
  if (progress === null || progress === undefined) return '0%'
  return `${Math.round(progress)}%`
}

/**
 * Format rating (e.g., 4.5 → "4.5 ★")
 */
export function formatRating(rating: number | null | undefined): string {
  if (!rating) return 'No rating'
  return `${rating.toFixed(1)} ★`
}

/**
 * Format author names from array
 */
export function formatAuthors(authors: Array<{ name: string; role?: string }>): string {
  if (!authors || authors.length === 0) return 'Unknown Author'
  
  const primaryAuthors = authors.filter(a => !a.role || a.role === 'author')
  if (primaryAuthors.length === 0) return authors[0].name
  
  return primaryAuthors.map(a => a.name).join(', ')
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Format quality score as percentage
 */
export function formatQuality(score: number): string {
  return `${score}%`
}

/**
 * Format download status for display
 */
export function formatDownloadStatus(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'downloading':
      return 'Downloading'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'paused':
      return 'Paused'
    default:
      return status.charAt(0).toUpperCase() + status.slice(1)
  }
}