import { logger } from './logger.js'

export class ATProtoError extends Error {
  constructor(message, status, context) {
    super(message)
    this.status = status
    this.context = context
    this.timestamp = new Date().toISOString()
  }
}

export function getErrorMessage(error) {
  if (!error) return '不明なエラー'
  
  if (error.status === 400) {
    return 'アカウントまたはレコードが見つかりません'
  } else if (error.status === 401) {
    return '認証が必要です。ログインしてください'
  } else if (error.status === 403) {
    return 'アクセス権限がありません'
  } else if (error.status === 429) {
    return 'アクセスが集中しています。しばらく待ってから再試行してください'
  } else if (error.status === 500) {
    return 'サーバーでエラーが発生しました'
  } else if (error.message?.includes('fetch')) {
    return 'ネットワーク接続を確認してください'
  } else if (error.message?.includes('timeout')) {
    return 'タイムアウトしました。再試行してください'
  }
  
  return `エラーが発生しました: ${error.message || '不明'}`
}

export function logError(error, context = 'Unknown') {
  const errorInfo = {
    context,
    message: error.message,
    status: error.status,
    timestamp: new Date().toISOString(),
    url: window.location.href
  }
  
  logger.error(`[ATProto Error] ${context}:`, errorInfo)
  
  // 本番環境では外部ログサービスに送信することも可能
  // if (import.meta.env.PROD) {
  //   sendToLogService(errorInfo)
  // }
}