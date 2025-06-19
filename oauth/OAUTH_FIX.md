# OAuth認証の修正案

## 現在の問題

1. **スコープエラー**: `Missing required scope: transition:generic`
   - OAuth認証時に必要なスコープが不足している
   - ✅ 修正済み: `scope: 'atproto transition:generic'` に変更

2. **401エラー**: PDSへの直接アクセス
   - `https://shiitake.us-east.host.bsky.network/xrpc/app.bsky.actor.getProfile` で401エラー
   - 原因: 個人のPDSに直接アクセスしているが、これは認証が必要
   - 解決策: 公開APIエンドポイント（`https://public.api.bsky.app`）を使用すべき

3. **セッション保存の問題**: handleが`@unknown`になる
   - OAuth認証後にセッションが正しく保存されていない
   - ✅ 修正済み: Agentの作成方法を修正

## 修正が必要な箇所

### 1. avatarFetcher.js の修正
個人のPDSではなく、公開APIを使用するように修正：

```javascript
// 現在の問題のあるコード
const response = await fetch(`${apiConfig.bsky}/xrpc/app.bsky.actor.getProfile?actor=${did}`)

// 修正案
// PDSに関係なく、常に公開APIを使用
const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`)
```

### 2. セッション復元の改善
OAuth認証後のコールバック処理で、セッションが正しく復元されていない可能性がある。

```javascript
// restoreSession メソッドの改善
async restoreSession() {
  // Try both clients
  for (const [name, client] of Object.entries(this.clients)) {
    if (!client) continue
    
    const result = await client.init()
    if (result?.session) {
      // セッション処理を確実に行う
      this.agent = new Agent(result.session)
      const sessionInfo = await this.processSession(result.session)
      
      // セッション情報をログに出力（デバッグ用）
      logger.log('Session restored:', { name, sessionInfo })
      
      return sessionInfo
    }
  }
  return null
}
```

## 根本的な問題

1. **PDSアクセスの誤解**
   - `app.bsky.actor.getProfile` は公開API（認証不要）
   - 個人のPDSサーバーに直接アクセスする必要はない
   - 常に `https://public.api.bsky.app` を使用すべき

2. **OAuth Clientの初期化タイミング**
   - コールバック時に両方のクライアント（bsky, syu）を試す必要がある
   - どちらのPDSでログインしたか分からないため

## 推奨される修正手順

1. **即座の修正**（401エラー解決）
   - `avatarFetcher.js` で公開APIを使用
   - `getProfile` 呼び出しをすべて公開APIに変更

2. **セッション管理の改善**
   - OAuth認証後のセッション復元を確実に
   - エラーハンドリングの強化

3. **デバッグ情報の追加**
   - セッション復元時のログ追加
   - どのOAuthクライアントが使用されたか確認