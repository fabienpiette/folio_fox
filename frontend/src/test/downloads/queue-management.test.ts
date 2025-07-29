/**
 * Download Queue Management Testing Suite
 * 
 * Tests queue state persistence, priority operations, batch operations,
 * and real-time updates via WebSocket connections.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils/test-utils'
import { DownloadsPage } from '@/components/downloads/DownloadsPage'
import { DownloadQueueItem, DownloadQueueResponse } from '@/types'
import { createMockWebSocket } from '@/test/utils/websocket-mock'

// Mock localStorage for persistence testing
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
})

const createMockDownload = (overrides: Partial<DownloadQueueItem> = {}): DownloadQueueItem => ({
  id: Math.floor(Math.random() * 10000),
  user: { id: 1, username: 'testuser' },
  book_id: null,
  indexer: { id: 1, name: 'Test Indexer' },
  title: 'Test Book',
  author_name: 'Test Author',
  download_url: 'https://example.com/download.epub',
  file_format: 'epub',
  file_size_bytes: 1048576,
  file_size_human: '1.0 MB',
  priority: 5,
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

describe('Download Queue Management Tests', () => {
  let mockWebSocket: ReturnType<typeof createMockWebSocket>

  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage.clear()
    mockWebSocket = createMockWebSocket()
  })

  afterEach(() => {
    mockWebSocket.close()
  })

  describe('Queue State Persistence', () => {
    it('should persist queue state across browser sessions', async () => {
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'Persistent Book 1', priority: 10 }),
        createMockDownload({ id: 2, title: 'Persistent Book 2', priority: 5 }),
        createMockDownload({ id: 3, title: 'Persistent Book 3', priority: 1 }),
      ]

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: mockDownloads,
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: mockDownloads.length,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: mockDownloads.length,
              pending_count: 3,
              downloading_count: 0,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: mockDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      const { unmount } = renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Persistent Book 1')).toBeInTheDocument()
        expect(screen.getByText('Persistent Book 2')).toBeInTheDocument()
        expect(screen.getByText('Persistent Book 3')).toBeInTheDocument()
      })

      // Verify queue state is persisted to localStorage
      const persistedState = mockLocalStorage.getItem('foliofox_download_queue')
      expect(persistedState).toBeTruthy()
      
      const parsedState = JSON.parse(persistedState!)
      expect(parsedState.downloads).toHaveLength(3)
      expect(parsedState.downloads[0].title).toBe('Persistent Book 1')

      // Unmount and remount to simulate browser restart
      unmount()
      renderWithProviders(<DownloadsPage />)

      // Should restore from persisted state
      await waitFor(() => {
        expect(screen.getByText('Persistent Book 1')).toBeInTheDocument()
        expect(screen.getByText('Persistent Book 2')).toBeInTheDocument()
        expect(screen.getByText('Persistent Book 3')).toBeInTheDocument()
      })
    })

    it('should handle corrupted persistence data gracefully', async () => {
      // Set corrupted data in localStorage
      mockLocalStorage.setItem('foliofox_download_queue', 'invalid_json{')

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [],
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 0,
              total_items: 0,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: 0,
              pending_count: 0,
              downloading_count: 0,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: 0,
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      // Should fallback to server data without crashing
      await waitFor(() => {
        expect(screen.getByText(/no downloads in queue/i)).toBeInTheDocument()
      })

      // Should clear corrupted data
      expect(mockLocalStorage.getItem('foliofox_download_queue')).toBe('null')
    })

    it('should synchronize local state with server after network recovery', async () => {
      const serverDownloads = [
        createMockDownload({ id: 1, title: 'Server Book 1', status: 'completed' }),
        createMockDownload({ id: 2, title: 'Server Book 2', status: 'downloading', progress_percentage: 75 }),
      ]

      const localDownloads = [
        createMockDownload({ id: 1, title: 'Local Book 1', status: 'downloading', progress_percentage: 50 }),
        createMockDownload({ id: 2, title: 'Local Book 2', status: 'pending' }),
        createMockDownload({ id: 3, title: 'Local Book 3', status: 'pending' }), // Only exists locally
      ]

      // Set local state
      mockLocalStorage.setItem('foliofox_download_queue', JSON.stringify({
        downloads: localDownloads,
        lastSync: Date.now() - 60000, // 1 minute ago
      }))

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: serverDownloads,
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: serverDownloads.length,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: serverDownloads.length,
              pending_count: 0,
              downloading_count: 1,
              completed_count: 1,
              failed_count: 0,
              total_size_bytes: serverDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      // Should show local state initially
      expect(screen.getByText('Local Book 1')).toBeInTheDocument()

      // After sync, should show server state
      await waitFor(() => {
        expect(screen.getByText('Server Book 1')).toBeInTheDocument()
        expect(screen.getByText('Server Book 2')).toBeInTheDocument()
        expect(screen.queryByText('Local Book 3')).not.toBeInTheDocument()
      })

      // Should update local storage with server state
      const updatedState = JSON.parse(mockLocalStorage.getItem('foliofox_download_queue')!)
      expect(updatedState.downloads).toHaveLength(2)
      expect(updatedState.downloads[0].title).toBe('Server Book 1')
      expect(updatedState.downloads[0].status).toBe('completed')
    })
  })

  describe('Priority Queue Operations', () => {
    it('should maintain correct download order based on priority', async () => {
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'Low Priority', priority: 1 }),
        createMockDownload({ id: 2, title: 'High Priority', priority: 10 }),
        createMockDownload({ id: 3, title: 'Medium Priority', priority: 5 }),
        createMockDownload({ id: 4, title: 'Urgent Priority', priority: 15 }),
      ]

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          // Sort by priority (highest first)
          const sortedDownloads = [...mockDownloads].sort((a, b) => b.priority - a.priority)
          
          const response: DownloadQueueResponse = {
            downloads: sortedDownloads,
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: sortedDownloads.length,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: sortedDownloads.length,
              pending_count: 4,
              downloading_count: 0,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: sortedDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        const downloadItems = screen.getAllByTestId(/download-item-/i)
        expect(downloadItems).toHaveLength(4)
        
        // Verify order: Urgent (15) -> High (10) -> Medium (5) -> Low (1)
        expect(within(downloadItems[0]).getByText('Urgent Priority')).toBeInTheDocument()
        expect(within(downloadItems[1]).getByText('High Priority')).toBeInTheDocument()
        expect(within(downloadItems[2]).getByText('Medium Priority')).toBeInTheDocument()
        expect(within(downloadItems[3]).getByText('Low Priority')).toBeInTheDocument()
      })
    })

    it('should dynamically update queue order when priority changes', async () => {
      const user = userEvent.setup()
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'Book A', priority: 5 }),
        createMockDownload({ id: 2, title: 'Book B', priority: 3 }),
        createMockDownload({ id: 3, title: 'Book C', priority: 7 }),
      ]

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const sortedDownloads = [...mockDownloads].sort((a, b) => b.priority - a.priority)
          
          const response: DownloadQueueResponse = {
            downloads: sortedDownloads,
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: sortedDownloads.length,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: sortedDownloads.length,
              pending_count: 3,
              downloading_count: 0,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: sortedDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        }),
        http.patch('/api/v1/downloads/queue/:id', async ({ params, request }) => {
          const id = parseInt(params.id as string)
          const body = await request.json() as any
          const download = mockDownloads.find(d => d.id === id)
          
          if (download && body.priority !== undefined) {
            download.priority = body.priority
            download.updated_at = new Date().toISOString()
          }
          
          return HttpResponse.json(download)
        })
      )

      renderWithProviders(<DownloadsPage />)

      // Initial order: C (7) -> A (5) -> B (3)
      await waitFor(() => {
        const downloadItems = screen.getAllByTestId(/download-item-/i)
        expect(within(downloadItems[0]).getByText('Book C')).toBeInTheDocument()
        expect(within(downloadItems[1]).getByText('Book A')).toBeInTheDocument()
        expect(within(downloadItems[2]).getByText('Book B')).toBeInTheDocument()
      })

      // Change Book B priority to 10 (highest)
      const bookBPriorityInput = screen.getByDisplayValue('3')
      await user.clear(bookBPriorityInput)
      await user.type(bookBPriorityInput, '10')
      await user.click(screen.getByRole('button', { name: /update priority/i }))

      // Simulate WebSocket update for real-time reordering
      mockWebSocket.simulateMessage({
        type: 'queue_updated',
        data: {
          download_id: 2,
          priority: 10,
          new_position: 0,
        }
      })

      // New order should be: B (10) -> C (7) -> A (5)
      await waitFor(() => {
        const downloadItems = screen.getAllByTestId(/download-item-/i)
        expect(within(downloadItems[0]).getByText('Book B')).toBeInTheDocument()
        expect(within(downloadItems[1]).getByText('Book C')).toBeInTheDocument()
        expect(within(downloadItems[2]).getByText('Book A')).toBeInTheDocument()
      })
    })

    it('should handle priority conflicts with stable sorting', async () => {
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'First Same Priority', priority: 5, created_at: '2023-01-01T10:00:00Z' }),
        createMockDownload({ id: 2, title: 'Second Same Priority', priority: 5, created_at: '2023-01-01T10:01:00Z' }),
        createMockDownload({ id: 3, title: 'Third Same Priority', priority: 5, created_at: '2023-01-01T10:02:00Z' }),
      ]

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          // Sort by priority first, then by creation time (FIFO for same priority)
          const sortedDownloads = [...mockDownloads].sort((a, b) => {
            if (a.priority === b.priority) {
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            }
            return b.priority - a.priority
          })
          
          const response: DownloadQueueResponse = {
            downloads: sortedDownloads,
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: sortedDownloads.length,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: sortedDownloads.length,
              pending_count: 3,
              downloading_count: 0,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: sortedDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        const downloadItems = screen.getAllByTestId(/download-item-/i)
        expect(downloadItems).toHaveLength(3)
        
        // Should maintain FIFO order for same priority
        expect(within(downloadItems[0]).getByText('First Same Priority')).toBeInTheDocument()
        expect(within(downloadItems[1]).getByText('Second Same Priority')).toBeInTheDocument()
        expect(within(downloadItems[2]).getByText('Third Same Priority')).toBeInTheDocument()
      })
    })
  })

  describe('Batch Operations Validation', () => {
    it('should support selecting multiple downloads', async () => {
      const user = userEvent.setup()
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'Book 1', status: 'pending' }),
        createMockDownload({ id: 2, title: 'Book 2', status: 'pending' }),
        createMockDownload({ id: 3, title: 'Book 3', status: 'downloading' }),
        createMockDownload({ id: 4, title: 'Book 4', status: 'completed' }),
      ]

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: mockDownloads,
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: mockDownloads.length,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: mockDownloads.length,
              pending_count: 2,
              downloading_count: 1,
              completed_count: 1,
              failed_count: 0,
              total_size_bytes: mockDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Book 1')).toBeInTheDocument()
        expect(screen.getByText('Book 2')).toBeInTheDocument()
        expect(screen.getByText('Book 3')).toBeInTheDocument()
        expect(screen.getByText('Book 4')).toBeInTheDocument()
      })

      // Select multiple downloads
      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0]) // Book 1
      await user.click(checkboxes[1]) // Book 2
      await user.click(checkboxes[2]) // Book 3

      // Verify selection count
      expect(screen.getByText(/3 downloads selected/i)).toBeInTheDocument()

      // Verify batch actions are enabled
      const batchActionsSection = screen.getByTestId('batch-actions')
      expect(within(batchActionsSection).getByRole('button', { name: /pause selected/i })).toBeEnabled()
      expect(within(batchActionsSection).getByRole('button', { name: /cancel selected/i })).toBeEnabled()
      expect(within(batchActionsSection).getByRole('button', { name: /remove selected/i })).toBeEnabled()
    })

    it('should execute batch pause operation', async () => {
      const user = userEvent.setup()
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'Book 1', status: 'pending' }),
        createMockDownload({ id: 2, title: 'Book 2', status: 'downloading' }),
        createMockDownload({ id: 3, title: 'Book 3', status: 'pending' }),
      ]

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: mockDownloads,
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: mockDownloads.length,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: mockDownloads.length,
              pending_count: 2,
              downloading_count: 1,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: mockDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        }),
        http.post('/api/v1/downloads/queue/batch', async ({ request }) => {
          const body = await request.json() as { action: string; ids: number[] }
          
          expect(body.action).toBe('pause')
          expect(body.ids).toEqual([1, 2, 3])
          
          // Update mock data
          mockDownloads.forEach(download => {
            if (body.ids.includes(download.id)) {
              download.status = 'paused'
              download.updated_at = new Date().toISOString()
            }
          })
          
          return HttpResponse.json({
            message: `Paused ${body.ids.length} downloads`,
            affected_downloads: body.ids.length,
          })
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Book 1')).toBeInTheDocument()
      })

      // Select all downloads
      const selectAllCheckbox = screen.getByLabelText(/select all/i)
      await user.click(selectAllCheckbox)

      // Execute batch pause
      const pauseButton = screen.getByRole('button', { name: /pause selected/i })
      await user.click(pauseButton)

      // Confirm batch action
      const confirmButton = screen.getByRole('button', { name: /confirm pause/i })
      await user.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText(/paused 3 downloads/i)).toBeInTheDocument()
      })

      // Simulate WebSocket updates for real-time status changes
      mockDownloads.forEach(download => {
        mockWebSocket.simulateMessage({
          type: 'download_status_changed',
          data: {
            download_id: download.id,
            status: 'paused',
            progress_percentage: download.progress_percentage,
          }
        })
      })

      // Verify status updates
      await waitFor(() => {
        const pausedItems = screen.getAllByText(/paused/i)
        expect(pausedItems).toHaveLength(3)
      })
    })

    it('should handle batch delete with confirmation', async () => {
      const user = userEvent.setup()
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'Book to Delete 1', status: 'failed' }),
        createMockDownload({ id: 2, title: 'Book to Delete 2', status: 'cancelled' }),
      ]

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: mockDownloads,
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: mockDownloads.length,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: mockDownloads.length,
              pending_count: 0,
              downloading_count: 0,
              completed_count: 0,
              failed_count: 2,
              total_size_bytes: mockDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        }),
        http.post('/api/v1/downloads/queue/batch', async ({ request }) => {
          const body = await request.json() as { action: string; ids: number[] }
          
          if (body.action === 'delete') {
            // Remove from mock data
            body.ids.forEach(id => {
              const index = mockDownloads.findIndex(d => d.id === id)
              if (index !== -1) {
                mockDownloads.splice(index, 1)
              }
            })
            
            return HttpResponse.json({
              message: `Deleted ${body.ids.length} downloads`,
              affected_downloads: body.ids.length,
            })
          }
          
          return HttpResponse.json({ error: 'Invalid action' }, { status: 400 })
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Book to Delete 1')).toBeInTheDocument()
        expect(screen.getByText('Book to Delete 2')).toBeInTheDocument()
      })

      // Select downloads to delete
      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])

      // Click delete button
      const deleteButton = screen.getByRole('button', { name: /remove selected/i })
      await user.click(deleteButton)

      // Should show confirmation dialog
      expect(screen.getByText(/are you sure.*delete 2 downloads/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()

      // Confirm deletion
      const confirmDeleteButton = screen.getByRole('button', { name: /confirm delete/i })
      await user.click(confirmDeleteButton)

      await waitFor(() => {
        expect(screen.getByText(/deleted 2 downloads/i)).toBeInTheDocument()
        expect(screen.queryByText('Book to Delete 1')).not.toBeInTheDocument()
        expect(screen.queryByText('Book to Delete 2')).not.toBeInTheDocument()
      })
    })
  })

  describe('Real-time WebSocket Updates', () => {
    it('should update download progress in real-time', async () => {
      const mockDownload = createMockDownload({
        id: 1,
        title: 'Real-time Progress Test',
        status: 'downloading',
        progress_percentage: 25,
      })

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [mockDownload],
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: 1,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: 1,
              pending_count: 0,
              downloading_count: 1,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: mockDownload.file_size_bytes || 0,
              estimated_completion: new Date(Date.now() + 300000).toISOString(),
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Real-time Progress Test')).toBeInTheDocument()
        expect(screen.getByText('25%')).toBeInTheDocument()
      })

      // Simulate progress updates via WebSocket
      const progressUpdates = [50, 75, 100]
      
      for (const progress of progressUpdates) {
        mockWebSocket.simulateMessage({
          type: 'download_progress',
          data: {
            download_id: 1,
            progress_percentage: progress,
            status: progress === 100 ? 'completed' : 'downloading',
            estimated_completion: progress === 100 ? null : new Date(Date.now() + (100 - progress) * 3000).toISOString(),
          }
        })

        await waitFor(() => {
          expect(screen.getByText(`${progress}%`)).toBeInTheDocument()
          if (progress === 100) {
            expect(screen.getByText(/completed/i)).toBeInTheDocument()
          }
        })
      }
    })

    it('should handle queue additions via WebSocket', async () => {
      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [],
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 0,
              total_items: 0,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: 0,
              pending_count: 0,
              downloading_count: 0,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: 0,
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText(/no downloads in queue/i)).toBeInTheDocument()
      })

      // Simulate new download added via WebSocket
      const newDownload = createMockDownload({
        id: 1,
        title: 'New WebSocket Download',
        status: 'pending',
      })

      mockWebSocket.simulateMessage({
        type: 'download_added',
        data: newDownload
      })

      await waitFor(() => {
        expect(screen.getByText('New WebSocket Download')).toBeInTheDocument()
        expect(screen.getByText(/pending/i)).toBeInTheDocument()
      })
    })

    it('should handle connection loss and reconnection', async () => {
      const mockDownload = createMockDownload({
        id: 1,
        title: 'Connection Test',
        status: 'downloading',
        progress_percentage: 50,
      })

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [mockDownload],
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 1,
              total_items: 1,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: 1,
              pending_count: 0,
              downloading_count: 1,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: mockDownload.file_size_bytes || 0,
              estimated_completion: new Date(Date.now() + 300000).toISOString(),
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Connection Test')).toBeInTheDocument()
        expect(screen.getByTestId('websocket-status')).toHaveTextContent(/connected/i)
      })

      // Simulate connection loss
      mockWebSocket.simulateClose()

      await waitFor(() => {
        expect(screen.getByTestId('websocket-status')).toHaveTextContent(/disconnected/i)
        expect(screen.getByText(/real-time updates unavailable/i)).toBeInTheDocument()
      })

      // Simulate reconnection
      mockWebSocket.simulateOpen()

      await waitFor(() => {
        expect(screen.getByTestId('websocket-status')).toHaveTextContent(/connected/i)
        expect(screen.queryByText(/real-time updates unavailable/i)).not.toBeInTheDocument()
      })
    })
  })

  afterAll(() => {
    server.resetHandlers()
  })
})