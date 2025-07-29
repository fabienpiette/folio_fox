// Re-export all types for easy importing
export * from './api'
export * from './websocket'

// Additional common types
export interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface TableColumn<T = unknown> {
  key: keyof T | string
  label: string
  sortable?: boolean
  width?: string
  render?: (value: unknown, row: T) => React.ReactNode
}

export interface FilterOption {
  key: string
  label: string
  type: 'text' | 'select' | 'multiselect' | 'range' | 'date' | 'boolean'
  options?: SelectOption[]
  placeholder?: string
  min?: number
  max?: number
}

export interface SortOption {
  field: string
  direction: 'asc' | 'desc'
}

export interface ViewMode {
  id: 'grid' | 'list' | 'table'
  label: string
  icon: React.ComponentType
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  persistent?: boolean
  action?: {
    label: string
    onClick: () => void
  }
}

export interface Modal {
  id: string
  title: string
  component: React.ComponentType<{ onClose: () => void }>
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  closeable?: boolean
}

export interface SearchFilters {
  query?: string
  author?: string
  series?: string
  genre?: string
  language?: string
  format?: string
  rating_min?: number
  rating_max?: number
  publication_year_min?: number
  publication_year_max?: number
  indexers?: number[]
  min_quality?: number
  max_size_mb?: number
}

export interface LibraryFilters {
  search?: string
  author?: string
  series?: string
  genre?: string
  language?: string
  format?: string
  rating_min?: number
  rating_max?: number
  publication_year_min?: number
  publication_year_max?: number
}

export interface DownloadFilters {
  status?: string[]
  priority_min?: number
  priority_max?: number
  created_after?: string
  created_before?: string
  user_id?: number
}

export interface QueueStats {
  total_items: number
  pending_count: number
  downloading_count: number
  completed_count: number
  failed_count: number
  total_size_bytes: number
  estimated_completion: string | null
}