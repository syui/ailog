import React, { useState, useEffect } from 'react';
import { Card } from './Card';
import { cardApi } from '../services/api';
import { Card as CardType } from '../types/card';
import '../styles/CardList.css';

interface CardMasterData {
  id: number;
  name: string;
  ja_name: string;
  description: string;
  base_cp_min: number;
  base_cp_max: number;
}

export const CardList: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [masterData, setMasterData] = useState<CardMasterData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/v1/cards/master');
      if (!response.ok) {
        throw new Error('Failed to fetch card master data');
      }
      const data = await response.json();
      setMasterData(data);
    } catch (err) {
      console.error('Error loading card master data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load card data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card-list-container">
        <div className="loading">Loading card data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-list-container">
        <div className="error">Error: {error}</div>
        <button onClick={loadMasterData}>Retry</button>
      </div>
    );
  }

  // Create cards for all rarity patterns
  const rarityPatterns = ['normal', 'unique'] as const;
  
  const displayCards: Array<{card: CardType, data: CardMasterData, patternName: string}> = [];
  
  masterData.forEach(data => {
    rarityPatterns.forEach(pattern => {
      const card: CardType = {
        id: data.id,
        cp: Math.floor((data.base_cp_min + data.base_cp_max) / 2),
        status: pattern,
        skill: null,
        owner_did: 'sample',
        obtained_at: new Date().toISOString(),
        is_unique: pattern === 'unique',
        unique_id: pattern === 'unique' ? 'sample-unique-id' : null
      };
      displayCards.push({
        card,
        data,
        patternName: `${data.id}-${pattern}`
      });
    });
  });


  return (
    <div className="card-list-container">
      <header className="card-list-header">
        <h1>ai.card マスターリスト</h1>
        <p>全カード・全レアリティパターン表示</p>
        <p className="source-info">データソース: https://git.syui.ai/ai/ai/raw/branch/main/ai.json</p>
      </header>

      <div className="card-list-simple-grid">
        {displayCards.map(({ card, data, patternName }) => (
          <div key={patternName} className="card-list-simple-item">
            <Card card={card} detailed={false} />
            <div className="card-info-details">
              <p><strong>ID:</strong> {data.id}</p>
              <p><strong>Name:</strong> {data.name}</p>
              <p><strong>日本語名:</strong> {data.ja_name}</p>
              <p><strong>レアリティ:</strong> {card.status}</p>
              <p><strong>CP:</strong> {card.cp}</p>
              <p><strong>CP範囲:</strong> {data.base_cp_min}-{data.base_cp_max}</p>
              {data.description && (
                <p className="card-description">{data.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};