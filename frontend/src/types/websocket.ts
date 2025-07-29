// WebSocket Message Types based on AsyncAPI specification

export interface WebSocketMessage<T = unknown> {
  type: string
  timestamp: string
  data: T
}

// Connection Management
export interface ConnectMessage {
  type: 'connect'
  timestamp: string
  data: {
    client_id: string
    version: string
  }
}

export interface ConnectedMessage {
  type: 'connected'
  timestamp: string
  data: {
    connection_id: string
    server_version: string
    heartbeat_interval: number
  }
}

export interface AuthenticateMessage {
  type: 'authenticate'
  timestamp: string
  data: {
    token: string
  }
}

export interface AuthenticatedMessage {
  type: 'authenticated'
  timestamp: string
  data: {
    user_id: number
    username: string
    permissions: string[]
    expires_at: string
  }
}

export interface HeartbeatMessage {
  type: 'heartbeat'
  timestamp: string
  data: {
    ping: boolean
  }
}

export interface ErrorMessage {
  type: 'error'
  timestamp: string
  data: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

// Download Updates
export interface DownloadProgressUpdate {
  type: 'download_progress_update'
  timestamp: string
  data: {
    download_id: number
    progress_percentage: number
    bytes_downloaded: number
    download_speed_kbps: number
    eta_seconds: number | null
    status: string
  }
}

export interface DownloadStatusChange {
  type: 'download_status_change'
  timestamp: string
  data: {
    download_id: number
    old_status: string
    new_status: string
    message?: string
    error?: string
  }
}

export interface DownloadCompleted {
  type: 'download_completed'
  timestamp: string
  data: {
    download_id: number
    file_path: string
    file_size_bytes: number
    download_duration_seconds: number
    average_speed_kbps: number
    book_id?: number
  }
}

export interface DownloadFailed {
  type: 'download_failed'
  timestamp: string
  data: {
    download_id: number
    error_message: string
    retry_count: number
    will_retry: boolean
    next_retry_at?: string
  }
}

// Queue Updates
export interface DownloadQueueUpdate {
  type: 'download_queue_update'
  timestamp: string
  data: {
    queue_stats: {
      total_items: number
      pending_count: number
      downloading_count: number
      completed_count: number
      failed_count: number
      total_size_bytes: number
      estimated_completion: string | null
    }
  }
}

export interface DownloadQueueItemAdded {
  type: 'download_queue_item_added'
  timestamp: string
  data: {
    download_id: number
    title: string
    author_name: string | null
    file_format: string
    priority: number
    position_in_queue: number
  }
}

export interface DownloadQueueItemRemoved {
  type: 'download_queue_item_removed'
  timestamp: string
  data: {
    download_id: number
    reason: 'completed' | 'cancelled' | 'failed' | 'removed'
  }
}

export interface DownloadPriorityChanged {
  type: 'download_priority_changed'
  timestamp: string
  data: {
    download_id: number
    old_priority: number
    new_priority: number
    new_position: number
  }
}

// Search Updates
export interface SearchResultsStream {
  type: 'search_results_stream'
  timestamp: string
  data: {
    search_id: string
    indexer_id: number
    indexer_name: string
    results: Array<{
      title: string
      author: string
      format: string
      file_size_bytes: number | null
      quality_score: number
      download_url: string
      cover_url: string | null
    }>
  }
}

export interface SearchIndexerComplete {
  type: 'search_indexer_complete'
  timestamp: string
  data: {
    search_id: string
    indexer_id: number
    indexer_name: string
    result_count: number
    response_time_ms: number
    error: string | null
  }
}

export interface SearchComplete {
  type: 'search_complete'
  timestamp: string
  data: {
    search_id: string
    total_results: number
    total_indexers: number
    successful_indexers: number
    failed_indexers: number
    search_duration_ms: number
  }
}

export interface SearchError {
  type: 'search_error'
  timestamp: string
  data: {
    search_id: string
    error_message: string
    failed_indexers: number[]
  }
}

// System Updates
export interface SystemHealthUpdate {
  type: 'system_health_update'
  timestamp: string
  data: {
    overall_status: 'healthy' | 'unhealthy' | 'degraded'
    components: Record<string, {
      status: 'healthy' | 'unhealthy' | 'degraded'
      message?: string
      response_time_ms?: number
    }>
  }
}

export interface ComponentStatusUpdate {
  type: 'component_status_update'
  timestamp: string
  data: {
    component: string
    old_status: string
    new_status: string
    message?: string
    response_time_ms?: number
  }
}

export interface SystemAlert {
  type: 'system_alert'
  timestamp: string
  data: {
    level: 'info' | 'warning' | 'error' | 'critical'
    title: string
    message: string
    component?: string
    action_required?: boolean
    auto_dismiss_seconds?: number
  }
}

// Notification Types
export interface UserNotification {
  type: 'user_notification'
  timestamp: string
  data: {
    id: string
    level: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    persistent: boolean
    action?: {
      label: string
      url?: string
      callback?: string
    }
  }
}

// Library Updates
export interface LibraryBookAdded {
  type: 'library_book_added'
  timestamp: string
  data: {
    book_id: number
    title: string
    author: string
    cover_url: string | null
    formats: string[]
  }
}

export interface LibraryBookUpdated {
  type: 'library_book_updated'
  timestamp: string
  data: {
    book_id: number
    title: string
    changes: string[]
  }
}

export interface LibraryBookRemoved {
  type: 'library_book_removed'
  timestamp: string
  data: {
    book_id: number
    title: string
  }
}

// Union type for all possible WebSocket messages
export type WebSocketMessageType =
  | ConnectMessage
  | ConnectedMessage
  | AuthenticateMessage
  | AuthenticatedMessage
  | HeartbeatMessage
  | ErrorMessage
  | DownloadProgressUpdate
  | DownloadStatusChange
  | DownloadCompleted
  | DownloadFailed
  | DownloadQueueUpdate
  | DownloadQueueItemAdded
  | DownloadQueueItemRemoved
  | DownloadPriorityChanged
  | SearchResultsStream
  | SearchIndexerComplete
  | SearchComplete
  | SearchError
  | SystemHealthUpdate
  | ComponentStatusUpdate
  | SystemAlert
  | UserNotification
  | LibraryBookAdded
  | LibraryBookUpdated
  | LibraryBookRemoved