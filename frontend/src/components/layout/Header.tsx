import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import {
  BellIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline'

import { useAuthStore } from '@/stores/auth'
import { cn } from '@/utils/cn'

export function Header() {
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
  }

  return (
    <header className="bg-dark-800 border-b border-dark-700 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left side - could add breadcrumbs here */}
        <div>
          {/* Breadcrumbs or page title could go here */}
        </div>

        {/* Right side - notifications and user menu */}
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <button className="p-2 text-dark-400 hover:text-dark-200 transition-colors">
            <BellIcon className="h-6 w-6" />
          </button>

          {/* User menu */}
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center space-x-3 text-dark-300 hover:text-dark-100 transition-colors">
              <UserCircleIcon className="h-8 w-8" />
              <span className="text-sm font-medium">{user?.username}</span>
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-dark-800 py-1 shadow-lg ring-1 ring-dark-700 focus:outline-none">
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={handleLogout}
                      className={cn(
                        'flex w-full items-center px-4 py-2 text-sm',
                        active
                          ? 'bg-dark-700 text-dark-100'
                          : 'text-dark-300'
                      )}
                    >
                      <ArrowRightOnRectangleIcon className="mr-3 h-4 w-4" />
                      Sign out
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </header>
  )
}