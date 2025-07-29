export function DashboardPage() {
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
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-primary-500/20 rounded-lg">
              <svg className="w-6 h-6 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-dark-400">Total Books</p>
              <p className="text-2xl font-bold text-dark-50">1,247</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-success-500/20 rounded-lg">
              <svg className="w-6 h-6 text-success-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-dark-400">Active Downloads</p>
              <p className="text-2xl font-bold text-dark-50">3</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-warning-500/20 rounded-lg">
              <svg className="w-6 h-6 text-warning-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-dark-400">Queue Items</p>
              <p className="text-2xl font-bold text-dark-50">12</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-error-500/20 rounded-lg">
              <svg className="w-6 h-6 text-error-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-dark-400">Failed Downloads</p>
              <p className="text-2xl font-bold text-dark-50">2</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">Recent Downloads</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-200">Foundation</p>
                <p className="text-xs text-dark-400">Isaac Asimov</p>
              </div>
              <span className="px-2 py-1 text-xs font-medium bg-success-500/20 text-success-300 rounded-full">
                Completed
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-200">Dune</p>
                <p className="text-xs text-dark-400">Frank Herbert</p>
              </div>
              <span className="px-2 py-1 text-xs font-medium bg-primary-500/20 text-primary-300 rounded-full">
                Downloading
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-200">Neuromancer</p>
                <p className="text-xs text-dark-400">William Gibson</p>
              </div>
              <span className="px-2 py-1 text-xs font-medium bg-warning-500/20 text-warning-300 rounded-full">
                Queued
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">System Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-dark-300">Database</span>
              <div className="flex items-center space-x-2">
                <div className="status-dot status-online"></div>
                <span className="text-xs text-success-400">Healthy</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-dark-300">Indexers</span>
              <div className="flex items-center space-x-2">
                <div className="status-dot status-online"></div>
                <span className="text-xs text-success-400">3/3 Online</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-dark-300">Download Service</span>
              <div className="flex items-center space-x-2">
                <div className="status-dot status-processing"></div>
                <span className="text-xs text-primary-400">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}