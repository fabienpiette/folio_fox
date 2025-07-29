import { http, HttpResponse } from 'msw'
import { Indexer } from '@/types'

const mockIndexers: Indexer[] = [
  {
    id: 1,
    name: 'Test Indexer 1',
    type: 'prowlarr',
    base_url: 'https://prowlarr.example.com',
    api_key: 'test-api-key-1',
    is_enabled: true,
    priority: 1,
    categories: ['books', 'ebooks'],
    supported_formats: ['epub', 'pdf', 'mobi'],
    rate_limit_per_hour: 100,
    timeout_seconds: 30,
    health_status: 'healthy',
    last_health_check: new Date().toISOString(),
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'Test Indexer 2',
    type: 'jackett',
    base_url: 'https://jackett.example.com',
    api_key: 'test-api-key-2',
    is_enabled: true,
    priority: 2,
    categories: ['books'],
    supported_formats: ['epub', 'pdf'],
    rate_limit_per_hour: 50,
    timeout_seconds: 25,
    health_status: 'healthy',
    last_health_check: new Date().toISOString(),
    created_at: '2024-01-02T00:00:00.000Z',
    updated_at: new Date().toISOString(),
  },
]

export const indexerHandlers = [
  // Get indexers
  http.get('/api/v1/indexers', ({ request }) => {
    const url = new URL(request.url)
    const enabled = url.searchParams.get('enabled')
    const type = url.searchParams.get('type')
    
    let filteredIndexers = mockIndexers
    
    if (enabled !== null) {
      const isEnabled = enabled === 'true'
      filteredIndexers = filteredIndexers.filter(indexer => indexer.is_enabled === isEnabled)
    }
    
    if (type) {
      filteredIndexers = filteredIndexers.filter(indexer => indexer.type === type)
    }
    
    return HttpResponse.json({
      indexers: filteredIndexers,
      total_count: filteredIndexers.length,
    })
  }),

  // Get specific indexer
  http.get('/api/v1/indexers/:id', ({ params }) => {
    const id = parseInt(params.id as string)
    const indexer = mockIndexers.find(i => i.id === id)
    
    if (!indexer) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Indexer with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    return HttpResponse.json(indexer)
  }),

  // Test indexer connection
  http.post('/api/v1/indexers/:id/test', ({ params }) => {
    const id = parseInt(params.id as string)
    const indexer = mockIndexers.find(i => i.id === id)
    
    if (!indexer) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Indexer with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    // Simulate connection test failure for specific cases
    if (indexer.name.includes('failing')) {
      return HttpResponse.json({
        success: false,
        message: 'Connection failed: Timeout after 30 seconds',
        response_time_ms: 30000,
        error_code: 'TIMEOUT',
        tested_at: new Date().toISOString(),
      })
    }
    
    return HttpResponse.json({
      success: true,
      message: 'Connection successful',
      response_time_ms: 150,
      capabilities: ['search', 'download'],
      tested_at: new Date().toISOString(),
    })
  }),

  // Add indexer
  http.post('/api/v1/indexers', async ({ request }) => {
    const body = await request.json() as any
    
    const newIndexer: Indexer = {
      id: mockIndexers.length + 1,
      name: body.name,
      type: body.type,
      base_url: body.base_url,
      api_key: body.api_key,
      is_enabled: body.is_enabled ?? true,
      priority: body.priority || mockIndexers.length + 1,
      categories: body.categories || [],
      supported_formats: body.supported_formats || [],
      rate_limit_per_hour: body.rate_limit_per_hour || 100,
      timeout_seconds: body.timeout_seconds || 30,
      health_status: 'healthy',
      last_health_check: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    mockIndexers.push(newIndexer)
    
    return HttpResponse.json(newIndexer, { status: 201 })
  }),

  // Update indexer
  http.patch('/api/v1/indexers/:id', async ({ params, request }) => {
    const id = parseInt(params.id as string)
    const body = await request.json() as any
    const indexerIndex = mockIndexers.findIndex(i => i.id === id)
    
    if (indexerIndex === -1) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Indexer with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    mockIndexers[indexerIndex] = {
      ...mockIndexers[indexerIndex],
      ...body,
      updated_at: new Date().toISOString(),
    }
    
    return HttpResponse.json(mockIndexers[indexerIndex])
  }),

  // Delete indexer
  http.delete('/api/v1/indexers/:id', ({ params }) => {
    const id = parseInt(params.id as string)
    const indexerIndex = mockIndexers.findIndex(i => i.id === id)
    
    if (indexerIndex === -1) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Indexer with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    mockIndexers.splice(indexerIndex, 1)
    
    return HttpResponse.json({ message: 'Indexer deleted successfully' })
  }),

  // Sync indexers (for Prowlarr/Jackett)
  http.post('/api/v1/indexers/sync', async ({ request }) => {
    const body = await request.json() as { source: 'prowlarr' | 'jackett'; base_url: string; api_key: string }
    
    // Simulate sync operation
    const syncedIndexers = [
      {
        name: `Synced ${body.source} Indexer 1`,
        type: body.source,
        categories: ['books', 'ebooks'],
        supported_formats: ['epub', 'pdf']
      },
      {
        name: `Synced ${body.source} Indexer 2`,
        type: body.source,
        categories: ['books'],
        supported_formats: ['epub']
      }
    ]
    
    return HttpResponse.json({
      message: `Successfully synced ${syncedIndexers.length} indexers from ${body.source}`,
      synced_count: syncedIndexers.length,
      indexers: syncedIndexers
    })
  }),
]