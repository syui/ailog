import React, { useState, useEffect } from 'react';
import { cardApi, aiCardApi } from '../services/api';
import '../styles/GachaStats.css';

interface GachaStatsData {
  total_draws: number;
  cards_by_rarity: Record<string, number>;
  success_rates: Record<string, number>;
  recent_activity: Array<{
    timestamp: string;
    user_did: string;
    card_name: string;
    rarity: string;
  }>;
}

export const GachaStats: React.FC = () => {
  const [stats, setStats] = useState<GachaStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useAI, setUseAI] = useState(true);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let result;
      if (useAI) {
        try {
          result = await aiCardApi.getEnhancedStats();
        } catch (aiError) {
          console.warn('AI統計が利用できません、基本統計に切り替えます:', aiError);
          setUseAI(false);
          result = await cardApi.getGachaStats();
        }
      } else {
        result = await cardApi.getGachaStats();
      }
      setStats(result);
    } catch (err) {
      console.error('Gacha stats failed:', err);
      setError('統計データの取得に失敗しました。ai.cardサーバーが起動していることを確認してください。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="gacha-stats">
        <div className="stats-loading">
          <div className="loading-spinner"></div>
          <p>統計データ取得中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gacha-stats">
        <div className="stats-error">
          <p>{error}</p>
          <button onClick={loadStats} className="retry-button">
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="gacha-stats">
        <div className="stats-empty">
          <p>統計データがありません</p>
          <button onClick={loadStats} className="load-stats-button">
            統計取得
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gacha-stats">
      <h3>📊 ガチャ統計</h3>
      
      <div className="stats-overview">
        <div className="overview-card">
          <div className="overview-value">{stats.total_draws}</div>
          <div className="overview-label">総ガチャ実行数</div>
        </div>
      </div>

      <div className="rarity-stats">
        <h4>レアリティ別出現数</h4>
        <div className="rarity-grid">
          {Object.entries(stats.cards_by_rarity).map(([rarity, count]) => (
            <div key={rarity} className={`rarity-stat rarity-${rarity.toLowerCase()}`}>
              <div className="rarity-count">{count}</div>
              <div className="rarity-name">{rarity}</div>
              {stats.success_rates[rarity] && (
                <div className="success-rate">
                  {(stats.success_rates[rarity] * 100).toFixed(1)}%
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {stats.recent_activity && stats.recent_activity.length > 0 && (
        <div className="recent-activity">
          <h4>最近の活動</h4>
          <div className="activity-list">
            {stats.recent_activity.slice(0, 5).map((activity, index) => (
              <div key={index} className="activity-item">
                <div className="activity-time">
                  {new Date(activity.timestamp).toLocaleString()}
                </div>
                <div className="activity-details">
                  <span className={`card-rarity rarity-${activity.rarity.toLowerCase()}`}>
                    {activity.rarity}
                  </span>
                  <span className="card-name">{activity.card_name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={loadStats} className="refresh-stats">
        統計更新
      </button>
    </div>
  );
};