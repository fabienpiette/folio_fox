// Configuration-related TypeScript types

export type IndexerType = 'prowlarr' | 'jackett' | 'custom'
export type IndexerStatus = 'healthy' | 'unhealthy' | 'degraded' | 'maintenance'

export interface Indexer {
  id: number
  name: string
  base_url: string
  api_endpoint?: string
  indexer_type: IndexerType
  supports_search: boolean
  supports_download: boolean
  is_active: boolean
  priority: number
  rate_limit_requests: number
  rate_limit_window: number
  timeout_seconds: number
  user_agent?: string
  description?: string
  website?: string
  created_at: string
  updated_at: string
  
  // Health status
  status?: IndexerStatus
  last_health_check?: string
  response_time_ms?: number
  error_message?: string
}

export interface UserIndexerConfig {
  id: number
  user_id: number
  indexer_id: number
  is_enabled: boolean
  api_key?: string
  username?: string
  password_hash?: string
  custom_settings?: string
  last_test_date?: string
  last_test_success?: boolean
  created_at: string
  updated_at: string
  
  // Relationships
  indexer?: Indexer
}

export interface IndexerHealth {
  id: number
  indexer_id: number
  status: IndexerStatus
  response_time_ms?: number
  error_message?: string
  checked_at: string
}

export interface IndexerTestResult {
  indexer_id: number
  success: boolean
  response_time_ms: number
  error_message?: string
  capabilities?: string[]
  version?: string
}

export interface IndexerResponse {
  id: number
  name: string
  base_url: string
  api_endpoint?: string
  indexer_type: IndexerType
  supports_search: boolean
  supports_download: boolean
  is_active: boolean
  priority: number
  rate_limit_requests: number
  rate_limit_window: number
  timeout_seconds: number
  user_agent?: string
  description?: string
  website?: string
  created_at: string
  updated_at: string
  
  // Health status
  status?: IndexerStatus
  last_health_check?: string
  response_time_ms?: number
  error_message?: string
  
  // User configuration
  user_config?: UserIndexerConfig
}

export interface IndexerListResponse {
  indexers: IndexerResponse[]
  total: number
}

// Request types
export interface CreateIndexerRequest {
  name: string
  base_url: string
  api_endpoint?: string
  indexer_type: IndexerType
  supports_search?: boolean
  supports_download?: boolean
  is_active?: boolean
  priority?: number
  rate_limit_requests?: number
  rate_limit_window?: number
  timeout_seconds?: number
  user_agent?: string
  description?: string
  website?: string
}

export interface UpdateIndexerConfigRequest {
  is_enabled: boolean
  api_key?: string
  username?: string
  password?: string
  custom_settings?: string
}

// System configuration types
export interface SystemSettings {
  app_name: string
  app_version: string
  max_concurrent_downloads: number
  default_download_path: string
  enable_health_monitoring: boolean
  health_check_interval: number
  log_level: 'debug' | 'info' | 'warn' | 'error'
  log_retention_days: number
  enable_metrics: boolean
  jwt_expiration_hours: number
  rate_limit_enabled: boolean
  rate_limit_requests_per_minute: number
}

export interface UserPreferences {
  id: number
  user_id: number
  theme: 'light' | 'dark' | 'auto'
  language: string
  timezone: string
  date_format: string
  time_format: '12h' | '24h'
  default_search_limit: number
  auto_download: boolean
  download_notifications: boolean
  email_notifications: boolean
  webhook_url?: string
  custom_css?: string
  created_at: string
  updated_at: string
}

export interface DownloadFolder {
  id: number
  user_id: number
  name: string
  path: string
  is_default: boolean
  format_filters?: string[]
  auto_organize: boolean
  created_at: string
  updated_at: string
}

export interface QualityProfile {
  id: number
  user_id: number
  name: string
  preferred_formats: string[]
  min_file_size_mb?: number
  max_file_size_mb?: number
  language_preferences: string[]
  quality_order: string[]
  is_default: boolean
  created_at: string
  updated_at: string
}

// API Error types specific to configuration
export interface ConfigError {
  field?: string
  message: string
  code?: string
}

export interface ConfigValidationError {
  errors: ConfigError[]
  message: string
}