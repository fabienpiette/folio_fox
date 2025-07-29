import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function to merge Tailwind CSS classes with clsx and tailwind-merge
 * This ensures proper class deduplication and override behavior
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}