/**
 * Download Reliability Testing Suite
 * 
 * Tests download queue management, concurrent downloads, error handling,
 * retry logic, progress tracking, and file integrity verification.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils/test-utils'
import { DownloadsPage } from '@/components/downloads/DownloadsPage'
import { DownloadQueueItem, DownloadStatus, DownloadQueueResponse } from '@/types'

// Mock download items for testing
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

describe('Download Reliability Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Download Queue Management', () => {
    it('should display download queue with correct status indicators', async () => {
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'Book 1', status: 'pending' }),
        createMockDownload({ id: 2, title: 'Book 2', status: 'downloading', progress_percentage: 45 }),
        createMockDownload({ id: 3, title: 'Book 3', status: 'completed' }),
        createMockDownload({ id: 4, title: 'Book 4', status: 'failed', error_message: 'Network timeout' }),
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
              pending_count: 1,
              downloading_count: 1,
              completed_count: 1,
              failed_count: 1,
              total_size_bytes: mockDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: new Date(Date.now() + 300000).toISOString(),
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

      // Verify status indicators
      expect(screen.getByText(/pending/i)).toBeInTheDocument()
      expect(screen.getByText(/downloading/i)).toBeInTheDocument()
      expect(screen.getByText(/45%/i)).toBeInTheDocument()
      expect(screen.getByText(/completed/i)).toBeInTheDocument()
      expect(screen.getByText(/failed/i)).toBeInTheDocument()
      expect(screen.getByText(/network timeout/i)).toBeInTheDocument()
    })

    it('should allow reordering downloads by priority', async () => {
      const user = userEvent.setup()
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'Low Priority', priority: 1 }),
        createMockDownload({ id: 2, title: 'High Priority', priority: 10 }),
        createMockDownload({ id: 3, title: 'Medium Priority', priority: 5 }),
      ]

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: mockDownloads.sort((a, b) => b.priority - a.priority),
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
              estimated_completion: new Date(Date.now() + 300000).toISOString(),
            }
          }
          return HttpResponse.json(response)
        }),
        http.patch('/api/v1/downloads/queue/:id', async ({ params, request }) => {
          const id = parseInt(params.id as string)
          const body = await request.json() as any
          const download = mockDownloads.find(d => d.id === id)
          
          if (download) {
            download.priority = body.priority
            download.updated_at = new Date().toISOString()
          }
          
          return HttpResponse.json(download)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        const downloadItems = screen.getAllByTestId(/download-item-/i)
        expect(downloadItems[0]).toHaveTextContent('High Priority')
        expect(downloadItems[1]).toHaveTextContent('Medium Priority')
        expect(downloadItems[2]).toHaveTextContent('Low Priority')
      })

      // Change priority of low priority item
      const priorityInput = screen.getByDisplayValue('1')
      await user.clear(priorityInput)
      await user.type(priorityInput, '15')
      await user.click(screen.getByRole('button', { name: /update priority/i }))

      await waitFor(() => {
        expect(screen.getByDisplayValue('15')).toBeInTheDocument()
      })
    })

    it('should support batch operations on multiple downloads', async () => {
      const user = userEvent.setup()
      const mockDownloads = [
        createMockDownload({ id: 1, title: 'Book 1', status: 'pending' }),
        createMockDownload({ id: 2, title: 'Book 2', status: 'pending' }),
        createMockDownload({ id: 3, title: 'Book 3', status: 'downloading' }),
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
              estimated_completion: new Date(Date.now() + 300000).toISOString(),
            }
          }
          return HttpResponse.json(response)
        }),
        http.post('/api/v1/downloads/queue/batch', async ({ request }) => {
          const body = await request.json() as { action: string; ids: number[] }
          
          return HttpResponse.json({
            message: `${body.action} applied to ${body.ids.length} downloads`,
            affected_downloads: body.ids.length,
          })
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Book 1')).toBeInTheDocument()
        expect(screen.getByText('Book 2')).toBeInTheDocument()
      })

      // Select multiple downloads
      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0]) // Book 1
      await user.click(checkboxes[1]) // Book 2

      // Apply batch action
      const batchActionSelect = screen.getByLabelText(/batch action/i)
      await user.selectOptions(batchActionSelect, 'pause')
      await user.click(screen.getByRole('button', { name: /apply to selected/i }))

      await waitFor(() => {
        expect(screen.getByText(/pause applied to 2 downloads/i)).toBeInTheDocument()
      })
    })
  })

  describe('Concurrent Download Handling', () => {
    it('should respect maximum concurrent download limits', async () => {
      const user = userEvent.setup()
      const mockDownloads = Array.from({ length: 10 }, (_, index) =>
        createMockDownload({
          id: index + 1,
          title: `Book ${index + 1}`,
          status: index < 3 ? 'downloading' : 'pending',
          progress_percentage: index < 3 ? Math.floor(Math.random() * 100) : 0,
        })
      )

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
              pending_count: 7,
              downloading_count: 3, // Maximum concurrent downloads
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: mockDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: new Date(Date.now() + 300000).toISOString(),
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        // Should show exactly 3 downloads in progress
        const downloadingItems = screen.getAllByText(/downloading/i)
        expect(downloadingItems).toHaveLength(3)

        // Should show 7 pending downloads
        const pendingItems = screen.getAllByText(/pending/i)
        expect(pendingItems).toHaveLength(7)

        // Should display concurrent limit message
        expect(screen.getByText(/3 of 3 concurrent downloads active/i)).toBeInTheDocument()
      })
    })

    it('should automatically start next download when one completes', async () => {
      let downloadingCount = 3
      const mockDownloads = Array.from({ length: 5 }, (_, index) =>
        createMockDownload({
          id: index + 1,
          title: `Book ${index + 1}`,
          status: index < downloadingCount ? 'downloading' : 'pending',
          progress_percentage: index < downloadingCount ? Math.floor(Math.random() * 100) : 0,
        })
      )

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
              pending_count: 5 - downloadingCount,
              downloading_count: downloadingCount,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: mockDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
              estimated_completion: new Date(Date.now() + 300000).toISOString(),
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getAllByText(/downloading/i)).toHaveLength(3)
        expect(screen.getAllByText(/pending/i)).toHaveLength(2)
      })

      // Simulate download completion via WebSocket message
      const mockWebSocketEvent = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'download_completed',
          data: {
            download_id: 1,
            status: 'completed',
            progress_percentage: 100,
          }
        })
      })

      // Update mock to reflect completion and next download starting
      mockDownloads[0].status = 'completed'
      mockDownloads[0].progress_percentage = 100
      mockDownloads[3].status = 'downloading' // Next download starts
      downloadingCount = 3 // Still 3 concurrent downloads

      // Dispatch WebSocket event
      window.dispatchEvent(mockWebSocketEvent)

      await waitFor(() => {
        expect(screen.getByText(/book 1.*completed/i)).toBeInTheDocument()
        expect(screen.getByText(/book 4.*downloading/i)).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling and Retry Logic', () => {
    it('should handle network errors with automatic retry', async () => {
      const user = userEvent.setup()
      let retryCount = 0
      const failingDownload = createMockDownload({
        id: 1,
        title: 'Failing Download',
        status: 'failed',
        error_message: 'Network timeout',
        retry_count: 1,
        max_retries: 3,
      })

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [failingDownload],
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
              downloading_count: 0,
              completed_count: 0,
              failed_count: 1,
              total_size_bytes: failingDownload.file_size_bytes || 0,
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        }),
        http.post('/api/v1/downloads/queue/:id/retry', ({ params }) => {
          const id = parseInt(params.id as string)
          retryCount++
          
          if (id === 1) {
            failingDownload.status = 'pending'
            failingDownload.retry_count = retryCount
            failingDownload.error_message = null
            
            return HttpResponse.json({
              message: 'Download queued for retry',
              download: failingDownload,
            })
          }
          
          return HttpResponse.json({ error: 'Download not found' }, { status: 404 })
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Failing Download')).toBeInTheDocument()
        expect(screen.getByText(/failed/i)).toBeInTheDocument()
        expect(screen.getByText(/network timeout/i)).toBeInTheDocument()
        expect(screen.getByText(/retry 1 of 3/i)).toBeInTheDocument()
      })

      // Manual retry
      const retryButton = screen.getByRole('button', { name: /retry download/i })
      await user.click(retryButton)

      await waitFor(() => {
        expect(screen.getByText(/pending/i)).toBeInTheDocument()
        expect(screen.getByText(/retry 2 of 3/i)).toBeInTheDocument()
      })
    })

    it('should handle file corruption and re-download', async () => {
      const corruptedDownload = createMockDownload({
        id: 1,
        title: 'Corrupted File',
        status: 'failed',
        error_message: 'File integrity check failed - checksum mismatch',
        retry_count: 1,
        max_retries: 3,
      })

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [corruptedDownload],
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
              downloading_count: 0,
              completed_count: 0,
              failed_count: 1,
              total_size_bytes: corruptedDownload.file_size_bytes || 0,
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Corrupted File')).toBeInTheDocument()
        expect(screen.getByText(/file integrity check failed/i)).toBeInTheDocument()
        expect(screen.getByText(/checksum mismatch/i)).toBeInTheDocument()
      })
    })

    it('should stop retrying after maximum attempts reached', async () => {
      const exhaustedDownload = createMockDownload({
        id: 1,
        title: 'Permanently Failed',
        status: 'failed',
        error_message: 'Maximum retry attempts exceeded',
        retry_count: 3,
        max_retries: 3,
      })

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [exhaustedDownload],
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
              downloading_count: 0,
              completed_count: 0,
              failed_count: 1,
              total_size_bytes: exhaustedDownload.file_size_bytes || 0,
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Permanently Failed')).toBeInTheDocument()
        expect(screen.getByText(/maximum retry attempts exceeded/i)).toBeInTheDocument()
        expect(screen.getByText(/retry 3 of 3/i)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /retry download/i })).not.toBeInTheDocument()
      })
    })
  })

  describe('Progress Tracking Accuracy', () => {
    it('should display accurate download progress', async () => {
      const progressStates = [
        { percentage: 0, status: 'pending' as DownloadStatus },
        { percentage: 25, status: 'downloading' as DownloadStatus },
        { percentage: 50, status: 'downloading' as DownloadStatus },
        { percentage: 75, status: 'downloading' as DownloadStatus },
        { percentage: 100, status: 'completed' as DownloadStatus },
      ]

      let currentState = 0
      const downloadWithProgress = createMockDownload({
        id: 1,
        title: 'Progress Test',
        status: progressStates[currentState].status,
        progress_percentage: progressStates[currentState].percentage,
        file_size_bytes: 10485760, // 10 MB
      })

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          downloadWithProgress.status = progressStates[currentState].status
          downloadWithProgress.progress_percentage = progressStates[currentState].percentage
          
          const response: DownloadQueueResponse = {
            downloads: [downloadWithProgress],
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
              pending_count: downloadWithProgress.status === 'pending' ? 1 : 0,
              downloading_count: downloadWithProgress.status === 'downloading' ? 1 : 0,
              completed_count: downloadWithProgress.status === 'completed' ? 1 : 0,
              failed_count: 0,
              total_size_bytes: downloadWithProgress.file_size_bytes || 0,
              estimated_completion: downloadWithProgress.status === 'downloading' ? 
                new Date(Date.now() + 60000).toISOString() : null,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      // Test each progress state
      for (const state of progressStates) {
        await waitFor(() => {
          expect(screen.getByText('Progress Test')).toBeInTheDocument()
          
          if (state.status === 'pending') {
            expect(screen.getByText(/pending/i)).toBeInTheDocument()
          } else if (state.status === 'downloading') {
            expect(screen.getByText(/downloading/i)).toBeInTheDocument()
            expect(screen.getByText(`${state.percentage}%`)).toBeInTheDocument()
            
            // Verify progress bar
            const progressBar = screen.getByRole('progressbar')
            expect(progressBar).toHaveAttribute('aria-valuenow', state.percentage.toString())
            
            // Verify bytes downloaded calculation
            const expectedBytes = Math.floor((state.percentage / 100) * 10485760)
            const expectedMB = (expectedBytes / 1048576).toFixed(1)
            expect(screen.getByText(new RegExp(`${expectedMB} MB of 10.0 MB`))).toBeInTheDocument()
          } else if (state.status === 'completed') {
            expect(screen.getByText(/completed/i)).toBeInTheDocument()
            expect(screen.getByText('100%')).toBeInTheDocument()
          }
        })

        currentState++
        if (currentState < progressStates.length) {
          // Simulate progress update via WebSocket
          const progressEvent = new MessageEvent('message', {
            data: JSON.stringify({
              type: 'download_progress',
              data: {
                download_id: 1,
                status: progressStates[currentState].status,
                progress_percentage: progressStates[currentState].percentage,
              }
            })
          })
          window.dispatchEvent(progressEvent)
        }
      }
    })

    it('should show estimated completion time', async () => {
      const downloadWithETA = createMockDownload({
        id: 1,
        title: 'ETA Test',
        status: 'downloading',
        progress_percentage: 30,
        estimated_completion: new Date(Date.now() + 600000).toISOString(), // 10 minutes
        started_at: new Date(Date.now() - 180000).toISOString(), // Started 3 minutes ago
      })

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [downloadWithETA],
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
              total_size_bytes: downloadWithETA.file_size_bytes || 0,
              estimated_completion: downloadWithETA.estimated_completion,
            }
          }
          return HttpResponse.json(response)
        })
      )

      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('ETA Test')).toBeInTheDocument()
        expect(screen.getByText(/30%/)).toBeInTheDocument()
        expect(screen.getByText(/eta.*10.*min/i)).toBeInTheDocument()
        expect(screen.getByText(/elapsed.*3.*min/i)).toBeInTheDocument()
      })
    })
  })

  describe('File Integrity Verification', () => {
    it('should verify file checksums after download', async () => {
      const completedDownload = createMockDownload({
        id: 1,
        title: 'Integrity Test',
        status: 'completed',
        progress_percentage: 100,
        download_path: '/downloads/integrity-test.epub',
        completed_at: new Date().toISOString(),
      })

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [completedDownload],
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
              downloading_count: 0,
              completed_count: 1,
              failed_count: 0,
              total_size_bytes: completedDownload.file_size_bytes || 0,
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        }),
        http.post('/api/v1/downloads/queue/:id/verify', ({ params }) => {
          const id = parseInt(params.id as string)
          
          if (id === 1) {
            return HttpResponse.json({
              verified: true,
              checksum: 'sha256:abc123def456',
              file_size: 1048576,
              verification_time_ms: 150,
            })
          }
          
          return HttpResponse.json({ error: 'Download not found' }, { status: 404 })
        })
      )

      const user = userEvent.setup()
      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Integrity Test')).toBeInTheDocument()
        expect(screen.getByText(/completed/i)).toBeInTheDocument()
      })

      // Trigger integrity verification
      const verifyButton = screen.getByRole('button', { name: /verify integrity/i })
      await user.click(verifyButton)

      await waitFor(() => {
        expect(screen.getByText(/verification passed/i)).toBeInTheDocument()
        expect(screen.getByText(/checksum.*abc123def456/i)).toBeInTheDocument()
        expect(screen.getByText(/verified in 150ms/i)).toBeInTheDocument()
      })
    })

    it('should handle integrity verification failures', async () => {
      const corruptedDownload = createMockDownload({
        id: 1,
        title: 'Corrupted File',
        status: 'completed',
        progress_percentage: 100,
        download_path: '/downloads/corrupted.epub',
        completed_at: new Date().toISOString(),
      })

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          const response: DownloadQueueResponse = {
            downloads: [corruptedDownload],
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
              downloading_count: 0,
              completed_count: 1,
              failed_count: 0,
              total_size_bytes: corruptedDownload.file_size_bytes || 0,
              estimated_completion: null,
            }
          }
          return HttpResponse.json(response)
        }),
        http.post('/api/v1/downloads/queue/:id/verify', ({ params }) => {
          const id = parseInt(params.id as string)
          
          if (id === 1) {
            return HttpResponse.json({
              verified: false,
              expected_checksum: 'sha256:expected123',
              actual_checksum: 'sha256:actual456',
              error: 'Checksum mismatch detected',
              verification_time_ms: 200,
            })
          }
          
          return HttpResponse.json({ error: 'Download not found' }, { status: 404 })
        })
      )

      const user = userEvent.setup()
      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByText('Corrupted File')).toBeInTheDocument()
      })

      // Trigger integrity verification
      const verifyButton = screen.getByRole('button', { name: /verify integrity/i })
      await user.click(verifyButton)

      await waitFor(() => {
        expect(screen.getByText(/verification failed/i)).toBeInTheDocument()
        expect(screen.getByText(/checksum mismatch/i)).toBeInTheDocument()
        expect(screen.getByText(/expected.*expected123/i)).toBeInTheDocument()
        expect(screen.getByText(/actual.*actual456/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /re-download/i })).toBeInTheDocument()
      })
    })
  })

  afterAll(() => {
    server.resetHandlers()
  })
})