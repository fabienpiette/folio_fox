import { apiClient } from './api'
import {
  Indexer,
  IndexerResponse,
  IndexerListResponse,
  IndexerHealth,
  IndexerTestResult,
  CreateIndexerRequest,
  UpdateIndexerConfigRequest,
  SystemSettings,
  UserPreferences,
  DownloadFolder,
  QualityProfile
} from '@/types/config'

// Indexer management API
export const indexerApi = {
  // List all indexers for the current user
  async list(): Promise<IndexerListResponse> {
    return apiClient.get('/indexers')
  },

  // Get a specific indexer with user configuration
  async get(id: number): Promise<IndexerResponse> {
    return apiClient.get(`/indexers/${id}`)
  },

  // Create a new indexer (admin only)
  async create(data: CreateIndexerRequest): Promise<Indexer> {
    return apiClient.post('/indexers', data)
  },

  // Update an existing indexer (admin only)
  async update(id: number, data: CreateIndexerRequest): Promise<Indexer> {
    return apiClient.put(`/indexers/${id}`, data)
  },

  // Delete an indexer (admin only)
  async delete(id: number): Promise<{ message: string }> {
    return apiClient.delete(`/indexers/${id}`)
  },

  // Update user-specific indexer configuration
  async updateConfig(id: number, config: UpdateIndexerConfigRequest): Promise<any> {
    return apiClient.put(`/indexers/${id}/config`, config)
  },

  // Test indexer connection
  async test(id: number): Promise<IndexerTestResult> {
    return apiClient.post(`/indexers/${id}/test`)
  },

  // Get indexer health status
  async getHealth(id: number): Promise<IndexerHealth> {
    return apiClient.get(`/indexers/${id}/health`)
  }
}

// System configuration API
export const systemConfigApi = {
  // Get system settings (admin only)
  async getSettings(): Promise<SystemSettings> {
    return apiClient.get('/system/settings')
  },

  // Update system settings (admin only)
  async updateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    return apiClient.put('/system/settings', settings)
  },

  // Get system status
  async getStatus(): Promise<any> {
    return apiClient.get('/system/status')
  },

  // Get system logs (admin only)
  async getLogs(params?: {
    level?: string
    component?: string
    since?: string
    limit?: number
  }): Promise<any> {
    const queryParams = new URLSearchParams()
    if (params?.level) queryParams.append('level', params.level)
    if (params?.component) queryParams.append('component', params.component)
    if (params?.since) queryParams.append('since', params.since)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    
    const query = queryParams.toString()
    return apiClient.get(`/system/logs${query ? `?${query}` : ''}`)
  },

  // Run system maintenance (admin only)
  async runMaintenance(tasks?: string[]): Promise<{ message: string }> {
    return apiClient.post('/system/maintenance', { tasks })
  }
}

// User preferences API
export const userPreferencesApi = {
  // Get user preferences
  async get(): Promise<UserPreferences> {
    return apiClient.get('/users/preferences')
  },

  // Update user preferences
  async update(preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    return apiClient.put('/users/preferences', preferences)
  },

  // Get download folders
  async getDownloadFolders(): Promise<DownloadFolder[]> {
    return apiClient.get('/users/download-folders')
  },

  // Create download folder
  async createDownloadFolder(folder: Omit<DownloadFolder, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<DownloadFolder> {
    return apiClient.post('/users/download-folders', folder)
  },

  // Update download folder
  async updateDownloadFolder(id: number, folder: Partial<DownloadFolder>): Promise<DownloadFolder> {
    return apiClient.put(`/users/download-folders/${id}`, folder)
  },

  // Delete download folder
  async deleteDownloadFolder(id: number): Promise<{ message: string }> {
    return apiClient.delete(`/users/download-folders/${id}`)
  },

  // Get quality profiles
  async getQualityProfiles(): Promise<QualityProfile[]> {
    return apiClient.get('/users/quality-profiles')
  },

  // Create quality profile
  async createQualityProfile(profile: Omit<QualityProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<QualityProfile> {
    return apiClient.post('/users/quality-profiles', profile)
  },

  // Update quality profile
  async updateQualityProfile(id: number, profile: Partial<QualityProfile>): Promise<QualityProfile> {
    return apiClient.put(`/users/quality-profiles/${id}`, profile)
  },

  // Delete quality profile
  async deleteQualityProfile(id: number): Promise<{ message: string }> {
    return apiClient.delete(`/users/quality-profiles/${id}`)
  }
}

// Configuration export/import API
export const configImportExportApi = {
  // Export user configuration
  async exportConfig(): Promise<{
    preferences: UserPreferences
    indexers: IndexerResponse[]
    download_folders: DownloadFolder[]
    quality_profiles: QualityProfile[]
  }> {
    return apiClient.get('/users/config/export')
  },

  // Import user configuration
  async importConfig(config: {
    preferences?: Partial<UserPreferences>
    indexers?: UpdateIndexerConfigRequest[]
    download_folders?: Omit<DownloadFolder, 'id' | 'user_id' | 'created_at' | 'updated_at'>[]
    quality_profiles?: Omit<QualityProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>[]
  }): Promise<{ message: string; imported: { [key: string]: number } }> {
    return apiClient.post('/users/config/import', config)
  }
}

// Configuration validation API
export const configValidationApi = {
  // Validate indexer configuration
  async validateIndexer(config: CreateIndexerRequest): Promise<{ valid: boolean; errors?: string[] }> {
    return apiClient.post('/config/validate/indexer', config)
  },

  // Validate download folder path
  async validateDownloadFolder(path: string): Promise<{ valid: boolean; writable: boolean; error?: string }> {
    return apiClient.post('/config/validate/download-folder', { path })
  },

  // Test webhook URL
  async testWebhook(url: string): Promise<{ success: boolean; response_time_ms: number; error?: string }> {
    return apiClient.post('/config/test/webhook', { url })
  }
}

// Unified configuration service
export const configService = {
  indexers: indexerApi,
  system: systemConfigApi,
  preferences: userPreferencesApi,
  importExport: configImportExportApi,
  validation: configValidationApi
}