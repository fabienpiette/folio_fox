import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

import { useAuthStore } from '@/stores/auth'
import { LoadingSpinner } from '@/components/ui/feedback/LoadingSpinner'
import { cn } from '@/utils/cn'

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error } = useAuthStore()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data)
      toast.success('Welcome back!')
    } catch (error) {
      // Error is already handled by the store and displayed via error state
      console.error('Login failed:', error)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-dark-50">
          Sign in to your account
        </h2>
        <p className="mt-2 text-sm text-dark-400">
          Access your personal eBook library and downloads
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="rounded-md bg-error-900/20 border border-error-500/20 p-4">
            <div className="text-sm text-error-300">{error}</div>
          </div>
        )}

        <div>
          <label htmlFor="username" className="block text-sm font-medium text-dark-200">
            Username
          </label>
          <div className="mt-2">
            <input
              {...register('username')}
              type="text"
              autoComplete="username"
              className={cn(
                'input',
                errors.username && 'input-error'
              )}
              placeholder="Enter your username"
            />
            {errors.username && (
              <p className="mt-2 text-sm text-error-400">
                {errors.username.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-dark-200">
            Password
          </label>
          <div className="mt-2 relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={cn(
                'input pr-10',
                errors.password && 'input-error'
              )}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeSlashIcon className="h-5 w-5 text-dark-400" />
              ) : (
                <EyeIcon className="h-5 w-5 text-dark-400" />
              )}
            </button>
            {errors.password && (
              <p className="mt-2 text-sm text-error-400">
                {errors.password.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary w-full"
          >
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" color="white" className="mr-2" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </div>
      </form>

      <div className="mt-8 pt-6 border-t border-dark-700">
        <p className="text-xs text-dark-500 text-center">
          FolioFox v1.0.0 - Personal eBook Management System
        </p>
      </div>
    </div>
  )
}