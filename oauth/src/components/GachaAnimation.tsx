import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './Card';
import { Card as CardType } from '../types/card';
import { atprotoOAuthService } from '../services/atproto-oauth';
import '../styles/GachaAnimation.css';

interface GachaAnimationProps {
  card: CardType;
  animationType: string;
  onComplete: () => void;
}

export const GachaAnimation: React.FC<GachaAnimationProps> = ({
  card,
  animationType,
  onComplete
}) => {
  const [phase, setPhase] = useState<'opening' | 'revealing' | 'complete'>('opening');
  const [showCard, setShowCard] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => setPhase('revealing'), 1500);
    const timer2 = setTimeout(() => {
      setPhase('complete');
      setShowCard(true);
    }, 3000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [onComplete]);

  const handleCardClick = () => {
    if (showCard) {
      onComplete();
    }
  };

  const handleSaveToCollection = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSharing) return;
    
    setIsSharing(true);
    try {
      await atprotoOAuthService.saveCardToCollection(card);
      alert('カードデータをatprotoコレクションに保存しました！');
    } catch (error) {
      // Failed to save card
      alert('保存に失敗しました。認証が必要かもしれません。');
    } finally {
      setIsSharing(false);
    }
  };

  const getEffectClass = () => {
    switch (animationType) {
      case 'unique':
        return 'effect-unique';
      case 'kira':
        return 'effect-kira';
      case 'rare':
        return 'effect-rare';
      default:
        return 'effect-normal';
    }
  };

  return (
    <div className={`gacha-container ${getEffectClass()}`} onClick={handleCardClick}>
      <AnimatePresence mode="wait">
        {phase === 'opening' && (
          <motion.div
            key="opening"
            className="gacha-opening"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.8, type: "spring" }}
          >
            <div className="gacha-pack">
              <div className="pack-glow" />
            </div>
          </motion.div>
        )}

        {phase === 'revealing' && (
          <motion.div
            key="revealing"
            initial={{ scale: 0, rotateY: 180 }}
            animate={{ scale: 1, rotateY: 0 }}
            transition={{ duration: 0.8, type: "spring" }}
          >
            <Card card={card} isRevealing={true} />
          </motion.div>
        )}

        {phase === 'complete' && showCard && (
          <motion.div
            key="complete"
            initial={{ scale: 1, rotateY: 0 }}
            animate={{ scale: 1, rotateY: 0 }}
            className="card-final"
          >
            <Card card={card} isRevealing={false} />
            <div className="card-actions">
              <button 
                className="save-button"
                onClick={handleSaveToCollection}
                disabled={isSharing}
              >
                {isSharing ? '保存中...' : '💾 atprotoに保存'}
              </button>
              <div className="click-hint">クリックして閉じる</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {animationType === 'unique' && (
        <div className="unique-effect">
          <div className="unique-particles" />
          <div className="unique-burst" />
        </div>
      )}
    </div>
  );
};