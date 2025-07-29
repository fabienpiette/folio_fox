import { http, HttpResponse } from 'msw'
import { SystemHealth, ComponentHealth } from '@/types'

const mockComponentHealth: ComponentHealth = {
  status: 'healthy',
  message: 'Component is operating normally',
  response_time_ms: 15,
  last_check: new Date().toISOString(),
}

const mockSystemHealth: SystemHealth = {
  status: 'healthy',
  version: '1.0.0',
  uptime_seconds: 86400,
  timestamp: new Date().toISOString(),
  components: {
    database: mockComponentHealth,
    redis: mockComponentHealth,
    indexers: mockComponentHealth,
    filesystem: mockComponentHealth,
    downloads: mockComponentHealth,
    scheduler: mockComponentHealth,
  }
}

export const systemHandlers = [
  // Health check - overall
  http.get('/api/v1/health', () => {
    return HttpResponse.json(mockSystemHealth)
  }),

  // Health check - specific component
  http.get('/api/v1/health/:component', ({ params }) => {
    const component = params.component as string
    
    if (!mockSystemHealth.components[component as keyof typeof mockSystemHealth.components]) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Component ${component} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    return HttpResponse.json(mockSystemHealth.components[component as keyof typeof mockSystemHealth.components])
  }),

  // System metrics
  http.get('/api/v1/metrics', () => {
    return HttpResponse.json({
      system: {
        cpu_usage_percent: 25.5,
        memory_usage_percent: 45.2,
        disk_usage_percent: 60.1,
        network_io_kbps: {
          in: 150.2,
          out: 89.7
        }
      },
      application: {
        active_connections: 25,
        total_searches_today: 150,
        total_downloads_today: 45,
        queue_size: 12,
        cache_hit_rate: 0.85
      },
      database: {
        connections_active: 5,
        connections_idle: 10,
        query_avg_duration_ms: 12.5,
        total_books: 1250,
        total_downloads: 3400
      }
    })
  }),

  // Configuration endpoints
  http.get('/api/v1/config', () => {
    return HttpResponse.json({
      search: {
        default_timeout_seconds: 30,
        max_results_per_indexer: 100,
        cache_ttl_seconds: 300
      },
      downloads: {
        max_concurrent_downloads: 3,
        retry_attempts: 3,
        timeout_seconds: 300
      },
      system: {
        log_level: 'INFO',
        max_log_files: 10,
        cleanup_interval_hours: 24
      }
    })
  }),

  http.patch('/api/v1/config', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      message: 'Configuration updated successfully',
      updated_settings: Object.keys(body as object).length
    })
  }),

  // System maintenance
  http.post('/api/v1/maintenance/cleanup', () => {
    return HttpResponse.json({
      message: 'Cleanup task started',
      task_id: 'cleanup-' + Math.random().toString(36).substr(2, 9),
      estimated_duration_seconds: 120
    })
  }),

  http.post('/api/v1/maintenance/backup', () => {
    return HttpResponse.json({
      message: 'Backup task started',
      task_id: 'backup-' + Math.random().toString(36).substr(2, 9),
      estimated_duration_seconds: 300
    })
  }),

  // Admin user management
  http.get('/api/v1/admin/users', ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    
    if (!authHeader || !authHeader.includes('admin')) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          detail: 'Admin access required',
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 403 }
      )
    }
    
    return HttpResponse.json({
      users: [
        {
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          is_active: true,
          is_admin: false,
          last_login: new Date().toISOString(),
          created_at: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 2,
          username: 'admin',
          email: 'admin@example.com',
          is_active: true,
          is_admin: true,
          last_login: new Date().toISOString(),
          created_at: '2024-01-01T00:00:00.000Z'
        }
      ],
      pagination: {
        current_page: 1,
        per_page: 20,
        total_pages: 1,
        total_items: 2,
        has_next: false,
        has_prev: false,
        next_page: null,
        prev_page: null,
      }
    })
  }),
]