import { useState, useEffect } from 'react'
import { 
  Cog8ToothIcon,
  ServerIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import { 
  useSystemSettings,
  useUpdateSystemSettings,
  useSystemStatus,
  useSystemLogs,
  useRunMaintenance
} from '@/hooks/useConfiguration'
import { LoadingSpinner } from '@/components/ui/feedback/LoadingSpinner'
import { ApiErrorDisplay, createApiError } from '@/components/ui/feedback'
import { cn } from '@/utils/cn'

const LOG_LEVELS = [
  { value: '', label: 'All Levels' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warning' },
  { value: 'error', label: 'Error' }
]

const LOG_COMPONENTS = [
  { value: '', label: 'All Components' },
  { value: 'api', label: 'API' },
  { value: 'indexer', label: 'Indexer' },
  { value: 'download', label: 'Download' },
  { value: 'search', label: 'Search' },
  { value: 'auth', label: 'Authentication' },
  { value: 'system', label: 'System' }
]

export function SystemSettings() {
  const [activeTab, setActiveTab] = useState<'settings' | 'logs' | 'maintenance' | 'status'>('settings')
  const [logFilters, setLogFilters] = useState({
    level: '',
    component: '',
    limit: 100
  })

  // API hooks
  const { data: systemSettings, isLoading: settingsLoading, error: settingsError } = useSystemSettings()
  const updateSettingsMutation = useUpdateSystemSettings()
  const { data: systemStatus, isLoading: statusLoading, error: statusError } = useSystemStatus()
  const { data: systemLogs, isLoading: logsLoading, error: logsError, refetch: refetchLogs } = useSystemLogs(logFilters)
  const maintenanceMutation = useRunMaintenance()

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<Record<string, any>>({})

  // Update form when settings load
  useEffect(() => {
    if (systemSettings) {
      setSettingsForm(systemSettings)
    }
  }, [systemSettings])

  // Refetch logs when filters change
  useEffect(() => {
    refetchLogs()
  }, [logFilters, refetchLogs])

  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateSettingsMutation.mutate(settingsForm)
  }

  const handleRunMaintenance = (tasks?: string[]) => {
    maintenanceMutation.mutate(tasks)
  }

  const tabs = [
    { id: 'settings', name: 'Settings', icon: Cog8ToothIcon },
    { id: 'status', name: 'Status', icon: ServerIcon },
    { id: 'logs', name: 'Logs', icon: DocumentTextIcon },
    { id: 'maintenance', name: 'Maintenance', icon: WrenchScrewdriverIcon }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-dark-50">System Settings</h2>
        <p className="text-sm text-dark-400 mt-1">
          Configure system-wide settings and monitor application health
        </p>
      </div>

      {/* Admin Warning */}
      <div className="bg-warning-900/20 border border-warning-700 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-warning-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-warning-300">Administrator Access Required</h3>
            <p className="text-sm text-warning-400 mt-1">
              These settings affect the entire system. Changes may require a restart to take effect.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-dark-700">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-dark-400 hover:text-dark-200 hover:border-dark-600'
              )}
            >
              <tab.icon className="w-5 h-5 mr-2" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'settings' && (
          <div className="card p-6">
            {settingsLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="lg" />
                <span className="ml-3 text-dark-300">Loading settings...</span>
              </div>
            ) : settingsError ? (
              <ApiErrorDisplay error={createApiError(settingsError)} />
            ) : (
              <form onSubmit={handleSettingsSubmit} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-dark-200">Application Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Application Name
                      </label>
                      <input
                        type="text"
                        value={settingsForm.application_name || ''}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, application_name: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="FolioFox"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Max Concurrent Downloads
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={settingsForm.max_concurrent_downloads || ''}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, max_concurrent_downloads: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="3"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Default Retry Count
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={settingsForm.default_retry_count || ''}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, default_retry_count: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="3"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Default Timeout (seconds)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="300"
                        value={settingsForm.default_timeout_seconds || ''}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, default_timeout_seconds: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="30"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Log Level
                      </label>
                      <select
                        value={settingsForm.log_level || 'info'}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, log_level: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warning</option>
                        <option value="error">Error</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Database Maintenance Hour (0-23)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={settingsForm.database_maintenance_hour || ''}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, database_maintenance_hour: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Webhook URL
                    </label>
                    <input
                      type="url"
                      value={settingsForm.webhook_url || ''}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, webhook_url: e.target.value }))}
                      className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="https://hooks.example.com/webhook"
                    />
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-md font-medium text-dark-200">Features</h4>
                    
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settingsForm.enable_webhooks === 'true'}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, enable_webhooks: e.target.checked.toString() }))}
                        className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                      />
                      <span className="text-dark-300">Enable Webhooks</span>
                    </label>

                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settingsForm.enable_metrics === 'true'}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, enable_metrics: e.target.checked.toString() }))}
                        className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                      />
                      <span className="text-dark-300">Enable Metrics Collection</span>
                    </label>

                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settingsForm.auto_cleanup_enabled === 'true'}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, auto_cleanup_enabled: e.target.checked.toString() }))}
                        className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                      />
                      <span className="text-dark-300">Enable Auto Cleanup</span>
                    </label>
                  </div>

                  {settingsForm.auto_cleanup_enabled === 'true' && (
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Auto Cleanup Days
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={settingsForm.auto_cleanup_days || ''}
                        onChange={(e) => setSettingsForm(prev => ({ ...prev, auto_cleanup_days: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="30"
                      />
                      <p className="text-xs text-dark-500 mt-1">
                        Automatically cleanup old logs and temporary files after this many days
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={updateSettingsMutation.isPending}
                    className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    {updateSettingsMutation.isPending ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Settings</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {activeTab === 'status' && (
          <div className="space-y-6">
            {statusLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="lg" />
                <span className="ml-3 text-dark-300">Loading system status...</span>
              </div>
            ) : statusError ? (
              <ApiErrorDisplay error={createApiError(statusError)} />
            ) : systemStatus ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Database Status */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-dark-200">Database</h3>
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      systemStatus.database?.status === 'healthy' ? 'bg-success-400' :
                      systemStatus.database?.status === 'degraded' ? 'bg-warning-400' : 'bg-error-400'
                    )} />
                  </div>
                  <div className="space-y-2 text-sm text-dark-400">
                    <div>Status: <span className="text-dark-300">{systemStatus.database?.status || 'Unknown'}</span></div>
                    <div>Response: <span className="text-dark-300">{systemStatus.database?.response_ms || 0}ms</span></div>
                    <div>Connections: <span className="text-dark-300">{systemStatus.database?.connections || 0}</span></div>
                  </div>
                </div>

                {/* Indexers Status */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-dark-200">Indexers</h3>
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      systemStatus.indexers?.status === 'healthy' ? 'bg-success-400' :
                      systemStatus.indexers?.status === 'degraded' ? 'bg-warning-400' : 'bg-error-400'
                    )} />
                  </div>
                  <div className="space-y-2 text-sm text-dark-400">
                    <div>Total: <span className="text-dark-300">{systemStatus.indexers?.total || 0}</span></div>
                    <div>Online: <span className="text-dark-300">{systemStatus.indexers?.online || 0}</span></div>
                    <div>Status: <span className="text-dark-300">{systemStatus.indexers?.status || 'Unknown'}</span></div>
                  </div>
                </div>

                {/* Download Service Status */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-dark-200">Downloads</h3>
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      systemStatus.downloadService?.status === 'active' ? 'bg-success-400' :
                      systemStatus.downloadService?.status === 'idle' ? 'bg-primary-400' : 'bg-error-400'
                    )} />
                  </div>
                  <div className="space-y-2 text-sm text-dark-400">
                    <div>Status: <span className="text-dark-300">{systemStatus.downloadService?.status || 'Unknown'}</span></div>
                    <div>Active: <span className="text-dark-300">{systemStatus.downloadService?.activeDownloads || 0}</span></div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            {/* Log Filters */}
            <div className="card p-4">
              <div className="flex items-center space-x-4">
                <div>
                  <select
                    value={logFilters.level}
                    onChange={(e) => setLogFilters(prev => ({ ...prev, level: e.target.value }))}
                    className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {LOG_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={logFilters.component}
                    onChange={(e) => setLogFilters(prev => ({ ...prev, component: e.target.value }))}
                    className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {LOG_COMPONENTS.map((component) => (
                      <option key={component.value} value={component.value}>
                        {component.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={logFilters.limit}
                    onChange={(e) => setLogFilters(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
                    className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={50}>50 entries</option>
                    <option value={100}>100 entries</option>
                    <option value={250}>250 entries</option>
                    <option value={500}>500 entries</option>
                  </select>
                </div>
                <button
                  onClick={() => refetchLogs()}
                  disabled={logsLoading}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 text-sm flex items-center space-x-2"
                >
                  {logsLoading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Refreshing...</span>
                    </>
                  ) : (
                    <span>Refresh</span>
                  )}
                </button>
              </div>
            </div>

            {/* Log Entries */}
            {logsError ? (
              <ApiErrorDisplay error={createApiError(logsError)} />
            ) : (
              <div className="card">
                <div className="max-h-96 overflow-y-auto">
                  {systemLogs?.logs?.length ? (
                    <div className="divide-y divide-dark-700">
                      {systemLogs.logs.map((log: any, index: number) => (
                        <div key={log.id || index} className="p-4">
                          <div className="flex items-start space-x-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                              log.level === 'error' ? 'bg-error-400' :
                              log.level === 'warn' ? 'bg-warning-400' :
                              log.level === 'debug' ? 'bg-dark-400' : 'bg-primary-400'
                            )} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className={cn(
                                  "text-xs font-medium px-2 py-1 rounded uppercase",
                                  log.level === 'error' ? 'bg-error-900 text-error-300' :
                                  log.level === 'warn' ? 'bg-warning-900 text-warning-300' :
                                  log.level === 'debug' ? 'bg-dark-700 text-dark-300' : 'bg-primary-900 text-primary-300'
                                )}>
                                  {log.level}
                                </span>
                                <span className="text-xs text-dark-500">
                                  {log.component}
                                </span>
                                <span className="text-xs text-dark-500">
                                  {new Date(log.created_at).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm text-dark-200 mt-1">{log.message}</p>
                              {log.details && (
                                <pre className="text-xs text-dark-400 mt-2 overflow-x-auto">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-dark-400">
                      <DocumentTextIcon className="w-12 h-12 mx-auto mb-4 text-dark-600" />
                      <p>No log entries found</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="space-y-6">
            <div className="card p-6">
              <div className="space-y-6">
                <div className="flex items-start space-x-3">
                  <InformationCircleIcon className="w-5 h-5 text-primary-400 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-primary-300">Maintenance Tasks</h3>
                    <p className="text-sm text-dark-400 mt-1">
                      Run system maintenance tasks to optimize performance and clean up old data.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => handleRunMaintenance(['cleanup_logs'])}
                    disabled={maintenanceMutation.isPending}
                    className="p-4 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg transition-colors disabled:opacity-50 text-left"
                  >
                    <h4 className="font-medium text-dark-200">Cleanup Old Logs</h4>
                    <p className="text-sm text-dark-400 mt-1">
                      Remove old system logs to free up disk space
                    </p>
                  </button>

                  <button
                    onClick={() => handleRunMaintenance(['optimize_database'])}
                    disabled={maintenanceMutation.isPending}
                    className="p-4 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg transition-colors disabled:opacity-50 text-left"
                  >
                    <h4 className="font-medium text-dark-200">Optimize Database</h4>
                    <p className="text-sm text-dark-400 mt-1">
                      Optimize database tables and rebuild indexes
                    </p>
                  </button>

                  <button
                    onClick={() => handleRunMaintenance(['cleanup_temp_files'])}
                    disabled={maintenanceMutation.isPending}
                    className="p-4 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg transition-colors disabled:opacity-50 text-left"
                  >
                    <h4 className="font-medium text-dark-200">Cleanup Temp Files</h4>
                    <p className="text-sm text-dark-400 mt-1">
                      Remove temporary download and processing files
                    </p>
                  </button>

                  <button
                    onClick={() => handleRunMaintenance()}
                    disabled={maintenanceMutation.isPending}
                    className="p-4 bg-primary-600 hover:bg-primary-700 border border-primary-500 rounded-lg transition-colors disabled:opacity-50 text-left"
                  >
                    <h4 className="font-medium text-white">Run All Tasks</h4>
                    <p className="text-sm text-primary-200 mt-1">
                      Execute all maintenance tasks at once
                    </p>
                  </button>
                </div>

                {maintenanceMutation.isPending && (
                  <div className="flex items-center justify-center py-4">
                    <LoadingSpinner size="lg" />
                    <span className="ml-3 text-dark-300">Running maintenance tasks...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}