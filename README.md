# ai.log

AI-powered static blog generator with ATProto integration, part of the ai.ai ecosystem.

## 🚀 Quick Start

### Installation & Setup

```bash
# 1. Clone repository
git clone https://git.syui.ai/ai/log
cd log

# 2. Build ailog
cargo build --release

# 3. Initialize blog
./target/release/ailog init my-blog

# 4. Create your first post
./target/release/ailog new "My First Post"

# 5. Build static site
./target/release/ailog build

# 6. Serve locally
./target/release/ailog serve
```

### Install via Cargo

```bash
cargo install --path .
# Now you can use `ailog` command globally
```

## 📖 Core Commands

### Blog Management

```bash
# Project setup
ailog init <project-name>           # Initialize new blog project
ailog new <title>                   # Create new blog post
ailog build                         # Generate static site with JSON index
ailog serve                         # Start development server
ailog clean                         # Clean build artifacts

# ATProto authentication  
ailog auth init                     # Setup ATProto credentials
ailog auth status                   # Check authentication status
ailog auth logout                   # Clear credentials

# OAuth app build
ailog oauth build <project-dir>     # Build OAuth comment system
```

### Stream & AI Features

```bash
# Start monitoring & AI generation
ailog stream start --ai-generate    # Monitor blog + auto-generate AI content
ailog stream start --daemon         # Run as background daemon
ailog stream status                 # Check stream status
ailog stream stop                   # Stop monitoring
ailog stream test                   # Test ATProto API access
```

### Documentation & Translation

```bash
# Generate documentation
ailog doc readme --with-ai          # Generate enhanced README
ailog doc api --output ./docs       # Generate API documentation
ailog doc structure --include-deps  # Analyze project structure

# AI-powered translation
ailog doc translate --input README.md --target-lang en
ailog doc translate --input docs/guide.ja.md --target-lang en --model qwen2.5:latest
```

## 🏗️ Architecture

### Project Structure

```
ai.log/
├── src/                    # Rust static blog generator
│   ├── commands/          # CLI command implementations
│   ├── generator.rs       # Core blog generation + JSON index
│   ├── mcp/              # MCP server integration
│   └── main.rs           # CLI entry point
├── my-blog/              # Your blog content
│   ├── content/posts/    # Markdown blog posts
│   ├── templates/        # Tera templates
│   ├── static/          # Static assets
│   └── public/          # Generated site output
├── oauth/               # ATProto comment system
│   ├── src/            # TypeScript OAuth app
│   ├── dist/           # Built OAuth assets
│   └── package.json    # Node.js dependencies
└── target/             # Rust build output
```

### Data Flow

```
Blog Posts (Markdown) → ailog build → public/
                                   ├── Static HTML pages
                                   └── index.json (API)
                                         ↓
ailog stream start --ai-generate → Monitor index.json
                                         ↓
New posts detected → Ollama AI → ATProto records
                               ├── ai.syui.log.chat.lang (translations)
                               └── ai.syui.log.chat.comment (AI comments)
                                         ↓
OAuth app → Display AI-generated content
```

## 🤖 AI Integration

### AI Content Generation

The `--ai-generate` flag enables automatic AI content generation:

1. **Blog Monitoring**: Monitors `index.json` every 5 minutes
2. **Duplicate Prevention**: Checks existing ATProto collections
3. **AI Generation**: Uses Ollama (gemma3:4b) for translations & comments
4. **ATProto Storage**: Saves to derived collections (`base.chat.lang`, `base.chat.comment`)

```bash
# Start AI generation monitor
ailog stream start --ai-generate

# Output:
# 🤖 Starting AI content generation monitor...
# 📡 Blog host: https://syui.ai
# 🧠 Ollama host: https://ollama.syui.ai
# 🔍 Checking for new blog posts...
# ✅ Generated translation for: 静的サイトジェネレータを作った
# ✅ Generated comment for: 静的サイトジェネレータを作った
```

### Collection Management

ailog uses a **simplified collection structure** based on a single base collection name:

```bash
# Single environment variable controls all collections (unified naming)
export VITE_OAUTH_COLLECTION="ai.syui.log"

# Automatically derives:
# - ai.syui.log (comments)
# - ai.syui.log.user (user management)  
# - ai.syui.log.chat.lang (AI translations)
# - ai.syui.log.chat.comment (AI comments)
```

**Benefits:**
- ✅ **Simple**: One variable instead of 5+
- ✅ **Consistent**: All collections follow the same pattern
- ✅ **Manageable**: Easy systemd/production configuration

### Ask AI Feature

Interactive AI chat integrated into blog pages:

