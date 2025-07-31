# FolioFox Error Handling System

This directory contains comprehensive error handling components designed to gracefully handle various error scenarios in the FolioFox frontend application.

## Components Overview

### 1. ErrorBoundary
A React error boundary component that catches unexpected JavaScript errors during rendering.

**Features:**
- Catches and displays React rendering errors
- Provides retry functionality
- Shows detailed error information in development
- Supports custom error reporting
- HOC wrapper for easy component wrapping

**Usage:**
```tsx
import { ErrorBoundary, withErrorBoundary } from '@/components/ui/feedback'

// Wrap components directly
<ErrorBoundary onError={handleError}>
  <YourComponent />
</ErrorBoundary>

// Or use HOC
const SafeComponent = withErrorBoundary(YourComponent)
```

### 2. ApiErrorDisplay
Displays API errors with retry functionality and different error type handling.

**Features:**
- Different error type icons (network, auth, server, etc.)
- Automatic retry with exponential backoff
- Multiple display variants (inline, card, banner)
- Detailed error information toggle
- Accessibility compliant

**Usage:**
```tsx
import { ApiErrorDisplay, createApiError } from '@/components/ui/feedback'

<ApiErrorDisplay
  error={createApiError(axiosError)}
  onRetry={handleRetry}
  variant="card"
  showDetails={true}
/>
```

### 3. EmptyStateDisplay
Shows empty states when no data is available with various preset configurations.

**Features:**
- Multiple illustration types (search, downloads, library, etc.)
- Preset configurations for common scenarios
- Action buttons for user guidance
- Responsive design
- Convenience components for specific use cases

**Usage:**
```tsx
import { EmptyStateDisplay, NoSearchResults, EmptyLibrary } from '@/components/ui/feedback'

// Custom empty state
<EmptyStateDisplay config={{
  title: "No results found",
  description: "Try adjusting your search terms",
  illustration: "search",
  action: {
    label: "Clear Filters",
    onClick: clearFilters
  }
}} />

// Preset components
<NoSearchResults query="your search" onClearFilters={clearFilters} />
<EmptyLibrary />
```

### 4. LoadingStateDisplay
Provides various loading state visualizations including spinners, skeletons, and pulse animations.

**Features:**
- Multiple loading variants (spinner, skeleton, pulse)
- Skeleton loaders for different UI patterns
- Specific dashboard loading states
- Loading overlays and button states
- Customizable sizes and messages

**Usage:**
```tsx
import { 
  LoadingStateDisplay, 
  DashboardStatsLoading, 
  TableSkeleton,
  LoadingOverlay 
} from '@/components/ui/feedback'

// Generic loading state
<LoadingStateDisplay config={{ 
  variant: "skeleton", 
  message: "Loading data..." 
}} />

// Specific skeleton patterns
<DashboardStatsLoading />
<TableSkeleton rows={5} />

// Loading overlay
<LoadingOverlay isLoading={true} message="Saving...">
  <YourContent />
</LoadingOverlay>
```

## Error Types

The system supports different error types with appropriate styling and icons:

- **network**: Connection issues, timeout errors
- **authentication**: 401 unauthorized errors
- **authorization**: 403 forbidden errors
- **validation**: 400 bad request, 422 validation errors
- **server**: 500+ server errors
- **timeout**: Request timeout errors
- **unknown**: Fallback for unhandled error types

## Integration with React Query

The error handling components are designed to work seamlessly with React Query:

```tsx
import { useQuery } from '@tanstack/react-query'
import { ApiErrorDisplay, createApiError } from '@/components/ui/feedback'

function MyComponent() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['data'],
    queryFn: fetchData,
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error?.response?.status === 401) return false
      return failureCount < 3
    }
  })

  if (isLoading) return <LoadingStateDisplay />
  if (error) return <ApiErrorDisplay error={createApiError(error)} onRetry={refetch} />
  if (!data?.length) return <EmptyStateDisplay config={emptyConfig} />
  
  return <DataDisplay data={data} />
}
```

## Accessibility Features

All components include proper accessibility features:

- **ARIA labels and roles** for screen readers
- **Keyboard navigation** support
- **Focus management** for interactive elements
- **Screen reader announcements** for status changes
- **High contrast** compatible styling
- **Semantic HTML** structure

## Styling and Theming

The components use the existing FolioFox design system:

- **Dark theme** optimized colors
- **Consistent spacing** and typography
- **Tailwind CSS** utility classes
- **Responsive design** patterns
- **Animation** and transition effects

## Error Reporting Integration

The ErrorBoundary component supports integration with error reporting services:

```tsx
<ErrorBoundary
  onError={(error, errorInfo) => {
    // Send to error reporting service
    errorReportingService.report(error, {
      componentStack: errorInfo.componentStack,
      userId: currentUser.id,
      timestamp: new Date().toISOString()
    })
  }}
>
  <App />
</ErrorBoundary>
```

## Best Practices

### 1. Error Boundary Placement
- Place at app level for global error catching
- Add to individual routes for isolation
- Use around critical components that might fail

### 2. API Error Handling
- Always convert raw errors to ApiError format using `createApiError()`
- Provide retry functionality for transient errors
- Show appropriate messages based on error type

### 3. Empty States
- Use specific empty state messages that guide users
- Provide clear actions when possible
- Match empty state illustrations to the context

### 4. Loading States
- Match skeleton patterns to actual content structure
- Use appropriate loading variants for the context
- Show progress indicators for long operations

### 5. User Experience
- Keep error messages clear and actionable
- Provide retry options for recoverable errors
- Use progressive disclosure for technical details
- Ensure all states are accessible and keyboard navigable

## Testing Error States

To test the error handling components in development:

```tsx
// Trigger React error
const BuggyComponent = () => {
  throw new Error('Test error boundary')
  return <div>This won't render</div>
}

// Simulate API errors
const TestApiError = () => {
  const error = createApiError({
    response: { status: 500, data: { message: 'Server error' } }
  })
  return <ApiErrorDisplay error={error} onRetry={() => console.log('retry')} />
}
```

## Browser Support

The error handling components support all modern browsers:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Features gracefully degrade in older browsers while maintaining core functionality.