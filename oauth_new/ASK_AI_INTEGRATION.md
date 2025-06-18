# Ask-AI Integration Implementation

## 概要

oauth_new アプリに ask-AI 機能を統合しました。この機能により、ユーザーはAIと対話し、その結果を atproto に記録できます。

## 実装されたファイル

### 1. `/src/hooks/useAskAI.js`
- ask-AI サーバーとの通信機能
- atproto への putRecord 機能
- チャット履歴の管理
- イベント送信（blog との通信用）

### 2. `/src/components/AskAI.jsx`
- チャット UI コンポーネント
- 質問入力・回答表示
- 認証チェック
- IME 対応

### 3. `/src/App.jsx` の更新
- AskAI コンポーネントの統合
- Ask AI ボタンの追加
- イベントリスナーの設定
- blog との通信機能

## JSON 構造の記録

`./json/` ディレクトリに各 collection の構造を記録しました：

- `ai.syui.ai_user.json` - ユーザーリスト
- `ai.syui.ai_chat.json` - チャット記録（空）
- `syui.syui.ai_chat.json` - チャット記録（実データ）
- `ai.syui.ai_chat_lang.json` - 翻訳記録
- `ai.syui.ai_chat_comment.json` - コメント記録

## 実際の ai.syui.log.chat 構造

確認された実際の構造：

```json
{
  "$type": "ai.syui.log.chat",
  "post": {
    "url": "https://syui.ai/",
    "date": "2025-06-18T02:16:04.609Z",
    "slug": "",
    "tags": [],
    "title": "syui.ai",
    "language": "ja"
  },
  "text": "質問またはAI回答テキスト",
  "type": "question|answer",
  "author": {
    "did": "did:plc:...",
    "handle": "handle名",
    "displayName": "表示名",
    "avatar": "アバターURL"
  },
  "createdAt": "2025-06-18T02:16:04.609Z"
}
```

## イベント通信

blog（ask-ai.js）と OAuth アプリ間の通信：

### 送信イベント
- `postAIQuestion` - blog から OAuth アプリへ質問送信
- `aiProfileLoaded` - OAuth アプリから blog へ AI プロフィール送信
- `aiResponseReceived` - OAuth アプリから blog へ AI 回答送信

### 受信イベント
- OAuth アプリが `postAIQuestion` を受信して処理
- blog が `aiResponseReceived` を受信して表示

## 環境変数

```env
VITE_ASK_AI_URL=http://localhost:3000/ask  # ask-AI サーバーURL（デフォルト）
VITE_ADMIN_HANDLE=ai.syui.ai
VITE_ATPROTO_PDS=syu.is
VITE_OAUTH_COLLECTION=ai.syui.log
```

## 機能

### 実装済み
- ✅ ask-AI サーバーとの通信
- ✅ atproto への question/answer record 保存
- ✅ チャット履歴の表示・管理
- ✅ blog との双方向イベント通信
- ✅ 認証機能（ログイン必須）
- ✅ エラーハンドリング・ローディング状態
- ✅ 実際の JSON 構造に合わせた実装

### 今後のテスト項目
- ask-AI サーバーの準備・起動
- 実際の質問送信テスト
- atproto への putRecord 動作確認
- blog からの連携テスト

## 使用方法

1. 開発サーバー起動: `npm run dev`
2. OAuth ログイン実行
3. "Ask AI" ボタンをクリック
4. チャット画面で質問入力
5. AI の回答が表示され、atproto に記録される

## 注意事項

- ask-AI サーバー（VITE_ASK_AI_URL）が必要
- 認証されたユーザーのみ質問可能
- ai.syui.log.chat への書き込み権限が必要
- Production 環境では logger が無効化される