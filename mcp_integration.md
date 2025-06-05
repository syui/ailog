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

ai.gptの設定ファイル `~/.config/syui/ai/gpt/config.json` に以下を追加：

```json
{
  "mcp": {
    "enabled": true,
    "servers": {
      "ai_gpt": {"base_url": "http://localhost:8001"},
      "ai_card": {"base_url": "http://localhost:8000"},
      "ai_log": {"base_url": "http://localhost:8002"}
    }
  }
}
```

## 利用可能なMCPツール

### 1. create_blog_post
新しいブログ記事を作成します。

**パラメータ**:
- `title` (必須): 記事のタイトル
- `content` (必須): Markdown形式の記事内容
- `tags` (オプション): 記事のタグ配列
- `slug` (オプション): カスタムURL slug

**使用例**:
```python
# ai.gptからの呼び出し例
result = await mcp_client.call_tool("create_blog_post", {
    "title": "AI統合の新しい可能性",
    "content": "# 概要\n\nai.gptとai.logの連携により...",
    "tags": ["AI", "技術", "ブログ"]
})
```

### 2. list_blog_posts
既存のブログ記事一覧を取得します。

**パラメータ**:
- `limit` (オプション): 取得件数上限 (デフォルト: 10)
- `offset` (オプション): スキップ件数 (デフォルト: 0)

### 3. build_blog
ブログをビルドして静的ファイルを生成します。

**パラメータ**:
- `enable_ai` (オプション): AI機能を有効化
- `translate` (オプション): 自動翻訳を有効化

### 4. get_post_content
指定したスラッグの記事内容を取得します。

**パラメータ**:
- `slug` (必須): 記事のスラッグ

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