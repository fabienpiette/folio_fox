import { useState } from 'react'
import { Dialog } from '@headlessui/react'
import {
  FunnelIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline'
import { SearchFilters as SearchFiltersType } from '@/types'
import { cn } from '@/utils/cn'

interface SearchFiltersProps {
  filters: SearchFiltersType
  onFiltersChange: (filters: SearchFiltersType) => void
  className?: string
}

const FILE_FORMATS = [
  { value: 'epub', label: 'EPUB' },
  { value: 'pdf', label: 'PDF' },
  { value: 'mobi', label: 'MOBI' },
  { value: 'azw3', label: 'AZW3' },
  { value: 'txt', label: 'TXT' },
  { value: 'djvu', label: 'DJVU' },
  { value: 'fb2', label: 'FB2' },
  { value: 'rtf', label: 'RTF' },
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
]

export function SearchFilters({
  filters,
  onFiltersChange,
  className,
}: SearchFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)

  const updateFilter = (key: keyof SearchFiltersType, value: SearchFiltersType[keyof SearchFiltersType]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const clearFilters = () => {
    onFiltersChange({})
  }

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'query' && filters[key as keyof SearchFiltersType] !== undefined
  )

  return (
    <>
      {/* Filter trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'btn btn-secondary relative',
          hasActiveFilters && 'ring-2 ring-primary-500',
          className
        )}
      >
        <FunnelIcon className="h-5 w-5 mr-2" />
        Filters
        {hasActiveFilters && (
          <span className="absolute -top-1 -right-1 h-3 w-3 bg-primary-500 rounded-full" />
        )}
      </button>

      {/* Filter modal */}
      <Dialog
        open={isOpen}
        onClose={setIsOpen}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/25" />
        
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Dialog.Panel className="w-full max-w-2xl bg-dark-800 rounded-lg border border-dark-600 shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-dark-700">
                <div className="flex items-center space-x-3">
                  <AdjustmentsHorizontalIcon className="h-6 w-6 text-primary-400" />
                  <Dialog.Title className="text-lg font-semibold text-dark-50">
                    Search Filters
                  </Dialog.Title>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-dark-400 hover:text-dark-200"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Filter content */}
              <div className="p-6 space-y-6">
                {/* Basic filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Author */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Author
                    </label>
                    <input
                      type="text"
                      value={filters.author || ''}
                      onChange={(e) => updateFilter('author', e.target.value)}
                      placeholder="Filter by author name"
                      className="input w-full"
                    />
                  </div>

                  {/* Series */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Series
                    </label>
                    <input
                      type="text"
                      value={filters.series || ''}
                      onChange={(e) => updateFilter('series', e.target.value)}
                      placeholder="Filter by series name"
                      className="input w-full"
                    />
                  </div>

                  {/* Genre */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Genre
                    </label>
                    <input
                      type="text"
                      value={filters.genre || ''}
                      onChange={(e) => updateFilter('genre', e.target.value)}
                      placeholder="Filter by genre"
                      className="input w-full"
                    />
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Language
                    </label>
                    <select
                      value={filters.language || ''}
                      onChange={(e) => updateFilter('language', e.target.value)}
                      className="input w-full"
                    >
                      <option value="">Any language</option>
                      {LANGUAGES.map((lang) => (
                        <option key={lang.value} value={lang.value}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Format selection */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-3">
                    File Format
                  </label>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                    {FILE_FORMATS.map((format) => (
                      <button
                        key={format.value}
                        onClick={() => 
                          updateFilter(
                            'format',
                            filters.format === format.value ? undefined : format.value
                          )
                        }
                        className={cn(
                          'px-3 py-2 text-xs font-medium rounded-md border transition-colors',
                          filters.format === format.value
                            ? 'bg-primary-600 border-primary-500 text-white'
                            : 'bg-dark-700 border-dark-600 text-dark-300 hover:bg-dark-600'
                        )}
                      >
                        {format.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Quality range */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Minimum Quality (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={filters.min_quality || ''}
                      onChange={(e) => 
                        updateFilter('min_quality', e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      placeholder="0"
                      className="input w-full"
                    />
                  </div>

                  {/* Max file size */}
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Max Size (MB)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={filters.max_size_mb || ''}
                      onChange={(e) => 
                        updateFilter('max_size_mb', e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      placeholder="Unlimited"
                      className="input w-full"
                    />
                  </div>

                  {/* Publication year range */}
                  <div className="md:col-span-2 lg:col-span-1">
                    <label className="block text-sm font-medium text-dark-200 mb-2">
                      Publication Year
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="1000"
                        max={new Date().getFullYear()}
                        value={filters.publication_year_min || ''}
                        onChange={(e) => 
                          updateFilter('publication_year_min', e.target.value ? parseInt(e.target.value) : undefined)
                        }
                        placeholder="From"
                        className="input"
                      />
                      <input
                        type="number"
                        min="1000"
                        max={new Date().getFullYear()}
                        value={filters.publication_year_max || ''}
                        onChange={(e) => 
                          updateFilter('publication_year_max', e.target.value ? parseInt(e.target.value) : undefined)
                        }
                        placeholder="To"
                        className="input"
                      />
                    </div>
                  </div>
                </div>

                {/* Rating range */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Rating Range
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Minimum</label>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={filters.rating_min || ''}
                        onChange={(e) => 
                          updateFilter('rating_min', e.target.value ? parseFloat(e.target.value) : undefined)
                        }
                        placeholder="0.0"
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Maximum</label>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={filters.rating_max || ''}
                        onChange={(e) => 
                          updateFilter('rating_max', e.target.value ? parseFloat(e.target.value) : undefined)
                        }
                        placeholder="5.0"
                        className="input w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-6 border-t border-dark-700">
                <button
                  onClick={clearFilters}
                  className="btn btn-ghost"
                  disabled={!hasActiveFilters}
                >
                  Clear All
                </button>
                <div className="space-x-3">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="btn btn-primary"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </Dialog.Panel>
          </div>
        </div>
      </Dialog>
    </>
  )
}