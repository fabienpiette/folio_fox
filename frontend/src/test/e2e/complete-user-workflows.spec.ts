/**
 * End-to-End Complete User Workflows
 * 
 * Tests complete user journeys from login to book download,
 * cross-browser compatibility, mobile responsiveness, and
 * accessibility compliance in real-world scenarios.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test'
import { injectAxeScript, checkA11y } from 'axe-playwright'

// Test data
const testUser = {
  username: 'testuser',
  password: 'testpassword123',
  email: 'test@foliofox.com',
}

const testSearches = [
  {
    query: 'The Great Gatsby',
    expectedResults: 'F. Scott Fitzgerald',
    format: 'epub',
  },
  {
    query: 'science fiction',
    expectedResults: 'results found',
    format: 'pdf',
  },
  {
    query: 'programming javascript',
    expectedResults: 'results found',
    format: 'epub',
  },
]

// Helper functions
const loginUser = async (page: Page) => {
  await page.goto('/login')
  await page.fill('[data-testid="username-input"]', testUser.username)
  await page.fill('[data-testid="password-input"]', testUser.password)
  await page.click('[data-testid="login-button"]')
  await expect(page).toHaveURL('/dashboard')
}

const performSearch = async (page: Page, query: string, format?: string) => {
  await page.goto('/search')
  await page.fill('[data-testid="search-input"]', query)
  
  if (format) {
    await page.selectOption('[data-testid="format-filter"]', format)
  }
  
  await page.click('[data-testid="search-button"]')
  await expect(page.locator('[data-testid="search-results"]')).toBeVisible()
}

const downloadBook = async (page: Page, bookTitle: string) => {
  const bookResult = page.locator(`[data-testid="search-result"]:has-text("${bookTitle}")`)
  await expect(bookResult).toBeVisible()
  
  await bookResult.locator('[data-testid="download-button"]').click()
  await expect(page.locator('[data-testid="download-confirmation"]')).toBeVisible()
  
  await page.click('[data-testid="confirm-download"]')
  await expect(page.locator('[data-testid="download-success"]')).toBeVisible()
}

test.describe('Complete User Workflows', () => {
  test.beforeEach(async ({ page }) => {
    // Setup API mocking for consistent test data
    await page.route('/api/v1/**', async (route) => {
      const url = route.request().url()
      
      if (url.includes('/auth/login')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'test-jwt-token',
            token_type: 'Bearer',
            expires_in: 3600,
            user: {
              id: 1,
              username: testUser.username,
              email: testUser.email,
              is_active: true,
              is_admin: false,
              last_login: null,
              created_at: '2023-01-01T00:00:00Z',
              updated_at: '2023-01-01T00:00:00Z',
            }
          }),
        })
      } else if (url.includes('/search')) {
        const urlParams = new URL(url)
        const query = urlParams.searchParams.get('query')
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            query: query || '',
            results: [
              {
                indexer_id: 1,
                indexer_name: 'Test Indexer',
                title: 'The Great Gatsby',
                author: 'F. Scott Fitzgerald', 
                description: 'A classic American novel',
                format: 'epub',
                file_size_bytes: 1048576,
                file_size_human: '1.0 MB',
                quality_score: 95,
                download_url: 'https://example.com/download/1',
                source_url: 'https://example.com/source/1',
                language: 'en',
                publication_year: 1925,
                isbn: '978-0123456789',
                cover_url: 'https://example.com/cover/1.jpg',
                tags: ['classic', 'american literature'],
                metadata: {},
                found_at: new Date().toISOString(),
              }
            ],
            total_results: 1,
            indexers_searched: [
              {
                indexer_id: 1,
                indexer_name: 'Test Indexer',
                result_count: 1,
                response_time_ms: 250,
                error: null,
              }
            ],
            search_duration_ms: 250,
            cached: false,
            cache_expires_at: null,
          }),
        })
      } else if (url.includes('/downloads/queue')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            downloads: [],
            pagination: {
              current_page: 1,
              per_page: 20,
              total_pages: 0,
              total_items: 0,
              has_next: false,
              has_prev: false,
              next_page: null,
              prev_page: null,
            },
            queue_stats: {
              total_items: 0,
              pending_count: 0,
              downloading_count: 0,
              completed_count: 0,
              failed_count: 0,
              total_size_bytes: 0,
              estimated_completion: null,
            }
          }),
        })
      } else {
        await route.continue()
      }
    })
  })

  test('Complete book discovery and download workflow', async ({ page }) => {
    // 1. User logs in
    await loginUser(page)
    
    // Verify dashboard loads
    await expect(page.locator('[data-testid="dashboard-header"]')).toContainText('Welcome to FolioFox')
    await expect(page.locator('[data-testid="search-stats"]')).toBeVisible()
    await expect(page.locator('[data-testid="download-stats"]')).toBeVisible()
    
    // 2. User navigates to search
    await page.click('[data-testid="nav-search"]')
    await expect(page).toHaveURL('/search')
    
    // 3. User performs search
    await performSearch(page, 'The Great Gatsby', 'epub')
    
    // Verify search results
    await expect(page.locator('[data-testid="search-results-count"]')).toContainText('1 result')
    await expect(page.locator('[data-testid="search-result"]')).toContainText('The Great Gatsby')
    await expect(page.locator('[data-testid="search-result"]')).toContainText('F. Scott Fitzgerald')
    
    // 4. User views book details
    await page.click('[data-testid="book-title-link"]')
    await expect(page.locator('[data-testid="book-details-modal"]')).toBeVisible()
    await expect(page.locator('[data-testid="book-title"]')).toContainText('The Great Gatsby')
    await expect(page.locator('[data-testid="book-author"]')).toContainText('F. Scott Fitzgerald')
    await expect(page.locator('[data-testid="book-format"]')).toContainText('epub')
    await expect(page.locator('[data-testid="book-size"]')).toContainText('1.0 MB')
    
    // 5. User downloads book
    await page.click('[data-testid="download-button"]')
    await expect(page.locator('[data-testid="download-confirmation"]')).toBeVisible()
    await expect(page.locator('[data-testid="download-details"]')).toContainText('The Great Gatsby')
    
    await page.click('[data-testid="confirm-download"]')
    await expect(page.locator('[data-testid="download-success"]')).toBeVisible()
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Added to download queue')
    
    // 6. User checks download queue
    await page.click('[data-testid="nav-downloads"]')
    await expect(page).toHaveURL('/downloads')
    
    // Should show the new download in queue
    await expect(page.locator('[data-testid="download-queue"]')).toBeVisible()
    
    // 7. User views library
    await page.click('[data-testid="nav-library"]')
    await expect(page).toHaveURL('/library')
    await expect(page.locator('[data-testid="library-header"]')).toBeVisible()
  })

  test('Search refinement and filtering workflow', async ({ page }) => {
    await loginUser(page)
    await page.goto('/search')
    
    // Initial broad search
    await performSearch(page, 'science fiction')
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible()
    
    // Refine search with filters
    await page.selectOption('[data-testid="format-filter"]', 'pdf')
    await page.fill('[data-testid="year-from"]', '2000')
    await page.fill('[data-testid="year-to"]', '2023')
    await page.selectOption('[data-testid="language-filter"]', 'en')
    
    // Apply filters
    await page.click('[data-testid="apply-filters"]')
    await expect(page.locator('[data-testid="active-filters"]')).toBeVisible()
    await expect(page.locator('[data-testid="filter-format"]')).toContainText('PDF')
    await expect(page.locator('[data-testid="filter-year"]')).toContainText('2000-2023')
    await expect(page.locator('[data-testid="filter-language"]')).toContainText('English')
    
    // Clear filters
    await page.click('[data-testid="clear-filters"]')
    await expect(page.locator('[data-testid="active-filters"]')).not.toBeVisible()
    
    // Save search
    await page.click('[data-testid="save-search"]')
    await page.fill('[data-testid="search-name"]', 'My Science Fiction Search')
    await page.click('[data-testid="confirm-save-search"]')
    await expect(page.locator('[data-testid="search-saved"]')).toBeVisible()
    
    // Load saved search
    await page.click('[data-testid="saved-searches"]')
    await page.click('[data-testid="saved-search"]:has-text("My Science Fiction Search")')
    await expect(page.locator('[data-testid="search-input"]')).toHaveValue('science fiction')
  })

  test('Download queue management workflow', async ({ page }) => {
    await loginUser(page)
    
    // Add multiple books to download queue
    for (const search of testSearches) {
      await performSearch(page, search.query, search.format)
      await downloadBook(page, 'The Great Gatsby') // Simplified for test
    }
    
    // Navigate to downloads page
    await page.goto('/downloads')
    
    // Verify queue shows downloads
    await expect(page.locator('[data-testid="download-item"]')).toHaveCount(testSearches.length)
    
    // Test bulk operations
    await page.click('[data-testid="select-all-downloads"]')
    await expect(page.locator('[data-testid="selected-count"]')).toContainText(`${testSearches.length} selected`)
    
    // Pause selected downloads
    await page.click('[data-testid="bulk-action-pause"]')
    await page.click('[data-testid="confirm-bulk-action"]')
    await expect(page.locator('[data-testid="bulk-action-success"]')).toBeVisible()
    
    // Resume downloads
    await page.click('[data-testid="bulk-action-resume"]')
    await page.click('[data-testid="confirm-bulk-action"]')
    await expect(page.locator('[data-testid="bulk-action-success"]')).toBeVisible()
    
    // Change download priority
    const firstDownload = page.locator('[data-testid="download-item"]').first()
    await firstDownload.locator('[data-testid="priority-input"]').fill('10')
    await firstDownload.locator('[data-testid="update-priority"]').click()
    await expect(page.locator('[data-testid="priority-updated"]')).toBeVisible()
    
    // View download history
    await page.click('[data-testid="download-history-tab"]')
    await expect(page.locator('[data-testid="download-history"]')).toBeVisible()
  })

  test('Library organization workflow', async ({ page }) => {
    await loginUser(page)
    await page.goto('/library')
    
    // Test different view modes
    await page.click('[data-testid="view-grid"]')
    await expect(page.locator('[data-testid="library-grid"]')).toBeVisible()
    
    await page.click('[data-testid="view-list"]')
    await expect(page.locator('[data-testid="library-list"]')).toBeVisible()
    
    // Test sorting options
    await page.selectOption('[data-testid="sort-by"]', 'title')
    await expect(page.locator('[data-testid="library-sorted"]')).toBeVisible()
    
    await page.selectOption('[data-testid="sort-by"]', 'date_added')
    await expect(page.locator('[data-testid="library-sorted"]')).toBeVisible()
    
    // Test filtering
    await page.selectOption('[data-testid="filter-format"]', 'epub')
    await expect(page.locator('[data-testid="format-filtered"]')).toBeVisible()
    
    await page.fill('[data-testid="filter-author"]', 'Fitzgerald')
    await expect(page.locator('[data-testid="author-filtered"]')).toBeVisible()
    
    // Test book actions
    const bookItem = page.locator('[data-testid="book-item"]').first()
    
    // Edit book metadata
    await bookItem.locator('[data-testid="edit-book"]').click()
    await expect(page.locator('[data-testid="edit-book-modal"]')).toBeVisible()
    
    await page.fill('[data-testid="book-tags"]', 'classic, american literature, fiction')
    await page.click('[data-testid="save-book-changes"]')
    await expect(page.locator('[data-testid="book-updated"]')).toBeVisible()
    
    // Create collection
    await page.click('[data-testid="create-collection"]')
    await page.fill('[data-testid="collection-name"]', 'American Classics')
    await page.fill('[data-testid="collection-description"]', 'Classic American literature books')
    await page.click('[data-testid="save-collection"]')
    await expect(page.locator('[data-testid="collection-created"]')).toBeVisible()
    
    // Add book to collection
    await bookItem.locator('[data-testid="add-to-collection"]').click()
    await page.selectOption('[data-testid="collection-select"]', 'American Classics')
    await page.click('[data-testid="confirm-add-to-collection"]')
    await expect(page.locator('[data-testid="added-to-collection"]')).toBeVisible()
  })

  test('System administration workflow', async ({ page }) => {
    // Login as admin user
    await page.goto('/login')
    await page.fill('[data-testid="username-input"]', 'admin')
    await page.fill('[data-testid="password-input"]', 'adminpass')
    await page.click('[data-testid="login-button"]')
    
    // Navigate to configuration
    await page.click('[data-testid="nav-config"]')
    await expect(page).toHaveURL('/config')
    
    // Test indexer management
    await page.click('[data-testid="indexers-tab"]')
    await expect(page.locator('[data-testid="indexer-list"]')).toBeVisible()
    
    // Add new indexer
    await page.click('[data-testid="add-indexer"]')
    await page.selectOption('[data-testid="indexer-type"]', 'prowlarr')
    await page.fill('[data-testid="indexer-name"]', 'Test Prowlarr')
    await page.fill('[data-testid="indexer-url"]', 'http://prowlarr:9696')
    await page.fill('[data-testid="indexer-api-key"]', 'test-api-key')
    await page.click('[data-testid="save-indexer"]')
    await expect(page.locator('[data-testid="indexer-added"]')).toBeVisible()
    
    // Test indexer connection
    await page.locator('[data-testid="indexer-item"]').last().locator('[data-testid="test-connection"]').click()
    await expect(page.locator('[data-testid="connection-test-result"]')).toBeVisible()
    
    // Test system settings
    await page.click('[data-testid="system-tab"]')
    await page.fill('[data-testid="max-concurrent-downloads"]', '5')
    await page.fill('[data-testid="download-timeout"]', '300')
    await page.click('[data-testid="save-system-settings"]')
    await expect(page.locator('[data-testid="settings-saved"]')).toBeVisible()
    
    // View system health
    await page.click('[data-testid="health-tab"]')
    await expect(page.locator('[data-testid="system-health"]')).toBeVisible()
    await expect(page.locator('[data-testid="health-status"]')).toContainText('Healthy')
    
    // Check component statuses
    await expect(page.locator('[data-testid="database-status"]')).toBeVisible()
    await expect(page.locator('[data-testid="redis-status"]')).toBeVisible()
    await expect(page.locator('[data-testid="indexers-status"]')).toBeVisible()
    
    // View logs
    await page.click('[data-testid="logs-tab"]')
    await expect(page.locator('[data-testid="system-logs"]')).toBeVisible()
    
    // Filter logs
    await page.selectOption('[data-testid="log-level-filter"]', 'error')
    await expect(page.locator('[data-testid="filtered-logs"]')).toBeVisible()
  })

  test('Error handling and recovery workflow', async ({ page }) => {
    await loginUser(page)
    
    // Test network error handling
    await page.route('/api/v1/search', route => route.abort())
    
    await page.goto('/search')
    await performSearch(page, 'network error test')
    
    await expect(page.locator('[data-testid="search-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="retry-search"]')).toBeVisible()
    
    // Restore network and retry
    await page.unroute('/api/v1/search')
    await page.click('[data-testid="retry-search"]')
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible()
    
    // Test download failure handling
    await page.route('/api/v1/downloads/queue', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })
    
    await downloadBook(page, 'The Great Gatsby')
    
    await expect(page.locator('[data-testid="download-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="retry-download"]')).toBeVisible()
    
    // Test offline mode
    await page.context().setOffline(true)
    await page.reload()
    
    await expect(page.locator('[data-testid="offline-banner"]')).toBeVisible()
    await expect(page.locator('[data-testid="offline-message"]')).toContainText('You are currently offline')
    
    // Restore connection
    await page.context().setOffline(false)
    await page.reload()
    
    await expect(page.locator('[data-testid="offline-banner"]')).not.toBeVisible()
  })

  test('Real-time updates workflow', async ({ page, context }) => {
    await loginUser(page)
    
    // Open two tabs to test real-time sync
    const secondPage = await context.newPage()
    await loginUser(secondPage)
    
    // First tab: Start a download
    await page.goto('/search')
    await performSearch(page, 'real-time test')
    await downloadBook(page, 'The Great Gatsby')
    
    // Second tab: Should see the download in queue
    await secondPage.goto('/downloads')
    await expect(secondPage.locator('[data-testid="download-item"]')).toBeVisible()
    
    // Simulate download progress updates via WebSocket
    await page.evaluate(() => {
      const event = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'download_progress',
          data: {
            download_id: 1,
            progress_percentage: 50,
            download_speed_kbps: 512,
            eta_seconds: 120,
          },
          timestamp: new Date().toISOString(),
        }),
      })
      window.dispatchEvent(event)
    })
    
    // Both tabs should show updated progress
    await expect(page.locator('[data-testid="download-progress"]')).toContainText('50%')
    await expect(secondPage.locator('[data-testid="download-progress"]')).toContainText('50%')
    
    // Simulate download completion
    await page.evaluate(() => {
      const event = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'download_completed',
          data: {
            download_id: 1,
            status: 'completed',
            progress_percentage: 100,
            download_path: '/downloads/the-great-gatsby.epub',
          },
          timestamp: new Date().toISOString(),
        }),
      })
      window.dispatchEvent(event)
    })
    
    // Both tabs should show completion
    await expect(page.locator('[data-testid="download-status"]')).toContainText('Completed')
    await expect(secondPage.locator('[data-testid="download-status"]')).toContainText('Completed')
    
    await secondPage.close()
  })
})

test.describe('Cross-Browser Compatibility', () => {
  const browsers = ['chromium', 'firefox', 'webkit']
  
  for (const browserName of browsers) {
    test(`Complete workflow on ${browserName}`, async ({ browser }) => {
      const context = await browser.newContext()
      const page = await context.newPage()
      
      await loginUser(page)
      await performSearch(page, 'cross-browser test')
      await downloadBook(page, 'The Great Gatsby')
      
      // Verify core functionality works across browsers
      await page.goto('/downloads')
      await expect(page.locator('[data-testid="download-item"]')).toBeVisible()
      
      await page.goto('/library')
      await expect(page.locator('[data-testid="library-header"]')).toBeVisible()
      
      await context.close()
    })
  }
})

test.describe('Mobile Responsiveness', () => {
  test('Mobile search and download workflow', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    await loginUser(page)
    
    // Test mobile navigation
    await page.click('[data-testid="mobile-menu-toggle"]')
    await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible()
    
    await page.click('[data-testid="mobile-nav-search"]')
    await expect(page).toHaveURL('/search')
    
    // Test mobile search interface
    await performSearch(page, 'mobile test')
    
    // Results should be touch-friendly
    await expect(page.locator('[data-testid="search-result"]')).toBeVisible()
    
    // Test mobile download interface
    await page.locator('[data-testid="search-result"]').first().tap()
    await expect(page.locator('[data-testid="book-details-modal"]')).toBeVisible()
    
    await page.tap('[data-testid="download-button"]')
    await expect(page.locator('[data-testid="download-confirmation"]')).toBeVisible()
    
    // Test mobile downloads page
    await page.click('[data-testid="mobile-menu-toggle"]')
    await page.click('[data-testid="mobile-nav-downloads"]')
    
    await expect(page.locator('[data-testid="download-queue"]')).toBeVisible()
    
    // Test mobile gestures
    await page.touchscreen.tap(200, 400)
    await expect(page.locator('[data-testid="download-item"]')).toBeVisible()
  })

  test('Tablet interface workflow', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    
    await loginUser(page)
    
    // Tablet should use responsive layout
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible()
    
    // Test tablet-optimized search
    await performSearch(page, 'tablet test')
    
    // Results should use grid layout on tablet
    await expect(page.locator('[data-testid="search-results-grid"]')).toBeVisible()
    
    // Test tablet download management  
    await downloadBook(page, 'The Great Gatsby')
    await page.goto('/downloads')
    
    // Should show tablet-optimized download queue
    await expect(page.locator('[data-testid="download-queue-tablet"]')).toBeVisible()
  })
})

test.describe('Accessibility Compliance', () => {
  test('Full accessibility audit', async ({ page }) => {
    await injectAxeScript(page)
    await loginUser(page)
    
    // Test dashboard accessibility
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    })
    
    // Test search page accessibility
    await page.goto('/search')
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    })
    
    // Test downloads page accessibility
    await page.goto('/downloads')
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    })
    
    // Test library page accessibility
    await page.goto('/library')
    await checkA11y(page, undefined, {
      detailedReport: true,
      detailedReportOptions: { html: true },
    })
  })

  test('Keyboard navigation workflow', async ({ page }) => {
    await loginUser(page)
    
    // Test keyboard navigation
    await page.keyboard.press('Tab') // Should focus first interactive element
    await page.keyboard.press('Tab') // Navigate to search
    await page.keyboard.press('Enter') // Activate search navigation
    
    await expect(page).toHaveURL('/search')
    
    // Test search with keyboard
    await page.keyboard.type('keyboard navigation test')
    await page.keyboard.press('Enter') // Submit search
    
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible()
    
    // Navigate through results with keyboard
    await page.keyboard.press('Tab') // Focus first result
    await page.keyboard.press('Enter') // Open result details
    
    await expect(page.locator('[data-testid="book-details-modal"]')).toBeVisible()
    
    // Close modal with keyboard
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="book-details-modal"]')).not.toBeVisible()
  })

  test('Screen reader compatibility', async ({ page }) => {
    await loginUser(page)
    
    // Verify ARIA labels and roles
    await expect(page.locator('[role="main"]')).toBeVisible()
    await expect(page.locator('[role="navigation"]')).toBeVisible()
    await expect(page.locator('[aria-label="Main navigation"]')).toBeVisible()
    
    // Test search accessibility
    await page.goto('/search')
    await expect(page.locator('[aria-label="Search for books"]')).toBeVisible()
    await expect(page.locator('[aria-label="Search filters"]')).toBeVisible()
    
    // Test form accessibility
    await expect(page.locator('[data-testid="search-input"]')).toHaveAttribute('aria-describedby')
    await expect(page.locator('[data-testid="format-filter"]')).toHaveAttribute('aria-label')
    
    // Test dynamic content accessibility
    await performSearch(page, 'screen reader test')
    
    await expect(page.locator('[aria-live="polite"]')).toBeVisible()
    await expect(page.locator('[aria-label*="search results"]')).toBeVisible()
  })
})