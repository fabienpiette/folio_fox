/**
 * API Contract Validation Tests
 * 
 * Tests to ensure frontend types match backend API responses
 * and OpenAPI specifications are accurate.
 */

import { describe, it, expect, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { dashboardService } from '@/services/dashboard'
import type { 
  DashboardStatsResponse, 
  SystemStatusResponse, 
  DownloadQueueResponse,
  ErrorResponse 
} from '@/types/api'

describe('API Contract Validation', () => {
  describe('Dashboard Stats Endpoint', () => {
    it('should match expected contract for /downloads/dashboard-stats', async () => {
      const mockResponse: DashboardStatsResponse = {
        totalBooks: 1234,
        completed_downloads: 987,
        activeDownloads: 3,
        queueItems: 12,
        failedDownloads: 5
      }

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await dashboardService.getStats()

      // Validate that all required fields are present
      expect(result).toHaveProperty('totalBooks')
      expect(result).toHaveProperty('completed_downloads')
      expect(result).toHaveProperty('activeDownloads')
      expect(result).toHaveProperty('queueItems')
      expect(result).toHaveProperty('failedDownloads')

      // Validate field types
      expect(typeof result.totalBooks).toBe('number')
      expect(typeof result.completed_downloads).toBe('number')
      expect(typeof result.activeDownloads).toBe('number')
      expect(typeof result.queueItems).toBe('number')
      expect(typeof result.failedDownloads).toBe('number')

      // Validate field values
      expect(result.totalBooks).toBe(1234)
      expect(result.completed_downloads).toBe(987)
      expect(result.activeDownloads).toBe(3)
      expect(result.queueItems).toBe(12)
      expect(result.failedDownloads).toBe(5)
    })

    it('should handle error responses with RFC 7807 format', async () => {
      const errorResponse: ErrorResponse = {
        type: 'https://api.foliofox.local/problems/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication token is missing or invalid',
        instance: '/api/v1/downloads/dashboard-stats',
        timestamp: '2025-07-31T10:30:00Z',
        request_id: 'req_test123'
      }

      server.use(
        http.get('/api/v1/downloads/dashboard-stats', () => {
          return HttpResponse.json(errorResponse, { status: 401 })
        })
      )

      const result = await dashboardService.getStats()

      // Should return fallback values on error
      expect(result.totalBooks).toBe(0)
      expect(result.activeDownloads).toBe(0)
      expect(result.queueItems).toBe(0)
      expect(result.failedDownloads).toBe(0)
    })
  })

  describe('System Status Endpoint', () => {
    it('should match expected contract for /system/status', async () => {
      const mockResponse: SystemStatusResponse = {
        database: {
          status: 'healthy',
          message: null,
          response_ms: 12,
          connections: 5
        },
        indexers: {
          total: 10,
          online: 8,
          status: 'degraded'
        },
        downloadService: {
          status: 'active',
          activeDownloads: 3
        }
      }

      server.use(
        http.get('/api/v1/system/status', () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await dashboardService.getSystemStatus()

      // Validate structure
      expect(result).toHaveProperty('database')
      expect(result).toHaveProperty('indexers')
      expect(result).toHaveProperty('downloadService')

      // Validate database status
      expect(result.database).toHaveProperty('status')
      expect(result.database.status).toBe('healthy')

      // Validate indexers status
      expect(result.indexers).toHaveProperty('total')
      expect(result.indexers).toHaveProperty('online')
      expect(result.indexers).toHaveProperty('status')
      expect(typeof result.indexers.total).toBe('number')
      expect(typeof result.indexers.online).toBe('number')

      // Validate download service status
      expect(result.downloadService).toHaveProperty('status')
      expect(result.downloadService).toHaveProperty('activeDownloads')
      expect(typeof result.downloadService.activeDownloads).toBe('number')
    })
  })

  describe('Download Queue Endpoint', () => {
    it('should validate pagination structure', async () => {
      const mockResponse: DownloadQueueResponse = {
        downloads: [],
        pagination: {
          current_page: 1,
          per_page: 50,
          total_pages: 1,
          total_items: 0,
          has_next: false,
          has_prev: false,
          next_page: null,
          prev_page: null
        },
        queue_stats: {
          total_items: 0,
          pending_count: 0,
          downloading_count: 0,
          completed_count: 0,
          failed_count: 0
        }
      }

      server.use(
        http.get('/api/v1/downloads/queue', () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await dashboardService.getRecentDownloads()

      // Should handle empty queue gracefully
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })
  })

  describe('Error Response Validation', () => {
    it('should validate RFC 7807 error format', () => {
      const errorResponse: ErrorResponse = {
        type: 'https://api.foliofox.local/problems/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'The request body contains invalid data',
        instance: '/api/v1/downloads/queue',
        timestamp: '2025-07-31T10:30:00Z',
        request_id: 'req_validation123',
        errors: [
          {
            field: 'priority',
            code: 'range_error',
            message: 'Priority must be between 1 and 10'
          }
        ]
      }

      // Validate required RFC 7807 fields
      expect(errorResponse).toHaveProperty('type')
      expect(errorResponse).toHaveProperty('title')
      expect(errorResponse).toHaveProperty('status')

      // Validate type is URI format
      expect(errorResponse.type).toMatch(/^https?:\/\//)

      // Validate status is number
      expect(typeof errorResponse.status).toBe('number')
      expect(errorResponse.status).toBeGreaterThanOrEqual(100)
      expect(errorResponse.status).toBeLessThan(600)

      // Validate timestamp is ISO format
      expect(errorResponse.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

      // Validate errors array structure if present
      if (errorResponse.errors) {
        expect(Array.isArray(errorResponse.errors)).toBe(true)
        errorResponse.errors.forEach(error => {
          expect(error).toHaveProperty('field')
          expect(error).toHaveProperty('code')
          expect(error).toHaveProperty('message')
        })
      }
    })
  })
})