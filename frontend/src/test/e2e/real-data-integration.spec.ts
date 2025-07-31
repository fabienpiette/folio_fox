import { test, expect } from '@playwright/test'

test.describe('Real Data Integration E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.route('**/api/v1/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
          },
          access_token: 'mock-jwt-token',
        }),
      })
    })

    // Mock dashboard stats endpoint
    await page.route('**/api/v1/downloads/dashboard-stats', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalBooks: 247,
          activeDownloads: 3,
          queueItems: 8,
          failedDownloads: 2,
        }),
      })
    })

    // Mock system status endpoint
    await page.route('**/api/v1/system/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          database: {
            status: 'healthy',
            response_ms: 12,
            connections: 4,
          },
          indexers: {
            total: 5,
            online: 4,
            status: 'degraded',
          },
          downloadService: {
            status: 'active',
            activeDownloads: 3,
          },
        }),
      })
    })

    // Mock download queue endpoint
    await page.route('**/api/v1/downloads/queue*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          downloads: [
            {
              id: '1',
              title: 'The Hitchhiker\'s Guide to the Galaxy',
              author: 'Douglas Adams',
              status: 'downloading',
              progress_percentage: 67,
              file_format: 'epub',
              file_size_human: '2.3 MB',
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:45:00Z',
            },
            {
              id: '2',
              title: 'Foundation',
              author: 'Isaac Asimov',
              status: 'completed',
              progress_percentage: 100,
              file_format: 'pdf',
              file_size_human: '5.1 MB',
              created_at: '2024-01-15T09:15:00Z',
              updated_at: '2024-01-15T09:45:00Z',
            },
            {
              id: '3',
              title: 'Neuromancer',
              author: 'William Gibson',
              status: 'failed',
              progress_percentage: 0,
              file_format: 'mobi',
              error_message: 'Download URL expired',
              created_at: '2024-01-15T08:20:00Z',
              updated_at: '2024-01-15T08:25:00Z',
            },
          ],
          pagination: {
            current_page: 1,
            per_page: 10,
            total_pages: 1,
            total_items: 3,
          },
        }),
      })
    })

    // Navigate to dashboard
    await page.goto('/dashboard')
  })

  test('displays real dashboard statistics correctly', async ({ page }) => {
    // Wait for dashboard to load
    await expect(page.locator('[data-testid="dashboard-stats"]')).toBeVisible()

    // Verify statistics are displayed with real values
    await expect(page.locator('[data-testid="total-books"]')).toContainText('247')
    await expect(page.locator('[data-testid="active-downloads"]')).toContainText('3')
    await expect(page.locator('[data-testid="queue-items"]')).toContainText('8')
    await expect(page.locator('[data-testid="failed-downloads"]')).toContainText('2')

    // Verify no fake/placeholder data is shown
    await expect(page.locator('text=1247')).not.toBeVisible() // Old fake data
    await expect(page.locator('text=12')).not.toBeVisible() // Old fake queue count
  })

  test('shows real download queue with proper status indicators', async ({ page }) => {
    // Wait for recent downloads section
    await expect(page.locator('[data-testid="recent-downloads"]')).toBeVisible()

    // Verify real download entries are displayed
    await expect(page.locator('text=The Hitchhiker\'s Guide to the Galaxy')).toBeVisible()
    await expect(page.locator('text=Douglas Adams')).toBeVisible()
    await expect(page.locator('text=Foundation')).toBeVisible()
    await expect(page.locator('text=Isaac Asimov')).toBeVisible()
    await expect(page.locator('text=Neuromancer')).toBeVisible()
    await expect(page.locator('text=William Gibson')).toBeVisible()

    // Verify status indicators show real statuses
    await expect(page.locator('[data-testid="download-status-downloading"]')).toBeVisible()
    await expect(page.locator('[data-testid="download-status-completed"]')).toBeVisible()
    await expect(page.locator('[data-testid="download-status-failed"]')).toBeVisible()

    // Verify progress information
    await expect(page.locator('text=67%')).toBeVisible() // Download progress
    await expect(page.locator('text=100%')).toBeVisible() // Completed
    await expect(page.locator('text=Download URL expired')).toBeVisible() // Error message
  })

  test('displays real system health status', async ({ page }) => {
    // Wait for system status section
    await expect(page.locator('[data-testid="system-status"]')).toBeVisible()

    // Verify database status
    await expect(page.locator('[data-testid="database-status"]')).toContainText('healthy')
    await expect(page.locator('text=12ms')).toBeVisible() // Response time

    // Verify indexer status shows degraded state
    await expect(page.locator('[data-testid="indexers-status"]')).toContainText('degraded')
    await expect(page.locator('text=4/5 online')).toBeVisible()

    // Verify download service status
    await expect(page.locator('[data-testid="download-service-status"]')).toContainText('active')
    await expect(page.locator('text=3 downloads')).toBeVisible()
  })

  test('handles API errors gracefully with user-friendly messages', async ({ page }) => {
    // Mock API error for dashboard stats
    await page.route('**/api/v1/downloads/dashboard-stats', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://foliofox.com/errors/internal-server',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Database connection failed',
        }),
      })
    })

    // Refresh the page to trigger the error
    await page.reload()

    // Verify error message is displayed
    await expect(page.locator('[data-testid="api-error"]')).toBeVisible()
    await expect(page.locator('text=Unable to load dashboard data')).toBeVisible()
    await expect(page.locator('text=Please try again')).toBeVisible()

    // Verify retry button is present and functional
    const retryButton = page.locator('[data-testid="retry-button"]')
    await expect(retryButton).toBeVisible()
    await expect(retryButton).toBeEnabled()
  })

  test('retry functionality works correctly after API failures', async ({ page }) => {
    let requestCount = 0
    
    // Mock failing then succeeding API
    await page.route('**/api/v1/downloads/dashboard-stats', async route => {
      requestCount++
      if (requestCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Service temporarily unavailable',
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            totalBooks: 156,
            activeDownloads: 1,
            queueItems: 4,
            failedDownloads: 0,
          }),
        })
      }
    })

    await page.reload()

    // Wait for error to appear
    await expect(page.locator('[data-testid="api-error"]')).toBeVisible()

    // Click retry button
    await page.click('[data-testid="retry-button"]')

    // Verify successful retry
    await expect(page.locator('[data-testid="total-books"]')).toContainText('156')
    await expect(page.locator('[data-testid="api-error"]')).not.toBeVisible()
  })

  test('loading states display correctly during API calls', async ({ page }) => {
    // Mock slow API response
    await page.route('**/api/v1/downloads/dashboard-stats', async route => {
      // Delay response to see loading state
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalBooks: 89,
          activeDownloads: 2,
          queueItems: 3,
          failedDownloads: 1,
        }),
      })
    })

    await page.reload()

    // Verify loading indicators are shown
    await expect(page.locator('[data-testid="dashboard-loading"]')).toBeVisible()
    await expect(page.locator('[data-testid="skeleton-loader"]')).toBeVisible()

    // Wait for loading to complete
    await expect(page.locator('[data-testid="dashboard-loading"]')).not.toBeVisible({ timeout: 2000 })
    
    // Verify data is displayed
    await expect(page.locator('[data-testid="total-books"]')).toContainText('89')
  })

  test('real-time updates work without UI flicker', async ({ page }) => {
    let updateCount = 0
    const initialData = {
      totalBooks: 100,
      activeDownloads: 2,
      queueItems: 5,
      failedDownloads: 1,
    }

    // Mock progressive updates
    await page.route('**/api/v1/downloads/dashboard-stats', async route => {
      updateCount++
      const data = {
        ...initialData,
        activeDownloads: initialData.activeDownloads + updateCount - 1,
        queueItems: Math.max(0, initialData.queueItems - updateCount + 1),
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      })
    })

    // Wait for initial load
    await expect(page.locator('[data-testid="active-downloads"]')).toContainText('2')

    // Simulate real-time update (background refresh)
    await page.click('[data-testid="refresh-button"]')
    
    // Verify updated values without flicker
    await expect(page.locator('[data-testid="active-downloads"]')).toContainText('3')
    await expect(page.locator('[data-testid="queue-items"]')).toContainText('4')
    
    // Should not show loading state during background refresh
    await expect(page.locator('[data-testid="dashboard-loading"]')).not.toBeVisible()
  })

  test('search functionality integrates with real backend', async ({ page }) => {
    // Mock search API
    await page.route('**/api/v1/search*', async route => {
      const url = new URL(route.request().url())
      const query = url.searchParams.get('query')
      
      if (query === 'science fiction') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            results: [
              {
                indexer_id: 1,
                indexer_name: 'BookDB',
                title: 'Dune',
                author: 'Frank Herbert',
                format: 'epub',
                file_size_human: '3.2 MB',
                quality_score: 98,
                download_url: 'https://example.com/dune.epub',
                language: 'en',
                found_at: '2024-01-15T11:00:00Z',
              },
              {
                indexer_id: 2,
                indexer_name: 'EBookLib',
                title: 'Foundation',
                author: 'Isaac Asimov',
                format: 'pdf',
                file_size_human: '2.8 MB',
                quality_score: 95,
                download_url: 'https://example.com/foundation.pdf',
                language: 'en',
                found_at: '2024-01-15T11:01:00Z',
              },
            ],
            total_results: 2,
            search_duration_ms: 342,
            indexers_searched: ['BookDB', 'EBookLib'],
            cached: false,
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            results: [],
            total_results: 0,
            search_duration_ms: 89,
            indexers_searched: [],
            cached: false,
          }),
        })
      }
    })

    // Navigate to search page
    await page.goto('/search')

    // Perform search
    await page.fill('[data-testid="search-input"]', 'science fiction')
    await page.click('[data-testid="search-button"]')

    // Wait for results
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible()

    // Verify real search results
    await expect(page.locator('text=Dune')).toBeVisible()
    await expect(page.locator('text=Frank Herbert')).toBeVisible()
    await expect(page.locator('text=Foundation')).toBeVisible()
    await expect(page.locator('text=Isaac Asimov')).toBeVisible()

    // Verify search metadata
    await expect(page.locator('text=2 results')).toBeVisible()
    await expect(page.locator('text=342ms')).toBeVisible()
    await expect(page.locator('text=BookDB, EBookLib')).toBeVisible()
  })

  test('authentication flow works with real token handling', async ({ page }) => {
    // Mock logout
    await page.route('**/api/v1/auth/logout', async route => {
      await route.fulfill({ status: 200 })
    })

    // Mock protected API call after logout
    await page.route('**/api/v1/downloads/dashboard-stats', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Authentication required',
        }),
      })
    })

    // Logout
    await page.click('[data-testid="user-menu"]')
    await page.click('[data-testid="logout-button"]')

    // Should redirect to login
    await expect(page).toHaveURL('/login')

    // Try to access protected route
    await page.goto('/dashboard')

    // Should show authentication error or redirect
    await expect(page.locator('text=Authentication required')).toBeVisible()
  })

  test('handles large datasets without performance degradation', async ({ page }) => {
    // Mock large download queue
    const largeDownloadList = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
      title: `Book ${index + 1}`,
      author: `Author ${index + 1}`,
      status: index % 4 === 0 ? 'downloading' : index % 4 === 1 ? 'completed' : index % 4 === 2 ? 'queued' : 'failed',
      progress_percentage: index % 4 === 0 ? Math.floor(Math.random() * 100) : index % 4 === 1 ? 100 : 0,
      file_format: ['epub', 'pdf', 'mobi'][index % 3],
      file_size_human: `${(Math.random() * 10 + 1).toFixed(1)} MB`,
      created_at: new Date(Date.now() - index * 3600000).toISOString(),
      updated_at: new Date(Date.now() - index * 1800000).toISOString(),
    }))

    await page.route('**/api/v1/downloads/queue*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          downloads: largeDownloadList,
          pagination: {
            current_page: 1,
            per_page: 100,
            total_pages: 1,
            total_items: 100,
          },
        }),
      })
    })

    const startTime = Date.now()
    
    await page.reload()
    
    // Wait for content to load
    await expect(page.locator('text=Book 1')).toBeVisible()
    await expect(page.locator('text=Book 50')).toBeVisible()
    
    const loadTime = Date.now() - startTime
    
    // Should load within reasonable time (< 3 seconds)
    expect(loadTime).toBeLessThan(3000)
    
    // Should be able to scroll through large list smoothly
    await page.mouse.wheel(0, 1000)
    await expect(page.locator('text=Book 100')).toBeVisible()
  })
})