import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, AuthResponse } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

interface AuthActions {
  login: (credentials: { username: string; password: string }) => Promise<void>
  logout: () => void
  setUser: (user: User) => void
  setToken: (token: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  initialize: () => Promise<void>
}

type AuthStore = AuthState & AuthActions

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // Actions
      login: async (credentials) => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Login failed')
          }

          const data: AuthResponse = await response.json()
          
          set({
            user: data.user,
            token: data.access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
        } catch (error) {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed',
          })
          throw error
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        })
      },

      setUser: (user) => set({ user }),
      
      setToken: (token) => set({ token, isAuthenticated: !!token }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error }),
      
      clearError: () => set({ error: null }),

      initialize: async () => {
        const { token, user } = get()
        
        if (!token) {
          set({ isLoading: false, isAuthenticated: false })
          return
        }

        // If we have both token and user data, assume they're valid
        // This prevents immediate logout after login
        if (token && user) {
          set({
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
          return
        }

        try {
          // Only verify token if we don't have user data
          const response = await fetch('/api/v1/users/profile', {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          })

          if (!response.ok) {
            // Don't auto-logout on profile fetch failure during initialization
            // Let the user try to use the app, and handle auth errors per-request
            console.warn('Token validation failed during initialization, but keeping user logged in')
            set({
              isAuthenticated: true,
              isLoading: false,
              error: null,
            })
            return
          }

          const user: User = await response.json()
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
        } catch (error) {
          // Don't auto-logout on network errors during initialization
          console.warn('Network error during token validation:', error)
          set({
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
        }
      },
    }),
    {
      name: 'foliofox-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    }
  )
)

// Initialize auth state on app load
useAuthStore.getState().initialize()