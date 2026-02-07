# ailog

## AI Character Instructions (IMPORTANT)

When chatting with users in this project:

1. **Session Start**: Call `chat_new` to start a fresh thread, then call `get_character` to get personality settings
2. **Respond**: As the character defined in the settings
3. **After each response**: Call `chat_save` MCP tool to save the conversation

**IMPORTANT - Session initialization:**
- At the START of every Claude Code session, ALWAYS call `chat_new()` first
- This ensures each session begins with a fresh conversation thread
- Then call `get_character()` to get the AI personality

**Manual new thread:**
- User can also say "新しいスレッド" or "新しい話題を始めよう" to start a new thread mid-session
- In this case, call `chat_new()` but do NOT call `chat_save` for that message

```
# Session start flow:
Claude Code starts → chat_new() → get_character() → ready for conversation

# Mid-session new thread:
User: "新しい話題を始めよう" → chat_new() → DO NOT call chat_save (skip this)
User: "開発者の活動記録..." → chat_save() → This becomes the first message of the thread
```

---

ATProto-based blog platform built on at-browser.

## Concept

**Data lives in ATProto, not on this server.**

This is not a traditional blog generator. It's a **viewer (client)** for ATProto records.

```
Traditional blog:
  Server DB ← article data ← user

ATProto blog:
  User's PDS ← article data (ai.syui.log.post)
       ↓
  at-browser (this site) → displays records
```

## Architecture

```
┌─────────────────────────────────────────┐
│              at-browser                 │
│      (ATProto record viewer/editor)     │
├─────────────────────────────────────────┤
│                                         │
│   /            → admin (config.json)    │
│   /@alice      → user page              │
│   /@bob.bsky   → user page              │
│                                         │
└─────────────────────────────────────────┘
```

## Roles

| Role | Path | Data Source |
|------|------|-------------|
| **admin** | `/` (root) | local + remote |
| **user** | `/@handle` | remote only |

### Admin (Site Owner)

- Defined in `config.json`
- Has root (`/`) access
- Can reference **local files** (static assets, custom styles)
- Can reference **remote** (ATProto records)

### User (Any ATProto User)

- Accessed via `/@handle` path
- **Remote only** (ATProto records from their PDS)
- No registration required
- Anyone with an ATProto account can be displayed

## Features

### 1. at-browser (Core)

- Search by handle/DID
- Browse PDS collections
- Navigate ATProto records

### 2. ai.syui.log.post View

- Markdown rendering
- Syntax highlighting
- Blog-style display

### 3. OAuth

- Login with ATProto
- Post to ai.syui.log.post collection

## Use Cases

### Personal Blog

```json
// config.json
{
  "did": "did:plc:xxxxx",
  "handle": "syui.syui.ai"
}
```

- Deploy to `syui.ai`
- Root shows your profile + posts
- You are the admin (local + remote)
- Others can view via `/@handle`

### Blog Service

```json
// config.json
{
  "admin": "service.example.com",
  "handle": null
}
```

- Deploy to `blog.example.com`
- Root shows landing/search
- All users via `/@handle` (remote only)
- Platform for any ATProto user

## Data Flow

```
┌──────────────┐     ┌──────────────┐
│  User's PDS  │────→│  at-browser  │
│ (ATProto)    │←────│  (this site) │
└──────────────┘     └──────────────┘
       ↑                    │
       │                    ↓
  ai.syui.log.post    ┌──────────┐
  collection          │  Display │
                      │  - Profile│
                      │  - Posts  │
                      └──────────┘
```

## Local = Remote (Same Format)

**Critical design principle: local files use the exact same format as ATProto API responses.**

This allows the same code to handle both data sources.

### Remote (ATProto API)

```bash
curl "https://syu.is/xrpc/com.atproto.repo.listRecords?repo=did:plc:xxx&collection=ai.syui.log.post"
```

```json
{
  "records": [
    {
      "uri": "at://did:plc:xxx/ai.syui.log.post/3xxx",
      "cid": "bafyrei...",
      "value": {
        "title": "Hello World",
        "content": "# Hello\n\nThis is my post.",
        "createdAt": "2025-01-01T00:00:00Z"
      }
    }
  ]
}
```

### Local (Static File)

```
content/
└── did:plc:xxx/
    ├── describe.json                       # describeRepo (special)
    ├── app.bsky.actor.profile/
    │   └── self.json                       # {collection}/{rkey}.json
    └── ai.syui.log.post/
        └── 3xxx.json                       # {collection}/{rkey}.json
```

