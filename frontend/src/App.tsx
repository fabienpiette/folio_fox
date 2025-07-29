import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useSystemHealth } from '@/hooks/useSystemHealth'

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
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="downloads" element={<DownloadsPage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="config/*" element={<ConfigurationPage />} />
            </Route>
            <Route path="/auth/*" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}
      </Routes>
    </div>
  )
}

export default App