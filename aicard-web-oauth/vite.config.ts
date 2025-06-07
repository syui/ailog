import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep console.log in production for debugging
    minify: 'esbuild',
  },
  esbuild: {
    drop: [], // Don't drop console.log
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    allowedHosts: ['localhost', '127.0.0.1', 'xxxcard.syui.ai'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      }
    },
    // Handle OAuth callback routing
    historyApiFallback: {
      rewrites: [
        { from: /^\/oauth\/callback/, to: '/index.html' }
      ]
    }
  }
})