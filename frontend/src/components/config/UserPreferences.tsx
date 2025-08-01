import { useState, useEffect } from 'react'
import { 
  UserIcon,
  FolderIcon,
  StarIcon,
  GlobeAltIcon,
  BellIcon,
  ArrowDownTrayIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { 
  useUserPreferences,
  useUpdateUserPreferences,
  useDownloadFolders,
  useCreateDownloadFolder,
  useUpdateDownloadFolder,
  useDeleteDownloadFolder,
  useQualityProfiles,
  useCreateQualityProfile,
  useUpdateQualityProfile,
  useDeleteQualityProfile
} from '@/hooks/useConfiguration'
import { LoadingSpinner } from '@/components/ui/feedback/LoadingSpinner'
import { ApiErrorDisplay, createApiError } from '@/components/ui/feedback'
import { UserPreferences as UserPreferencesType, DownloadFolder, QualityProfile } from '@/types/config'
import { cn } from '@/utils/cn'

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' }
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' }
]

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney'
]

const FILE_FORMATS = [
  { value: 'epub', label: 'EPUB' },
  { value: 'pdf', label: 'PDF' },
  { value: 'mobi', label: 'MOBI' },
  { value: 'azw3', label: 'AZW3' },
  { value: 'txt', label: 'TXT' },
  { value: 'rtf', label: 'RTF' },
  { value: 'docx', label: 'DOCX' }
]

