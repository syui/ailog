# ailog

atproto blog cli

https://git.syui.ai/ai/log

```sh
$ git clone https://git.syui.ai/ai/log
$ cd log
$ cat public/config.json
$ npm run dev
```

## lexicon

> ai.syui.log.post, ai.syui.log.chat

```json
{
  "site": "https://syui.ai",
  "title": "post-title",
  "publishedAt": "2026-02-19T...",
  "content": { "$type": "ai.syui.log.post#markdown", "text": "..." },
  "description": "概要"
}
```

optional:

```diff
+ root          (string, at-uri)
+ parent        (string, at-uri)
+ langs         (array of language)
+ translations  (ref #translationMap)
```

`site.standard.document` base.

- https://github.com/bluesky-social/atproto-website/blob/main/lexicons/site/standard/document.json

## oauth

Use ATProto OAuth to login from the browser and create, edit, or delete posts.

### Setup

#### 1. Edit client-metadata.json

Modify `public/client-metadata.json` with your own domain:

```json
{
  "client_id": "https://example.com/client-metadata.json",
  "client_name": "example.com",
  "client_uri": "https://example.com",
  "redirect_uris": ["https://example.com/"],
  "scope": "atproto transition:generic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "application_type": "web",
  "token_endpoint_auth_method": "none",
  "dpop_bound_access_tokens": true
}
```

**Required changes:**

| Field | Description |
|-------|-------------|
| `client_id` | URL of this file. Must be `https://yourdomain.com/client-metadata.json` |
| `client_name` | App name (shown on auth screen) |
| `client_uri` | Your site URL |
| `redirect_uris` | Redirect URL after OAuth. Use your site's root URL |

#### 2. Deploy the file

`client-metadata.json` must be publicly accessible at:

```
https://yourdomain.com/client-metadata.json
```

The ATProto PDS fetches this file during authentication, so it **must be accessible via public URL**.

#### 3. Local development

No configuration needed for local development (localhost/127.0.0.1). The code automatically uses ATProto's loopback client ID:

```
http://localhost?redirect_uri=http://127.0.0.1:5173/&scope=atproto%20transition%3Ageneric
```

#### 4. Network configuration

To support multiple PDS servers, define networks in `public/network.json`:

```json
{
  "bsky.social": {
    "bsky": "https://bsky.social",
    "plc": "https://plc.directory"
  },
  "syu.is": {
    "bsky": "https://bsky.syu.is",
    "plc": "https://plc.syu.is",
    "web": "https://syu.is"
  }
}
```

The appropriate PDS is automatically selected based on the handle's domain.

### Troubleshooting

- **Auth error**: Verify `client_id` matches the actual file URL
- **Redirect error**: Verify `redirect_uris` matches your site URL
- **CORS error**: Verify `client-metadata.json` is served with correct Content-Type

## cli 

```sh
$ cargo build
$ ./target/debug/ailog
```

### login (l)

login to atproto pds.

```sh
$ ailog login <handle> -p <password> [-s <server>]
$ ailog l user.bsky.social -p mypassword
$ ailog l user.syu.is -p mypassword -s syu.is
```

### post (p)

post a record to collection.

```sh
$ ailog post <file> -c <collection> [-r <rkey>]
$ ailog p ./post.json -c ai.syui.log.post
$ ailog p ./post.json -c ai.syui.log.post -r 3abc123
```

### get (g)

get records from collection.

```sh
$ ailog get -c <collection> [-l <limit>]
$ ailog g -c ai.syui.log.post
$ ailog g -c ai.syui.log.post -l 20
```

### delete (d)

delete a record from collection.

```sh
$ ailog delete -c <collection> -r <rkey>
$ ailog d -c ai.syui.log.post -r 3abc123
```

### sync (s)

sync pds data to local content directory.

```sh
$ ailog sync [-o <output>]
$ ailog s
$ ailog s -o ./public/content
$ ailog s -c ai.syui.log.chat
```

### lexicon

update lexicon schema.

```sh
$ ailog lexicon <file>
$ ailog lexicon ./lexicons/ai.syui.log.post.json
```

```sh
$ ailog did syui.ai
did:plc:uqzpqmrjnptsxezjx4xuh2mn
```

```txt
_lexicon.log.syui.ai  txt  "did=did:plc:uqzpqmrjnptsxezjx4xuh2mn"
```

### gen

generate lexicon code from atproto lexicon json files.

```sh
$ ailog gen [-i <input>] [-o <output>]
$ ailog gen
$ ailog gen -i ./repos/atproto/lexicons -o ./src/lexicons
```

### lang

translate content files using lms.

```sh
$ ailog lang <input> [-f <from>] [-t <to>]
$ ailog lang ./post.json
$ ailog lang ./public/content -f ja -t en
```

requires `.env`:

