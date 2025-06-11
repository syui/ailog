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
        writeBundle() {
          // Generate standalone index.html for testing
          const indexHtmlPath = path.resolve(__dirname, 'dist/index.html')
          const indexHtmlContent = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ai.card OAuth Test</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background-color: #0a0a0a;
        color: #ffffff;
      }
    </style>
    <script type="module" crossorigin src="/assets/comment-atproto.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/comment-atproto.css">
  </head>
  <body>
    <div id="comment-atproto"></div>
  </body>
</html>`
          fs.writeFileSync(indexHtmlPath, indexHtmlContent)
          console.log('Generated standalone index.html for testing')
        }
      }
    ],
    build: {
      // Keep console.log in production for debugging
      minify: 'esbuild',
      rollupOptions: {
        output: {
          // Fixed filenames for ailog integration
          entryFileNames: 'assets/comment-atproto.js',
          chunkFileNames: 'assets/comment-atproto-[name].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return 'assets/comment-atproto.css';
            }
            return 'assets/[name].[ext]';
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