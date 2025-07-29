/**
 * WebSocket Integration Testing Suite
 * 
 * Tests real-time communication, connection management, 
 * message handling, and event synchronization.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/utils/test-utils'
import { createMockWebSocket } from '@/test/utils/websocket-mock'
import { DownloadsPage } from '@/components/downloads/DownloadsPage'
import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { useWebSocket } from '@/hooks/useWebSocket'
import { WebSocketMessage, DownloadQueueItem } from '@/types'

// Mock WebSocket API
const mockWebSocketClass = vi.fn()
let mockWebSocketInstance: ReturnType<typeof createMockWebSocket>

beforeAll(() => {
  mockWebSocketInstance = createMockWebSocket()
  mockWebSocketClass.mockImplementation(() => mockWebSocketInstance)
  
  // Replace global WebSocket with mock
  Object.defineProperty(window, 'WebSocket', {
    value: mockWebSocketClass,
    writable: true,
  })
})

describe('WebSocket Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWebSocketInstance.reset()
  })

  afterEach(() => {
    mockWebSocketInstance.close()
  })

  describe('Connection Management', () => {
    it('should establish WebSocket connection on initialization', async () => {
      const TestComponent = () => {
        const { isConnected, connectionState } = useWebSocket({
          url: 'ws://localhost:8080/ws',
          reconnect: true,
        })

        return (
          <div>
            <div data-testid="connection-status">
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            <div data-testid="connection-state">{connectionState}</div>
          </div>
        )
      }

      renderWithProviders(<TestComponent />)

      // Should attempt to connect
      expect(mockWebSocketClass).toHaveBeenCalledWith('ws://localhost:8080/ws')
      
      // Simulate successful connection
      mockWebSocketInstance.simulateOpen()

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected')
        expect(screen.getByTestId('connection-state')).toHaveTextContent('connected')
      })
    })

    it('should handle connection failures with retry logic', async () => {
      const TestComponent = () => {
        const { isConnected, connectionState, reconnectAttempts } = useWebSocket({
          url: 'ws://localhost:8080/ws',
          reconnect: true,
          maxReconnectAttempts: 3,
          reconnectInterval: 1000,
        })

        return (
          <div>
            <div data-testid="connection-status">
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            <div data-testid="connection-state">{connectionState}</div>
            <div data-testid="reconnect-attempts">{reconnectAttempts}</div>
          </div>
        )
      }

      renderWithProviders(<TestComponent />)

      // Simulate connection failure
      mockWebSocketInstance.simulateError(new Error('Connection failed'))

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Disconnected')
        expect(screen.getByTestId('connection-state')).toHaveTextContent('reconnecting')
      })

      // Should attempt to reconnect
      expect(mockWebSocketClass).toHaveBeenCalledTimes(2)

      // Simulate multiple failures
      mockWebSocketInstance.simulateError(new Error('Connection failed again'))
      mockWebSocketInstance.simulateError(new Error('Still failing'))

      await waitFor(() => {
        expect(screen.getByTestId('reconnect-attempts')).toHaveTextContent('3')
        expect(screen.getByTestId('connection-state')).toHaveTextContent('failed')
      })
    })

    it('should handle connection drops and automatic reconnection', async () => {
      const TestComponent = () => {
        const { isConnected, connectionState } = useWebSocket({
          url: 'ws://localhost:8080/ws',
          reconnect: true,
          reconnectInterval: 500,
        })

        return (
          <div>
            <div data-testid="connection-status">
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            <div data-testid="connection-state">{connectionState}</div>
          </div>
        )
      }

      renderWithProviders(<TestComponent />)

      // Initial connection
      mockWebSocketInstance.simulateOpen()

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected')
      })

      // Simulate connection drop
      mockWebSocketInstance.simulateClose({ code: 1006, reason: 'Connection lost' })

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Disconnected')
        expect(screen.getByTestId('connection-state')).toHaveTextContent('reconnecting')
      })

      // Should attempt to reconnect
      expect(mockWebSocketClass).toHaveBeenCalledTimes(2)

      // Simulate successful reconnection
      mockWebSocketInstance.simulateOpen()

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected')
        expect(screen.getByTestId('connection-state')).toHaveTextContent('connected')
      })
    })
  })

  describe('Message Handling', () => {
    it('should receive and handle download progress messages', async () => {
      renderWithProviders(<DownloadsPage />)

      // Establish connection
      mockWebSocketInstance.simulateOpen()

      // Simulate download progress message
      const progressMessage: WebSocketMessage = {
        type: 'download_progress',
        data: {
          download_id: 1,
          status: 'downloading',
          progress_percentage: 45,
          bytes_downloaded: 4718592,
          bytes_total: 10485760,
          download_speed_kbps: 512,
          eta_seconds: 300,
        },
        timestamp: new Date().toISOString(),
      }

      mockWebSocketInstance.simulateMessage(progressMessage)

      await waitFor(() => {
        expect(screen.getByText(/45%/)).toBeInTheDocument()
        expect(screen.getByText(/512 KB\/s/)).toBeInTheDocument()
        expect(screen.getByText(/5 minutes remaining/)).toBeInTheDocument()
      })
    })

    it('should handle download status change messages', async () => {
      renderWithProviders(<DownloadsPage />)

      mockWebSocketInstance.simulateOpen()

      // Simulate download completion
      const completionMessage: WebSocketMessage = {
        type: 'download_completed',
        data: {
          download_id: 1,
          status: 'completed',
          progress_percentage: 100,
          download_path: '/downloads/test-book.epub',
          file_size_bytes: 10485760,
          download_duration_seconds: 600,
          average_speed_kbps: 1024,
        },
        timestamp: new Date().toISOString(),
      }

      mockWebSocketInstance.simulateMessage(completionMessage)

      await waitFor(() => {
        expect(screen.getByText(/completed/i)).toBeInTheDocument()
        expect(screen.getByText(/100%/)).toBeInTheDocument()
        expect(screen.getByText(/10 minutes/)).toBeInTheDocument()
        expect(screen.getByText(/1024 KB\/s average/)).toBeInTheDocument()
      })
    })

    it('should handle download error messages', async () => {
      renderWithProviders(<DownloadsPage />)

      mockWebSocketInstance.simulateOpen()

      // Simulate download error
      const errorMessage: WebSocketMessage = {
        type: 'download_failed',
        data: {
          download_id: 1,
          status: 'failed',
          error_message: 'Network timeout: server unreachable',
          retry_count: 1,
          max_retries: 3,
          next_retry_at: new Date(Date.now() + 60000).toISOString(),
        },
        timestamp: new Date().toISOString(),
      }

      mockWebSocketInstance.simulateMessage(errorMessage)

      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument()
        expect(screen.getByText(/network timeout/i)).toBeInTheDocument()
        expect(screen.getByText(/retry 1 of 3/i)).toBeInTheDocument()
        expect(screen.getByText(/retrying in 1 minute/i)).toBeInTheDocument()
      })
    })

    it('should handle queue updates and reordering', async () => {
      renderWithProviders(<DownloadsPage />)

      mockWebSocketInstance.simulateOpen()

      // Simulate queue reorder
      const queueUpdateMessage: WebSocketMessage = {
        type: 'queue_updated',
        data: {
          action: 'reorder',
          affected_downloads: [
            { download_id: 1, new_position: 2, new_priority: 5 },
            { download_id: 2, new_position: 1, new_priority: 10 },
            { download_id: 3, new_position: 3, new_priority: 3 },
          ],
        },
        timestamp: new Date().toISOString(),
      }

      mockWebSocketInstance.simulateMessage(queueUpdateMessage)

      await waitFor(() => {
        // Should update UI to reflect new order
        const downloadItems = screen.getAllByTestId(/download-item-/i)
        expect(downloadItems[0]).toHaveAttribute('data-download-id', '2')
        expect(downloadItems[1]).toHaveAttribute('data-download-id', '1')
        expect(downloadItems[2]).toHaveAttribute('data-download-id', '3')
      })
    })

    it('should handle new download additions', async () => {
      renderWithProviders(<DownloadsPage />)

      mockWebSocketInstance.simulateOpen()

      // Simulate new download added
      const newDownloadMessage: WebSocketMessage = {
        type: 'download_added',
        data: {
          id: 4,
          user: { id: 1, username: 'testuser' },
          book_id: null,
          indexer: { id: 1, name: 'Test Indexer' },
          title: 'New WebSocket Book',
          author_name: 'WebSocket Author',
          download_url: 'https://example.com/new-book.epub',
          file_format: 'epub',
          file_size_bytes: 5242880,
          file_size_human: '5.0 MB',
          priority: 7,
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
        } as DownloadQueueItem,
        timestamp: new Date().toISOString(),
      }

      mockWebSocketInstance.simulateMessage(newDownloadMessage)

      await waitFor(() => {
        expect(screen.getByText('New WebSocket Book')).toBeInTheDocument()
        expect(screen.getByText('WebSocket Author')).toBeInTheDocument()
        expect(screen.getByText(/pending/i)).toBeInTheDocument()
        expect(screen.getByText(/5.0 MB/)).toBeInTheDocument()
      })
    })
  })

  describe('System Status Updates', () => {
    it('should handle system health status changes', async () => {
      renderWithProviders(<DashboardPage />)

      mockWebSocketInstance.simulateOpen()

      // Simulate system health degradation
      const healthMessage: WebSocketMessage = {
        type: 'system_health_changed',
        data: {
          status: 'degraded',
          affected_components: ['indexers', 'downloads'],
          changes: [
            {
              component: 'indexers',
              old_status: 'healthy',
              new_status: 'degraded',
              message: '1 of 3 indexers offline',
            },
            {
              component: 'downloads',
              old_status: 'healthy',
              new_status: 'degraded',
              message: 'Download queue processing slowly',
            }
          ],
        },
        timestamp: new Date().toISOString(),
      }

      mockWebSocketInstance.simulateMessage(healthMessage)

      await waitFor(() => {
        expect(screen.getByText(/system status: degraded/i)).toBeInTheDocument()
        expect(screen.getByText(/1 of 3 indexers offline/i)).toBeInTheDocument()
        expect(screen.getByText(/download queue processing slowly/i)).toBeInTheDocument()
      })
    })

    it('should handle indexer status changes', async () => {
      renderWithProviders(<DashboardPage />)

      mockWebSocketInstance.simulateOpen()

      // Simulate indexer going offline
      const indexerMessage: WebSocketMessage = {
        type: 'indexer_status_changed',
        data: {
          indexer_id: 2,
          indexer_name: 'Jackett Local',
          old_status: 'healthy',
          new_status: 'unhealthy',
          error: 'Connection timeout after 30 seconds',
          last_successful_request: new Date(Date.now() - 300000).toISOString(),
        },
        timestamp: new Date().toISOString(),
      }

      mockWebSocketInstance.simulateMessage(indexerMessage)

      await waitFor(() => {
        expect(screen.getByText(/jackett local.*offline/i)).toBeInTheDocument()
        expect(screen.getByText(/connection timeout/i)).toBeInTheDocument()
        expect(screen.getByText(/last successful.*5 minutes ago/i)).toBeInTheDocument()
      })
    })
  })

  describe('Message Broadcasting', () => {
    it('should send heartbeat messages to maintain connection', async () => {
      const TestComponent = () => {
        const { isConnected, send } = useWebSocket({
          url: 'ws://localhost:8080/ws',
          heartbeat: {
            enabled: true,
            interval: 1000,
            message: { type: 'ping', data: {}, timestamp: new Date().toISOString() },
          },
        })

        return (
          <div>
            <div data-testid="connection-status">
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        )
      }

      renderWithProviders(<TestComponent />)

      mockWebSocketInstance.simulateOpen()

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected')
      })

      // Wait for heartbeat interval
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Verify heartbeat message was sent
      expect(mockWebSocketInstance.sentMessages).toContainEqual(
        expect.objectContaining({
          type: 'ping',
          data: {},
        })
      )
    })

    it('should send user activity updates', async () => {
      const TestComponent = () => {
        const { send } = useWebSocket({
          url: 'ws://localhost:8080/ws',
        })

        const handleUserAction = () => {
          send({
            type: 'user_activity',
            data: {
              action: 'search_performed',
              query: 'test search',
              results_count: 25,
            },
            timestamp: new Date().toISOString(),
          })
        }

        return (
          <button onClick={handleUserAction} data-testid="action-button">
            Perform Action
          </button>
        )
      }

      const { user } = renderWithProviders(<TestComponent />)

      mockWebSocketInstance.simulateOpen()

      const actionButton = screen.getByTestId('action-button')
      await user.click(actionButton)

      expect(mockWebSocketInstance.sentMessages).toContainEqual(
        expect.objectContaining({
          type: 'user_activity',
          data: {
            action: 'search_performed',
            query: 'test search',
            results_count: 25,
          },
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed WebSocket messages', async () => {
      const TestComponent = () => {
        const { lastError } = useWebSocket({
          url: 'ws://localhost:8080/ws',
        })

        return (
          <div>
            <div data-testid="last-error">
              {lastError || 'No error'}
            </div>
          </div>
        )
      }

      renderWithProviders(<TestComponent />)

      mockWebSocketInstance.simulateOpen()

      // Send malformed message
      mockWebSocketInstance.simulateRawMessage('invalid json{')

      await waitFor(() => {
        expect(screen.getByTestId('last-error')).toHaveTextContent(/failed to parse message/i)
      })
    })

    it('should handle unknown message types gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const TestComponent = () => {
        useWebSocket({
          url: 'ws://localhost:8080/ws',
        })

        return <div>WebSocket Test</div>
      }

      renderWithProviders(<TestComponent />)

      mockWebSocketInstance.simulateOpen()

      // Send unknown message type
      const unknownMessage: WebSocketMessage = {
        type: 'unknown_message_type' as any,
        data: { some: 'data' },
        timestamp: new Date().toISOString(),
      }

      mockWebSocketInstance.simulateMessage(unknownMessage)

      // Should log warning but not crash
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown WebSocket message type')
      )

      consoleWarnSpy.mockRestore()
    })

    it('should handle WebSocket connection limits', async () => {
      const TestComponent = () => {
        const { connectionState, lastError } = useWebSocket({
          url: 'ws://localhost:8080/ws',
        })

        return (
          <div>
            <div data-testid="connection-state">{connectionState}</div>
            <div data-testid="last-error">{lastError || 'No error'}</div>
          </div>
        )
      }

      renderWithProviders(<TestComponent />)

      // Simulate connection rejected due to rate limiting
      mockWebSocketInstance.simulateClose({ 
        code: 1008, 
        reason: 'Connection limit exceeded' 
      })

      await waitFor(() => {
        expect(screen.getByTestId('connection-state')).toHaveTextContent('failed')
        expect(screen.getByTestId('last-error')).toHaveTextContent(/connection limit exceeded/i)
      })
    })
  })

  describe('Performance Optimization', () => {
    it('should throttle high-frequency messages', async () => {
      let messageCount = 0

      const TestComponent = () => {
        const { } = useWebSocket({
          url: 'ws://localhost:8080/ws',
          messageThrottling: {
            enabled: true,
            maxMessagesPerSecond: 10,
          },
          onMessage: () => {
            messageCount++
          },
        })

        return <div>WebSocket Test</div>
      }

      renderWithProviders(<TestComponent />)

      mockWebSocketInstance.simulateOpen()

      // Send 20 messages rapidly
      for (let i = 0; i < 20; i++) {
        const message: WebSocketMessage = {
          type: 'download_progress',
          data: { download_id: 1, progress_percentage: i * 5 },
          timestamp: new Date().toISOString(),
        }
        mockWebSocketInstance.simulateMessage(message)
      }

      // Should throttle to max 10 messages per second
      expect(messageCount).toBeLessThanOrEqual(10)
    })

    it('should batch similar message types', async () => {
      const receivedBatches: any[] = []

      const TestComponent = () => {
        const { } = useWebSocket({
          url: 'ws://localhost:8080/ws',
          messageBatching: {
            enabled: true,
            batchInterval: 100,
            batchSize: 5,
          },
          onMessageBatch: (batch) => {
            receivedBatches.push(batch)
          },
        })

        return <div>WebSocket Test</div>
      }

      renderWithProviders(<TestComponent />)

      mockWebSocketInstance.simulateOpen()

      // Send multiple progress messages rapidly
      for (let i = 0; i < 8; i++) {
        const message: WebSocketMessage = {
          type: 'download_progress',
          data: { download_id: 1, progress_percentage: i * 10 },
          timestamp: new Date().toISOString(),
        }
        mockWebSocketInstance.simulateMessage(message)
      }

      // Wait for batch interval
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should batch messages
      expect(receivedBatches.length).toBeGreaterThan(0)
      expect(receivedBatches[0]).toHaveLength(5) // First batch
      expect(receivedBatches[1]).toHaveLength(3) // Remaining messages
    })
  })

  afterAll(() => {
    // Restore original WebSocket
    delete (window as any).WebSocket
  })
})