```bash
# 1. Setup Ollama
brew install ollama
ollama pull gemma2:2b

# 2. Start with CORS support
OLLAMA_ORIGINS="https://example.com" ollama serve

# 3. Configure AI DID in templates/base.html
const aiConfig = {
    systemPrompt: 'You are a helpful AI assistant.',
    aiDid: 'did:plc:your-ai-bot-did'
};
```

## 🌐 ATProto Integration

### OAuth Comment System

The OAuth app provides ATProto-authenticated commenting:

```bash
# 1. Build OAuth app
cd oauth
npm install
npm run build

# 2. Configure for production
ailog oauth build my-blog  # Auto-generates .env.production

# 3. Deploy OAuth assets
# Assets are automatically copied to public/ during ailog build
```

### Authentication Setup

```bash
# Initialize ATProto authentication
ailog auth init

# Input required:
# - Handle (e.g., your.handle.bsky.social)
# - Access JWT
# - Refresh JWT

# Check status
ailog auth status
```

### Collection Structure

All ATProto collections are **automatically derived** from a single base name:

```
Base Collection: "ai.syui.log"
├── ai.syui.log (user comments)
├── ai.syui.log.user (registered commenters)
└── ai.syui.log.chat/
    ├── ai.syui.log.chat.lang (AI translations)
    └── ai.syui.log.chat.comment (AI comments)
```

**Configuration Priority:**
1. Environment variable: `VITE_OAUTH_COLLECTION` (unified)
2. config.toml: `[oauth] collection = "..."`
3. Auto-generated from domain (e.g., `log.syui.ai` → `ai.syui.log`)
4. Default: `ai.syui.log`

### Stream Monitoring

```bash
# Monitor ATProto streams for comments
ailog stream start

# Enable AI generation alongside monitoring
ailog stream start --ai-generate --daemon
```

## 📱 OAuth App Features

The OAuth TypeScript app provides:

### Comment System
- **Real-time Comments**: ATProto-authenticated commenting
- **User Management**: Automatic user registration
- **Mobile Responsive**: Optimized for all devices
- **JSON View**: Technical record inspection

### AI Content Display
- **Lang: EN Tab**: AI-generated English translations
- **AI Comment Tab**: AI-generated blog insights
- **Admin Records**: Fetches from admin DID collections
- **Real-time Updates**: Live content refresh

### Setup & Configuration

```bash
cd oauth

# Development
npm run dev

# Production build
npm run build

# Preview production
npm run preview
```

**Environment Variables:**
```bash
# Production (.env.production - auto-generated by ailog oauth build)
VITE_APP_HOST=https://syui.ai
VITE_OAUTH_CLIENT_ID=https://syui.ai/client-metadata.json
VITE_OAUTH_REDIRECT_URI=https://syui.ai/oauth/callback
VITE_ADMIN_DID=did:plc:uqzpqmrjnptsxezjx4xuh2mn

# Simplified collection configuration (single base collection)
VITE_OAUTH_COLLECTION=ai.syui.log

# AI Configuration
VITE_AI_ENABLED=true
VITE_AI_ASK_AI=true
VITE_AI_PROVIDER=ollama
# ... (other AI settings)
```

## 🔧 Advanced Features

### JSON Index Generation

Every `ailog build` generates `/public/index.json`:

```json
[
  {
    "title": "静的サイトジェネレータを作った",
    "href": "https://syui.ai/posts/2025-06-06-ailog.html",
    "formated_time": "Thu Jun 12, 2025",
    "utc_time": "2025-06-12T00:00:00Z",
    "tags": ["blog", "rust", "mcp", "atp"],
    "contents": "Plain text content...",
    "description": "Excerpt...",
    "categories": []
  }
]
```

This enables:
- **API Access**: Programmatic blog content access
- **Stream Monitoring**: AI generation triggers
- **Search Integration**: Full-text search capabilities

### Translation System

AI-powered document translation with Ollama:

```bash
# Basic translation
ailog doc translate --input README.md --target-lang en

# Advanced options
ailog doc translate \
  --input docs/guide.ja.md \
  --target-lang en \
  --source-lang ja \
  --model qwen2.5:latest \
  --output docs/guide.en.md
```

**Features:**
- **Markdown-aware**: Preserves code blocks, links, tables
- **Multiple models**: qwen2.5, gemma3, etc.
- **Auto-detection**: Detects Japanese content automatically
- **Structure preservation**: Maintains document formatting

### MCP Server Integration

```bash
# Start MCP server for ai.gpt integration
ailog mcp --port 8002

# Available tools:
# - create_blog_post
# - list_blog_posts  
# - build_blog
# - get_post_content
# - translate_document
# - generate_documentation
```