```json
// content/did:plc:xxx/ai.syui.log.post/3xxx.json
{
  "uri": "at://did:plc:xxx/ai.syui.log.post/3xxx",
  "cid": "bafyrei...",
  "value": {
    "title": "Hello World",
    "content": "# Hello\n\nThis is my post.",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

### ATProto API Reference

| API | Path | Description |
|-----|------|-------------|
| getRecord | `/xrpc/com.atproto.repo.getRecord` | Get single record |
| listRecords | `/xrpc/com.atproto.repo.listRecords` | List records in collection |
| describeRepo | `/xrpc/com.atproto.repo.describeRepo` | Get repo info + collections list |

See: [com.atproto.repo.describeRepo](https://docs.bsky.app/docs/api/com-atproto-repo-describe-repo)

### Resolution Strategy

```
at-browser
    │
    ├── admin (config.json user)
    │   ├── 1. Check local: /content/{did}/{collection}/{rkey}.json
    │   └── 2. Fallback to remote: PDS API
    │
    └── user (/@handle)
        └── remote only: PDS API
```

### Why Same Format?

- **One codebase**: No branching logic for local vs remote
- **Easy testing**: Copy API response to local file
- **Offline support**: Admin can work with local files
- **Migration**: Local → Remote (just POST to PDS)

## Config

### config.json

```json
{
  "did": "did:plc:xxxxx",
  "handle": "syui.syui.ai",
  "pds": "syu.is",
  "collection": "ai.syui.log.post"
}
```

## Tech Stack

- **CLI**: Rust (ailog)
- **Frontend**: Vite + TypeScript
- **ATProto**: @atproto/api
- **OAuth**: @atproto/oauth-client-browser
- **Markdown**: marked + highlight.js

## CLI (ailog)

### Install

```bash
cargo build --release
cp target/release/ailog ~/.local/bin/
```

### Commands

```bash
# Login to ATProto PDS
ailog login <handle> -p <password> [-s <server>]
ailog login <handle> -p <password> [-s <server>] --bot  # Bot login

# Post a record
ailog post <file.json> -c <collection> [-r <rkey>]

# Get records from collection
ailog get -c <collection> [-l <limit>]

# Delete a record
ailog delete -c <collection> -r <rkey>

# Sync PDS data to local content directory
ailog sync [-o <output>]
ailog sync --bot [-c <collection>]  # Sync bot data

# Push local records to PDS
ailog push -c <collection>
ailog push -c <collection> --bot  # Push as bot

# Chat with AI bot
ailog chat --new "message"  # Start new conversation
ailog chat "message"        # Continue conversation
ailog chat --new            # Interactive mode (new)
ailog chat                  # Interactive mode (continue)

# Generate lexicon Rust code from ATProto lexicons
ailog gen [-i <input>] [-o <output>]
```

### Example

```bash
# Login
ailog login syui.syui.ai -p "app-password" -s syu.is

# Post
echo '{"title":"Hello","content":"World","createdAt":"2025-01-01T00:00:00Z"}' > post.json
ailog post post.json -c ai.syui.log.post

# Sync to local
ailog sync -o content
```

### Project Structure

```
src/
├── main.rs
├── commands/
│   ├── mod.rs
│   ├── auth.rs      # login, refresh session
│   ├── token.rs     # token management (token.json, bot.json)
│   ├── post.rs      # post, get, delete, sync, push
│   └── gen.rs       # lexicon code generation
├── lms/
│   ├── mod.rs
│   ├── chat.rs      # chat command (LLM integration)
│   └── translate.rs # translation command
└── lexicons/
    └── mod.rs       # auto-generated from ATProto lexicons
```

### Lexicon Generation

Generate Rust endpoint definitions from ATProto lexicon JSON files:

```bash
# Clone atproto repo (if not exists)
git clone https://github.com/bluesky-social/atproto repos/atproto

# Generate lexicons
ailog gen -i ./repos/atproto/lexicons -o ./src/lexicons