```
TRANSLATE_URL=http://127.0.0.1:1234/v1
TRANSLATE_MODEL=plamo-2-translate
```

## Lexicon Validation (Browser)

AT-Browser has a "Validate" button on record detail pages to validate records against their lexicon schema.

### How it works

```
NSID: app.bsky.actor.profile
        ↓
1. Parse NSID → authority: actor.bsky.app
        ↓
2. DNS TXT lookup: _lexicon.actor.bsky.app
   → did=did:plc:xxx
        ↓
3. Resolve DID → PDS endpoint
        ↓
4. Fetch lexicon from PDS:
   com.atproto.repo.getRecord
   - repo: did:plc:xxx
   - collection: com.atproto.lexicon.schema
   - rkey: app.bsky.actor.profile
        ↓
5. Validate record with @atproto/lexicon
```

### DNS TXT Record Setup

To publish your own lexicon, set a DNS TXT record:

```
_lexicon.log.syui.ai  TXT  "did=did:plc:uqzpqmrjnptsxezjx4xuh2mn"
```

Then create the lexicon record in your repo under `com.atproto.lexicon.schema` collection.

### Browser-compatible DNS lookup

Uses Cloudflare DNS-over-HTTPS (DoH) for browser compatibility:

```
https://mozilla.cloudflare-dns.com/dns-query?name=_lexicon.actor.bsky.app&type=TXT
```

### Note: com.atproto.lexicon.resolveLexicon

ATProto spec defines `com.atproto.lexicon.resolveLexicon` endpoint, but it's not yet implemented on any PDS (bsky.social, syu.is, etc.):

```sh
$ curl "https://bsky.social/xrpc/com.atproto.lexicon.resolveLexicon?nsid=app.bsky.actor.profile"
{"error":"XRPCNotSupported","message":"XRPCNotSupported"}
```

The current implementation uses the DNS-based approach instead, which works today.

### Reference

- [resolve-lexicon](https://resolve-lexicon.pages.dev/) - Browser-compatible lexicon resolver

## chat

Chat with AI bot and save conversations to ATProto.

### Setup

1. Login as user and bot:

```sh
# User login
$ ailog login user.syu.is -p <password> -s syu.is

# Bot login
$ ailog login ai.syu.is -p <password> -s syu.is --bot
```

2. Configure LLM endpoint in `.env`:

```
CHAT_URL=http://127.0.0.1:1234/v1
CHAT_MODEL=gpt-oss-20b
```

3. (Optional) Set character/system prompt:

```sh
# Direct prompt
CHAT_SYSTEM="You are ai, a friendly AI assistant."

# Or load from file
CHAT_SYSTEM_FILE=./character.txt
```

### Usage

```sh
# Start a new conversation
$ ailog chat --new "hello"

# Continue the conversation
$ ailog chat "how are you?"

# Interactive mode (new session)
$ ailog chat --new

# Interactive mode (continue)
$ ailog chat
```

### Data Storage

Messages are saved locally to `public/content/{did}/ai.syui.log.chat/`:

```
public/content/
├── did:plc:xxx/              # User's messages
│   └── ai.syui.log.chat/
│       ├── index.json
│       └── {rkey}.json
└── did:plc:yyy/              # Bot's messages
    └── ai.syui.log.chat/
        ├── index.json
        └── {rkey}.json
```

### Sync & Push

```sh
# Sync bot data from PDS to local
$ ailog sync --bot

# Push local chat to PDS
$ ailog push -c ai.syui.log.chat --bot
```

### Web Display

View chat threads at `/@{handle}/at/chat`:

- `/@user.syu.is/at/chat` - Thread list (conversations started by user)
- `/@user.syu.is/at/chat/{rkey}` - Full conversation thread

### Record Schema

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

- `root`: First message URI in the thread (empty for conversation start)
- `parent`: Previous message URI in the thread

### Claude Code Integration (MCP)

Use Claude Code to chat and automatically save conversations.

**1. Setup MCP server:**

```sh
# Add MCP server
$ claude mcp add ailog /path/to/ailog mcp-serve

# Or with full path
$ claude mcp add ailog ~/ai/log/target/release/ailog mcp-serve

# Verify
$ claude mcp list
```

Or manually edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "ailog": {
      "command": "/path/to/ailog",
      "args": ["mcp-serve"]
    }
  }
}
```

**2. Chat with Claude:**

```sh
$ cd ~/ai/log
$ claude
> こんにちは

# Claude:
# 1. get_character でキャラクター設定取得
# 2. キャラクター(アイ)として応答
# 3. chat_save で会話を自動保存
```

**MCP Tools:**
- `get_character` - Get AI character settings from .env
- `chat_save` - Save conversation exchange
- `chat_list` - List recent messages
- `chat_new` - Start new thread
