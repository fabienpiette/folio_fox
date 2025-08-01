import { useState, useEffect } from 'react'
import { XMarkIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { IndexerResponse } from '@/types/config'
import { useUpdateIndexerConfig, useTestIndexer } from '@/hooks/useConfiguration'
import { LoadingSpinner } from '@/components/ui/feedback/LoadingSpinner'
import { cn } from '@/utils/cn'

interface IndexerConfigModalProps {
  indexer?: IndexerResponse
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface ConfigFormData {
  is_enabled: boolean
  api_key: string
  username: string
  password: string
  custom_settings?: string
}

export function IndexerConfigModal({ indexer, isOpen, onClose, onSuccess }: IndexerConfigModalProps) {
  const [formData, setFormData] = useState<ConfigFormData>({
    is_enabled: true,
    api_key: '',
    username: '',
    password: ''
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showApiKey, setShowApiKey] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  
  const updateConfigMutation = useUpdateIndexerConfig()
  const testMutation = useTestIndexer()
  
  const isLoading = updateConfigMutation.isPending

  useEffect(() => {
    if (indexer?.user_config) {
      setFormData({
        is_enabled: indexer.user_config.is_enabled,
        api_key: indexer.user_config.api_key || '',
        username: indexer.user_config.username || '',
        password: '', // Never populate password field for security
        custom_settings: indexer.user_config.custom_settings || ''
      })
    } else {
      // Reset form for new configuration
      setFormData({
        is_enabled: true,
        api_key: '',
        username: '',
        password: ''
      })
    }
    setErrors({})
  }, [indexer, isOpen])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (indexer?.indexer_type === 'torznab' && !formData.api_key.trim()) {
      newErrors.api_key = 'API key is required for Torznab indexers'
    }
    
    if (indexer?.indexer_type === 'newznab' && !formData.api_key.trim()) {
      newErrors.api_key = 'API key is required for Newznab indexers'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!indexer || !validateForm()) {
      return
    }
    
    try {
      await updateConfigMutation.mutateAsync({
        id: indexer.id,
        config: {
          is_enabled: formData.is_enabled,
          api_key: formData.api_key || undefined,
          username: formData.username || undefined,
          password: formData.password || undefined,
          custom_settings: formData.custom_settings || undefined
        }
      })
      
      onSuccess?.()
      onClose()
    } catch (error) {
      // Error is handled by the mutation hooks
    }
  }

  const handleTestConnection = async () => {
    if (!indexer) return
    
    if (!validateForm()) {
      return
    }
    
    setIsTestingConnection(true)
    try {
      await testMutation.mutateAsync(indexer.id)
    } catch (error) {
      // Error is handled by the mutation hook
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleInputChange = (field: keyof ConfigFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  if (!isOpen || !indexer) return null

  const isTorznabOrNewznab = indexer.indexer_type === 'torznab' || indexer.indexer_type === 'newznab'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-dark-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <div>
            <h2 className="text-xl font-semibold text-dark-50">
              Configure {indexer.name}
            </h2>
            <p className="text-sm text-dark-400 mt-1">
              Set up your personal access settings for this indexer
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-dark-400 hover:text-dark-200 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-dark-300">
                Enable this indexer
              </label>
              <p className="text-xs text-dark-500 mt-1">
                When enabled, this indexer will be included in your searches
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_enabled}
                onChange={(e) => handleInputChange('is_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {/* API Key Field */}
          {isTorznabOrNewznab && (
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                API Key *
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={formData.api_key}
                  onChange={(e) => handleInputChange('api_key', e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 pr-10 bg-dark-700 border rounded-lg text-dark-100 placeholder-dark-400",
                    "focus:outline-none focus:ring-2 focus:border-transparent",
                    errors.api_key 
                      ? "border-error-500 focus:ring-error-500" 
                      : "border-dark-600 focus:ring-primary-500"
                  )}
                  placeholder="Enter your API key"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-dark-400 hover:text-dark-200"
                >
                  {showApiKey ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.api_key && <p className="mt-1 text-sm text-error-400">{errors.api_key}</p>}
              
              {indexer.indexer_type === 'torznab' && (
                <div className="mt-2 p-3 bg-primary-900/20 border border-primary-700 rounded-lg">
                  <p className="text-xs text-primary-300 font-medium mb-1">💡 Jackett API Key</p>
                  <p className="text-xs text-primary-400">
                    Find your API key in Jackett at the top right corner, or visit: {indexer.base_url?.replace(/\/$/, '')}/UI/Dashboard
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Username Field (optional for some indexers) */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Username <span className="text-dark-500">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Username if required"
            />
          </div>

          {/* Password Field (optional for some indexers) */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Password <span className="text-dark-500">(optional)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className="w-full px-3 py-2 pr-10 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Password if required"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-dark-400 hover:text-dark-200"
              >
                {showPassword ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-dark-700">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTestingConnection || !formData.is_enabled}
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
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Configuration</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}