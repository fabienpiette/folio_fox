import { http, HttpResponse } from 'msw'
import { authHandlers } from './handlers/auth'
import { searchHandlers } from './handlers/search'
import { downloadHandlers } from './handlers/downloads'
import { libraryHandlers } from './handlers/library'
import { systemHandlers } from './handlers/system'
import { indexerHandlers } from './handlers/indexers'

// Combine all handlers
export const handlers = [
  ...authHandlers,
  ...searchHandlers,
  ...downloadHandlers,
  ...libraryHandlers,
  ...systemHandlers,
  ...indexerHandlers,
  
  // Default fallback handler
  http.all('*', ({ request }) => {
    console.warn(`Unhandled ${request.method} request to ${request.url}`)
    return HttpResponse.json(
      { 
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: `Endpoint not found: ${request.method} ${request.url}`,
        timestamp: new Date().toISOString(),
        request_id: 'test-' + Math.random().toString(36).substr(2, 9)
      },
      { status: 404 }
    )
  })
]