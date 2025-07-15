import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/comment-atproto-[hash].js',
        chunkFileNames: 'assets/comment-atproto-[hash].js',
        assetFileNames: 'assets/comment-atproto-[hash].[ext]'
      }
    }
  }
})