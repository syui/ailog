# ai.log

A Rust-based static blog generator with AI integration capabilities.

## Overview

ai.log is part of the ai ecosystem - a static site generator that creates blogs with built-in AI features for content enhancement and atproto integration. The system follows the yui system principles with dual-layer MCP architecture.

## Architecture

### Dual MCP Integration

**ai.log MCP Server (API Layer)**
- **Role**: Independent blog API
- **Port**: 8002
- **Location**: `./src/mcp/`
- **Function**: Core blog generation and management

**ai.gpt Integration (Server Layer)**
- **Role**: AI integration gateway
- **Port**: 8001 (within ai.gpt)
- **Location**: `../src/aigpt/mcp_server.py`
- **Function**: AI memory system + HTTP proxy to ai.log

### Data Flow
```
Claude Code → ai.gpt (Server/AI) → ai.log (API/Blog) → Static Site
              ↑                      ↑
              Memory System          File Operations
              Relationship AI        Markdown Processing
              Context Analysis       Template Rendering
```

## Features

- **Static Blog Generation**: Inspired by Zola, built with Rust
- **AI-Powered Content**: Memory-driven article generation via ai.gpt
- **🌍 Ollama Translation**: Multi-language markdown translation with structure preservation
- **atproto Integration**: OAuth authentication and comment system (planned)
- **MCP Integration**: Seamless Claude Code workflow

## Installation

```bash
cargo install ailog
```

## Usage

### Standalone Mode

```bash
# Initialize a new blog
ailog init myblog

# Create a new post
ailog new "My First Post"

# Build the blog
ailog build

# Serve locally
ailog serve

# Start MCP server
ailog mcp --port 8002

# Generate documentation
ailog doc readme --with-ai
ailog doc api --output ./docs
ailog doc structure --include-deps

# Translate documents (requires Ollama)
ailog doc translate --input README.md --target-lang en
ailog doc translate --input docs/api.md --target-lang ja --model qwen2.5:latest

# Clean build files
ailog clean
```

### AI Ecosystem Integration

When integrated with ai.gpt, use natural language:
- "ブログ記事を書いて" → Triggers `log_ai_content`
- "記事一覧を見せて" → Triggers `log_list_posts`
- "ブログをビルドして" → Triggers `log_build_blog`

### Documentation & Translation

Generate comprehensive documentation and translate content:
- "READMEを生成して" → Triggers `log_generate_docs`
- "APIドキュメントを作成して" → Generates API documentation
- "プロジェクト構造を解析して" → Creates structure documentation
- "このファイルを英語に翻訳して" → Triggers `log_translate_document`
- "マークダウンを日本語に変換して" → Uses Ollama for translation

## MCP Tools

### ai.log Server (Port 8002)
- `create_blog_post` - Create new blog post
- `list_blog_posts` - List existing posts
- `build_blog` - Build static site
- `get_post_content` - Get post by slug
- `translate_document` ⭐ - Ollama-powered markdown translation
- `generate_documentation` ⭐ - Code analysis and documentation generation

### ai.gpt Integration (Port 8001)
- `log_create_post` - Proxy to ai.log + error handling
- `log_list_posts` - Proxy to ai.log + formatting
- `log_build_blog` - Proxy to ai.log + AI features
- `log_get_post` - Proxy to ai.log + context
- `log_system_status` - Health check for ai.log
- `log_ai_content` ⭐ - AI memory → blog content generation
- `log_translate_document` 🌍 - Document translation via Ollama
- `log_generate_docs` 📚 - Documentation generation

### Documentation Generation Tools
- `doc readme` - Generate README.md from project analysis
- `doc api` - Generate API documentation
- `doc structure` - Analyze and document project structure
- `doc changelog` - Generate changelog from git history
- `doc translate` 🌍 - Multi-language document translation

### Translation Features
- **Language Support**: English, Japanese, Chinese, Korean, Spanish
- **Markdown Preservation**: Code blocks, links, images, tables maintained
- **Auto-Detection**: Automatically detects Japanese content
- **Ollama Integration**: Uses local AI models for privacy and cost-efficiency
- **Smart Processing**: Section-by-section translation with structure awareness

