import React, { useState, useEffect } from 'react';
import { aiCardApi } from '../services/api';
import '../styles/CollectionAnalysis.css';

interface AnalysisData {
  total_cards: number;
  unique_cards: number;
  rarity_distribution: Record<string, number>;
  collection_score: number;
  recommendations: string[];
}

interface CollectionAnalysisProps {
  userDid: string;
}

export const CollectionAnalysis: React.FC<CollectionAnalysisProps> = ({ userDid }) => {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalysis = async () => {
    if (!userDid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await aiCardApi.analyzeCollection(userDid);
      setAnalysis(result);
    } catch (err) {
      // Collection analysis failed
      setError('AI分析機能を利用するにはai.gptサーバーが必要です。基本機能はai.cardサーバーのみで利用できます。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalysis();
  }, [userDid]);

  if (loading) {
    return (
      <div className="collection-analysis">
        <div className="analysis-loading">
          <div className="loading-spinner"></div>
          <p>AI分析中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="collection-analysis">
        <div className="analysis-error">
          <p>{error}</p>
          <button onClick={loadAnalysis} className="retry-button">
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="collection-analysis">
        <div className="analysis-empty">
          <p>分析データがありません</p>
          <button onClick={loadAnalysis} className="analyze-button">
            分析開始
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="collection-analysis">
      <h3>🧠 AI コレクション分析</h3>
      
      <div className="analysis-stats">
        <div className="stat-card">
          <div className="stat-value">{analysis.total_cards}</div>
          <div className="stat-label">総カード数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{analysis.unique_cards}</div>
          <div className="stat-label">ユニークカード</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{analysis.collection_score}</div>
          <div className="stat-label">コレクションスコア</div>
        </div>
      </div>

      <div className="rarity-distribution">
        <h4>レアリティ分布</h4>
        <div className="rarity-bars">
          {Object.entries(analysis.rarity_distribution).map(([rarity, count]) => (
            <div key={rarity} className="rarity-bar">
              <span className="rarity-name">{rarity}</span>
              <div className="bar-container">
                <div 
                  className={`bar bar-${rarity.toLowerCase()}`}
                  style={{ width: `${(count / analysis.total_cards) * 100}%` }}
                ></div>
              </div>
              <span className="rarity-count">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <div className="recommendations">
          <h4>🎯 AI推奨</h4>
          <ul>
            {analysis.recommendations.map((rec, index) => (
              <li key={index}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={loadAnalysis} className="refresh-analysis">
        分析更新
      </button>
    </div>
  );
};