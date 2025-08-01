import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configService } from '@/services/configService'
import {
  IndexerTestResult,
  CreateIndexerRequest,
  UpdateIndexerConfigRequest,
  SystemSettings,
  UserPreferences,
  DownloadFolder,
  QualityProfile
} from '@/types/config'
import toast from 'react-hot-toast'

// Indexer management hooks
export function useIndexers() {
  return useQuery({
    queryKey: ['indexers'],
    queryFn: configService.indexers.list,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      const errorResponse = (error as any)?.response
      if (errorResponse?.status >= 400 && errorResponse?.status < 500) {
        return false
      }
      return failureCount < 2
    }
  })
}

export function useIndexer(id: number) {
  return useQuery({
    queryKey: ['indexers', id],
    queryFn: () => configService.indexers.get(id),
    enabled: !!id,
    staleTime: 30 * 1000,
    retry: 2
  })
}

export function useCreateIndexer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: CreateIndexerRequest) => configService.indexers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indexers'] })
      toast.success('Indexer created successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to create indexer'
      toast.error(message)
    }
  })
}

export function useUpdateIndexer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CreateIndexerRequest }) =>
      configService.indexers.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['indexers'] })
      queryClient.invalidateQueries({ queryKey: ['indexers', id] })
      toast.success('Indexer updated successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to update indexer'
      toast.error(message)
    }
  })
}

export function useDeleteIndexer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: number) => configService.indexers.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indexers'] })
      toast.success('Indexer deleted successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to delete indexer'
      toast.error(message)
    }
  })
}

export function useUpdateIndexerConfig() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, config }: { id: number; config: UpdateIndexerConfigRequest }) =>
      configService.indexers.updateConfig(id, config),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['indexers'] })
      queryClient.invalidateQueries({ queryKey: ['indexers', id] })
      toast.success('Indexer configuration updated')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to update configuration'
      toast.error(message)
    }
  })
}

export function useTestIndexer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: number) => configService.indexers.test(id),
    onSuccess: (result: IndexerTestResult, id: number) => {
      queryClient.invalidateQueries({ queryKey: ['indexers'] })
      queryClient.invalidateQueries({ queryKey: ['indexers', id] })
      queryClient.invalidateQueries({ queryKey: ['indexer-health', id] })
      
      if (result.success) {
        toast.success(`Connection test successful (${result.response_time_ms}ms)`)
      } else {
        toast.error(`Connection test failed: ${result.error_message}`)
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to test indexer'
      toast.error(message)
    }
  })
}

export function useIndexerHealth(id: number) {
  return useQuery({
    queryKey: ['indexer-health', id],
    queryFn: () => configService.indexers.getHealth(id),
    enabled: !!id,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Refetch every minute
    retry: 1
  })
}

// System configuration hooks
export function useSystemSettings() {
  return useQuery({
    queryKey: ['system', 'settings'],
    queryFn: configService.system.getSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2
  })
}

export function useUpdateSystemSettings() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (settings: Partial<SystemSettings>) =>
      configService.system.updateSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'settings'] })
      toast.success('System settings updated')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to update system settings'
      toast.error(message)
    }
  })
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ['system', 'status'],
    queryFn: configService.system.getStatus,
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
    retry: 1
  })
}

export function useSystemLogs(params?: {
  level?: string
  component?: string
  since?: string
  limit?: number
}) {
  return useQuery({
    queryKey: ['system', 'logs', params],
    queryFn: () => configService.system.getLogs(params),
    staleTime: 30 * 1000,
    retry: 2
  })
}

export function useRunMaintenance() {
  return useMutation({
    mutationFn: (tasks?: string[]) => configService.system.runMaintenance(tasks),
    onSuccess: () => {
      toast.success('Maintenance tasks completed')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to run maintenance'
      toast.error(message)
    }
  })
}

