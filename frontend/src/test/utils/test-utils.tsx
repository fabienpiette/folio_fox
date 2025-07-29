import React, { ReactElement } from 'react'
import { render as rtlRender, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

// Create a custom render function that includes providers
function AllTheProviders({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  wrapper?: React.ComponentType<{ children: React.ReactNode }>
}

const customRender = (
  ui: ReactElement,
  options?: CustomRenderOptions
) => {
  const { wrapper: Wrapper = AllTheProviders, ...renderOptions } = options || {}
  
  return rtlRender(ui, { wrapper: Wrapper, ...renderOptions })
}

// Re-export everything
export * from '@testing-library/react'
export { customRender as render }

// Custom queries and matchers
export const getByTestId = (container: HTMLElement, testId: string) => {
  const element = container.querySelector(`[data-testid="${testId}"]`)
  if (!element) {
    throw new Error(`Unable to find element with testId: ${testId}`)
  }
  return element
}

export const queryByTestId = (container: HTMLElement, testId: string) => {
  return container.querySelector(`[data-testid="${testId}"]`)
}

// Wait for loading states to resolve
export const waitForLoadingToFinish = async () => {
  await new Promise(resolve => setTimeout(resolve, 100))
}

// Mock window.scrollTo for tests
export const mockScrollTo = () => {
  Object.defineProperty(window, 'scrollTo', {
    value: jest.fn(),
    writable: true
  })
}