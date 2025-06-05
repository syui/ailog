# ai.log

A Rust-based static blog generator with AI integration capabilities.

## Overview

ai.log is part of the ai ecosystem - a static site generator that creates blogs with built-in AI features for content enhancement and atproto integration.

## Features

- Static blog generation (inspired by Zola)
- AI-powered article editing and enhancement
- Automatic translation (ja → en)
- AI comment system integrated with atproto
- OAuth authentication via atproto accounts

## Installation

```bash
cargo install ailog
```

## Usage

```bash
# Initialize a new blog
ailog init myblog

# Create a new post
ailog new "My First Post"

# Build the blog
ailog build

# Serve locally
ailog serve

# Clean build files
ailog clean
```

## Configuration

Configuration files are stored in `~/.config/syui/ai/log/`

## AI Integration (Planned)

- Automatic content suggestions and corrections
- Multi-language support with AI translation
- AI-generated comments linked to atproto accounts

## atproto Integration (Planned)

Implements OAuth 2.0 for user authentication:
- Users can comment using their atproto accounts
- Comments are stored in atproto collections
- Full data sovereignty for users

## Build & Deploy

Designed for GitHub Actions and Cloudflare Pages deployment. Push to main branch triggers automatic build and deploy.

## Development Status

Currently implemented:
- ✅ Project structure and Cargo.toml setup
- ✅ Basic command-line interface (init, new, build, serve, clean)
- ✅ Configuration system with TOML support
- ✅ Markdown parsing with frontmatter support
- ✅ Template system with Handlebars
- ✅ Static site generation with posts and pages
- ✅ Development server with hot reload
- ✅ AI integration foundation (GPT client, translator, comment system)
- ✅ atproto client with OAuth support
- ✅ MCP server integration for AI tools
- ✅ Test blog with sample content and styling

Planned features:
- AI-powered content enhancement and suggestions
- Automatic translation (ja → en) pipeline
- atproto comment system with OAuth authentication
- Advanced template customization
- Plugin system for extensibility

## License

© syui
