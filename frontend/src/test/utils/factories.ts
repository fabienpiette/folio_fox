/**
 * Test data factories for generating mock data consistently across tests
 */

import { 
  User, 
  Book, 
  SearchResult, 
  DownloadQueueItem, 
  Indexer,
  SystemHealth,
  DownloadStatus
} from '@/types'

let userIdCounter = 1
let bookIdCounter = 1
let downloadIdCounter = 1
let indexerIdCounter = 1

// User factories
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: userIdCounter++,
  username: `testuser${userIdCounter}`,
  email: `user${userIdCounter}@example.com`,
  is_active: true,
  is_admin: false,
  last_login: new Date().toISOString(),
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: new Date().toISOString(),
  ...overrides,
})

export const createAdminUser = (overrides: Partial<User> = {}): User =>
  createMockUser({ is_admin: true, username: 'admin', ...overrides })

// Book factories
export const createMockBook = (overrides: Partial<Book> = {}): Book => ({
  id: bookIdCounter++,
  title: `Test Book ${bookIdCounter}`,
  subtitle: null,
  description: `A test book description for book ${bookIdCounter}`,
  isbn_10: '0123456789',
  isbn_13: '978-0123456789',
  asin: null,
  goodreads_id: `goodreads-${bookIdCounter}`,
  google_books_id: `google-${bookIdCounter}`,
  publication_date: '2023-01-01',
  page_count: 200 + bookIdCounter * 10,
  language: { id: 1, code: 'en', name: 'English' },
  publisher: { id: 1, name: 'Test Publisher' },
  series: null,
  series_position: null,
  authors: [{ id: 1, name: `Test Author ${bookIdCounter}`, role: 'author' }],
  genres: [{ id: 1, name: 'Fiction' }],
  rating_average: 4.0 + Math.random(),
  rating_count: Math.floor(Math.random() * 1000) + 100,
  tags: ['test', 'fiction'],
  cover_url: `https://example.com/covers/${bookIdCounter}.jpg`,
  cover_local_path: null,
  available_formats: Math.floor(Math.random() * 5) + 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: new Date().toISOString(),
  ...overrides,
})

export const createClassicBook = (): Book =>
  createMockBook({
    title: 'The Great Gatsby',
    authors: [{ id: 1, name: 'F. Scott Fitzgerald', role: 'author' }],
    publication_date: '1925-04-10',
    genres: [{ id: 1, name: 'Classic Literature' }],
    tags: ['classic', 'american literature', 'jazz age'],
  })

// Search result factories
export const createMockSearchResult = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  indexer_id: 1,
  indexer_name: 'Test Indexer',
  title: `Search Result ${Math.random().toString(36).substr(2, 9)}`,
  author: 'Test Author',
  description: 'A test search result',
  format: 'epub',
  file_size_bytes: Math.floor(Math.random() * 10000000) + 1000000,
  file_size_human: '2.5 MB',
  quality_score: Math.floor(Math.random() * 40) + 60,
  download_url: `https://example.com/download/${Math.random().toString(36).substr(2, 9)}`,
  source_url: `https://example.com/source/${Math.random().toString(36).substr(2, 9)}`,
  language: 'en',
  publication_year: 2020 + Math.floor(Math.random() * 4),
  isbn: `978-${Math.random().toString().substr(2, 10)}`,
  cover_url: `https://example.com/cover/${Math.random().toString(36).substr(2, 9)}.jpg`,
  tags: ['test', 'fiction'],
  metadata: {},
  found_at: new Date().toISOString(),
  ...overrides,
})

