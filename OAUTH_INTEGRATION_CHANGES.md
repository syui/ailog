# OAuth Integration Changes for ai.log

## 概要
ailogブログシステムにATProto/Bluesky OAuth認証を使用したコメントシステムを統合しました。

## 実装された機能

### 1. OAuth認証システム
- **ATProto BrowserOAuthClient** を使用した完全なOAuth 2.1フロー
- Blueskyアカウントでのワンクリック認証
- セッション永続化とリフレッシュトークン対応

### 2. コメントシステム
- 認証済みユーザーによるコメント投稿
- ATProto collection (`ai.syui.log`) への直接保存
- リアルタイムコメント表示と削除機能
- 複数PDS対応のコメント取得

### 3. 管理機能
- 管理者用ユーザーリスト管理
- DID解決とプロフィール情報の自動取得
- JSON形式でのレコード表示・編集

## 技術的変更点

### aicard-web-oauth (React OAuth App)

#### 新規ファイル
```
aicard-web-oauth/
├── src/
│   ├── services/
│   │   ├── atproto-oauth.ts     # BrowserOAuthClient wrapper
│   │   └── auth.ts              # Legacy auth service
│   ├── components/
│   │   ├── OAuthCallback.tsx    # OAuth callback handler
│   │   └── OAuthCallbackPage.tsx
│   └── utils/
│       ├── oauth-endpoints.ts   # OAuth endpoint utilities
│       └── oauth-keys.ts        # OAuth configuration
```

#### 主要な変更
- **App.tsx**: URL parameter/hash detection, 詳細デバッグログ追加
- **vite.config.ts**: 固定ファイル名出力 (`comment-atproto.js/css`)
- **main.tsx**: React mount点を `comment-atproto` に変更

#### OAuthCallback.tsx の機能
- Query parameters と hash parameters の両方を検出
- 認証完了後の自動URL cleanup (`window.history.replaceState`)
- Popup/direct navigation 両対応
- Fallback認証とエラーハンドリング

### ailog (Rust Static Site Generator)

#### OAuth Callback Route
**src/commands/serve.rs**:
```rust
} else if path.starts_with("/oauth/callback") {
    // Handle OAuth callback - serve the callback HTML page
    match serve_oauth_callback().await {
        Ok((ct, data, cc)) => ("200 OK", ct, data, cc),
        Err(e) => // Error handling
    }
}
```

#### OAuth Callback HTML
- ATProto認証パラメータの検出・処理
- Hash parameters でのリダイレクト (`#code=...&state=...`)
- Popup/window間通信対応
- localStorage を使った一時的なデータ保存

### Template Integration

#### base.html (ailog templates)
```html
<!-- OAuth Comment System - Load in head for early initialization -->
<script type="module" crossorigin src="/assets/comment-atproto.js"></script>
<link rel="stylesheet" crossorigin href="/assets/comment-atproto.css">
```

#### index.html / post.html
```html
<!-- OAuth Comment System -->
<div id="comment-atproto"></div>
```

### OAuth Configuration

#### client-metadata.json
```json
{
  "client_id": "https://log.syui.ai/client-metadata.json",
  "redirect_uris": [
    "https://log.syui.ai/oauth/callback",
    "https://log.syui.ai/"
  ],
  "scope": "atproto transition:generic",
  "dpop_bound_access_tokens": true
}
```

## インフラストラクチャ

### Cloudflare Tunnel
```yaml
# cloudflared-config.yml
ingress:
  - hostname: log.syui.ai
    service: http://localhost:4173  # ailog serve
```

### Build Process
1. **aicard-web-oauth**: `npm run build` → `dist/assets/`
2. **Asset copy**: `dist/assets/*` → `my-blog/public/assets/`
3. **ailog build**: Template processing + static file serving

## データフロー

### OAuth認証フロー
```
1. User clicks "atproto" button
2. BrowserOAuthClient initiates OAuth flow
3. Redirect to Bluesky authorization server
4. Callback to https://log.syui.ai/oauth/callback
5. ailog serves OAuth callback HTML
6. JavaScript processes parameters and redirects with hash
7. React app detects hash parameters and completes authentication
8. URL cleanup removes OAuth parameters
```

### コメント投稿フロー
```
1. Authenticated user writes comment
2. React app calls ATProto API
3. Record saved to ai.syui.log collection
4. Comments reloaded from all configured PDS endpoints
5. Real-time display update
```

## 設定ファイル

### 必須ファイル
- `my-blog/static/client-metadata.json` - OAuth client configuration
- `aicard-web-oauth/.env.production` - Production environment variables
- `cloudflared-config.yml` - Tunnel routing configuration

### 開発用ファイル
- `aicard-web-oauth/.env.development` - Development settings
- `aicard-web-oauth/public/client-metadata.json` - Local OAuth metadata

## 主要な修正点

### 1. Build System
- Vite output ファイル名を固定 (`comment-atproto.js/css`)
- Build時のclient-metadata.json更新自動化

### 2. OAuth Callback処理
- Hash parameters 対応でSPA architectureに最適化
- URL cleanup でクリーンなユーザー体験
- Popup/direct navigation 両対応

### 3. Error Handling
- Network エラー時のfallback認証
- セッション期限切れ時の再認証
- OAuth parameter不足時の適切なエラー表示

### 4. Session Management
- localStorage + sessionStorage 併用
- OAuth state/code verifier の適切な管理
- Cross-tab session sharing

## テスト済み機能

✅ **動作確認済み**
- OAuth認証 (Bluesky)
- コメント投稿・削除
- セッション永続化
- URL parameter cleanup
- 複数PDS対応
- 管理者機能

⏳ **今後のテスト項目**
- Incognito/private mode での動作
- 複数タブでの同時使用
- Long-term session の動作確認

## 運用メモ

### デプロイ手順
1. `cd aicard-web-oauth && npm run build`
2. `cp -r dist/assets/* ../my-blog/public/assets/`
3. `cd my-blog && cargo build --release`
4. ailog serve でテスト確認

### トラブルシューティング
- OAuth エラー: client-metadata.json のredirect_uris確認
- コメント表示されない: Network tab でAPI response確認
- Build エラー: Node.js/npm version, dependencies確認

## 関連リンク
- [ATProto OAuth Specification](https://atproto.com/specs/oauth)
- [Bluesky OAuth Documentation](https://github.com/bluesky-social/atproto/blob/main/packages/api/OAUTH.md)
- [BrowserOAuthClient API](https://github.com/bluesky-social/atproto/tree/main/packages/oauth-client-browser)