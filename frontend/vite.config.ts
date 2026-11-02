import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api/auth': {
        target: process.env.VITE_AUTH_TARGET || 'http://auth-service:3334',
        changeOrigin: true,
      },
      '/api/create': {
        target: process.env.VITE_AUTH_TARGET || 'http://auth-service:3334',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_BACKEND_TARGET || 'http://backend:3333',
        changeOrigin: true,
      },
    },
  },
})