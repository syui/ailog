# ATProto OAuth Comment System

ATProtocol（Bluesky）のOAuth認証を使用したコメントシステムです。

## プロジェクト概要

このプロジェクトは、ATProtocolネットワーク上のコメントとlangレコードを表示するWebアプリケーションです。
- 標準的なOAuth認証画面を使用
- タブ切り替えでレコード表示
- ページコンテキストに応じたフィルタリング

## ファイル構成

```
src/
├── config/
│   └── env.js              # 環境変数の一元管理
├── utils/
│   └── pds.js              # PDS判定・API設定ユーティリティ
├── api/
│   └── atproto.js          # ATProto API クライアント
├── hooks/
│   ├── useAuth.js          # OAuth認証フック
│   ├── useAdminData.js     # 管理者データ取得フック
│   └── usePageContext.js   # ページ判定フック
├── services/
│   └── oauth.js            # OAuth認証サービス
├── components/
│   ├── AuthButton.jsx      # ログイン/ログアウトボタン
│   ├── RecordTabs.jsx      # Lang/Commentタブ切り替え
│   ├── RecordList.jsx      # レコード表示リスト
│   ├── UserLookup.jsx      # ユーザー検索（未使用）
│   └── OAuthCallback.jsx   # OAuth コールバック処理
└── App.jsx                 # メインアプリケーション
```

## 環境設定

### .env ファイル

```bash
VITE_ADMIN=ai.syui.ai                                    # 管理者ハンドル
VITE_PDS=syu.is                                         # デフォルトPDS
VITE_HANDLE_LIST=["ai.syui.ai", "syui.syui.ai", "ai.ai"] # syu.is系ハンドルリスト
VITE_COLLECTION=ai.syui.log                             # ベースコレクション
VITE_OAUTH_CLIENT_ID=https://syui.ai/client-metadata.json # OAuth クライアントID
VITE_OAUTH_REDIRECT_URI=https://syui.ai/oauth/callback   # OAuth リダイレクトURI
```

### 必要な依存関係

```json
{
  "dependencies": {
    "@atproto/api": "^0.15.12",
    "@atproto/oauth-client-browser": "^0.3.19",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

## 主要機能

### 1. OAuth認証システム

**実装場所**: `src/services/oauth.js`

- `@atproto/oauth-client-browser`を使用した標準OAuth実装
- bsky.social と syu.is 両方のPDSに対応
- セッション自動復元機能

**重要**: ATProtoのセッション管理は複雑なため、公式ライブラリの使用が必須です。

### 2. PDS判定システム

**実装場所**: `src/utils/pds.js`

```javascript
// ハンドル判定ロジック
isSyuIsHandle(handle) → boolean
// PDS設定取得
getApiConfig(pds) → { pds, bsky, plc, web }
```

環境変数`VITE_HANDLE_LIST`と`VITE_PDS`を基に自動判定します。

### 3. コレクション取得システム

**実装場所**: `src/api/atproto.js`

```javascript
// 基本コレクション
collections.getBase(pds, repo, collection)
// lang コレクション（翻訳系）
collections.getLang(pds, repo, collection) // → {collection}.chat.lang
// comment コレクション（コメント系）
collections.getComment(pds, repo, collection) // → {collection}.chat.comment
```

### 4. ページコンテキスト判定

**実装場所**: `src/hooks/usePageContext.js`

```javascript
// URL解析結果
{
  isTopPage: boolean,     // トップページかどうか
  rkey: string | null,    // 個別ページのrkey（/posts/xxx → xxx）
  url: string             // 現在のURL
}
```

## 表示ロジック

### フィルタリング

1. **トップページ**: 最新3件を表示
2. **個別ページ**: `record.value.post.url`の rkey が現在ページと一致するもののみ表示

### タブ切り替え

- Lang Records: `{collection}.chat.lang`
- Comment Records: `{collection}.chat.comment`

## 開発・デバッグ

### 起動コマンド

```bash
npm install
npm run dev    # 開発サーバー
npm run build  # プロダクションビルド
```

### OAuth デバッグ

1. **ローカル開発**: 自動的にloopback clientが使用される
2. **本番環境**: `client-metadata.json`が必要

```json
// public/client-metadata.json
{
  "client_id": "https://syui.ai/client-metadata.json",
  "client_name": "ATProto Comment System",
  "redirect_uris": ["https://syui.ai/oauth/callback"],
  "scope": "atproto",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "application_type": "web",
  "dpop_bound_access_tokens": true
}
```

### よくある問題

1. **セッションが保存されない**
   - `@atproto/oauth-client-browser`のバージョン確認
   - IndexedDBの確認（ブラウザの開発者ツール）

2. **PDS判定が正しく動作しない**
   - `VITE_HANDLE_LIST`の JSON 形式を確認
   - 環境変数の読み込み確認

3. **レコードが表示されない**
   - 管理者アカウントの DID 解決確認
   - コレクション名の確認（`{base}.chat.lang`, `{base}.chat.comment`）

## API エンドポイント

### 使用しているATProto API

1. **com.atproto.repo.describeRepo**
   - ハンドル → DID, PDS解決

2. **app.bsky.actor.getProfile**
   - プロフィール情報取得

3. **com.atproto.repo.listRecords**
   - コレクションレコード取得

## セキュリティ

- OAuth 2.1 + PKCE による認証
- DPoP (Demonstration of Proof of Possession) 対応
- セッション情報はブラウザのIndexedDBに暗号化保存

## 今後の拡張可能性

1. **コメント投稿機能**
   - 認証済みユーザーによるコメント作成
   - `com.atproto.repo.putRecord` API使用

2. **リアルタイム更新**
   - Jetstream WebSocket 接続
   - 新しいレコードの自動表示

3. **マルチPDS対応**
   - より多くのPDSへの対応
   - 動的PDS判定の改善

## トラブルシューティング

### ログ確認
ブラウザの開発者ツールでコンソールログを確認してください。主要なエラーは以下の通りです：

- `OAuth initialization failed`: OAuth設定の問題
- `Failed to load admin data`: API アクセスエラー
- `Auth check failed`: セッション復元エラー

### 環境変数確認
```javascript
// 開発者ツールのコンソールで確認
console.log(import.meta.env)
```

## 参考資料

- [ATProto OAuth Guide](https://github.com/bluesky-social/atproto/blob/main/packages/api/OAUTH.md)
- [BrowserOAuthClient Documentation](https://github.com/bluesky-social/atproto/tree/main/packages/oauth-client-browser)
- [ATProto API Reference](https://docs.bsky.app/docs/advanced-guides/atproto-api)