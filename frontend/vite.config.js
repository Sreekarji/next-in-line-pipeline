import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite configuration for the hiring pipeline frontend
export default defineConfig({
  plugins: [react()],
  server: {
    // Map API calls to the local express backend
    proxy: {
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true
      }
    }
  }
})