## Configuration

### ai.log Configuration
- Location: `~/.config/syui/ai/log/`
- Format: TOML configuration

### ai.gpt Integration
- Configuration: `../config.json`
- Auto-detection: ai.log tools enabled when `./log/` directory exists
- System prompt: Automatically triggers blog tools for related queries

## AI Integration Features

### Memory-Driven Content Generation
- **Source**: ai.gpt memory system
- **Process**: Contextual memories → AI analysis → Blog content
- **Output**: Structured markdown with personal insights

### Automatic Workflows
- Daily blog posts from accumulated memories
- Content enhancement and suggestions
- Related article recommendations
- Multi-language content generation

## atproto Integration (Planned)

### OAuth 2.0 Authentication
- Client metadata: `public/client-metadata.json`
- Comment system integration
- Data sovereignty: Users own their comments
- Collection storage in atproto

### Comment System
- atproto account login
- Distributed comment storage
- Real-time comment synchronization

## Build & Deploy

### GitHub Actions
```yaml
# .github/workflows/gh-pages.yml
- name: Build ai.log
  run: |
    cd log
    cargo build --release
    ./target/release/ailog build
```

### Cloudflare Pages
- Static output: `./public/`
- Automatic deployment on main branch push
- AI content generation during build process

## Development Status

### ✅ Completed Features
- Project structure and Cargo.toml setup
- CLI interface (init, new, build, serve, clean, mcp, doc)
- Configuration system with TOML support
- Markdown parsing with frontmatter support
- Template system with Handlebars
- Static site generation with posts and pages
- Development server with hot reload
- **MCP server integration (both layers)**
- **ai.gpt integration with 6 tools**
- **AI memory system connection**
- **📚 Documentation generation from code**
- **🔍 Rust project analysis and API extraction**
- **📝 README, API docs, and structure analysis**
- **🌍 Ollama-powered translation system**
- **🚀 Complete MCP integration with ai.gpt**
- **📄 Markdown-aware translation preserving structure**
- Test blog with sample content and styling

### 🚧 In Progress
- AI-powered content enhancement pipeline
- atproto OAuth implementation

### 📋 Planned Features
- Advanced template customization
- Plugin system for extensibility
- Real-time comment system
- Multi-blog management
- VTuber integration (ai.verse connection)

## Integration with ai Ecosystem

### System Dependencies
- **ai.gpt**: Memory system, relationship tracking, AI provider
- **ai.card**: Future cross-system content sharing
- **ai.bot**: atproto posting and mention handling
- **ai.verse**: 3D world blog representation (future)

### yui System Compliance
- **Uniqueness**: Each blog post tied to individual identity
- **Reality Reflection**: Personal memories → digital content
- **Irreversibility**: Published content maintains historical integrity

## Getting Started

### 1. Standalone Usage
```bash
git clone [repository]
cd log
cargo run -- init my-blog
cargo run -- new "First Post"
cargo run -- build
cargo run -- serve
```

### 2. AI Ecosystem Integration
```bash
# Start ai.log MCP server
cargo run -- mcp --port 8002

# In another terminal, start ai.gpt
cd ../
# ai.gpt startup commands

# Use Claude Code with natural language blog commands
```

## Documentation Generation Features

### 📚 Automatic README Generation
```bash
# Generate README from project analysis
ailog doc readme --source ./src --with-ai

# Output: Enhanced README.md with:
# - Project overview and metrics
# - Dependency analysis
# - Module structure
# - AI-generated insights
```

### 📖 API Documentation
```bash
# Generate comprehensive API docs
ailog doc api --source ./src --format markdown --output ./docs

# Creates:
# - docs/api.md (main API overview)
# - docs/module_name.md (per-module documentation)
# - Function signatures and documentation
# - Struct/enum definitions
```

### 🏗️ Project Structure Analysis
```bash
# Analyze and document project structure
ailog doc structure --source . --include-deps

# Generates:
# - Directory tree visualization
# - File distribution by language
# - Dependency graph analysis
# - Code metrics and statistics
```

