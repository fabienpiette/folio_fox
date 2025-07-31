import { useQuery } from '@tanstack/react-query'
import { dashboardService } from '@/services/dashboard'

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardService.getStats,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // 30 seconds
    retry: 3,
  })
}

export const useRecentDownloads = () => {
  return useQuery({
    queryKey: ['dashboard', 'recent-downloads'],
    queryFn: dashboardService.getRecentDownloads,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 15 * 1000, // 15 seconds
    retry: 3,
  })
}

export const useSystemStatus = () => {
  return useQuery({
    queryKey: ['dashboard', 'system-status'],
    queryFn: dashboardService.getSystemStatus,
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 10 * 1000, // 10 seconds
    retry: 3,
  })
}