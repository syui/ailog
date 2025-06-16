import React, { useState, useEffect } from 'react';
import { atprotoOAuthService } from '../services/atproto-oauth';
import { Card } from './Card';
import '../styles/CardBox.css';

interface CardBoxProps {
  userDid: string;
}

export const CardBox: React.FC<CardBoxProps> = ({ userDid }) => {
  const [boxData, setBoxData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadBoxData();
  }, [userDid]);

  const loadBoxData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await atprotoOAuthService.getCardsFromBox();
      setBoxData(data);
    } catch (err) {
      // Failed to load card box
      setError(err instanceof Error ? err.message : 'カードボックスの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToBox = async () => {
    // 現在のカードデータを取得してボックスに保存
    // この部分は親コンポーネントから渡すか、APIから取得する必要があります
    alert('カードボックスへの保存機能は親コンポーネントから実行してください');
  };

  const handleDeleteBox = async () => {
    if (!window.confirm('カードボックスを削除してもよろしいですか？\nこの操作は取り消せません。')) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await atprotoOAuthService.deleteCardBox();
      setBoxData({ records: [] });
      alert('カードボックスを削除しました');
    } catch (err) {
      // Failed to delete card box
      setError(err instanceof Error ? err.message : 'カードボックスの削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="card-box-container">
        <div className="loading">カードボックスを読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-box-container">
        <div className="error">エラー: {error}</div>
        <button onClick={loadBoxData} className="retry-button">
          再試行
        </button>
      </div>
    );
  }

  const records = boxData?.records || [];
  const selfRecord = records.find((record: any) => record.uri.includes('/self'));
  const cards = selfRecord?.value?.cards || [];

  return (
    <div className="card-box-container">
      <div className="card-box-header">
        <h3>📦 atproto カードボックス</h3>
        <div className="box-actions">
          <button 
            onClick={() => setShowJson(!showJson)} 
            className="json-button"
          >
            {showJson ? 'JSON非表示' : 'JSON表示'}
          </button>
          <button onClick={loadBoxData} className="refresh-button">
            🔄 更新
          </button>
          {cards.length > 0 && (
            <button 
              onClick={handleDeleteBox} 
              className="delete-button"
              disabled={isDeleting}
            >
              {isDeleting ? '削除中...' : '🗑️ 削除'}
            </button>
          )}
        </div>
      </div>

      <div className="uri-display">
        <p>
          <strong>📍 URI:</strong> 
          <code>at://did:plc:uqzpqmrjnptsxezjx4xuh2mn/ai.card.box/self</code>
        </p>
      </div>

      {showJson && (
        <div className="json-display">
          <h4>Raw JSON データ:</h4>
          <pre className="json-content">
            {JSON.stringify(boxData, null, 2)}
          </pre>
        </div>
      )}

      <div className="box-stats">
        <p>
          <strong>総カード数:</strong> {cards.length}枚
          {selfRecord?.value?.updated_at && (
            <>
              <br />
              <strong>最終更新:</strong> {new Date(selfRecord.value.updated_at).toLocaleString()}
            </>
          )}
        </p>
      </div>

      {cards.length > 0 ? (
        <>
          <div className="card-grid">
            {cards.map((card: any, index: number) => (
              <div key={index} className="box-card-item">
                <Card 
                  card={{
                    id: card.id,
                    cp: card.cp,
                    status: card.status,
                    skill: card.skill,
                    owner_did: card.owner_did,
                    obtained_at: card.obtained_at,
                    is_unique: card.is_unique,
                    unique_id: card.unique_id
                  }} 
                />
                <div className="card-info">
                  <small>ID: {card.id} | CP: {card.cp}</small>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-box">
          <p>カードボックスにカードがありません</p>
          <p>カードを引いてからバックアップボタンを押してください</p>
        </div>
      )}
    </div>
  );
};