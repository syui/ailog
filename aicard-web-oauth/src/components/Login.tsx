import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { authService } from '../services/auth';
import { atprotoOAuthService } from '../services/atproto-oauth';
import '../styles/Login.css';

interface LoginProps {
  onLogin: (did: string, handle: string) => void;
  onClose: () => void;
  defaultHandle?: string;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onClose, defaultHandle }) => {
  const [loginMode, setLoginMode] = useState<'oauth' | 'legacy'>('oauth');
  const [identifier, setIdentifier] = useState(defaultHandle || '');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOAuthLogin = async () => {
    setError(null);
    setIsLoading(true);

    try {
      // Prompt for handle if not provided
      const handle = identifier.trim() || undefined;
      await atprotoOAuthService.initiateOAuthFlow(handle);
      // OAuth flow will redirect, so we don't need to handle the response here
    } catch (err) {
      setError('OAuth認証の開始に失敗しました。');
      setIsLoading(false);
    }
  };

  const handleLegacyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await authService.login(identifier, password);
      onLogin(response.did, response.handle);
    } catch (err) {
      setError('ログインに失敗しました。認証情報を確認してください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      className="login-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="login-modal"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", duration: 0.5 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>atprotoログイン</h2>
        
        <div className="login-mode-selector">
          <button
            type="button"
            className={`mode-button ${loginMode === 'oauth' ? 'active' : ''}`}
            onClick={() => setLoginMode('oauth')}
          >
            OAuth 2.1 (推奨)
          </button>
          <button
            type="button"
            className={`mode-button ${loginMode === 'legacy' ? 'active' : ''}`}
            onClick={() => setLoginMode('legacy')}
          >
            アプリパスワード
          </button>
        </div>

        {loginMode === 'oauth' ? (
          <div className="oauth-login">
            <div className="oauth-info">
              <h3>🔐 OAuth 2.1 認証</h3>
              <p>
                より安全で標準準拠の認証方式です。
                ブラウザが一時的にatproto認証サーバーにリダイレクトされます。
              </p>
              {(window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') && (
                <div className="dev-notice">
                  <small>🛠️ 開発環境: モック認証を使用します（実際のBlueskyにはアクセスしません）</small>
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="oauth-identifier">Bluesky Handle</label>
              <input
                id="oauth-identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="your.handle.bsky.social"
                required
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <div className="button-group">
              <button
                type="button"
                className="oauth-login-button"
                onClick={handleOAuthLogin}
                disabled={isLoading || !identifier.trim()}
              >
                {isLoading ? '認証開始中...' : 'atprotoで認証'}
              </button>
              <button
                type="button"
                className="cancel-button"
                onClick={onClose}
                disabled={isLoading}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLegacyLogin}>
            <div className="form-group">
              <label htmlFor="identifier">ハンドル または DID</label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="your.handle または did:plc:..."
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">アプリパスワード</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="アプリパスワード"
                required
                disabled={isLoading}
              />
              <small>
                メインパスワードではなく、
                <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer">
                  アプリパスワード
                </a>
                を使用してください
              </small>
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <div className="button-group">
              <button
                type="submit"
                className="login-button"
                disabled={isLoading}
              >
                {isLoading ? 'ログイン中...' : 'ログイン'}
              </button>
              <button
                type="button"
                className="cancel-button"
                onClick={onClose}
                disabled={isLoading}
              >
                キャンセル
              </button>
            </div>
          </form>
        )}

        <div className="login-info">
          <p>
            ai.logはatprotoアカウントを使用します。
            コメントはあなたのPDSに保存されます。
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};