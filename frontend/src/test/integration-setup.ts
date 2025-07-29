import { beforeEach, afterEach } from 'vitest'
import { server } from './mocks/server'

// Additional setup for integration tests
beforeEach(() => {
  // Reset any runtime handlers we may have added during individual tests
  server.resetHandlers()
  
  // Clear any stored authentication tokens
  localStorage.removeItem('auth-token')
  sessionStorage.clear()
  
  // Reset any global state stores
  // This would be where you reset Zustand stores, React Query cache, etc.
})

afterEach(() => {
  // Clean up any side effects from integration tests
  server.resetHandlers()
})