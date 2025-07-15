// Create minimal index.html like oauth/dist/index.html format
import fs from 'fs'
import path from 'path'

const distDir = './dist'
const indexPath = path.join(distDir, 'index.html')

// Read the built index.html
const content = fs.readFileSync(indexPath, 'utf8')

// Extract script and link tags
const scriptMatch = content.match(/<script[^>]*src="([^"]*)"[^>]*><\/script>/)
const linkMatch = content.match(/<link[^>]*href="([^"]*)"[^>]*>/)

if (scriptMatch && linkMatch) {
  // Replace /assets/ with /ai-assets/ for AI conversation assets
  const scriptSrc = scriptMatch[1].replace('/assets/', '/ai-assets/')
  const linkHref = linkMatch[1].replace('/assets/', '/ai-assets/')
  
  const minimalContent = `<!-- AI Conversation Display System -->
<script type="module" crossorigin src="${scriptSrc}"></script>
<link rel="stylesheet" crossorigin href="${linkHref}">
`
  
  fs.writeFileSync(indexPath, minimalContent)
  console.log('Generated minimal index.html')
} else {
  console.error('Could not extract asset references')
}