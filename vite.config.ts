import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep React and all React-dependent UI libs together to avoid load order issues
          if (id.includes('node_modules/react/') || 
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router') ||
              id.includes('@radix-ui') ||
              id.includes('node_modules/scheduler')) {
            return 'vendor-react-ui'
          }
          // Firebase - large and separate
          if (id.includes('firebase') || id.includes('@firebase')) {
            return 'vendor-firebase'
          }
          // HLS.js - large media library
          if (id.includes('hls.js')) {
            return 'vendor-hls'
          }
          // Lucide icons
          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }
          // TanStack Query
          if (id.includes('@tanstack')) {
            return 'vendor-query'
          }
          // Supabase
          if (id.includes('@supabase')) {
            return 'vendor-supabase'
          }
          // Other utilities
          if (id.includes('sonner') || 
              id.includes('clsx') || 
              id.includes('tailwind-merge') ||
              id.includes('class-variance-authority') ||
              id.includes('recharts') ||
              id.includes('d3-')) {
            return 'vendor-utils'
          }
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
})