### 📝 Git Changelog Generation
```bash
# Generate changelog from git history
ailog doc changelog --from v1.0.0 --explain-changes

# Creates:
# - Structured changelog
# - Commit categorization
# - AI-enhanced change explanations
```

### 🤖 AI-Enhanced Documentation
When `--with-ai` is enabled:
- **Content Enhancement**: AI improves readability and adds insights
- **Context Awareness**: Leverages ai.gpt memory system
- **Smart Categorization**: Automatic organization of content
- **Technical Writing**: Professional documentation style

## 🌍 Translation System

### Ollama-Powered Translation

ai.log includes a comprehensive translation system powered by Ollama AI models:

```bash
# Basic translation
ailog doc translate --input README.md --target-lang en

# Advanced translation with custom settings
ailog doc translate \
  --input docs/technical-guide.ja.md \
  --target-lang en \
  --source-lang ja \
  --output docs/technical-guide.en.md \
  --model qwen2.5:latest \
  --ollama-endpoint http://localhost:11434
```

### Translation Features

#### 📄 Markdown-Aware Processing
- **Code Block Preservation**: All code snippets remain untranslated
- **Link Maintenance**: URLs and link structures preserved
- **Image Handling**: Alt text can be translated while preserving image paths
- **Table Translation**: Table content translated while maintaining structure
- **Header Preservation**: Markdown headers translated with level maintenance

#### 🎯 Smart Language Detection
- **Auto-Detection**: Automatically detects Japanese content using Unicode ranges
- **Manual Override**: Specify source language for precise control
- **Mixed Content**: Handles documents with multiple languages

#### 🔧 Flexible Configuration
- **Model Selection**: Choose from available Ollama models
- **Custom Endpoints**: Use different Ollama instances
- **Output Control**: Auto-generate or specify output paths
- **Batch Processing**: Process multiple files efficiently

### Supported Languages

| Language | Code | Direction | Model Optimized |
|----------|------|-----------|-----------------|
| English  | `en` | ↔️        | ✅ qwen2.5      |
| Japanese | `ja` | ↔️        | ✅ qwen2.5      |
| Chinese  | `zh` | ↔️        | ✅ qwen2.5      |
| Korean   | `ko` | ↔️        | ⚠️ Basic       |
| Spanish  | `es` | ↔️        | ⚠️ Basic       |

### Translation Workflow

1. **Parse Document**: Analyze markdown structure and identify sections
2. **Preserve Code**: Isolate code blocks and technical content
3. **Translate Content**: Process text sections with Ollama AI
4. **Reconstruct**: Rebuild document maintaining original formatting
5. **Validate**: Ensure structural integrity and completeness

### Integration with ai.gpt

```python
# Via ai.gpt MCP tools
await log_translate_document(
    input_file="README.ja.md",
    target_lang="en",
    model="qwen2.5:latest"
)
```

### Requirements

- **Ollama**: Install and run Ollama locally
- **Models**: Download supported models (qwen2.5:latest recommended)
- **Memory**: Sufficient RAM for model inference
- **Network**: For initial model download only

## Configuration Examples

### Basic Blog Config
```toml
[blog]
title = "My AI Blog"
description = "Personal thoughts and AI insights"
base_url = "https://myblog.example.com"

[ai]
provider = "openai"
model = "gpt-4"
translation = true
```

### Advanced Integration
```json
// ../config.json (ai.gpt)
{
  "mcp": {
    "servers": {
      "ai_gpt": {
        "endpoints": {
          "log_ai_content": "/log_ai_content",
          "log_create_post": "/log_create_post"
        }
      }
    }
  }
}
```

## Troubleshooting

### MCP Connection Issues
- Ensure ai.log server is running: `cargo run -- mcp --port 8002`
- Check ai.gpt config includes log endpoints
- Verify `./log/` directory exists relative to ai.gpt

### Build Failures
- Check Rust version: `rustc --version`
- Update dependencies: `cargo update`
- Clear cache: `cargo clean`

### AI Integration Problems
- Verify ai.gpt memory system is initialized
- Check AI provider configuration
- Ensure sufficient context in memory system

## License

© syui

---

**Part of the ai ecosystem**: ai.gpt, ai.card, ai.log, ai.bot, ai.verse, ai.shell
