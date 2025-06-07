import React from 'react';
import { motion } from 'framer-motion';
import { Card as CardType, CardRarity } from '../types/card';
import '../styles/Card.css';

interface CardProps {
  card: CardType;
  isRevealing?: boolean;
  detailed?: boolean;
}

const CARD_INFO: Record<number, { name: string; color: string }> = {
  0: { name: "アイ", color: "#fff700" },
  1: { name: "夢幻", color: "#b19cd9" },
  2: { name: "光彩", color: "#ffd700" },
  3: { name: "中性子", color: "#cacfd2" },
  4: { name: "太陽", color: "#ff6b35" },
  5: { name: "夜空", color: "#1a1a2e" },
  6: { name: "雪", color: "#e3f2fd" },
  7: { name: "雷", color: "#ffd93d" },
  8: { name: "超究", color: "#6c5ce7" },
  9: { name: "剣", color: "#a8e6cf" },
  10: { name: "破壊", color: "#ff4757" },
  11: { name: "地球", color: "#4834d4" },
  12: { name: "天の川", color: "#9c88ff" },
  13: { name: "創造", color: "#00d2d3" },
  14: { name: "超新星", color: "#ff9ff3" },
  15: { name: "世界", color: "#54a0ff" },
};

export const Card: React.FC<CardProps> = ({ card, isRevealing = false, detailed = false }) => {
  const cardInfo = CARD_INFO[card.id] || { name: "Unknown", color: "#666" };
  const imageUrl = `https://git.syui.ai/ai/card/raw/branch/main/img/${card.id}.webp`;
  
  const getRarityClass = () => {
    switch (card.status) {
      case CardRarity.UNIQUE:
        return 'card-unique';
      case CardRarity.KIRA:
        return 'card-kira';
      case CardRarity.SUPER_RARE:
        return 'card-super-rare';
      case CardRarity.RARE:
        return 'card-rare';
      default:
        return 'card-normal';
    }
  };

  if (!detailed) {
    // Simple view - only image and frame
    return (
      <motion.div
        className={`card card-simple ${getRarityClass()}`}
        initial={isRevealing ? { rotateY: 180 } : {}}
        animate={isRevealing ? { rotateY: 0 } : {}}
        transition={{ duration: 0.8, type: "spring" }}
      >
        <div className="card-frame">
          <img 
            src={imageUrl} 
            alt={cardInfo.name}
            className="card-image-simple"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      </motion.div>
    );
  }

  // Detailed view - all information
  return (
    <motion.div
      className={`card ${getRarityClass()}`}
      initial={isRevealing ? { rotateY: 180 } : {}}
      animate={isRevealing ? { rotateY: 0 } : {}}
      transition={{ duration: 0.8, type: "spring" }}
      style={{
        '--card-color': cardInfo.color,
      } as React.CSSProperties}
    >
      <div className="card-inner">
        <div className="card-header">
          <span className="card-id">#{card.id}</span>
          <span className="card-cp">CP: {card.cp}</span>
        </div>
        
        <div className="card-image-container">
          <img 
            src={imageUrl} 
            alt={cardInfo.name}
            className="card-image"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        
        <div className="card-content">
          <h3 className="card-name">{cardInfo.name}</h3>
          {card.is_unique && (
            <div className="unique-badge">UNIQUE</div>
          )}
        </div>
        
        {card.skill && (
          <div className="card-skill">
            <p>{card.skill}</p>
          </div>
        )}
        
        <div className="card-footer">
          <span className="card-rarity">{card.status.toUpperCase()}</span>
        </div>
      </div>
    </motion.div>
  );
};