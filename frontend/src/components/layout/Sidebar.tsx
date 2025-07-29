import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  BookOpenIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/utils/cn'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Search', href: '/search', icon: MagnifyingGlassIcon },
  { name: 'Downloads', href: '/downloads', icon: ArrowDownTrayIcon },
  { name: 'Library', href: '/library', icon: BookOpenIcon },
  { name: 'Configuration', href: '/config', icon: Cog6ToothIcon },
]

export function Sidebar() {
  return (
    <div className="w-64 bg-dark-800 border-r border-dark-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-dark-700">
        <h1 className="text-2xl font-bold text-primary-400">FolioFox</h1>
        <p className="text-sm text-dark-400 mt-1">eBook Manager</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-dark-300 hover:bg-dark-700 hover:text-white'
              )
            }
          >
            <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-dark-700">
        <p className="text-xs text-dark-500 text-center">
          v1.0.0
        </p>
      </div>
    </div>
  )
}