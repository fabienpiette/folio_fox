import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { useAuthStore } from '@/stores/auth'
import toast from 'react-hot-toast'

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  (error) => {
    const { response } = error

    if (response?.status === 401) {
      // Token expired or invalid
      useAuthStore.getState().logout()
      toast.error('Session expired. Please log in again.')
      return Promise.reject(error)
    }

    if (response?.status === 403) {
      toast.error('Access denied. You do not have permission to perform this action.')
      return Promise.reject(error)
    }

    if (response?.status === 429) {
      toast.error('Rate limit exceeded. Please try again later.')
      return Promise.reject(error)
    }

    if (response?.status >= 500) {
      toast.error('Server error. Please try again later.')
      return Promise.reject(error)
    }

    // For other errors, let the component handle them
    return Promise.reject(error)
  }
)

// Generic API request function
async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await api.request<T>(config)
  return response.data
}

// HTTP method helpers
export const apiClient = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'GET', url }),
  
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PUT', url, data }),
  
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PATCH', url, data }),
  
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'DELETE', url }),
}

export default api