// User preferences hooks
export function useUserPreferences() {
  return useQuery({
    queryKey: ['user', 'preferences'],
    queryFn: configService.preferences.get,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2
  })
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (preferences: Partial<UserPreferences>) =>
      configService.preferences.update(preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'preferences'] })
      toast.success('Preferences updated')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to update preferences'
      toast.error(message)
    }
  })
}

// Download folders hooks
export function useDownloadFolders() {
  return useQuery({
    queryKey: ['user', 'download-folders'],
    queryFn: configService.preferences.getDownloadFolders,
    staleTime: 5 * 60 * 1000,
    retry: 2
  })
}

export function useCreateDownloadFolder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (folder: Omit<DownloadFolder, 'id' | 'user_id' | 'created_at' | 'updated_at'>) =>
      configService.preferences.createDownloadFolder(folder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'download-folders'] })
      toast.success('Download folder created')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to create download folder'
      toast.error(message)
    }
  })
}

export function useUpdateDownloadFolder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, folder }: { id: number; folder: Partial<DownloadFolder> }) =>
      configService.preferences.updateDownloadFolder(id, folder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'download-folders'] })
      toast.success('Download folder updated')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to update download folder'
      toast.error(message)
    }
  })
}

export function useDeleteDownloadFolder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: number) => configService.preferences.deleteDownloadFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'download-folders'] })
      toast.success('Download folder deleted')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to delete download folder'
      toast.error(message)
    }
  })
}

// Quality profiles hooks
export function useQualityProfiles() {
  return useQuery({
    queryKey: ['user', 'quality-profiles'],
    queryFn: configService.preferences.getQualityProfiles,
    staleTime: 5 * 60 * 1000,
    retry: 2
  })
}

export function useCreateQualityProfile() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (profile: Omit<QualityProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>) =>
      configService.preferences.createQualityProfile(profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'quality-profiles'] })
      toast.success('Quality profile created')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to create quality profile'
      toast.error(message)
    }
  })
}

export function useUpdateQualityProfile() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, profile }: { id: number; profile: Partial<QualityProfile> }) =>
      configService.preferences.updateQualityProfile(id, profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'quality-profiles'] })
      toast.success('Quality profile updated')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to update quality profile'
      toast.error(message)
    }
  })
}

export function useDeleteQualityProfile() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: number) => configService.preferences.deleteQualityProfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'quality-profiles'] })
      toast.success('Quality profile deleted')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to delete quality profile'
      toast.error(message)
    }
  })
}

// Configuration import/export hooks
export function useExportConfig() {
  return useMutation({
    mutationFn: configService.importExport.exportConfig,
    onSuccess: (data) => {
      // Create and download the config file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `foliofox-config-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success('Configuration exported successfully')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to export configuration'
      toast.error(message)
    }
  })
}

export function useImportConfig() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: configService.importExport.importConfig,
    onSuccess: (result) => {
      // Invalidate all config-related queries
      queryClient.invalidateQueries({ queryKey: ['indexers'] })
      queryClient.invalidateQueries({ queryKey: ['user', 'preferences'] })
      queryClient.invalidateQueries({ queryKey: ['user', 'download-folders'] })
      queryClient.invalidateQueries({ queryKey: ['user', 'quality-profiles'] })
      
      const total = Object.values(result.imported).reduce((sum, count) => sum + count, 0)
      toast.success(`Configuration imported successfully (${total} items)`)
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to import configuration'
      toast.error(message)
    }
  })
}

// Configuration validation hooks
export function useValidateIndexer() {
  return useMutation({
    mutationFn: configService.validation.validateIndexer,
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Validation failed'
      toast.error(message)
    }
  })
}

export function useValidateDownloadFolder() {
  return useMutation({
    mutationFn: (path: string) => configService.validation.validateDownloadFolder(path),
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Validation failed'
      toast.error(message)
    }
  })
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (url: string) => configService.validation.testWebhook(url),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Webhook test successful (${result.response_time_ms}ms)`)
      } else {
        toast.error(`Webhook test failed: ${result.error}`)
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Webhook test failed'
      toast.error(message)
    }
  })
}