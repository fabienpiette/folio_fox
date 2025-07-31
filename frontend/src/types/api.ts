// API Response Types based on OpenAPI specification

export interface ApiResponse<T = unknown> {
  data: T
  message?: string
  timestamp: string
}

export interface PaginationInfo {
  current_page: number
  per_page: number
  total_pages: number
  total_items: number
  has_next: boolean
  has_prev: boolean
  next_page: number | null
  prev_page: number | null
}

export interface ErrorResponse {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: Array<{
    field: string
    code: string
    message: string
  }>
  timestamp: string
  request_id: string
}

// User & Authentication Types
export interface User {
  id: number
  username: string
  email: string | null
  is_active: boolean
  is_admin: boolean
  last_login: string | null
  created_at: string
  updated_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  user: User
}

export interface LoginRequest {
  username: string
  password: string
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: string
  timezone: string
  notifications_enabled: boolean
  auto_download: boolean
  preferred_quality_profile_id: number | null
  default_download_folder_id: number | null
}

// Book & Library Types
export interface Book {
  id: number
  title: string
  subtitle: string | null
  description: string | null
  isbn_10: string | null
  isbn_13: string | null
  asin: string | null
  goodreads_id: string | null
  google_books_id: string | null
  publication_date: string | null
  page_count: number | null
  language: {
    id: number
    code: string
    name: string
  } | null
  publisher: {
    id: number
    name: string
  } | null
  series: {
    id: number
    name: string
    total_books: number | null
  } | null
  series_position: number | null
  authors: Array<{
    id: number
    name: string
    role: 'author' | 'editor' | 'translator' | 'illustrator'
  }>
  genres: Array<{
    id: number
    name: string
  }>
  rating_average: number | null
  rating_count: number
  tags: string[]
  cover_url: string | null
  cover_local_path: string | null
  available_formats: number
  created_at: string
  updated_at: string
}

export interface BookFile {
  id: number
  format: {
    id: number
    name: string
    mime_type: string
  }
  file_path: string | null
  file_size_bytes: number
  quality_score: number
  source_url: string | null
  download_date: string | null
  checksum: string | null
  is_primary: boolean
  created_at: string
}

export interface BookDetails extends Book {
  files: BookFile[]
  download_history?: DownloadHistoryItem[]
}

export interface BooksResponse {
  books: Book[]
  pagination: PaginationInfo
  total_count: number
}

// Search Types
export interface SearchResult {
  indexer_id: number
  indexer_name: string
  title: string
  author: string
  description: string | null
  format: string
  file_size_bytes: number | null
  file_size_human: string
  quality_score: number
  download_url: string
  source_url: string | null
  language: string | null
  publication_year: number | null
  isbn: string | null
  cover_url: string | null
  tags: string[]
  metadata: Record<string, unknown>
  found_at: string
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  total_results: number
  indexers_searched: Array<{
    indexer_id: number
    indexer_name: string
    result_count: number
    response_time_ms: number
    error: string | null
  }>
  search_duration_ms: number
  cached: boolean
  cache_expires_at: string | null
}

export interface SearchSuggestion {
  text: string
  type: 'title' | 'author' | 'series' | 'genre'
  count: number
}

export interface SearchHistoryEntry {
  id: number
  query: string
  filters: Record<string, unknown>
  results_count: number
  indexers_searched: number[]
  search_duration_ms: number
  searched_at: string
}

// Download Types
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'paused'

export interface DownloadQueueItem {
  id: number
  user: {
    id: number
    username: string
  }
  book_id: number | null
  indexer: {
    id: number
    name: string
  }
  title: string
  author_name: string | null
  download_url: string
  file_format: string
  file_size_bytes: number | null
  file_size_human: string | null
  priority: number
  status: DownloadStatus
  progress_percentage: number
  download_path: string | null
  quality_profile: {
    id: number
    name: string
  } | null
  retry_count: number
  max_retries: number
  error_message: string | null
  estimated_completion: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface DownloadDetails extends DownloadQueueItem {
  download_speed_kbps: number | null
  eta_seconds: number | null
  bytes_downloaded: number
  connection_info: {
    remote_host: string
    connection_type: 'http' | 'https' | 'ftp' | 'torrent'
    user_agent: string
  } | null
  log_entries: Array<{
    timestamp: string
    level: 'debug' | 'info' | 'warning' | 'error'
    message: string
  }>
}

export interface DownloadQueueResponse {
  downloads: DownloadQueueItem[]
  pagination: PaginationInfo
  queue_stats: {
    total_items: number
    pending_count?: number
    downloading_count?: number
    completed_count?: number
    failed_count?: number
    total_size_bytes?: number
    estimated_completion?: string | null
  }
}

// Dashboard-specific types matching backend implementation
export interface DashboardStatsResponse {
  totalBooks: number
  completed_downloads: number
  activeDownloads: number
  queueItems: number
  failedDownloads: number
}

// System status types matching backend implementation
export interface SystemStatusResponse {
  database: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    message?: string | null
    response_ms: number
    connections: number
  }
  indexers: {
    total: number
    online: number
    status: 'healthy' | 'degraded' | 'unhealthy'
  }
  downloadService: {
    status: 'active' | 'idle' | 'error'
    activeDownloads: number
  }
}

export interface DownloadCreate {
  title: string
  author_name?: string
  download_url: string
  file_format: 'epub' | 'pdf' | 'mobi' | 'azw3' | 'txt' | 'djvu' | 'fb2' | 'rtf'
  file_size_bytes?: number
  indexer_id: number
  book_id?: number
  priority?: number
  quality_profile_id?: number
  download_folder_id?: number
  metadata?: Record<string, unknown>
}

export interface DownloadHistoryItem {
  id: number
  queue_id: number
  user: {
    id: number
    username: string
  }
  book_id: number | null
  indexer: {
    id: number
    name: string
  }
  title: string
  author_name: string | null
  file_format: string
  file_size_bytes: number | null
  file_size_human: string | null
  download_duration_seconds: number | null
  download_duration_human: string | null
  final_status: 'completed' | 'failed' | 'cancelled'
  error_message: string | null
  download_path: string | null
  average_speed_kbps: number | null
  completed_at: string
}

// System Types
export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded'
  version: string
  uptime_seconds: number
  timestamp: string
  components: {
    database: ComponentHealth
    redis: ComponentHealth
    indexers: ComponentHealth
    filesystem: ComponentHealth
    downloads: ComponentHealth
    scheduler: ComponentHealth
  }
}

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy' | 'degraded'
  message?: string
  response_time_ms?: number
  last_check: string
}

// Indexer Types
export interface Indexer {
  id: number
  name: string
  type: 'prowlarr' | 'jackett' | 'custom'
  base_url: string
  api_key: string
  is_enabled: boolean
  priority: number
  categories: string[]
  supported_formats: string[]
  rate_limit_per_hour: number
  timeout_seconds: number
  health_status: 'healthy' | 'unhealthy' | 'degraded'
  last_health_check: string
  created_at: string
  updated_at: string
}