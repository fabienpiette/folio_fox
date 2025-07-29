import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { splitVendorChunkPlugin } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Enable React Fast Refresh for development
      fastRefresh: true,
      // Optimize JSX runtime for production
      jsxRuntime: 'automatic',
    }),
    splitVendorChunkPlugin(),
    // Bundle analyzer plugin (only in analyze mode)
    process.env.ANALYZE === 'true' && visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/components': resolve(__dirname, './src/components'),
      '@/hooks': resolve(__dirname, './src/hooks'),
      '@/services': resolve(__dirname, './src/services'),
      '@/stores': resolve(__dirname, './src/stores'),
      '@/types': resolve(__dirname, './src/types'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/assets': resolve(__dirname, './src/assets'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Optimize build performance
    target: 'esnext',
    minify: 'esbuild',
    // Increase chunk size warning limit for large apps
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Advanced code splitting strategy
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            // React ecosystem
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor'
            }
            // UI libraries
            if (id.includes('@headlessui') || id.includes('@heroicons') || id.includes('@tanstack')) {
              return 'ui-vendor'
            }
            // Utilities and date libraries
            if (id.includes('date-fns') || id.includes('axios') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'utils-vendor'
            }
            // Virtual scrolling libraries
            if (id.includes('react-window') || id.includes('react-virtualized')) {
              return 'virtualization-vendor'
            }
            // Large libraries get their own chunks
            if (id.includes('lodash')) {
              return 'lodash-vendor'
            }
            // Everything else goes to vendor
            return 'vendor'
          }
          
          // Application code splitting
          if (id.includes('/src/components/search/')) {
            return 'search-components'
          }
          if (id.includes('/src/components/downloads/')) {
            return 'downloads-components'
          }
          if (id.includes('/src/components/library/')) {
            return 'library-components'
          }
          if (id.includes('/src/services/')) {
            return 'services'
          }
          if (id.includes('/src/hooks/')) {
            return 'hooks'
          }
        },
        // Optimize chunk names for caching
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
          if (facadeModuleId) {
            // Extract meaningful names from paths
            if (facadeModuleId.includes('components/')) {
              const componentName = facadeModuleId.split('/').pop()?.replace('.tsx', '').replace('.ts', '')
              return `components/[name]-${componentName}-[hash].js`
            }
            if (facadeModuleId.includes('pages/')) {
              const pageName = facadeModuleId.split('/').pop()?.replace('.tsx', '').replace('.ts', '')
              return `pages/[name]-${pageName}-[hash].js`
            }
          }
          return 'chunks/[name]-[hash].js'
        },
        entryFileNames: 'entries/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') || []
          const ext = info[info.length - 1]
          
          // Organize assets by type
          if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(assetInfo.name || '')) {
            return `images/[name]-[hash][extname]`
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name || '')) {
            return `fonts/[name]-[hash][extname]`
          }
          if (/\.(css)$/i.test(assetInfo.name || '')) {
            return `styles/[name]-[hash][extname]`
          }
          
          return `assets/[name]-[hash][extname]`
        },
      },
      // Optimization for large codebases
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false,
      },
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@tanstack/react-virtual',
      'react-window',
      '@headlessui/react',
      '@heroicons/react/24/outline',
      '@heroicons/react/24/solid',
      'axios',
      'clsx',
      'tailwind-merge',
      'date-fns',
    ],
    // Exclude large libraries that should be loaded dynamically
    exclude: ['@tanstack/react-query-devtools'],
  },
  // Performance optimizations
  esbuild: {
    // Remove console.log in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Optimize for modern browsers
    target: 'esnext',
  },
  // CSS optimization
  css: {
    postcss: {
      plugins: [
        // Add CSS optimization plugins
        require('autoprefixer'),
        ...(process.env.NODE_ENV === 'production' ? [
          require('cssnano')({
            preset: ['default', {
              discardComments: { removeAll: true },
              normalizeWhitespace: true,
              mergeLonghand: true,
              mergeRules: true,
            }],
          }),
        ] : []),
      ],
    },
  },
})