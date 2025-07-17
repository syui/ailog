import React from 'react'
import { AtUriBrowser } from './components/AtUriBrowser.jsx'
import './App.css'

function App() {
  return (
    <AtUriBrowser>
      <div className="container">
        <h1>AT URI Browser</h1>
        
        <div className="test-section">
          <h2>テスト用 AT URI</h2>
          <p>以下のAT URIをクリックすると、モーダルでコンテンツが表示されます。</p>
          
          <div className="test-uris">
            <div className="at-uri" data-at-uri="at://did:plc:vzsvtbtbnwn22xjqhcu3vd6y/app.bsky.feed.post/3lu5givmkc222">
              at://did:plc:vzsvtbtbnwn22xjqhcu3vd6y/app.bsky.feed.post/3lu5givmkc222
            </div>
            <div className="at-uri" data-at-uri="at://did:plc:vzsvtbtbnwn22xjqhcu3vd6y/app.bsky.actor.profile/self">
              at://did:plc:vzsvtbtbnwn22xjqhcu3vd6y/app.bsky.actor.profile/self
            </div>
            <div className="at-uri" data-at-uri="at://syui.ai/app.bsky.actor.profile/self">
              at://syui.ai/app.bsky.actor.profile/self
            </div>
            <div className="at-uri" data-at-uri="at://bsky.app/app.bsky.actor.profile/self">
              at://bsky.app/app.bsky.actor.profile/self
            </div>
          </div>
          
          <div className="instructions">
            <h3>使用方法:</h3>
            <ol>
              <li>上記のAT URIをクリックしてください</li>
              <li>モーダルがポップアップし、AT Protocolレコードの内容が表示されます</li>
              <li>モーダルは×ボタンまたはEscキーで閉じることができます</li>
              <li>モーダルはレスポンシブ対応で、異なる画面サイズに対応します</li>
            </ol>
          </div>
        </div>
        
        <div className="test-section">
          <h2>AT URI について</h2>
          <p>AT URIは、AT Protocolで使用される統一リソース識別子です。この形式により、分散ソーシャルネットワーク上のコンテンツを一意に識別できます。</p>
          <p>このブラウザを使用することで、ブログ投稿やその他のコンテンツに埋め込まれたAT URIを直接探索することが可能です。</p>
          
          <h3>対応PDS環境</h3>
          <ul>
            <li><strong>bsky.social</strong> - メインのBlueskyネットワーク</li>
            <li><strong>syu.is</strong> - 独立したPDS環境</li>
            <li><strong>plc.directory</strong> + <strong>plc.syu.is</strong> - DID解決</li>
          </ul>
          
          <p><small>注意: 独立したPDS環境では、レコードの同期状況により、一部のコンテンツが利用できない場合があります。</small></p>
        </div>
        
        <a href="/" className="back-link">← ブログに戻る</a>
      </div>
    </AtUriBrowser>
  )
}

export default App