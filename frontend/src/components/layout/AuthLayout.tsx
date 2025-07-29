import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-8 bg-gradient-to-br from-dark-900 to-dark-800">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-primary-400 mb-2">
              FolioFox
            </h1>
            <p className="text-lg text-dark-300">
              Your Personal eBook Library Manager
            </p>
          </div>
          
          <div className="space-y-6 text-dark-400">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span>Automated book discovery and downloads</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 4V2a1 1 0 011-1h4a1 1 0 011 1v2h4a1 1 0 110 2h-1v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6H3a1 1 0 110-2h4zM9 6v10h2V6H9z" />
                </svg>
              </div>
              <span>Comprehensive library management</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                </svg>
              </div>
              <span>Multiple indexer support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="lg:hidden mb-8 text-center">
            <h1 className="text-3xl font-bold text-primary-400 mb-2">
              FolioFox
            </h1>
            <p className="text-dark-300">
              Your Personal eBook Library Manager
            </p>
          </div>
          
          <Outlet />
        </div>
      </div>
    </div>
  )
}