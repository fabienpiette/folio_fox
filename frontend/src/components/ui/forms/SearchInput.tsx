import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { searchApi } from '@/services/searchApi'
import { SearchSuggestion } from '@/types'
import { cn } from '@/utils/cn'
import { LoadingSpinner } from '../feedback/LoadingSpinner'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSearch: (query: string) => void
  placeholder?: string
  className?: string
  showSuggestions?: boolean
  suggestionType?: 'all' | 'title' | 'author' | 'series' | 'genre'
}

export function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder = 'Search for books...',
  className,
  showSuggestions = true,
  suggestionType = 'all',
}: SearchInputProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch suggestions when typing
  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['search-suggestions', value, suggestionType],
    queryFn: () => searchApi.getSuggestions(value, suggestionType, 8),
    enabled: showSuggestions && value.length >= 2,
    staleTime: 30000, // 30 seconds
  })

  const suggestions = useMemo(() => suggestionsData?.suggestions || [], [suggestionsData?.suggestions])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    setShowDropdown(showSuggestions && newValue.length >= 2)
    setSelectedIndex(-1)
  }

  const handleSelectSuggestion = useCallback((suggestion: SearchSuggestion) => {
    onChange(suggestion.text)
    setShowDropdown(false)
    setSelectedIndex(-1)
    onSearch(suggestion.text)
  }, [onChange, onSearch])

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (value.trim()) {
      onSearch(value.trim())
      setShowDropdown(false)
      setSelectedIndex(-1)
    }
  }, [value, onSearch])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showDropdown || suggestions.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => 
            prev < suggestions.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
          break
        case 'Enter':
          e.preventDefault()
          if (selectedIndex >= 0) {
            handleSelectSuggestion(suggestions[selectedIndex])
          } else {
            handleSubmit()
          }
          break
        case 'Escape':
          setShowDropdown(false)
          setSelectedIndex(-1)
          inputRef.current?.blur()
          break
      }
    }

    if (showDropdown) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showDropdown, suggestions, selectedIndex, handleSelectSuggestion, handleSubmit])

  // Handle clicks outside dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setShowDropdown(false)
        setSelectedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleClear = () => {
    onChange('')
    setShowDropdown(false)
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }

  const handleFocus = () => {
    if (showSuggestions && value.length >= 2) {
      setShowDropdown(true)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-dark-400" />
          </div>
          
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={handleFocus}
            placeholder={placeholder}
            className="input pl-10 pr-10 w-full"
          />
          
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-dark-400 hover:text-dark-200"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </form>

      {/* Suggestions dropdown */}
      {showDropdown && showSuggestions && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-dark-800 border border-dark-600 rounded-md shadow-lg max-h-96 overflow-auto"
        >
          {suggestionsLoading ? (
            <div className="px-4 py-3 flex items-center justify-center">
              <LoadingSpinner size="sm" />
              <span className="ml-2 text-sm text-dark-400">Loading suggestions...</span>
            </div>
          ) : suggestions.length > 0 ? (
            <ul className="py-1">
              {suggestions.map((suggestion, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className={cn(
                      'w-full px-4 py-2 text-left text-sm hover:bg-dark-700 flex items-center justify-between',
                      index === selectedIndex && 'bg-dark-700'
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <MagnifyingGlassIcon className="h-4 w-4 text-dark-400" />
                      <span className="text-dark-200">{suggestion.text}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-dark-500 capitalize">
                        {suggestion.type}
                      </span>
                      <span className="text-xs text-dark-500">
                        {suggestion.count}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : value.length >= 2 ? (
            <div className="px-4 py-3 text-sm text-dark-400 text-center">
              No suggestions found
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}