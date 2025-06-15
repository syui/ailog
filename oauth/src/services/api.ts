import axios from 'axios';
import { CardDrawResult } from '../types/card';

// ai.card 直接APIアクセス（メイン）
const API_HOST = import.meta.env.VITE_API_HOST || '';
const API_BASE = import.meta.env.PROD && API_HOST ? `${API_HOST}/api/v1` : '/api/v1';

// ai.gpt MCP統合（オプション機能）
const AI_GPT_BASE = import.meta.env.VITE_ENABLE_AI_FEATURES === 'true' 
  ? (import.meta.env.PROD ? '/api/ai-gpt' : 'http://localhost:8001')
  : null;

const cardApi_internal = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

const aiGptApi = AI_GPT_BASE ? axios.create({
  baseURL: AI_GPT_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
}) : null;

// ai.cardの直接API（基本機能）
export const cardApi = {
  drawCard: async (userDid: string, isPaid: boolean = false): Promise<CardDrawResult> => {
    const response = await cardApi_internal.post('/cards/draw', {
      user_did: userDid,
      is_paid: isPaid,
    });
    return response.data;
  },

  getUserCards: async (userDid: string) => {
    const response = await cardApi_internal.get(`/cards/user/${userDid}`);
    return response.data;
  },

  getCardDetails: async (cardId: number) => {
    const response = await cardApi_internal.get(`/cards/${cardId}`);
    return response.data;
  },

  getUniqueCards: async () => {
    const response = await cardApi_internal.get('/cards/unique');
    return response.data;
  },

  getGachaStats: async () => {
    const response = await cardApi_internal.get('/cards/stats');
    return response.data;
  },

  // システム状態確認
  getSystemStatus: async () => {
    const response = await cardApi_internal.get('/health');
    return response.data;
  },
};

// ai.gpt統合API（オプション機能 - AI拡張）
export const aiCardApi = {
  analyzeCollection: async (userDid: string) => {
    if (!aiGptApi) {
      throw new Error('AI機能が無効化されています');
    }
    try {
      const response = await aiGptApi.get('/card_analyze_collection', {
        params: { did: userDid }
      });
      return response.data.data;
    } catch (error) {
      throw new Error('AI分析機能を利用するにはai.gptサーバーが必要です');
    }
  },

  getEnhancedStats: async () => {
    if (!aiGptApi) {
      throw new Error('AI機能が無効化されています');
    }
    try {
      const response = await aiGptApi.get('/card_get_gacha_stats');
      return response.data.data;
    } catch (error) {
      throw new Error('AI統計機能を利用するにはai.gptサーバーが必要です');
    }
  },

  // AI機能が利用可能かチェック
  isAIAvailable: async (): Promise<boolean> => {
    if (!aiGptApi || import.meta.env.VITE_ENABLE_AI_FEATURES !== 'true') {
      return false;
    }
    
    try {
      await aiGptApi.get('/health');
      return true;
    } catch (error) {
      return false;
    }
  },
};