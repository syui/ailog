# ai.log MCP Integration Guide

ai.logをai.gptと連携するためのMCPサーバー設定ガイド

## MCPサーバー起動

```bash
# ai.logプロジェクトディレクトリで
./target/debug/ailog mcp --port 8002

# またはサブディレクトリから
./target/debug/ailog mcp --port 8002 --path /path/to/blog
```

## ai.gptでの設定

ai.logツールはai.gptのMCPサーバーに統合済みです。`config.json`に以下の設定が含まれています：

```json
{
  "mcp": {
    "enabled": "true",
    "auto_detect": "true",
    "servers": {
      "ai_gpt": {
        "base_url": "http://localhost:8001",
        "endpoints": {
          "log_create_post": "/log_create_post",
          "log_list_posts": "/log_list_posts",
          "log_build_blog": "/log_build_blog",
          "log_get_post": "/log_get_post",
          "log_system_status": "/log_system_status",
          "log_ai_content": "/log_ai_content"
        }
      }
    }
  }
}
```

**重要**: ai.logツールを使用するには、ai.logディレクトリが `./log/` に存在し、ai.logのMCPサーバーがポート8002で稼働している必要があります。

## 利用可能なMCPツール（ai.gpt統合版）

### 1. log_create_post
新しいブログ記事を作成します。

**パラメータ**:
- `title` (必須): 記事のタイトル
- `content` (必須): Markdown形式の記事内容
- `tags` (オプション): 記事のタグ配列
- `slug` (オプション): カスタムURL slug

**使用例**:
```python
# Claude Code/ai.gptから自動呼び出し
# "ブログ記事を書いて"という発言で自動トリガー
```

### 2. log_list_posts
既存のブログ記事一覧を取得します。

**パラメータ**:
- `limit` (オプション): 取得件数上限 (デフォルト: 10)
- `offset` (オプション): スキップ件数 (デフォルト: 0)

### 3. log_build_blog
ブログをビルドして静的ファイルを生成します。

**パラメータ**:
- `enable_ai` (オプション): AI機能を有効化 (デフォルト: true)
- `translate` (オプション): 自動翻訳を有効化 (デフォルト: false)

### 4. log_get_post
指定したスラッグの記事内容を取得します。

**パラメータ**:
- `slug` (必須): 記事のスラッグ

### 5. log_system_status
ai.logシステムの状態を確認します。

### 6. log_ai_content ⭐ NEW
AI記憶システムと連携して自動でブログ記事を生成・投稿します。

**パラメータ**:
- `user_id` (必須): ユーザーID
- `topic` (オプション): 記事のトピック (デフォルト: "daily thoughts")

**機能**:
- ai.gptの記憶システムから関連する思い出を取得
- AI技術で記憶をブログ記事に変換
- 自動でai.logに投稿

## ai.gptからの連携パターン

### 記事の自動投稿
```python
# 記憶システムから関連情報を取得
memories = get_contextual_memories("ブログ")

# AI記事生成
content = generate_blog_content(memories)

# ai.logに投稿
result = await mcp_client.call_tool("create_blog_post", {
    "title": "今日の思考メモ",
    "content": content,
    "tags": ["日記", "AI"]
})

# ビルド実行
await mcp_client.call_tool("build_blog", {"enable_ai": True})
```

### 記事一覧の確認と編集
```python
# 記事一覧取得
posts = await mcp_client.call_tool("list_blog_posts", {"limit": 5})

# 特定記事の内容取得
content = await mcp_client.call_tool("get_post_content", {
    "slug": "ai-integration"
})

# 修正版を投稿（上書き）
updated_content = enhance_content(content)
await mcp_client.call_tool("create_blog_post", {
    "title": "AI統合の新しい可能性（改訂版）",
    "content": updated_content,
    "slug": "ai-integration-revised"
})
```

## 自動化ワークフロー

ai.gptのスケジューラーと組み合わせて：

1. **日次ブログ投稿**: 蓄積された記憶から記事を自動生成・投稿
2. **記事修正**: 既存記事の内容を自動改善
3. **関連記事提案**: 過去記事との関連性に基づく新記事提案
4. **多言語対応**: 自動翻訳によるグローバル展開

## エラーハンドリング

MCPツール呼び出し時のエラーは以下の形式で返されます：

```json
{
  "jsonrpc": "2.0",
  "id": "request_id",
  "error": {
    "code": -32000,
    "message": "エラーメッセージ",
    "data": null
  }
}
```

## セキュリティ考慮事項

- MCPサーバーはローカルホストでのみ動作
- ai.gptからの認証済みリクエストのみ処理
- ファイルアクセスは指定されたブログディレクトリ内に制限