## 🚀 Deployment

### GitHub Actions

```yaml
name: Deploy ai.log Blog
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Rust
      uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
        
    - name: Build ailog
      run: cargo build --release
      
    - name: Build blog
      run: |
        cd my-blog
        ../target/release/ailog build
        
    - name: Deploy to Cloudflare Pages
      uses: cloudflare/pages-action@v1
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        projectName: my-blog
        directory: my-blog/public
```

### Production Setup

```bash
# 1. Build for production
cargo build --release

# 2. Setup systemd services
sudo cp systemd/system/ailog-stream.service /etc/systemd/system/
sudo systemctl enable ailog-stream.service
sudo systemctl start ailog-stream.service

# 3. Configure Ollama with CORS
sudo vim /usr/lib/systemd/system/ollama.service
# Add: Environment="OLLAMA_ORIGINS=https://yourdomain.com"

# 4. Monitor services
journalctl -u ailog-stream.service -f
```

## 🌍 Translation Support

### Supported Languages

| Language | Code | Status | Model |
|----------|------|--------|-------|
| English  | `en` | ✅ Full | qwen2.5 |
| Japanese | `ja` | ✅ Full | qwen2.5 |
| Chinese  | `zh` | ✅ Full | qwen2.5 |
| Korean   | `ko` | ⚠️ Basic | qwen2.5 |
| Spanish  | `es` | ⚠️ Basic | qwen2.5 |

### Translation Workflow

1. **Parse**: Analyze markdown structure
2. **Preserve**: Isolate code blocks and technical content  
3. **Translate**: Process with Ollama AI
4. **Reconstruct**: Rebuild with original formatting
5. **Validate**: Ensure structural integrity

## 🎯 Use Cases

### Personal Blog
- **AI-Enhanced**: Automatic translations and AI insights
- **Distributed Comments**: ATProto-based social interaction
- **Mobile-First**: Responsive OAuth comment system

### Technical Documentation
- **Code Analysis**: Automatic API documentation
- **Multi-language**: AI-powered translation
- **Structure Analysis**: Project overview generation

### AI Ecosystem Integration
- **ai.gpt Connection**: Memory-driven content generation
- **MCP Integration**: Claude Code workflow support
- **Distributed Identity**: ATProto authentication

## 🔍 Troubleshooting

### Build Issues
```bash
# Check Rust version
rustc --version

# Update dependencies
cargo update

# Clean build
cargo clean && cargo build --release
```

### Authentication Problems
```bash
# Reset authentication
ailog auth logout
ailog auth init

# Test API access
ailog stream test
```

### AI Generation Issues
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Test with manual request
curl -X POST http://localhost:11434/api/generate \
  -d '{"model":"gemma3:4b","prompt":"Test","stream":false}'

# Check CORS settings
# Ensure OLLAMA_ORIGINS includes your domain
```

### OAuth App Issues
```bash
# Rebuild OAuth assets
cd oauth
rm -rf dist/
npm run build

# Check environment variables
cat .env.production

# Verify client-metadata.json
curl https://yourdomain.com/client-metadata.json
```

## 📚 Documentation

### Core Concepts
- **Static Generation**: Rust-powered site building
- **JSON Index**: API-compatible blog data
- **ATProto Integration**: Distributed social features
- **AI Enhancement**: Automatic content generation

### File Structure
- `config.toml`: Blog configuration (simplified collection setup)
- `content/posts/*.md`: Blog post sources
- `templates/*.html`: Tera template files
- `public/`: Generated static site + API (index.json)
- `oauth/dist/`: Built OAuth assets

### Example config.toml
```toml
[site]
title = "My Blog"
base_url = "https://myblog.com"

[oauth]
admin = "did:plc:your-admin-did"
collection = "ai.myblog.log"  # Single base collection

[ai]
enabled = true
auto_translate = true
comment_moderation = true
model = "gemma3:4b"
host = "https://ollama.syui.ai"
```

## 🔗 ai.ai Ecosystem

ai.log is part of the broader ai.ai ecosystem:

- **ai.gpt**: Memory system and AI integration
- **ai.card**: ATProto-based card game system  
- **ai.bot**: Social media automation
- **ai.verse**: 3D virtual world integration
- **ai.shell**: AI-powered shell interface

### yui System Compliance
- **Uniqueness**: Each blog tied to individual identity
- **Reality Reflection**: Personal memories → digital content
- **Irreversibility**: Published content maintains integrity

## 📝 License

© syui

---

**Part of the ai ecosystem**: ai.gpt, ai.card, ai.log, ai.bot, ai.verse, ai.shell