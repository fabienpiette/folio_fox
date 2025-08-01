import { useState } from 'react'
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { 
  useIndexers, 
  useDeleteIndexer, 
  useTestIndexer,
  useUpdateIndexerConfig
} from '@/hooks/useConfiguration'
import { IndexerResponse, IndexerStatus } from '@/types/config'
import { LoadingSpinner } from '@/components/ui/feedback/LoadingSpinner'
import { ApiErrorDisplay, createApiError } from '@/components/ui/feedback'
import { cn } from '@/utils/cn'

interface IndexerManagementProps {
  onCreateIndexer?: () => void
  onEditIndexer?: (indexer: IndexerResponse) => void
  userRole?: 'admin' | 'user'
}

export function IndexerManagement({ 
  onCreateIndexer, 
  onEditIndexer,
  userRole = 'user'
}: IndexerManagementProps) {
  const [expandedIndexer, setExpandedIndexer] = useState<number | null>(null)
  
  const { data: indexersData, isLoading, error, refetch } = useIndexers()
  const deleteIndexerMutation = useDeleteIndexer()
  const testIndexerMutation = useTestIndexer()
  const updateConfigMutation = useUpdateIndexerConfig()
  
  const indexers = indexersData?.indexers || []

  const getStatusIcon = (status?: IndexerStatus) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon className="w-5 h-5 text-success-400" />
      case 'degraded':
        return <ExclamationTriangleIcon className="w-5 h-5 text-warning-400" />
      case 'unhealthy':
        return <XCircleIcon className="w-5 h-5 text-error-400" />
      case 'maintenance':
        return <ClockIcon className="w-5 h-5 text-primary-400" />
      default:
        return <ClockIcon className="w-5 h-5 text-dark-400" />
    }
  }

  const getStatusText = (status?: IndexerStatus) => {
    switch (status) {
      case 'healthy':
        return 'Healthy'
      case 'degraded':
        return 'Degraded'
      case 'unhealthy':
        return 'Down'
      case 'maintenance':
        return 'Maintenance'
      default:
        return 'Unknown'
    }
  }

  const getStatusColor = (status?: IndexerStatus) => {
    switch (status) {
      case 'healthy':
        return 'text-success-400'
      case 'degraded':
        return 'text-warning-400'
      case 'unhealthy':
        return 'text-error-400'
      case 'maintenance':
        return 'text-primary-400'
      default:
        return 'text-dark-400'
    }
  }

  const handleDeleteIndexer = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the indexer "${name}"? This action cannot be undone.`)) {
      return
    }
    
    try {
      await deleteIndexerMutation.mutateAsync(id)
    } catch (error) {
      // Error is handled in the hook
    }
  }

  const handleTestIndexer = async (id: number) => {
    try {
      await testIndexerMutation.mutateAsync(id)
    } catch (error) {
      // Error is handled in the hook
    }
  }

  const handleToggleIndexer = async (indexer: IndexerResponse) => {
    if (!indexer.user_config) {
      // Create initial user config if it doesn't exist
      await updateConfigMutation.mutateAsync({
        id: indexer.id,
        config: { is_enabled: !indexer.is_active }
      })
    } else {
      await updateConfigMutation.mutateAsync({
        id: indexer.id,
        config: { 
          ...indexer.user_config,
          is_enabled: !indexer.user_config.is_enabled 
        }
      })
    }
  }

  const handleExpandIndexer = (id: number) => {
    setExpandedIndexer(expandedIndexer === id ? null : id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
        <span className="ml-3 text-dark-300">Loading indexers...</span>
      </div>
    )
  }

  if (error) {
    return (
      <ApiErrorDisplay
        error={createApiError(error)}
        onRetry={refetch}
        className="mb-6"
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-dark-50">Indexer Management</h2>
          <p className="text-sm text-dark-400 mt-1">
            Configure and manage your book indexers
          </p>
        </div>
        
        {userRole === 'admin' && onCreateIndexer && (
          <button
            onClick={onCreateIndexer}
            className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Add Indexer
          </button>
        )}
      </div>

      {/* Indexers List */}
      {indexers.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-24 h-24 mx-auto mb-4 text-dark-600">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-dark-200 mb-2">No Indexers Configured</h3>
          <p className="text-dark-400 mb-4">
            Add indexers to start searching for books from various sources.
          </p>
          {userRole === 'admin' && onCreateIndexer && (
            <button
              onClick={onCreateIndexer}
              className="inline-flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Add Your First Indexer
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {indexers.map((indexer) => (
            <div key={indexer.id} className="card">
              {/* Indexer Header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(indexer.status)}
                    <div>
                      <h3 className="font-medium text-dark-100">{indexer.name}</h3>
                      <div className="flex items-center space-x-4 text-sm text-dark-400">
                        <span>{indexer.indexer_type}</span>
                        <span>•</span>
                        <span className={getStatusColor(indexer.status)}>
                          {getStatusText(indexer.status)}
                        </span>
                        {indexer.response_time_ms && (
                          <>
                            <span>•</span>
                            <span>{indexer.response_time_ms}ms</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Enable/Disable Toggle */}
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={indexer.user_config?.is_enabled ?? indexer.is_active}
                      onChange={() => handleToggleIndexer(indexer)}
                      disabled={updateConfigMutation.isPending}
                      className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                    />
                    <span className="text-sm text-dark-300">Enabled</span>
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  {/* Test Button */}
                  <button
                    onClick={() => handleTestIndexer(indexer.id)}
                    disabled={testIndexerMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-md transition-colors disabled:opacity-50"
                  >
                    {testIndexerMutation.isPending ? 'Testing...' : 'Test'}
                  </button>
                  
                  {/* Edit Button */}
                  {userRole === 'admin' && onEditIndexer && (
                    <button
                      onClick={() => onEditIndexer(indexer)}
                      className="p-2 text-dark-400 hover:text-primary-400 transition-colors"
                      title="Edit indexer"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  )}
                  
                  {/* Delete Button */}
                  {userRole === 'admin' && (
                    <button
                      onClick={() => handleDeleteIndexer(indexer.id, indexer.name)}
                      disabled={deleteIndexerMutation.isPending}
                      className="p-2 text-dark-400 hover:text-error-400 transition-colors disabled:opacity-50"
                      title="Delete indexer"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                  
                  {/* Expand Button */}
                  <button
                    onClick={() => handleExpandIndexer(indexer.id)}
                    className="p-2 text-dark-400 hover:text-dark-200 transition-colors"
                  >
                    <svg
                      className={cn(
                        "w-4 h-4 transition-transform",
                        expandedIndexer === indexer.id ? "rotate-180" : ""
                      )}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Expanded Details */}
              {expandedIndexer === indexer.id && (
                <div className="border-t border-dark-700 p-4 bg-dark-800/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h4 className="font-medium text-dark-200 mb-2">Connection Details</h4>
                      <dl className="space-y-1">
                        <div>
                          <dt className="text-dark-400 inline">Base URL:</dt>
                          <dd className="text-dark-300 ml-2 inline">{indexer.base_url}</dd>
                        </div>
                        {indexer.api_endpoint && (
                          <div>
                            <dt className="text-dark-400 inline">API Endpoint:</dt>
                            <dd className="text-dark-300 ml-2 inline">{indexer.api_endpoint}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-dark-400 inline">Timeout:</dt>
                          <dd className="text-dark-300 ml-2 inline">{indexer.timeout_seconds}s</dd>
                        </div>
                        <div>
                          <dt className="text-dark-400 inline">Priority:</dt>
                          <dd className="text-dark-300 ml-2 inline">{indexer.priority}</dd>
                        </div>
                      </dl>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-dark-200 mb-2">Capabilities</h4>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            indexer.supports_search ? "bg-success-400" : "bg-dark-600"
                          )} />
                          <span className="text-dark-300">Search</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            indexer.supports_download ? "bg-success-400" : "bg-dark-600"
                          )} />
                          <span className="text-dark-300">Download</span>
                        </div>
                      </div>
                    </div>
                    
                    {indexer.user_config && (
                      <div className="md:col-span-2">
                        <h4 className="font-medium text-dark-200 mb-2">User Configuration</h4>
                        <dl className="space-y-1">
                          {indexer.user_config.api_key && (
                            <div>
                              <dt className="text-dark-400 inline">API Key:</dt>
                              <dd className="text-dark-300 ml-2 inline font-mono">{indexer.user_config.api_key}</dd>
                            </div>
                          )}
                          {indexer.user_config.username && (
                            <div>
                              <dt className="text-dark-400 inline">Username:</dt>
                              <dd className="text-dark-300 ml-2 inline">{indexer.user_config.username}</dd>
                            </div>
                          )}
                          {indexer.user_config.last_test_date && (
                            <div>
                              <dt className="text-dark-400 inline">Last Test:</dt>
                              <dd className="text-dark-300 ml-2 inline">
                                {new Date(indexer.user_config.last_test_date).toLocaleString()}
                                {indexer.user_config.last_test_success !== undefined && (
                                  <span className={cn(
                                    "ml-2",
                                    indexer.user_config.last_test_success ? "text-success-400" : "text-error-400"
                                  )}>
                                    ({indexer.user_config.last_test_success ? 'Success' : 'Failed'})
                                  </span>
                                )}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}