// Logger utility with environment-based control
class Logger {
  constructor() {
    this.isDev = import.meta.env.DEV || false
    this.debugEnabled = import.meta.env.VITE_ENABLE_DEBUG === 'true'
    this.isEnabled = this.debugEnabled // Enable when debug flag is true (regardless of dev mode)
  }

  log(...args) {
    if (this.isEnabled) {
      console.log(...args)
    }
  }

  error(...args) {
    if (this.isEnabled) {
      console.error(...args)
    }
  }

  warn(...args) {
    if (this.isEnabled) {
      console.warn(...args)
    }
  }

  info(...args) {
    if (this.isEnabled) {
      console.info(...args)
    }
  }

  // グループログ
  group(label) {
    if (this.isEnabled) {
      console.group(label)
    }
  }

  groupEnd() {
    if (this.isEnabled) {
      console.groupEnd()
    }
  }

  // テーブル表示
  table(data) {
    if (this.isEnabled) {
      console.table(data)
    }
  }

  // 時間計測
  time(label) {
    if (this.isEnabled) {
      console.time(label)
    }
  }

  timeEnd(label) {
    if (this.isEnabled) {
      console.timeEnd(label)
    }
  }

  // ログを有効/無効にする
  enable() {
    this.isEnabled = true
  }

  disable() {
    this.isEnabled = false
  }
}

// シングルトンインスタンス
export const logger = new Logger()

// デバッグ有効時にグローバルアクセス可能にする
if (import.meta.env.VITE_ENABLE_DEBUG === 'true') {
  window._logger = logger
}