export function UserPreferences() {
  const [activeTab, setActiveTab] = useState<'general' | 'folders' | 'quality'>('general')
  const [editingFolder, setEditingFolder] = useState<DownloadFolder | null>(null)
  const [editingProfile, setEditingProfile] = useState<QualityProfile | null>(null)
  const [isAddingFolder, setIsAddingFolder] = useState(false)
  const [isAddingProfile, setIsAddingProfile] = useState(false)

  // API hooks
  const { data: preferences, isLoading: preferencesLoading, error: preferencesError } = useUserPreferences()
  const updatePreferencesMutation = useUpdateUserPreferences()
  
  const { data: downloadFolders, isLoading: foldersLoading, error: foldersError } = useDownloadFolders()
  const createFolderMutation = useCreateDownloadFolder()
  const updateFolderMutation = useUpdateDownloadFolder()
  const deleteFolderMutation = useDeleteDownloadFolder()
  
  const { data: qualityProfiles, isLoading: profilesLoading, error: profilesError } = useQualityProfiles()
  const createProfileMutation = useCreateQualityProfile()
  const updateProfileMutation = useUpdateQualityProfile()
  const deleteProfileMutation = useDeleteQualityProfile()

  // Form states
  const [preferencesForm, setPreferencesForm] = useState<Partial<UserPreferencesType>>({})
  const [folderForm, setFolderForm] = useState({
    name: '',
    path: '',
    is_default: false,
    auto_organize: true,
    folder_pattern: '{author}/{title}'
  })
  const [profileForm, setProfileForm] = useState({
    name: '',
    preferred_formats: ['epub', 'pdf'],
    min_quality_score: 0,
    max_file_size_mb: '',
    language_preferences: ['en'],
    quality_order: ['epub', 'pdf'],
    is_default: false
  })

  // Update form when preferences load
  useEffect(() => {
    if (preferences) {
      setPreferencesForm({
        theme: preferences.theme,
        language: preferences.language,
        timezone: preferences.timezone,
        notifications_enabled: preferences.notifications_enabled,
        auto_download: preferences.auto_download
      })
    }
  }, [preferences])

  const handlePreferencesSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updatePreferencesMutation.mutate(preferencesForm)
  }

  const handleFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingFolder) {
      updateFolderMutation.mutate({
        id: editingFolder.id,
        folder: folderForm
      }, {
        onSuccess: () => {
          setEditingFolder(null)
          resetFolderForm()
        }
      })
    } else {
      createFolderMutation.mutate(folderForm, {
        onSuccess: () => {
          setIsAddingFolder(false)
          resetFolderForm()
        }
      })
    }
  }

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const profileData = {
      ...profileForm,
      max_file_size_mb: profileForm.max_file_size_mb ? parseInt(profileForm.max_file_size_mb) : undefined,
      quality_order: profileForm.quality_order || profileForm.preferred_formats
    }
    
    if (editingProfile) {
      updateProfileMutation.mutate({
        id: editingProfile.id,
        profile: profileData
      }, {
        onSuccess: () => {
          setEditingProfile(null)
          resetProfileForm()
        }
      })
    } else {
      createProfileMutation.mutate(profileData, {
        onSuccess: () => {
          setIsAddingProfile(false)
          resetProfileForm()
        }
      })
    }
  }

  const resetFolderForm = () => {
    setFolderForm({
      name: '',
      path: '',
      is_default: false,
      auto_organize: true,
      folder_pattern: '{author}/{title}'
    })
  }

  const resetProfileForm = () => {
    setProfileForm({
      name: '',
      preferred_formats: ['epub', 'pdf'],
      min_quality_score: 0,
      max_file_size_mb: '',
      language_preferences: ['en'],
      quality_order: ['epub', 'pdf'],
      is_default: false
    })
  }

  const startEditingFolder = (folder: DownloadFolder) => {
    setEditingFolder(folder)
    setFolderForm({
      name: folder.name,
      path: folder.path,
      is_default: folder.is_default,
      auto_organize: folder.auto_organize,
      folder_pattern: folder.folder_pattern
    })
  }

  const startEditingProfile = (profile: QualityProfile) => {
    setEditingProfile(profile)
    setProfileForm({
      name: profile.name,
      preferred_formats: Array.from(profile.preferred_formats),
      min_quality_score: profile.min_quality_score,
      max_file_size_mb: profile.max_file_size_mb?.toString() || '',
      language_preferences: Array.from(profile.language_preferences),
      quality_order: Array.from(profile.quality_order),
      is_default: profile.is_default
    })
  }

  const handleDeleteFolder = (folder: DownloadFolder) => {
    if (window.confirm(`Are you sure you want to delete the folder "${folder.name}"?`)) {
      deleteFolderMutation.mutate(folder.id)
    }
  }

  const handleDeleteProfile = (profile: QualityProfile) => {
    if (window.confirm(`Are you sure you want to delete the profile "${profile.name}"?`)) {
      deleteProfileMutation.mutate(profile.id)
    }
  }

  if (preferencesLoading || foldersLoading || profilesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
        <span className="ml-3 text-dark-300">Loading preferences...</span>
      </div>
    )
  }

  if (preferencesError) {
    return (
      <ApiErrorDisplay
        error={createApiError(preferencesError)}
        className="mb-6"
      />
    )
  }

  const tabs = [
    { id: 'general', name: 'General', icon: UserIcon },
    { id: 'folders', name: 'Download Folders', icon: FolderIcon },
    { id: 'quality', name: 'Quality Profiles', icon: StarIcon }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-dark-50">User Preferences</h2>
        <p className="text-sm text-dark-400 mt-1">
          Customize your experience and download settings
        </p>
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
        {activeTab === 'general' && (
          <div className="card p-6">
            <form onSubmit={handlePreferencesSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    <GlobeAltIcon className="w-4 h-4 inline mr-2" />
                    Theme
                  </label>
                  <select
                    value={preferencesForm.theme || 'dark'}
                    onChange={(e) => setPreferencesForm(prev => ({ ...prev, theme: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {THEMES.map((theme) => (
                      <option key={theme.value} value={theme.value}>
                        {theme.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Language
                  </label>
                  <select
                    value={preferencesForm.language || 'en'}
                    onChange={(e) => setPreferencesForm(prev => ({ ...prev, language: e.target.value }))}
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Timezone
                  </label>
                  <select
                    value={preferencesForm.timezone || 'UTC'}
                    onChange={(e) => setPreferencesForm(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium text-dark-200">Notifications & Downloads</h3>
                
                <div className="space-y-3">
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={preferencesForm.notifications_enabled ?? true}
                      onChange={(e) => setPreferencesForm(prev => ({ ...prev, notifications_enabled: e.target.checked }))}
                      className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                    />
                    <div className="flex items-center space-x-2">
                      <BellIcon className="w-4 h-4 text-dark-400" />
                      <span className="text-dark-300">Enable notifications</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={preferencesForm.auto_download ?? false}
                      onChange={(e) => setPreferencesForm(prev => ({ ...prev, auto_download: e.target.checked }))}
                      className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                    />
                    <div className="flex items-center space-x-2">
                      <ArrowDownTrayIcon className="w-4 h-4 text-dark-400" />
                      <span className="text-dark-300">Auto-download enabled searches</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updatePreferencesMutation.isPending}
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
                >
                  {updatePreferencesMutation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Preferences</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'folders' && (
          <div className="space-y-6">
            {/* Add Folder Button */}
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-dark-200">Download Folders</h3>
              <button
                onClick={() => setIsAddingFolder(true)}
                className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Folder
              </button>
            </div>

            {/* Folders List */}
            {foldersError ? (
              <ApiErrorDisplay error={createApiError(foldersError)} />
            ) : (
              <div className="space-y-4">
                {downloadFolders?.map((folder) => (
                  <div key={folder.id} className="card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium text-dark-100">{folder.name}</h4>
                          {folder.is_default && (
                            <span className="px-2 py-1 text-xs bg-primary-600 text-white rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-dark-400 mt-1">{folder.path}</p>
                        <p className="text-xs text-dark-500 mt-1">
                          Pattern: {folder.folder_pattern} • 
                          {folder.auto_organize ? ' Auto-organize' : ' Manual'}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => startEditingFolder(folder)}
                          className="p-2 text-dark-400 hover:text-primary-400 transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(folder)}
                          className="p-2 text-dark-400 hover:text-error-400 transition-colors"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add/Edit Folder Form */}
            {(isAddingFolder || editingFolder) && (
              <div className="card p-6">
                <h4 className="text-lg font-medium text-dark-200 mb-4">
                  {editingFolder ? 'Edit Folder' : 'Add New Folder'}
                </h4>
                <form onSubmit={handleFolderSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Name
                      </label>
                      <input
                        type="text"
                        value={folderForm.name}
                        onChange={(e) => setFolderForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="e.g. Books"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Path
                      </label>
                      <input
                        type="text"
                        value={folderForm.path}
                        onChange={(e) => setFolderForm(prev => ({ ...prev, path: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="/downloads/books"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Folder Pattern
                    </label>
                    <input
                      type="text"
                      value={folderForm.folder_pattern}
                      onChange={(e) => setFolderForm(prev => ({ ...prev, folder_pattern: e.target.value }))}
                      className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="{author}/{title}"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={folderForm.is_default}
                        onChange={(e) => setFolderForm(prev => ({ ...prev, is_default: e.target.checked }))}
                        className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                      />
                      <span className="text-dark-300">Set as default folder</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={folderForm.auto_organize}
                        onChange={(e) => setFolderForm(prev => ({ ...prev, auto_organize: e.target.checked }))}
                        className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                      />
                      <span className="text-dark-300">Auto-organize files</span>
                    </label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingFolder(false)
                        setEditingFolder(null)
                        resetFolderForm()
                      }}
                      className="px-4 py-2 text-dark-300 hover:text-dark-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createFolderMutation.isPending || updateFolderMutation.isPending}
                      className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
                    >
                      {(createFolderMutation.isPending || updateFolderMutation.isPending) ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span>{editingFolder ? 'Updating...' : 'Creating...'}</span>
                        </>
                      ) : (
                        <span>{editingFolder ? 'Update Folder' : 'Create Folder'}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {activeTab === 'quality' && (
          <div className="space-y-6">
            {/* Add Profile Button */}
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-dark-200">Quality Profiles</h3>
              <button
                onClick={() => setIsAddingProfile(true)}
                className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Profile
              </button>
            </div>

            {/* Profiles List */}
            {profilesError ? (
              <ApiErrorDisplay error={createApiError(profilesError)} />
            ) : (
              <div className="space-y-4">
                {qualityProfiles?.map((profile) => (
                  <div key={profile.id} className="card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium text-dark-100">{profile.name}</h4>
                          {profile.is_default && (
                            <span className="px-2 py-1 text-xs bg-primary-600 text-white rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-dark-400 mt-1">
                          Formats: {Array.from(profile.preferred_formats).join(', ')}
                        </p>
                        <p className="text-xs text-dark-500 mt-1">
                          Min Score: {profile.min_quality_score} • 
                          {profile.max_file_size_mb ? ` Max Size: ${profile.max_file_size_mb}MB` : ' No size limit'} • 
                          Languages: {Array.from(profile.language_preferences).join(', ')}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => startEditingProfile(profile)}
                          className="p-2 text-dark-400 hover:text-primary-400 transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProfile(profile)}
                          className="p-2 text-dark-400 hover:text-error-400 transition-colors"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add/Edit Profile Form */}
            {(isAddingProfile || editingProfile) && (
              <div className="card p-6">
                <h4 className="text-lg font-medium text-dark-200 mb-4">
                  {editingProfile ? 'Edit Profile' : 'Add New Profile'}
                </h4>
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Name
                      </label>
                      <input
                        type="text"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="e.g. High Quality"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Max File Size (MB)
                      </label>
                      <input
                        type="number"
                        value={profileForm.max_file_size_mb}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, max_file_size_mb: e.target.value }))}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Leave empty for no limit"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Min Quality Score (0-100)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={profileForm.min_quality_score}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, min_quality_score: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Preferred Formats
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {FILE_FORMATS.map((format) => (
                        <label key={format.value} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={profileForm.preferred_formats.includes(format.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setProfileForm(prev => ({
                                  ...prev,
                                  preferred_formats: [...prev.preferred_formats, format.value]
                                }))
                              } else {
                                setProfileForm(prev => ({
                                  ...prev,
                                  preferred_formats: prev.preferred_formats.filter(f => f !== format.value)
                                }))
                              }
                            }}
                            className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                          />
                          <span className="text-dark-300 text-sm">{format.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Language Preferences
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {LANGUAGES.slice(0, 6).map((lang) => (
                        <label key={lang.value} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={profileForm.language_preferences.includes(lang.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setProfileForm(prev => ({
                                  ...prev,
                                  language_preferences: [...prev.language_preferences, lang.value]
                                }))
                              } else {
                                setProfileForm(prev => ({
                                  ...prev,
                                  language_preferences: prev.language_preferences.filter(l => l !== lang.value)
                                }))
                              }
                            }}
                            className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                          />
                          <span className="text-dark-300 text-sm">{lang.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={profileForm.is_default}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, is_default: e.target.checked }))}
                        className="w-4 h-4 text-primary-600 bg-dark-700 border-dark-600 rounded focus:ring-primary-500 focus:ring-2"
                      />
                      <span className="text-dark-300">Set as default profile</span>
                    </label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingProfile(false)
                        setEditingProfile(null)
                        resetProfileForm()
                      }}
                      className="px-4 py-2 text-dark-300 hover:text-dark-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createProfileMutation.isPending || updateProfileMutation.isPending}
                      className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
                    >
                      {(createProfileMutation.isPending || updateProfileMutation.isPending) ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span>{editingProfile ? 'Updating...' : 'Creating...'}</span>
                        </>
                      ) : (
                        <span>{editingProfile ? 'Update Profile' : 'Create Profile'}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}