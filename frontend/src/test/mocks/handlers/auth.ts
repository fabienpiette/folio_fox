import { http, HttpResponse } from 'msw'
import { AuthResponse, User } from '@/types'

const mockUser: User = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  is_active: true,
  is_admin: false,
  last_login: new Date().toISOString(),
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: new Date().toISOString(),
}

const mockAuthResponse: AuthResponse = {
  access_token: 'mock-jwt-token',
  token_type: 'Bearer',
  expires_in: 3600,
  user: mockUser,
}

export const authHandlers = [
  // Login
  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = await request.json() as { username: string; password: string }
    
    if (body.username === 'testuser' && body.password === 'password') {
      return HttpResponse.json(mockAuthResponse)
    }
    
    if (body.username === 'admin' && body.password === 'admin') {
      return HttpResponse.json({
        ...mockAuthResponse,
        user: { ...mockUser, username: 'admin', is_admin: true }
      })
    }
    
    return HttpResponse.json(
      {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid username or password',
        timestamp: new Date().toISOString(),
        request_id: 'test-' + Math.random().toString(36).substr(2, 9)
      },
      { status: 401 }
    )
  }),

  // Token refresh
  http.post('/api/v1/auth/refresh', ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: 'Missing or invalid authorization header',
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 401 }
      )
    }
    
    return HttpResponse.json({
      access_token: 'new-mock-jwt-token',
      token_type: 'Bearer',
      expires_in: 3600,
    })
  }),

  // Logout
  http.post('/api/v1/auth/logout', () => {
    return HttpResponse.json({ message: 'Successfully logged out' })
  }),

  // Get current user
  http.get('/api/v1/auth/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Unauthorized',
          status: 401,
          detail: 'Missing or invalid authorization header',
          timestamp: new Date().toISOString(),
          request_id: 'test-' + Math.random().toString(36).substr(2, 9)
        },
        { status: 401 }
      )
    }
    
    return HttpResponse.json(mockUser)
  }),
]