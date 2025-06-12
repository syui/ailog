import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [
      react(),
      // Custom plugin to replace variables in public files during build
      {
        name: 'replace-env-vars',
        writeBundle() {
          const host = env.VITE_APP_HOST || 'https://log.syui.ai'
          const clientId = env.VITE_OAUTH_CLIENT_ID || `${host}/client-metadata.json`
          const redirectUri = env.VITE_OAUTH_REDIRECT_URI || `${host}/oauth/callback`
          
          // Replace variables in client-metadata.json
          const clientMetadataPath = path.resolve(__dirname, 'dist/client-metadata.json')
          if (fs.existsSync(clientMetadataPath)) {
            let content = fs.readFileSync(clientMetadataPath, 'utf-8')
            content = content.replace(/https:\/\/log\.syui\.ai/g, host)
            fs.writeFileSync(clientMetadataPath, content)
            console.log(`Updated client-metadata.json with host: ${host}`)
          }
        }
      },
      // Generate standalone index.html for testing
      {
        name: 'generate-standalone-html',
        writeBundle(options, bundle) {
          // Find actual generated filenames
          const jsFile = Object.keys(bundle).find(fileName => fileName.startsWith('assets/comment-atproto') && fileName.endsWith('.js'))
          const cssFile = Object.keys(bundle).find(fileName => fileName.startsWith('assets/comment-atproto') && fileName.endsWith('.css'))
          
          // Generate minimal index.html with just asset references
          const indexHtmlPath = path.resolve(__dirname, 'dist/index.html')
          const indexHtmlContent = `<!-- OAuth Comment System - Load globally for session management -->
<script type="module" crossorigin src="/${jsFile}"></script>
<link rel="stylesheet" crossorigin href="/${cssFile}">`
          fs.writeFileSync(indexHtmlPath, indexHtmlContent)
          console.log('Generated minimal index.html with asset references')
        }
      }
    ],
    build: {
      // Keep console.log in production for debugging
      minify: 'esbuild',
      rollupOptions: {
        output: {
          // Hash-based filenames to bust cache
          entryFileNames: 'assets/comment-atproto-[hash].js',
          chunkFileNames: 'assets/comment-atproto-[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return 'assets/comment-atproto-[hash].css';
            }
            return 'assets/[name]-[hash].[ext]';
          }
        }
      }
    },
    esbuild: {
      drop: [], // Don't drop console.log
    },
    server: {
      port: 5173,
      host: '127.0.0.1',
      allowedHosts: ['localhost', '127.0.0.1', 'log.syui.ai'],
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
  }
})