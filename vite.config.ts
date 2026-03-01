import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/web',
  publicDir: '../../public',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/web/index.html'),
        'oauth-cli': resolve(__dirname, 'src/web/oauth/cli/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/web'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