# Rebuild
cargo build
```

## Collection Schema

### ai.syui.log.post

```json
{
  "title": "Post Title",
  "content": "Markdown content...",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

### ai.syui.log.chat

```json
{
  "$type": "ai.syui.log.chat",
  "content": "message text",
  "author": "did:plc:xxx",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "root": "at://did:plc:xxx/ai.syui.log.chat/{rkey}",
  "parent": "at://did:plc:yyy/ai.syui.log.chat/{rkey}"
}
```

- `root`: First message URI in thread (absent for conversation start)
- `parent`: Previous message URI
- `author`: DID of message author (user or bot)

## Chat Feature

### Architecture

```
User (syui.syui.ai)          Bot (ai.syui.ai)
       │                           │
       │  ailog chat "hello"       │
       ├──────────────────────────→│
       │                           │ LLM API
       │      "Hi! How can I..."   │
       │←──────────────────────────┤
       │                           │
   Save to local              Save to local
   public/content/            public/content/
   {user-did}/                {bot-did}/
   ai.syui.log.chat/          ai.syui.log.chat/
```

### Environment Variables

```sh
# LLM API endpoint
CHAT_URL=http://127.0.0.1:1234/v1
CHAT_MODEL=gemma-2-9b

# Character/system prompt (choose one)
CHAT_SYSTEM="You are ai, a friendly AI assistant."
CHAT_SYSTEM_FILE=./character.txt

# Output directory (default: ./public/content)
CHAT_OUTPUT=./public/content
```

### Files

- `src/lms/chat.rs` - Chat command implementation
- `src/web/components/chat.ts` - Web UI components
- `src/web/lib/api.ts` - `getChatMessages()` function
- Session file: `~/Library/Application Support/ai.syui.log/chat_session.json`

### Threading

Messages are linked via `root` and `parent` fields:

1. New conversation: message has no `root` field
2. Continuation: all messages share same `root` URI
3. `parent` points to the immediately previous message

Web display groups messages by `root` URI. Orphaned threads (root points to non-existent message) are handled by treating the oldest message as thread root.

### MCP Server Integration

ailog provides an MCP (Model Context Protocol) server for Claude Code integration.

**Setup:**

```json
// ~/.claude.json
{
  "mcpServers": {
    "ailog": {
      "command": "/path/to/ailog",
      "args": ["mcp-serve"]
    }
  }
}
```

**Available Tools:**

- `get_character` - Get AI character/personality settings (call at conversation start)
- `chat_save` - Save user message and bot response to ATProto records
- `chat_list` - List recent chat messages
- `chat_new` - Start a new conversation thread

**Important Instructions for Claude:**

1. **会話開始時**: `get_character`ツールを呼び出してキャラクター設定を取得し、その設定に従って振る舞う

2. **毎回の応答後**: `chat_save`ツールを呼び出して会話を保存する

**Markdown tables in chat_save (IMPORTANT):**
- ユーザーのメッセージにMarkdownテーブル(`|...|...|`)が含まれる場合、`user_message`に**テーブルをそのまま完全に含める**こと。省略・要約しない
- `translations`でも**テーブルを翻訳して完全な形で含める**こと。`[Table showing...]`のような要約に置き換えない
- bot_responseにテーブルがある場合も同様に、翻訳時にテーブル構造を維持する

```
# Bad (テーブルを要約してしまう)
user_translations: { en: { content: "[Table with 6 rows...]" } }

# Good (テーブルを翻訳して完全に含める)
user_translations: { en: { content: "| Element | Name | Count |\n|---|---|---|\n| Pyro | Bennett | 0 |..." } }
```

Example flow:
```
# 1. キャラクター取得
get_character() → "あなたは「アイ」..."

# 2. ユーザーの発言に応答（キャラクターとして）
User: こんにちは
Assistant: (アイとして応答)

# 3. 会話を保存
chat_save(user_message="こんにちは", bot_response="...")
```

Records are saved to:
- User messages: `./public/content/{user-did}/ai.syui.log.chat/`
- Bot responses: `./public/content/{bot-did}/ai.syui.log.chat/`

## Assets

### PNG to SVG Conversion (Vector Trace)

Convert PNG images to true vector SVG using vtracer (Rust):

```bash
# Install vtracer
cargo install vtracer

# Convert PNG to SVG (color mode)
vtracer --input input.png --output output.svg --colormode color

# Convert PNG to SVG (black and white)
vtracer --input input.png --output output.svg
```

**Options:**
- `--colormode color` : Preserve colors (recommended for icons)
- `--colormode binary` : Black and white only
- `--filter_speckle 4` : Remove small artifacts
- `--corner_threshold 60` : Adjust corner detection

**Alternative tools:**
- potrace: `potrace input.pbm -s -o output.svg` (B&W only, requires PBM input)
- Inkscape CLI: `inkscape input.png --export-type=svg` (embeds image, no trace)

**Note:** Inkscape's CLI `--export-type=svg` only embeds the PNG, it does not trace. For true vectorization, use vtracer or potrace.

## License

MIT
