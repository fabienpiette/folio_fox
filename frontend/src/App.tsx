import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { ErrorBoundary } from '@/components/ui/feedback'

// Layout Components
import { AuthLayout } from '@/components/layout/AuthLayout'
import { MainLayout } from '@/components/layout/MainLayout'

// Page Components
import { LoginPage } from '@/components/auth/LoginPage'
import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { SearchPage } from '@/components/search/SearchPage'
import { DownloadsPage } from '@/components/downloads/DownloadsPage'
import { LibraryPage } from '@/components/library/LibraryPage'
import { ConfigurationPage } from '@/components/config/ConfigurationPage'
import { LoadingSpinner } from '@/components/ui/feedback/LoadingSpinner'

function App() {
  const { isAuthenticated, isLoading } = useAuthStore()
  
  // Initialize WebSocket connection when authenticated
  useWebSocket(isAuthenticated)
  
  // Monitor system health
  useSystemHealth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('Application Error:', error, errorInfo)
        // In production, send to error reporting service
        if (process.env.NODE_ENV === 'production') {
          // Example: sendErrorToReportingService(error, errorInfo)
        }
      }}
      showDetails={process.env.NODE_ENV === 'development'}
    >
      <div className="min-h-screen bg-dark-950 text-dark-50">
        <Routes>
          {/* Authentication Routes */}
          {!isAuthenticated ? (
            <>
              <Route path="/auth/*" element={<AuthLayout />}>
                <Route path="login" element={<LoginPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/auth/login" replace />} />
            </>
          ) : (
            /* Main Application Routes */
            <>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route 
                  path="dashboard" 
                  element={
                    <ErrorBoundary>
                      <DashboardPage />
                    </ErrorBoundary>
                  } 
                />
                <Route 
                  path="search" 
                  element={
                    <ErrorBoundary>
                      <SearchPage />
                    </ErrorBoundary>
                  } 
                />
                <Route 
                  path="downloads" 
                  element={
                    <ErrorBoundary>
                      <DownloadsPage />
                    </ErrorBoundary>
                  } 
                />
                <Route 
                  path="library" 
                  element={
                    <ErrorBoundary>
                      <LibraryPage />
                    </ErrorBoundary>
                  } 
                />
                <Route 
                  path="config/*" 
                  element={
                    <ErrorBoundary>
                      <ConfigurationPage />
                    </ErrorBoundary>
                  } 
                />
              </Route>
              <Route path="/auth/*" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </>
          )}
        </Routes>
      </div>
    </ErrorBoundary>
  )
}

export default App