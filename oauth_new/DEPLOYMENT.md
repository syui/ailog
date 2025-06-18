# 本番環境デプロイメント手順

## 本番環境用の調整

### 1. テスト機能の削除・無効化

本番環境では以下の調整が必要です：

#### A. TestUI コンポーネントの削除
```jsx
// src/App.jsx から以下を削除/コメントアウト
import TestUI from './components/TestUI.jsx'
const [showTestUI, setShowTestUI] = useState(false)

// ボトムセクションからTestUIを削除
{showTestUI && (
  <TestUI />
)}
<button
  onClick={() => setShowTestUI(!showTestUI)}
  className={`btn ${showTestUI ? 'btn-danger' : 'btn-outline'} btn-sm`}
>
  {showTestUI ? 'close test' : 'test'}
</button>
```

#### B. ログ出力の完全無効化
現在は `logger.js` で開発環境のみログが有効になっていますが、完全に確実にするため：

```bash
# 本番ビルド前に全てのconsole.logを確認
grep -r "console\." src/ --exclude-dir=node_modules
```

### 2. 環境変数の設定

#### 本番用 .env.production
```bash
VITE_ATPROTO_PDS=syu.is
VITE_ADMIN_HANDLE=ai.syui.ai  
VITE_AI_HANDLE=ai.syui.ai
VITE_OAUTH_COLLECTION=ai.syui.log
```

### 3. ビルドコマンド

```bash
# 本番用ビルド
npm run build

# 生成されるファイル確認
ls -la dist/
```

### 4. デプロイ用ファイル構成

```
dist/
├── index.html                          # 最小化HTML
├── assets/
│   ├── comment-atproto-[hash].js      # メインJSバンドル
│   └── comment-atproto-[hash].css     # CSS
```

### 5. ailog サイトへの統合

#### A. アセットファイルのコピー
```bash
# distファイルをailogサイトの適切な場所にコピー
cp dist/assets/* /path/to/ailog/static/assets/
cp dist/index.html /path/to/ailog/templates/oauth-assets.html
```

#### B. ailog テンプレートでの読み込み
```html
<!-- ailog のテンプレートに追加 -->
{{ if .Site.Params.oauth_comments }}
  {{ partial "oauth-assets.html" . }}
{{ end }}
```

### 6. 本番環境チェックリスト

#### ✅ セキュリティ
- [ ] OAuth認証のリダイレクトURL確認
- [ ] 環境変数の機密情報確認
- [ ] HTTPS通信確認

#### ✅ パフォーマンス  
- [ ] バンドルサイズ確認（現在1.2MB）
- [ ] ファイル圧縮確認
- [ ] キャッシュ設定確認

#### ✅ 機能
- [ ] 本番PDS接続確認
- [ ] OAuth認証フロー確認
- [ ] コメント投稿・表示確認
- [ ] アバター表示確認

#### ✅ UI/UX
- [ ] モバイル表示確認
- [ ] アクセシビリティ確認
- [ ] エラーハンドリング確認

### 7. 段階的デプロイ戦略

#### Phase 1: テスト環境
```bash
# テスト用のサブドメインでデプロイ
# test.syui.ai など
```

#### Phase 2: 本番環境
```bash
# 問題なければ本番環境にデプロイ
# ailog本体に統合
```

### 8. トラブルシューティング

#### よくある問題
1. **OAuth認証エラー**: リダイレクトURL設定確認
2. **PDS接続エラー**: ネットワーク・DNS設定確認  
3. **アバター表示エラー**: CORS設定確認
4. **CSS競合**: oauth-プレフィックス確認

#### ログ確認方法
```bash
# 本番環境でエラーが発生した場合
# ブラウザのDevToolsでエラー確認
# logger.jsは本番では無効化されている
```

### 9. 本番用設定ファイル

```bash
# ~/.config/syui/ai/log/config.json
{
  "oauth": {
    "environment": "production",
    "debug": false,
    "test_mode": false
  }
}
```

### 10. 推奨デプロイ手順

```bash
# 1. テスト機能削除
git checkout -b production-ready
# App.jsx からTestUI関連を削除

# 2. 本番ビルド
npm run build

# 3. ファイル確認
ls -la dist/

# 4. ailogサイトに統合
cp dist/assets/* ../my-blog/static/assets/
cp dist/index.html ../my-blog/templates/oauth-assets.html

# 5. ailogサイトでテスト
cd ../my-blog
hugo server

# 6. 問題なければcommit
git add .
git commit -m "Production build: Remove test UI, optimize for deployment"
```

## 注意事項

- TestUIは開発・デモ用のため本番では削除必須
- loggerは自動で本番では無効化される
- OAuth設定は本番PDS用に調整必要
- バンドルサイズが大きいため今後最適化検討