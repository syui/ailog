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
  const minimalContent = `<!-- OAuth Comment System - Load globally for session management -->
<script type="module" crossorigin src="${scriptMatch[1]}"></script>
<link rel="stylesheet" crossorigin href="${linkMatch[1]}">
`
  
  fs.writeFileSync(indexPath, minimalContent)
  console.log('Generated minimal index.html')
} else {
  console.error('Could not extract asset references')
}