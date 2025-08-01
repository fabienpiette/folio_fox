import { useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { 
  Cog8ToothIcon,
  ServerIcon,
  UserIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline'
import { cn } from '@/utils/cn'
import { IndexerManagement } from './IndexerManagement'
import { IndexerForm } from './IndexerForm'
import { UserPreferences } from './UserPreferences'
import { SystemSettings } from './SystemSettings'
import { IndexerResponse } from '@/types/config'

const configTabs = [
  { 
    id: 'indexers', 
    name: 'Indexers', 
    icon: ServerIcon,
    path: '/config/indexers',
    description: 'Manage book indexers and sources'
  },
  { 
    id: 'preferences', 
    name: 'Preferences', 
    icon: UserIcon,
    path: '/config/preferences',
    description: 'Personal settings and preferences'
  },
  { 
    id: 'system', 
    name: 'System', 
    icon: Cog8ToothIcon,
    path: '/config/system',
    description: 'System configuration (Admin only)'
  },
  { 
    id: 'maintenance', 
    name: 'Maintenance', 
    icon: WrenchScrewdriverIcon,
    path: '/config/maintenance',
    description: 'System maintenance tools (Admin only)'
  }
]

export function ConfigurationPage() {
  const [userRole] = useState<'admin' | 'user'>('admin') // TODO: Get from auth context
  const [isIndexerFormOpen, setIsIndexerFormOpen] = useState(false)
  const [editingIndexer, setEditingIndexer] = useState<IndexerResponse | undefined>()

  const handleCreateIndexer = () => {
    setEditingIndexer(undefined)
    setIsIndexerFormOpen(true)
  }

  const handleEditIndexer = (indexer: IndexerResponse) => {
    setEditingIndexer(indexer)
    setIsIndexerFormOpen(true)
  }

  const handleCloseIndexerForm = () => {
    setIsIndexerFormOpen(false)
    setEditingIndexer(undefined)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-dark-50">Configuration</h1>
        <p className="mt-2 text-dark-400">
          System settings and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="lg:w-64 flex-shrink-0">
          <nav className="space-y-2">
            {configTabs.map((tab) => {
              // Hide admin-only tabs for regular users
              if ((tab.id === 'system' || tab.id === 'maintenance') && userRole !== 'admin') {
                return null
              }
              
              return (
                <NavLink
                  key={tab.id}
                  to={tab.path}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center px-4 py-3 rounded-lg transition-colors',
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                    )
                  }
                >
                  <tab.icon className="w-5 h-5 mr-3" />
                  <div className="flex-1">
                    <div className="font-medium">{tab.name}</div>
                    <div className="text-xs opacity-75">{tab.description}</div>
                  </div>
                </NavLink>
              )
            })}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <Routes>
            <Route path="/" element={<Navigate to="/config/indexers" replace />} />
            <Route 
              path="/indexers" 
              element={
                <IndexerManagement 
                  userRole={userRole}
                  onCreateIndexer={handleCreateIndexer}
                  onEditIndexer={handleEditIndexer}
                />
              } 
            />
            <Route 
              path="/preferences" 
              element={<UserPreferences />} 
            />
            {userRole === 'admin' && (
              <>
                <Route 
                  path="/system" 
                  element={<SystemSettings />} 
                />
                <Route 
                  path="/maintenance" 
                  element={<SystemSettings />} 
                />
              </>
            )}
          </Routes>
        </div>
      </div>

      {/* Indexer Form Modal */}
      <IndexerForm
        indexer={editingIndexer}
        isOpen={isIndexerFormOpen}
        onClose={handleCloseIndexerForm}
        onSuccess={handleCloseIndexerForm}
      />
    </div>
  )
}