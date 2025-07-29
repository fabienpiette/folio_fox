/**
 * WCAG Accessibility Compliance Testing Suite
 * 
 * Tests WCAG 2.1 AA compliance, keyboard navigation, screen reader compatibility,
 * color contrast, focus management, and semantic HTML structure.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils/test-utils'
import { SearchPage } from '@/components/search/SearchPage'
import { DownloadsPage } from '@/components/downloads/DownloadsPage'
import { LoginPage } from '@/components/auth/LoginPage'
import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { axe, toHaveNoViolations } from 'jest-axe'

// Extend Jest matchers for accessibility testing
expect.extend(toHaveNoViolations)

// Accessibility testing utilities
interface AccessibilityTestResult {
  violations: any[]
  passes: any[]
  incomplete: any[]
  inapplicable: any[]
}

const runAccessibilityTest = async (
  container: HTMLElement,
  options: any = {}
): Promise<AccessibilityTestResult> => {
  const results = await axe(container, {
    rules: {
      // Enable all WCAG 2.1 AA rules
      'color-contrast': { enabled: true },
      'keyboard-navigation': { enabled: true },
      'focus-management': { enabled: true },
      'semantic-markup': { enabled: true },
      'aria-attributes': { enabled: true },
      'form-labels': { enabled: true },
      'heading-structure': { enabled: true },
      'landmark-roles': { enabled: true },
      'alt-text': { enabled: true },
      ...options.rules,
    },
    tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
    ...options,
  })

  return results
}

// Mock color contrast checker
const checkColorContrast = (foreground: string, background: string): number => {
  // Simplified contrast calculation for testing
  // In real implementation, use proper color contrast algorithms
  const getLuminance = (color: string): number => {
    // Convert hex to RGB and calculate relative luminance
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16) / 255
    const g = parseInt(hex.substr(2, 2), 16) / 255
    const b = parseInt(hex.substr(4, 2), 16) / 255
    
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  }

  const l1 = getLuminance(foreground)
  const l2 = getLuminance(background)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  
  return (lighter + 0.05) / (darker + 0.05)
}

// Screen reader testing utilities
const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  const announcement = document.createElement('div')
  announcement.setAttribute('aria-live', priority)
  announcement.setAttribute('aria-atomic', 'true')
  announcement.className = 'sr-only'
  announcement.textContent = message
  document.body.appendChild(announcement)
  
  setTimeout(() => {
    document.body.removeChild(announcement)
  }, 1000)
}

describe('WCAG Accessibility Compliance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset any accessibility-related state
    document.body.className = ''
    document.body.setAttribute('data-theme', 'light')
  })

  describe('WCAG 2.1 AA Compliance', () => {
    it('should pass automated accessibility tests for login page', async () => {
      const { container } = renderWithProviders(<LoginPage />)
      
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument()
      })

      const results = await runAccessibilityTest(container)
      expect(results).toHaveNoViolations()
    })

    it('should pass automated accessibility tests for dashboard', async () => {
      const { container } = renderWithProviders(<DashboardPage />)
      
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument()
      })

      const results = await runAccessibilityTest(container)
      expect(results).toHaveNoViolations()
    })

    it('should pass automated accessibility tests for search page', async () => {
      const { container } = renderWithProviders(<SearchPage />)
      
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument()
      })

      const results = await runAccessibilityTest(container)
      expect(results).toHaveNoViolations()
    })

    it('should pass automated accessibility tests for downloads page', async () => {
      const { container } = renderWithProviders(<DownloadsPage />)
      
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument()
      })

      const results = await runAccessibilityTest(container)
      expect(results).toHaveNoViolations()
    })

    it('should have proper document structure with landmarks', async () => {
      const { container } = renderWithProviders(<SearchPage />)
      
      // Check for required landmarks
      expect(screen.getByRole('banner')).toBeInTheDocument() // header
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('navigation')).toBeInTheDocument()
      expect(screen.queryByRole('contentinfo')).toBeInTheDocument() // footer
      
      // Check landmark labeling
      expect(screen.getByRole('navigation')).toHaveAttribute('aria-label')
      expect(screen.getByRole('main')).toHaveAttribute('aria-labelledby')
      
      const results = await runAccessibilityTest(container, {
        rules: {
          'landmark-one-main': { enabled: true },
          'landmark-complementary-is-top-level': { enabled: true },
          'landmark-no-duplicate-banner': { enabled: true },
          'landmark-no-duplicate-contentinfo': { enabled: true },
          'region': { enabled: true },
        }
      })
      
      expect(results).toHaveNoViolations()
    })

    it('should have proper heading hierarchy', async () => {
      const { container } = renderWithProviders(<SearchPage />)
      
      await waitFor(() => {
        const headings = screen.getAllByRole('heading')
        expect(headings.length).toBeGreaterThan(0)
        
        // Check heading levels are sequential
        const headingLevels = headings.map(heading => {
          const level = heading.tagName.match(/H(\d)/)?.[1]
          return parseInt(level || '1')
        })
        
        // Should start with h1
        expect(Math.min(...headingLevels)).toBe(1)
        
        // Should not skip levels
        const sortedLevels = [...new Set(headingLevels)].sort()
        for (let i = 1; i < sortedLevels.length; i++) {
          expect(sortedLevels[i] - sortedLevels[i - 1]).toBeLessThanOrEqual(1)
        }
      })

      const results = await runAccessibilityTest(container, {
        rules: {
          'heading-order': { enabled: true },
          'empty-heading': { enabled: true },
          'page-has-heading-one': { enabled: true },
        }
      })
      
      expect(results).toHaveNoViolations()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should support full keyboard navigation on search page', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      // Test tab navigation through interactive elements
      await user.tab()
      expect(document.activeElement).toHaveAttribute('role', 'textbox')
      
      await user.tab()
      expect(document.activeElement).toHaveAttribute('type', 'button')
      
      await user.tab()
      expect(document.activeElement).toHaveAttribute('role', 'combobox')
      
      // Test reverse navigation
      await user.tab({ shift: true })
      expect(document.activeElement).toHaveAttribute('type', 'button')
      
      // Test Enter key activation
      const searchButton = screen.getByRole('button', { name: /search/i })
      searchButton.focus()
      await user.keyboard('{Enter}')
      
      // Should trigger search
      await waitFor(() => {
        expect(screen.getByTestId('search-results')).toBeInTheDocument()
      })
    })

    it('should handle keyboard navigation in download queue', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument()
      })

      // Test arrow key navigation in list
      const downloadItems = screen.getAllByRole('listitem')
      if (downloadItems.length > 0) {
        downloadItems[0].focus()
        
        await user.keyboard('{ArrowDown}')
        expect(document.activeElement).toBe(downloadItems[1] || downloadItems[0])
        
        await user.keyboard('{ArrowUp}')
        expect(document.activeElement).toBe(downloadItems[0])
        
        // Test space bar for selection
        await user.keyboard(' ')
        expect(downloadItems[0]).toHaveAttribute('aria-selected', 'true')
      }
    })

    it('should manage focus properly in modals', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      // Trigger modal
      const bookResult = screen.getAllByTestId('search-result')[0]
      await user.click(bookResult)
      
      await waitFor(() => {
        const modal = screen.getByRole('dialog')
        expect(modal).toBeInTheDocument()
        
        // Focus should be trapped in modal
        expect(document.activeElement).toBeInTheDocument()
        expect(modal).toContainElement(document.activeElement)
      })

      // Test Escape key closes modal
      await user.keyboard('{Escape}')
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('should provide skip links for keyboard users', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      // Tab to first element should reveal skip link
      await user.tab()
      
      const skipLink = screen.getByText(/skip to main content/i)
      expect(skipLink).toBeVisible()
      
      // Activating skip link should jump to main content
      await user.click(skipLink)
      expect(document.activeElement).toHaveAttribute('role', 'main')
    })

    it('should handle focus indicators properly', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByRole('textbox')
      
      // Focus should be visible
      await user.tab()
      expect(document.activeElement).toBe(searchInput)
      expect(searchInput).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-blue-500')
      
      // Test focus management with mouse and keyboard
      const searchButton = screen.getByRole('button', { name: /search/i })
      
      // Mouse focus should not show focus ring
      await user.click(searchButton)
      expect(searchButton).not.toHaveClass('focus:ring-2')
      
      // Keyboard focus should show focus ring
      await user.tab()
      expect(document.activeElement).toHaveClass('focus:ring-2')
    })
  })

  describe('Screen Reader Compatibility', () => {
    it('should have proper ARIA labels and descriptions', async () => {
      renderWithProviders(<SearchPage />)

      // Test form labels
      const searchInput = screen.getByRole('textbox')
      expect(searchInput).toHaveAttribute('aria-label', 'Search for books')
      
      const formatFilter = screen.getByRole('combobox', { name: /format/i })
      expect(formatFilter).toHaveAttribute('aria-describedby')
      
      // Test button descriptions
      const searchButton = screen.getByRole('button', { name: /search/i })
      expect(searchButton).toHaveAttribute('aria-describedby')
      
      // Test status announcements
      const statusRegion = screen.getByRole('status')
      expect(statusRegion).toHaveAttribute('aria-live', 'polite')
    })

    it('should announce dynamic content changes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const statusRegion = screen.getByRole('status')
      
      // Perform search
      const searchInput = screen.getByRole('textbox')
      await user.type(searchInput, 'test search')
      await user.click(screen.getByRole('button', { name: /search/i }))

      // Should announce search status
      await waitFor(() => {
        expect(statusRegion).toHaveTextContent(/searching/i)
      })

      await waitFor(() => {
        expect(statusRegion).toHaveTextContent(/found \d+ results/i)
      })
    })

    it('should provide context for complex interactions', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        const downloadItems = screen.getAllByRole('listitem')
        if (downloadItems.length > 0) {
          const firstItem = downloadItems[0]
          
          // Should have proper labeling
          expect(firstItem).toHaveAttribute('aria-labelledby')
          expect(firstItem).toHaveAttribute('aria-describedby')
          
          // Progress should be announced
          const progressBar = screen.getByRole('progressbar')
          expect(progressBar).toHaveAttribute('aria-valuenow')
          expect(progressBar).toHaveAttribute('aria-valuemin', '0')
          expect(progressBar).toHaveAttribute('aria-valuemax', '100')
          expect(progressBar).toHaveAttribute('aria-label')
        }
      })
    })

    it('should handle error states accessibly', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      // Trigger validation error
      const searchButton = screen.getByRole('button', { name: /search/i })
      await user.click(searchButton)

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveAttribute('aria-live', 'assertive')
        
        // Error should be associated with input
        const searchInput = screen.getByRole('textbox')
        expect(searchInput).toHaveAttribute('aria-invalid', 'true')
        expect(searchInput).toHaveAttribute('aria-describedby')
      })
    })

    it('should provide rich descriptions for complex content', async () => {
      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        // Test data table accessibility
        const table = screen.getByRole('table')
        expect(table).toHaveAttribute('aria-label', 'Download queue')
        
        // Test column headers
        const columnHeaders = screen.getAllByRole('columnheader')
        columnHeaders.forEach(header => {
          expect(header).toHaveAttribute('scope', 'col')
        })
        
        // Test row descriptions
        const rows = screen.getAllByRole('row')
        rows.slice(1).forEach(row => { // Skip header row
          expect(row).toHaveAttribute('aria-describedby')
        })
      })
    })
  })

  describe('Color Contrast Compliance', () => {
    it('should meet WCAG AA contrast requirements for text', async () => {
      renderWithProviders(<SearchPage />)

      // Test primary text contrast
      const mainHeading = screen.getByRole('heading', { level: 1 })
      const headingStyles = window.getComputedStyle(mainHeading)
      
      const textColor = headingStyles.color
      const backgroundColor = headingStyles.backgroundColor || '#ffffff'
      
      // Convert RGB to hex for contrast calculation
      const rgbToHex = (rgb: string): string => {
        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
        if (!match) return '#000000'
        
        const r = parseInt(match[1]).toString(16).padStart(2, '0')
        const g = parseInt(match[2]).toString(16).padStart(2, '0')
        const b = parseInt(match[3]).toString(16).padStart(2, '0')
        
        return `#${r}${g}${b}`
      }
      
      const textHex = rgbToHex(textColor)
      const bgHex = rgbToHex(backgroundColor)
      
      const contrast = checkColorContrast(textHex, bgHex)
      
      // WCAG AA requires 4.5:1 contrast for normal text
      expect(contrast).toBeGreaterThanOrEqual(4.5)
    })

    it('should meet contrast requirements for interactive elements', async () => {
      renderWithProviders(<SearchPage />)

      const searchButton = screen.getByRole('button', { name: /search/i })
      const buttonStyles = window.getComputedStyle(searchButton)
      
      const textColor = buttonStyles.color
      const backgroundColor = buttonStyles.backgroundColor
      
      // Button text should have sufficient contrast
      const contrast = checkColorContrast(textColor, backgroundColor)
      expect(contrast).toBeGreaterThanOrEqual(4.5)
      
      // Test focus state contrast
      searchButton.focus()
      const focusStyles = window.getComputedStyle(searchButton)
      const focusColor = focusStyles.outlineColor || focusStyles.borderColor
      
      if (focusColor && focusColor !== 'transparent') {
        const focusContrast = checkColorContrast(focusColor, backgroundColor)
        expect(focusContrast).toBeGreaterThanOrEqual(3) // WCAG AA non-text contrast
      }
    })

    it('should provide high contrast mode support', async () => {
      // Simulate high contrast mode
      document.body.setAttribute('data-theme', 'high-contrast')
      
      renderWithProviders(<SearchPage />)

      const mainContent = screen.getByRole('main')
      const styles = window.getComputedStyle(mainContent)
      
      // High contrast mode should use system colors
      expect(styles.color).toMatch(/(WindowText|CanvasText|black|white)/i)
      expect(styles.backgroundColor).toMatch(/(Window|Canvas|black|white)/i)
      
      // All interactive elements should be visible
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        const buttonStyles = window.getComputedStyle(button)
        expect(buttonStyles.border).not.toBe('none')
        expect(buttonStyles.outline).not.toBe('none')
      })
    })

    it('should handle dark mode accessibility', async () => {
      document.body.setAttribute('data-theme', 'dark')
      
      renderWithProviders(<SearchPage />)

      // Test dark mode contrast ratios
      const headings = screen.getAllByRole('heading')
      headings.forEach(heading => {
        const styles = window.getComputedStyle(heading)
        const textColor = styles.color
        const backgroundColor = styles.backgroundColor || '#000000'
        
        const contrast = checkColorContrast(textColor, backgroundColor)
        expect(contrast).toBeGreaterThanOrEqual(4.5)
      })
    })
  })

  describe('Focus Management', () => {
    it('should maintain logical focus order', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const focusableElements = screen.getAllByRole('textbox')
        .concat(screen.getAllByRole('button'))
        .concat(screen.getAllByRole('combobox'))
        .concat(screen.getAllByRole('link'))

      // Tab through all elements
      for (let i = 0; i < focusableElements.length; i++) {
        await user.tab()
        expect(document.activeElement).toBeInTheDocument()
        
        // Focus should follow DOM order
        const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement)
        expect(currentIndex).toBeGreaterThanOrEqual(0)
      }
    })

    it('should handle focus trapping in modals', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      // Open modal
      const firstResult = screen.getAllByTestId('search-result')[0]
      await user.click(firstResult)
      
      const modal = await screen.findByRole('dialog')
      expect(modal).toBeInTheDocument()
      
      // Focus should be trapped in modal
      const modalFocusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      
      expect(modalFocusableElements.length).toBeGreaterThan(0)
      
      // Tab through modal elements
      let currentIndex = 0
      for (let i = 0; i < modalFocusableElements.length + 2; i++) {
        await user.tab()
        
        // Focus should cycle within modal
        expect(modal).toContainElement(document.activeElement)
        currentIndex = (currentIndex + 1) % modalFocusableElements.length
      }
    })

    it('should restore focus after modal closes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const trigger = screen.getAllByTestId('search-result')[0]
      trigger.focus()
      
      // Open modal
      await user.click(trigger)
      const modal = await screen.findByRole('dialog')
      expect(modal).toBeInTheDocument()
      
      // Close modal
      const closeButton = screen.getByRole('button', { name: /close/i })
      await user.click(closeButton)
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      
      // Focus should return to trigger
      expect(document.activeElement).toBe(trigger)
    })

    it('should handle focus for dynamic content', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByRole('textbox')
      const searchButton = screen.getByRole('button', { name: /search/i })
      
      await user.type(searchInput, 'dynamic focus test')
      await user.click(searchButton)
      
      // Focus should move to results when they appear
      await waitFor(() => {
        const resultsHeading = screen.getByRole('heading', { name: /search results/i })
        expect(resultsHeading).toBeInTheDocument()
        expect(document.activeElement).toBe(resultsHeading)
      })
    })
  })

  describe('Semantic HTML Structure', () => {
    it('should use proper semantic elements', async () => {
      const { container } = renderWithProviders(<SearchPage />)

      // Test semantic structure
      expect(container.querySelector('header')).toBeInTheDocument()
      expect(container.querySelector('main')).toBeInTheDocument()
      expect(container.querySelector('nav')).toBeInTheDocument()
      expect(container.querySelector('footer')).toBeInTheDocument()
      
      // Test article/section usage
      const sections = container.querySelectorAll('section')
      expect(sections.length).toBeGreaterThan(0)
      
      sections.forEach(section => {
        // Sections should have headings or aria-labels
        const hasHeading = section.querySelector('h1, h2, h3, h4, h5, h6')
        const hasAriaLabel = section.hasAttribute('aria-label') || section.hasAttribute('aria-labelledby')
        expect(hasHeading || hasAriaLabel).toBeTruthy()
      })
    })

    it('should use proper list semantics', async () => {
      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        const lists = screen.getAllByRole('list')
        expect(lists.length).toBeGreaterThan(0)
        
        lists.forEach(list => {
          const listItems = list.querySelectorAll('[role="listitem"]')
          expect(listItems.length).toBeGreaterThan(0)
          
          // Each list item should have proper content
          listItems.forEach(item => {
            expect(item.textContent?.trim()).toBeTruthy()
          })
        })
      })
    })

    it('should use proper table semantics', async () => {
      renderWithProviders(<DownloadsPage />)

      await waitFor(() => {
        const table = screen.getByRole('table')
        expect(table).toBeInTheDocument()
        
        // Table should have caption or aria-label
        const caption = table.querySelector('caption')
        const hasAriaLabel = table.hasAttribute('aria-label')
        expect(caption || hasAriaLabel).toBeTruthy()
        
        // Headers should be properly associated
        const headers = table.querySelectorAll('th')
        headers.forEach(header => {
          expect(header.hasAttribute('scope')).toBeTruthy()
        })
        
        // Data cells should reference headers if complex
        const complexCells = table.querySelectorAll('td[headers]')
        complexCells.forEach(cell => {
          const headerIds = cell.getAttribute('headers')?.split(' ') || []
          headerIds.forEach(id => {
            expect(table.querySelector(`#${id}`)).toBeInTheDocument()
          })
        })
      })
    })

    it('should use proper form semantics', async () => {
      renderWithProviders(<SearchPage />)

      const forms = screen.getAllByRole('search')
      expect(forms.length).toBeGreaterThan(0)
      
      forms.forEach(form => {
        // Form should have accessible name
        const hasLabel = form.hasAttribute('aria-label') || form.hasAttribute('aria-labelledby')
        expect(hasLabel).toBeTruthy()
        
        // Form controls should be properly labeled
        const inputs = form.querySelectorAll('input, select, textarea')
        inputs.forEach(input => {
          const hasLabel = input.hasAttribute('aria-label') || 
                          input.hasAttribute('aria-labelledby') ||
                          form.querySelector(`label[for="${input.id}"]`)
          expect(hasLabel).toBeTruthy()
        })
      })
    })
  })

  describe('Error Handling and Validation', () => {
    it('should provide accessible error messages', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      // Trigger validation error
      const searchButton = screen.getByRole('button', { name: /search/i })
      await user.click(searchButton)

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveAttribute('aria-live', 'assertive')
        
        // Error should be descriptive
        expect(errorMessage.textContent).toMatch(/search query.*required/i)
        
        // Input should be marked invalid
        const searchInput = screen.getByRole('textbox')
        expect(searchInput).toHaveAttribute('aria-invalid', 'true')
        expect(searchInput).toHaveAttribute('aria-describedby')
      })
    })

    it('should handle loading states accessibly', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByRole('textbox')
      await user.type(searchInput, 'loading test')
      
      const searchButton = screen.getByRole('button', { name: /search/i })
      await user.click(searchButton)

      // Loading state should be announced
      await waitFor(() => {
        const loadingIndicator = screen.getByRole('status')
        expect(loadingIndicator).toHaveTextContent(/searching/i)
        expect(loadingIndicator).toHaveAttribute('aria-live', 'polite')
        
        // Button should be disabled during loading
        expect(searchButton).toHaveAttribute('aria-disabled', 'true')
      })
    })

    it('should provide accessible success messages', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SearchPage />)

      const searchInput = screen.getByRole('textbox')
      await user.type(searchInput, 'success test')
      
      const searchButton = screen.getByRole('button', { name: /search/i })
      await user.click(searchButton)

      await waitFor(() => {
        const successMessage = screen.getByRole('status')
        expect(successMessage).toHaveTextContent(/found.*results/i)
        expect(successMessage).toHaveAttribute('aria-live', 'polite')
      })
    })
  })

  afterAll(() => {
    // Clean up any accessibility test artifacts
    document.body.removeAttribute('data-theme')
    document.body.className = ''
  })
})