// Download factories
export const createMockDownload = (overrides: Partial<DownloadQueueItem> = {}): DownloadQueueItem => ({
  id: downloadIdCounter++,
  user: { id: 1, username: 'testuser' },
  book_id: null,
  indexer: { id: 1, name: 'Test Indexer' },
  title: `Download ${downloadIdCounter}`,
  author_name: 'Test Author',
  download_url: `https://example.com/download/${downloadIdCounter}`,
  file_format: 'epub',
  file_size_bytes: Math.floor(Math.random() * 10000000) + 1000000,
  file_size_human: '2.5 MB',
  priority: Math.floor(Math.random() * 10) + 1,
  status: 'pending',
  progress_percentage: 0,
  download_path: null,
  quality_profile: { id: 1, name: 'Standard' },
  retry_count: 0,
  max_retries: 3,
  error_message: null,
  estimated_completion: null,
  started_at: null,
  completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

export const createDownloadingItem = (): DownloadQueueItem =>
  createMockDownload({
    status: 'downloading',
    progress_percentage: Math.floor(Math.random() * 80) + 10,
    started_at: new Date(Date.now() - 300000).toISOString(),
    estimated_completion: new Date(Date.now() + 600000).toISOString(),
  })

export const createCompletedDownload = (): DownloadQueueItem =>
  createMockDownload({
    status: 'completed',
    progress_percentage: 100,
    started_at: new Date(Date.now() - 600000).toISOString(),
    completed_at: new Date().toISOString(),
    download_path: '/downloads/completed/book.epub',
  })

export const createFailedDownload = (): DownloadQueueItem =>
  createMockDownload({
    status: 'failed',
    progress_percentage: Math.floor(Math.random() * 50),
    started_at: new Date(Date.now() - 300000).toISOString(),
    error_message: 'Connection timeout',
    retry_count: 2,
  })

// Indexer factories
export const createMockIndexer = (overrides: Partial<Indexer> = {}): Indexer => ({
  id: indexerIdCounter++,
  name: `Test Indexer ${indexerIdCounter}`,
  type: 'prowlarr',
  base_url: `https://indexer${indexerIdCounter}.example.com`,
  api_key: `test-api-key-${indexerIdCounter}`,
  is_enabled: true,
  priority: indexerIdCounter,
  categories: ['books', 'ebooks'],
  supported_formats: ['epub', 'pdf', 'mobi'],
  rate_limit_per_hour: 100,
  timeout_seconds: 30,
  health_status: 'healthy',
  last_health_check: new Date().toISOString(),
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: new Date().toISOString(),
  ...overrides,
})

export const createJackettIndexer = (): Indexer =>
  createMockIndexer({
    type: 'jackett',
    supported_formats: ['epub', 'pdf'],
    rate_limit_per_hour: 50,
  })

export const createUnhealthyIndexer = (): Indexer =>
  createMockIndexer({
    health_status: 'unhealthy',
    is_enabled: false,
  })

// System health factories
export const createMockSystemHealth = (overrides: Partial<SystemHealth> = {}): SystemHealth => ({
  status: 'healthy',
  version: '1.0.0',
  uptime_seconds: 86400,
  timestamp: new Date().toISOString(),
  components: {
    database: {
      status: 'healthy',
      message: 'Database is operating normally',
      response_time_ms: 15,
      last_check: new Date().toISOString(),
    },
    redis: {
      status: 'healthy',
      message: 'Redis is operating normally',
      response_time_ms: 8,
      last_check: new Date().toISOString(),
    },
    indexers: {
      status: 'healthy',
      message: 'All indexers are operational',
      response_time_ms: 120,
      last_check: new Date().toISOString(),
    },
    filesystem: {
      status: 'healthy',
      message: 'Filesystem has adequate space',
      response_time_ms: 5,
      last_check: new Date().toISOString(),
    },
    downloads: {
      status: 'healthy',
      message: 'Download service is operational',
      response_time_ms: 25,
      last_check: new Date().toISOString(),
    },
    scheduler: {
      status: 'healthy',
      message: 'Scheduler is running normally',
      response_time_ms: 10,
      last_check: new Date().toISOString(),
    },
  },
  ...overrides,
})

export const createDegradedSystemHealth = (): SystemHealth =>
  createMockSystemHealth({
    status: 'degraded',
    components: {
      ...createMockSystemHealth().components,
      indexers: {
        status: 'degraded',
        message: 'Some indexers are experiencing issues',
        response_time_ms: 500,
        last_check: new Date().toISOString(),
      },
    },
  })

// Utility functions for creating arrays of mock data
export const createMockBooks = (count: number): Book[] =>
  Array.from({ length: count }, () => createMockBook())

export const createMockSearchResults = (count: number): SearchResult[] =>
  Array.from({ length: count }, () => createMockSearchResult())

export const createMockDownloads = (count: number): DownloadQueueItem[] =>
  Array.from({ length: count }, () => createMockDownload())

export const createMockIndexers = (count: number): Indexer[] =>
  Array.from({ length: count }, () => createMockIndexer())

// Reset counters for test isolation
export const resetCounters = () => {
  userIdCounter = 1
  bookIdCounter = 1
  downloadIdCounter = 1
  indexerIdCounter = 1
}