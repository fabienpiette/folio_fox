import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'

import App from './App.tsx'
import './index.css'

// Configure React Query with optimized performance settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Enhanced retry logic with exponential backoff
      retry: (failureCount, error: unknown) => {
        const errorResponse = (error as {response?: {status?: number}})?.response
        
        // Don't retry on client errors (4xx)
        if (errorResponse?.status && errorResponse.status >= 400 && errorResponse.status < 500) {
          console.warn(`Query failed with ${errorResponse.status}, not retrying`)
          return false
        }
        
        // Retry up to 3 times for server errors and network issues
        return failureCount < 3
      },
      
      // Exponential backoff with jitter for retries
      retryDelay: (attemptIndex) => {
        const baseDelay = Math.min(1000 * (2 ** attemptIndex), 30000)
        const jitter = Math.random() * 0.3 * baseDelay
        return baseDelay + jitter
      },
      
      // Default stale time - can be overridden per query
      staleTime: 2 * 60 * 1000, // 2 minutes default
      
      // Garbage collection time - keep cached data longer
      gcTime: 15 * 60 * 1000, // 15 minutes
      
      // Performance optimizations
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
      
      // Network mode for offline handling
      networkMode: 'online',
      
      // Background refetching
      refetchInterval: false, // Disabled by default, enabled per query
      refetchIntervalInBackground: false,
      
      // Prevent unnecessary renders
      notifyOnChangeProps: ['data', 'error', 'isLoading'],
      
      // Request deduplication
      structuralSharing: true,
    },
    mutations: {
      retry: false,
      networkMode: 'online',
    },
  },
  
  // Global error handling
  mutationCache: {
    onError: (error, variables, context, mutation) => {
      console.error('Mutation error:', error, {
        variables,
        context: context,
        mutationKey: mutation.mutationKey,
      })
    },
  },
  
  queryCache: {
    onError: (error, query) => {
      // Only log non-auth errors to avoid spam
      const errorResponse = (error as {response?: {status?: number}})?.response
      if (errorResponse?.status !== 401 && errorResponse?.status !== 403) {
        console.error('Query error:', error, {
          queryKey: query.queryKey,
          queryHash: query.queryHash,
        })
      }
    },
    
    onSuccess: (data, query) => {
      // Optional: Log successful queries for debugging
      if (process.env.NODE_ENV === 'development') {
        console.debug('Query success:', {
          queryKey: query.queryKey,
          dataSize: JSON.stringify(data).length,
        })
      }
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            className: 'dark:bg-dark-800 dark:text-dark-100',
            style: {
              background: 'rgb(30 41 59)', // dark-800
              color: 'rgb(248 250 252)', // dark-50
              border: '1px solid rgb(71 85 105)', // dark-600
            },
          }}
        />
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
)