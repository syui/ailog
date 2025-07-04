import { useState } from 'react'
import { atproto, collections } from '../api/atproto.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { getErrorMessage, logError } from '../utils/errorHandler.js'
import { AIProviderFactory } from '../services/aiProvider.js'

export function useAskAI(adminData, userProfile, agent) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [chatHistory, setChatHistory] = useState([])
  
  // AIプロバイダーを環境変数から作成
  const aiProvider = AIProviderFactory.createFromEnv()

  const askQuestion = async (question) => {
    if (!question.trim()) return

    setLoading(true)
    setError(null)

    try {
      logger.log('Sending question to AI provider:', question)

      // AIプロバイダーに質問を送信
      const aiResponse = await aiProvider.ask(question, {
        userProfile: userProfile
      })
      
      logger.log('Received AI response:', aiResponse)

      // AI回答をチャット履歴に追加
      const chatEntry = {
        id: `chat-${Date.now()}`,
        question: question.trim(),
        answer: aiResponse.answer || 'エラーが発生しました',
        timestamp: new Date().toISOString(),
        user: userProfile ? {
          did: userProfile.did,
          handle: userProfile.handle,
          displayName: userProfile.displayName,
          avatar: userProfile.avatar
        } : null
      }

      setChatHistory(prev => [...prev, chatEntry])

      // atprotoにレコードを保存
      await saveChatRecord(chatEntry, aiResponse)

      // Dispatch event for blog communication
      window.dispatchEvent(new CustomEvent('aiResponseReceived', {
        detail: {
          question: chatEntry.question,
          answer: chatEntry.answer,
          timestamp: chatEntry.timestamp,
          aiProfile: adminData?.profile ? {
            did: adminData.did,
            handle: adminData.profile.handle,
            displayName: adminData.profile.displayName,
            avatar: adminData.profile.avatar
          } : null
        }
      }))

      return aiResponse

    } catch (err) {
      logError(err, 'useAskAI.askQuestion')
      
      let errorMessage = 'AI応答の生成に失敗しました'
      if (err.message.includes('Request timeout')) {
        errorMessage = 'AI応答がタイムアウトしました'
      } else if (err.message.includes('API error')) {
        errorMessage = `API エラー: ${err.message}`
      } else if (err.message.includes('Failed to fetch')) {
        errorMessage = 'AI サーバーに接続できませんでした'
      }
      
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const saveChatRecord = async (chatEntry, aiResponse) => {
    if (!agent || !adminData?.did) {
      logger.warn('Cannot save chat record: missing agent or admin data')
      return
    }

    try {
      const currentUrl = window.location.href
      const timestamp = chatEntry.timestamp
      const baseRkey = `${new Date(timestamp).toISOString().replace(/[:.]/g, '-').slice(0, -5)}Z`

      // Post metadata (共通)
      const postMetadata = {
        url: currentUrl,
        date: timestamp,
        slug: new URL(currentUrl).pathname.split('/').pop()?.replace(/\.html$/, '') || '',
        tags: [],
        title: document.title || 'AI Chat',
        language: 'ja'
      }

      // Question record (ユーザーの質問)
      const questionRecord = {
        repo: adminData.did,
        collection: `${env.collection}.chat`,
        rkey: baseRkey,
        record: {
          $type: `${env.collection}.chat`,
          post: postMetadata,
          text: chatEntry.question,
          type: 'question',
          author: chatEntry.user ? {
            did: chatEntry.user.did,
            handle: chatEntry.user.handle,
            displayName: chatEntry.user.displayName,
            avatar: chatEntry.user.avatar
          } : {
            did: 'unknown',
            handle: 'user',
            displayName: 'User',
            avatar: null
          },
          createdAt: timestamp
        }
      }

      // Answer record (AIの回答)
      const answerRecord = {
        repo: adminData.did,
        collection: `${env.collection}.chat`,
        rkey: `${baseRkey}-answer`,
        record: {
          $type: `${env.collection}.chat`,
          post: postMetadata,
          text: chatEntry.answer,
          type: 'answer',
          author: {
            did: adminData.did,
            handle: adminData.profile?.handle || 'ai',
            displayName: adminData.profile?.displayName || 'ai',
            avatar: adminData.profile?.avatar || null
          },
          createdAt: timestamp
        }
      }

      logger.log('Saving question record to atproto:', questionRecord)
      await atproto.putRecord(null, questionRecord, agent)

      logger.log('Saving answer record to atproto:', answerRecord)
      await atproto.putRecord(null, answerRecord, agent)

      // キャッシュを無効化
      collections.invalidateCache(env.collection)

      logger.log('Chat records saved successfully')

    } catch (err) {
      logError(err, 'useAskAI.saveChatRecord')
      // 保存エラーは致命的ではないので、UIエラーにはしない
    }
  }

  const clearChatHistory = () => {
    setChatHistory([])
    setError(null)
  }

  const loadChatHistory = async () => {
    if (!adminData?.did) return

    try {
      const records = await collections.getChat(
        adminData.apiConfig.pds,
        adminData.did,
        env.collection
      )

      // Group records by timestamp and create Q&A pairs
      const recordGroups = {}
      
      records.forEach(record => {
        const timestamp = record.value.createdAt
        const baseKey = timestamp.replace('-answer', '')
        
        if (!recordGroups[baseKey]) {
          recordGroups[baseKey] = {}
        }
        
        if (record.value.type === 'question') {
          recordGroups[baseKey].question = record.value.text
          recordGroups[baseKey].user = record.value.author
          recordGroups[baseKey].timestamp = timestamp
          recordGroups[baseKey].id = record.uri
        } else if (record.value.type === 'answer') {
          recordGroups[baseKey].answer = record.value.text
          recordGroups[baseKey].timestamp = timestamp
        }
      })

      // Convert to history format, only include complete Q&A pairs
      const history = Object.values(recordGroups)
        .filter(group => group.question && group.answer)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .slice(-10) // 最新10件のみ

      setChatHistory(history)
      logger.log('Chat history loaded:', history.length, 'entries')

    } catch (err) {
      logError(err, 'useAskAI.loadChatHistory')
      // 履歴読み込みエラーは致命的ではない
    }
  }

  return {
    askQuestion,
    loading,
    error,
    chatHistory,
    clearChatHistory,
    loadChatHistory
  }
}