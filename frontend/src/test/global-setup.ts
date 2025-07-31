import { chromium, FullConfig } from '@playwright/test'

async function globalSetup(_config: FullConfig) {
  // Start a browser to warm up and ensure everything is ready
  const browser = await chromium.launch()
  const page = await browser.newPage()
  
  try {
    // Pre-warm the application and ensure it's responding
    await page.goto('http://localhost:3000', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    })
    
    // Create a test user session if needed
    await page.evaluate(() => {
      localStorage.setItem('test-setup', 'completed')
    })
    
    console.log('Global setup completed successfully')
    
  } catch (error) {
    console.error('Global setup failed:', error)
    throw error
  } finally {
    await browser.close()
  }
}

export default globalSetup