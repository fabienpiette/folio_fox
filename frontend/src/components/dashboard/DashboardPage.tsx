import { useDashboardStats, useRecentDownloads, useSystemStatus } from '@/hooks/useDashboard'

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: recentDownloads, isLoading: downloadsLoading } = useRecentDownloads()
  const { data: systemStatus, isLoading: statusLoading } = useSystemStatus()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-dark-50">Dashboard</h1>
        <p className="mt-2 text-dark-400">
          Overview of your eBook library and download activity
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={
            <svg className="w-6 h-6 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          label="Total Books"
          value={statsLoading ? '...' : stats?.totalBooks?.toLocaleString() || '0'}
          bgColor="bg-primary-500/20"
          isLoading={statsLoading}
        />

        <StatCard
          icon={
            <svg className="w-6 h-6 text-success-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
            </svg>
          }
          label="Active Downloads"
          value={statsLoading ? '...' : stats?.activeDownloads?.toString() || '0'}
          bgColor="bg-success-500/20"
          isLoading={statsLoading}
        />

        <StatCard
          icon={
            <svg className="w-6 h-6 text-warning-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
            </svg>
          }
          label="Queue Items"
          value={statsLoading ? '...' : stats?.queueItems?.toString() || '0'}
          bgColor="bg-warning-500/20"
          isLoading={statsLoading}
        />

        <StatCard
          icon={
            <svg className="w-6 h-6 text-error-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
            </svg>
          }
          label="Failed Downloads"
          value={statsLoading ? '...' : stats?.failedDownloads?.toString() || '0'}
          bgColor="bg-error-500/20"
          isLoading={statsLoading}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">Recent Downloads</h3>
          {downloadsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-4 bg-dark-600 rounded w-24 mb-1"></div>
                      <div className="h-3 bg-dark-700 rounded w-16"></div>
                    </div>
                    <div className="h-6 bg-dark-600 rounded w-16"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {recentDownloads?.length ? (
                recentDownloads.map(download => (
                  <div key={download.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-200">{download.title}</p>
                      <p className="text-xs text-dark-400">{download.author}</p>
                    </div>
                    <StatusBadge status={download.status} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-dark-400 text-center py-4">No recent downloads</p>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">System Status</h3>
          {statusLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="h-4 bg-dark-600 rounded w-20"></div>
                    <div className="flex items-center space-x-2">
                      <div className="h-3 w-3 bg-dark-600 rounded-full"></div>
                      <div className="h-3 bg-dark-600 rounded w-12"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-300">Database</span>
                <div className="flex items-center space-x-2">
                  <div className={`status-dot ${
                    systemStatus?.database.status === 'healthy' ? 'status-online' : 'status-error'
                  }`}></div>
                  <span className={`text-xs ${
                    systemStatus?.database.status === 'healthy' ? 'text-success-400' : 'text-error-400'
                  }`}>
                    {systemStatus?.database.status === 'healthy' ? 'Healthy' : 'Unhealthy'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-300">Indexers</span>
                <div className="flex items-center space-x-2">
                  <div className={`status-dot ${
                    systemStatus?.indexers.status === 'healthy' ? 'status-online' : 'status-error'
                  }`}></div>
                  <span className={`text-xs ${
                    systemStatus?.indexers.status === 'healthy' ? 'text-success-400' : 'text-error-400'
                  }`}>
                    {systemStatus?.indexers.online || 0}/{systemStatus?.indexers.total || 0} Online
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-300">Download Service</span>
                <div className="flex items-center space-x-2">
                  <div className={`status-dot ${
                    systemStatus?.downloadService.status === 'active' ? 'status-processing' : 'status-error'
                  }`}></div>
                  <span className={`text-xs ${
                    systemStatus?.downloadService.status === 'active' ? 'text-primary-400' : 'text-error-400'
                  }`}>
                    {systemStatus?.downloadService.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper Components
interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  bgColor: string
  isLoading: boolean
}

function StatCard({ icon, label, value, bgColor, isLoading }: StatCardProps) {
  return (
    <div className="card">
      <div className="flex items-center">
        <div className={`p-2 ${bgColor} rounded-lg`}>
          {icon}
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-dark-400">{label}</p>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-6 bg-dark-600 rounded w-16"></div>
            </div>
          ) : (
            <p className="text-2xl font-bold text-dark-50">{value}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success-500/20 text-success-300'
      case 'downloading':
        return 'bg-primary-500/20 text-primary-300'
      case 'queued':
        return 'bg-warning-500/20 text-warning-300'
      case 'failed':
        return 'bg-error-500/20 text-error-300'
      default:
        return 'bg-dark-500/20 text-dark-300'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'downloading':
        return 'Downloading'
      case 'queued':
        return 'Queued'
      case 'failed':
        return 'Failed'
      default:
        return 'Unknown'
    }
  }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusStyles(status)}`}>
      {getStatusText(status)}
    </span>
  )
}