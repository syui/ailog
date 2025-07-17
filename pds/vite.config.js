import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/pds/',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
})