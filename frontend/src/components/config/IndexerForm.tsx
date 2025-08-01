import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { IndexerResponse, CreateIndexerRequest, IndexerType } from '@/types/config'
import { useCreateIndexer, useUpdateIndexer, useTestIndexer } from '@/hooks/useConfiguration'
import { LoadingSpinner } from '@/components/ui/feedback/LoadingSpinner'
import { cn } from '@/utils/cn'

interface IndexerFormProps {
  indexer?: IndexerResponse
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const INDEXER_TYPES: { value: IndexerType; label: string }[] = [
  { value: 'torznab', label: 'Torznab' },
  { value: 'newznab', label: 'Newznab' },
  { value: 'rss', label: 'RSS' },
  { value: 'html', label: 'HTML Scraper' },
  { value: 'api', label: 'API' }
]

export function IndexerForm({ indexer, isOpen, onClose, onSuccess }: IndexerFormProps) {
  const [formData, setFormData] = useState<CreateIndexerRequest>({
    name: '',
    base_url: '',
    api_endpoint: '',
    indexer_type: 'torznab',
    supports_search: true,
    supports_download: true,
    is_active: true,
    priority: 1,
    rate_limit_requests: 10,
    rate_limit_window: 60,
    timeout_seconds: 30,
    user_agent: 'FolioFox/1.0',
    description: '',
    website: ''
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  
  const createMutation = useCreateIndexer()
  const updateMutation = useUpdateIndexer()
  const testMutation = useTestIndexer()
  
  const isEditing = !!indexer
  const isLoading = createMutation.isPending || updateMutation.isPending

  useEffect(() => {
    if (indexer) {
      setFormData({
        name: indexer.name,
        base_url: indexer.base_url,
        api_endpoint: indexer.api_endpoint || '',
        indexer_type: indexer.indexer_type,
        supports_search: indexer.supports_search,
        supports_download: indexer.supports_download,
        is_active: indexer.is_active,
        priority: indexer.priority,
        rate_limit_requests: indexer.rate_limit_requests || 10,
        rate_limit_window: indexer.rate_limit_window || 60,
        timeout_seconds: indexer.timeout_seconds || 30,
        user_agent: indexer.user_agent || 'FolioFox/1.0',
        description: indexer.description || '',
        website: indexer.website || ''
      })
    } else {
      // Reset form for new indexer
      setFormData({
        name: '',
        base_url: '',
        api_endpoint: '',
        indexer_type: 'torznab',
        supports_search: true,
        supports_download: true,
        is_active: true,
        priority: 1,
        rate_limit_requests: 10,
        rate_limit_window: 60,
        timeout_seconds: 30,
        user_agent: 'FolioFox/1.0',
        description: '',
        website: ''
      })
    }
    setErrors({})
  }, [indexer, isOpen])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }
    
    if (!formData.base_url.trim()) {
      newErrors.base_url = 'Base URL is required'
    } else {
      try {
        new URL(formData.base_url)
      } catch {
        newErrors.base_url = 'Please enter a valid URL'
      }
    }
    
    if (formData.website && formData.website.trim()) {
      try {
        new URL(formData.website)
      } catch {
        newErrors.website = 'Please enter a valid URL'
      }
    }
    
    if (formData.priority !== undefined && (formData.priority < 1 || formData.priority > 100)) {
      newErrors.priority = 'Priority must be between 1 and 100'
    }
    
    if (formData.rate_limit_requests !== undefined && formData.rate_limit_requests < 1) {
      newErrors.rate_limit_requests = 'Rate limit requests must be at least 1'
    }
    
    if (formData.rate_limit_window !== undefined && formData.rate_limit_window < 1) {
      newErrors.rate_limit_window = 'Rate limit window must be at least 1 second'
    }
    
    if (formData.timeout_seconds !== undefined && (formData.timeout_seconds < 5 || formData.timeout_seconds > 300)) {
      newErrors.timeout_seconds = 'Timeout must be between 5 and 300 seconds'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }
    
    try {
      if (isEditing && indexer) {
        await updateMutation.mutateAsync({ id: indexer.id, data: formData })
      } else {
        await createMutation.mutateAsync(formData)
      }
      
      onSuccess?.()
      onClose()
    } catch (error) {
      // Error is handled by the mutation hooks
    }
  }

  const handleTestConnection = async () => {
    if (!indexer?.id) return
    
    setIsTestingConnection(true)
    try {
      await testMutation.mutateAsync(indexer.id)
    } catch (error) {
      // Error is handled by the mutation hook
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleInputChange = (field: keyof CreateIndexerRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-dark-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <h2 className="text-xl font-semibold text-dark-50">
            {isEditing ? 'Edit Indexer' : 'Add New Indexer'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-dark-400 hover:text-dark-200 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-dark-200">Basic Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 bg-dark-700 border rounded-lg text-dark-100 placeholder-dark-400",
                    "focus:outline-none focus:ring-2 focus:border-transparent",
                    errors.name 
                      ? "border-error-500 focus:ring-error-500" 
                      : "border-dark-600 focus:ring-primary-500"
                  )}
                  placeholder="e.g. MyIndexer"
                />
                {errors.name && <p className="mt-1 text-sm text-error-400">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Type
                </label>
                <select
                  value={formData.indexer_type}
                  onChange={(e) => handleInputChange('indexer_type', e.target.value as IndexerType)}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {INDEXER_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Base URL *
              </label>
              <input
                type="url"
                value={formData.base_url}
                onChange={(e) => handleInputChange('base_url', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 bg-dark-700 border rounded-lg text-dark-100 placeholder-dark-400",
                  "focus:outline-none focus:ring-2 focus:border-transparent",
                  errors.base_url 
                    ? "border-error-500 focus:ring-error-500" 
                    : "border-dark-600 focus:ring-primary-500"
                )}
                placeholder="https://indexer.example.com"
              />
              {errors.base_url && <p className="mt-1 text-sm text-error-400">{errors.base_url}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                API Endpoint
              </label>
              <input
                type="text"
                value={formData.api_endpoint}
                onChange={(e) => handleInputChange('api_endpoint', e.target.value)}
                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="/api/v1/search"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Optional description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Website
              </label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 bg-dark-700 border rounded-lg text-dark-100 placeholder-dark-400",
                  "focus:outline-none focus:ring-2 focus:border-transparent",
                  errors.website 
                    ? "border-error-500 focus:ring-error-500" 
                    : "border-dark-600 focus:ring-primary-500"
                )}
                placeholder="https://indexer.example.com"
              />
              {errors.website && <p className="mt-1 text-sm text-error-400">{errors.website}</p>}
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-dark-200">Configuration</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Priority (1-100)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', parseInt(e.target.value) || 1)}
                  className={cn(
                    "w-full px-3 py-2 bg-dark-700 border rounded-lg text-dark-100",
                    "focus:outline-none focus:ring-2 focus:border-transparent",
                    errors.priority 
                      ? "border-error-500 focus:ring-error-500" 
                      : "border-dark-600 focus:ring-primary-500"
                  )}
                />
                {errors.priority && <p className="mt-1 text-sm text-error-400">{errors.priority}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Rate Limit (req/window)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.rate_limit_requests}
                  onChange={(e) => handleInputChange('rate_limit_requests', parseInt(e.target.value) || 10)}
                  className={cn(
                    "w-full px-3 py-2 bg-dark-700 border rounded-lg text-dark-100",
                    "focus:outline-none focus:ring-2 focus:border-transparent",
                    errors.rate_limit_requests 
                      ? "border-error-500 focus:ring-error-500" 
                      : "border-dark-600 focus:ring-primary-500"
                  )}
                />
                {errors.rate_limit_requests && <p className="mt-1 text-sm text-error-400">{errors.rate_limit_requests}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Rate Window (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.rate_limit_window}
                  onChange={(e) => handleInputChange('rate_limit_window', parseInt(e.target.value) || 60)}
                  className={cn(
                    "w-full px-3 py-2 bg-dark-700 border rounded-lg text-dark-100",
                    "focus:outline-none focus:ring-2 focus:border-transparent",
                    errors.rate_limit_window 
                      ? "border-error-500 focus:ring-error-500" 
                      : "border-dark-600 focus:ring-primary-500"
                  )}
                />
                {errors.rate_limit_window && <p className="mt-1 text-sm text-error-400">{errors.rate_limit_window}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Timeout (5-300 seconds)
                </label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={formData.timeout_seconds}
                  onChange={(e) => handleInputChange('timeout_seconds', parseInt(e.target.value) || 30)}
                  className={cn(
                    "w-full px-3 py-2 bg-dark-700 border rounded-lg text-dark-100",
                    "focus:outline-none focus:ring-2 focus:border-transparent",
                    errors.timeout_seconds 
                      ? "border-error-500 focus:ring-error-500" 
                      : "border-dark-600 focus:ring-primary-500"
                  )}
                />
                {errors.timeout_seconds && <p className="mt-1 text-sm text-error-400">{errors.timeout_seconds}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  User Agent
                </label>
                <input
                  type="text"
                  value={formData.user_agent}
                  onChange={(e) => handleInputChange('user_agent', e.target.value)}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="FolioFox/1.0"
                />
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-dark-200">Capabilities</h3>
            
            <div className="space-y-3">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.supports_search}
                  onChange={(e) => handleInputChange('supports_search', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                />
                <span className="text-dark-300">Supports Search</span>
              </label>

              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.supports_download}
                  onChange={(e) => handleInputChange('supports_download', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                />
                <span className="text-dark-300">Supports Download</span>
              </label>

              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange('is_active', e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                />
                <span className="text-dark-300">Active</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-dark-700">
            <div>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className="px-4 py-2 text-sm bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
                >
                  {isTestingConnection ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>{isEditing ? 'Updating...' : 'Creating...'}</span>
                  </>
                ) : (
                  <span>{isEditing ? 'Update Indexer' : 'Create Indexer'}</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}