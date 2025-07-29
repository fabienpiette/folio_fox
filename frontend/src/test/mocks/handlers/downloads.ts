import { http, HttpResponse } from 'msw'
import { DownloadQueueItem, DownloadQueueResponse, DownloadStatus } from '@/types'

const mockDownloads: DownloadQueueItem[] = [
  {
    id: 1,
    user: { id: 1, username: 'testuser' },
    book_id: null,
    indexer: { id: 1, name: 'Test Indexer 1' },
    title: 'The Great Gatsby',
    author_name: 'F. Scott Fitzgerald',
    download_url: 'https://example.com/download/1',
    file_format: 'epub',
    file_size_bytes: 1048576,
    file_size_human: '1.0 MB',
    priority: 5,
    status: 'downloading' as DownloadStatus,
    progress_percentage: 65,
    download_path: null,
    quality_profile: { id: 1, name: 'Standard' },
    retry_count: 0,
    max_retries: 3,
    error_message: null,
    estimated_completion: new Date(Date.now() + 300000).toISOString(),
    started_at: new Date(Date.now() - 180000).toISOString(),
    completed_at: null,
    created_at: new Date(Date.now() - 600000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    user: { id: 1, username: 'testuser' },
    book_id: null,
    indexer: { id: 2, name: 'Test Indexer 2' },
    title: 'To Kill a Mockingbird',
    author_name: 'Harper Lee',
    download_url: 'https://example.com/download/2',
    file_format: 'pdf',
    file_size_bytes: 2097152,
    file_size_human: '2.0 MB',
    priority: 3,
    status: 'pending' as DownloadStatus,
    progress_percentage: 0,
    download_path: null,
    quality_profile: { id: 1, name: 'Standard' },
    retry_count: 0,
    max_retries: 3,
    error_message: null,
    estimated_completion: null,
    started_at: null,
    completed_at: null,
    created_at: new Date(Date.now() - 300000).toISOString(),
    updated_at: new Date().toISOString(),
  },
]

export const downloadHandlers = [
  // Get download queue
  http.get('/api/v1/downloads/queue', ({ request }) => {
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const status = url.searchParams.get('status')?.split(',')
    
    let filteredDownloads = mockDownloads
    if (status) {
      filteredDownloads = mockDownloads.filter(download => 
        status.includes(download.status)
      )
    }
    
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedDownloads = filteredDownloads.slice(startIndex, endIndex)
    
    const response: DownloadQueueResponse = {
      downloads: paginatedDownloads,
      pagination: {
        current_page: page,
        per_page: limit,
        total_pages: Math.ceil(filteredDownloads.length / limit),
        total_items: filteredDownloads.length,
        has_next: endIndex < filteredDownloads.length,
        has_prev: page > 1,
        next_page: endIndex < filteredDownloads.length ? page + 1 : null,
        prev_page: page > 1 ? page - 1 : null,
      },
      queue_stats: {
        total_items: mockDownloads.length,
        pending_count: mockDownloads.filter(d => d.status === 'pending').length,
        downloading_count: mockDownloads.filter(d => d.status === 'downloading').length,
        completed_count: mockDownloads.filter(d => d.status === 'completed').length,
        failed_count: mockDownloads.filter(d => d.status === 'failed').length,
        total_size_bytes: mockDownloads.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0),
        estimated_completion: new Date(Date.now() + 600000).toISOString(),
      }
    }
    
    return HttpResponse.json(response)
  }),

  // Get specific download
  http.get('/api/v1/downloads/queue/:id', ({ params }) => {
    const id = parseInt(params.id as string)
    const download = mockDownloads.find(d => d.id === id)
    
    if (!download) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Download with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    return HttpResponse.json(download)
  }),

  // Add to download queue
  http.post('/api/v1/downloads/queue', async ({ request }) => {
    const body = await request.json() as any
    
    const newDownload: DownloadQueueItem = {
      id: mockDownloads.length + 1,
      user: { id: 1, username: 'testuser' },
      book_id: body.book_id || null,
      indexer: { id: body.indexer_id, name: 'Test Indexer' },
      title: body.title,
      author_name: body.author_name || null,
      download_url: body.download_url,
      file_format: body.file_format,
      file_size_bytes: body.file_size_bytes || null,
      file_size_human: body.file_size_bytes ? `${(body.file_size_bytes / 1048576).toFixed(1)} MB` : null,
      priority: body.priority || 5,
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
    }
    
    mockDownloads.push(newDownload)
    
    return HttpResponse.json(newDownload, { status: 201 })
  }),

  // Update download
  http.patch('/api/v1/downloads/queue/:id', async ({ params, request }) => {
    const id = parseInt(params.id as string)
    const body = await request.json() as any
    const downloadIndex = mockDownloads.findIndex(d => d.id === id)
    
    if (downloadIndex === -1) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Download with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    mockDownloads[downloadIndex] = {
      ...mockDownloads[downloadIndex],
      ...body,
      updated_at: new Date().toISOString(),
    }
    
    return HttpResponse.json(mockDownloads[downloadIndex])
  }),

  // Delete download
  http.delete('/api/v1/downloads/queue/:id', ({ params }) => {
    const id = parseInt(params.id as string)
    const downloadIndex = mockDownloads.findIndex(d => d.id === id)
    
    if (downloadIndex === -1) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: `Download with id ${id} not found`,
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 404 }
      )
    }
    
    mockDownloads.splice(downloadIndex, 1)
    
    return HttpResponse.json({ message: 'Download removed from queue' })
  }),

  // Batch operations
  http.post('/api/v1/downloads/queue/batch', async ({ request }) => {
    const body = await request.json() as { action: string; ids: number[] }
    
    const updatedDownloads = mockDownloads.filter(download => 
      body.ids.includes(download.id)
    ).map(download => {
      switch (body.action) {
        case 'pause':
          return { ...download, status: 'paused' as DownloadStatus }
        case 'resume':
          return { ...download, status: 'pending' as DownloadStatus }
        case 'cancel':
          return { ...download, status: 'cancelled' as DownloadStatus }
        default:
          return download
      }
    })
    
    return HttpResponse.json({
      message: `${body.action} applied to ${updatedDownloads.length} downloads`,
      affected_downloads: updatedDownloads.length
    })
  }),
]