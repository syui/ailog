import React, { useState, useEffect } from 'react';
import { OAuthCallback } from './components/OAuthCallback';
import { authService, User } from './services/auth';
import { atprotoOAuthService } from './services/atproto-oauth';
import { appConfig } from './config/app';
import './App.css';

function App() {
  console.log('APP COMPONENT LOADED - Console working!');
  console.log('Current timestamp:', new Date().toISOString());
  
  // Immediately log URL information on every page load
  console.log('IMMEDIATE URL CHECK:');
  console.log('- href:', window.location.href);
  console.log('- pathname:', window.location.pathname); 
  console.log('- search:', window.location.search);
  console.log('- hash:', window.location.hash);
  
  // Also show URL info via alert if it contains OAuth parameters
  if (window.location.search.includes('code=') || window.location.search.includes('state=')) {
    const urlInfo = `OAuth callback detected!\n\nURL: ${window.location.href}\nSearch: ${window.location.search}`;
    alert(urlInfo);
    console.log('OAuth callback URL detected!');
  } else {
    // Check if we have stored OAuth info from previous steps
    const preOAuthUrl = sessionStorage.getItem('pre_oauth_url');
    const storedState = sessionStorage.getItem('oauth_state');
    const storedCodeVerifier = sessionStorage.getItem('oauth_code_verifier');
    
    console.log('=== OAUTH SESSION STORAGE CHECK ===');
    console.log('Pre-OAuth URL:', preOAuthUrl);
    console.log('Stored state:', storedState);
    console.log('Stored code verifier:', storedCodeVerifier ? 'Present' : 'Missing');
    console.log('=== END SESSION STORAGE CHECK ===');
  }
  
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handleInput, setHandleInput] = useState('');
  const [userListInput, setUserListInput] = useState('');
  const [isPostingUserList, setIsPostingUserList] = useState(false);
  const [userListRecords, setUserListRecords] = useState<any[]>([]);
  const [showJsonFor, setShowJsonFor] = useState<string | null>(null);

  useEffect(() => {
    // Setup Jetstream WebSocket for real-time comments (optional)
    const setupJetstream = () => {
      try {
        const ws = new WebSocket('wss://jetstream2.us-east.bsky.network/subscribe');
        
        ws.onopen = () => {
          console.log('Jetstream connected');
          ws.send(JSON.stringify({
            wantedCollections: [appConfig.collections.comment]
          }));
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.collection === appConfig.collections.comment && data.commit?.operation === 'create') {
              console.log('New comment detected via Jetstream:', data);
              // Optionally reload comments
              // loadAllComments(window.location.href);
            }
          } catch (err) {
            console.warn('Failed to parse Jetstream message:', err);
          }
        };
        
        ws.onerror = (err) => {
          console.warn('Jetstream error:', err);
        };
        
        return ws;
      } catch (err) {
        console.warn('Failed to setup Jetstream:', err);
        return null;
      }
    };
    
    // Jetstream + Cache example
    const jetstream = setupJetstream();
    
    // キャッシュからコメント読み込み
    const loadCachedComments = () => {
      const cached = localStorage.getItem('cached_comments_' + window.location.pathname);
      if (cached) {
        const { comments: cachedComments, timestamp } = JSON.parse(cached);
        // 5分以内のキャッシュなら使用
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          setComments(cachedComments);
          return true;
        }
      }
      return false;
    };
    
    // キャッシュがなければ、ATProtoから取得（認証状態に関係なく）
    if (!loadCachedComments()) {
      loadAllComments(); // URLフィルタリングを無効にして全コメント表示
    }

    // Handle popstate events for mock OAuth flow
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const isOAuthCallback = urlParams.has('code') && urlParams.has('state');
      
      if (isOAuthCallback) {
        // Force re-render to handle OAuth callback
        window.location.reload();
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Check if this is an OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const isOAuthCallback = urlParams.has('code') && urlParams.has('state');
    
    if (isOAuthCallback) {
      return; // Let OAuthCallback component handle this
    }

    // Check existing sessions
    const checkAuth = async () => {
      // First check OAuth session using official BrowserOAuthClient
      console.log('Checking OAuth session...');
      const oauthResult = await atprotoOAuthService.checkSession();
      console.log('OAuth checkSession result:', oauthResult);
      
      if (oauthResult) {
        console.log('OAuth session found:', oauthResult);
        // Ensure handle is not DID
        const handle = oauthResult.handle !== oauthResult.did ? oauthResult.handle : oauthResult.handle;
        
        // Get user profile including avatar
        const userProfile = await getUserProfile(oauthResult.did, handle);
        setUser(userProfile);
        
        // Load all comments for display (this will be the default view)
        // Temporarily disable URL filtering to see all comments
        loadAllComments();
        
        // Load user list records if admin
        if (userProfile.did === appConfig.adminDid) {
          loadUserListRecords();
        }
        
        setIsLoading(false);
        return;
      } else {
        console.log('No OAuth session found');
      }

      // Fallback to legacy auth
      const verifiedUser = await authService.verify();
      if (verifiedUser) {
        setUser(verifiedUser);
        
        // Load all comments for display (this will be the default view)
        // Temporarily disable URL filtering to see all comments
        loadAllComments();
        
        // Load user list records if admin
        if (verifiedUser.did === appConfig.adminDid) {
          loadUserListRecords();
        }
      }
      setIsLoading(false);
      
      // 認証状態に関係なく、コメントを読み込む
      loadAllComments();
    };

    checkAuth();

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const getUserProfile = async (did: string, handle: string): Promise<User> => {
    try {
      const agent = atprotoOAuthService.getAgent();
      if (agent) {
        const profile = await agent.getProfile({ actor: handle });
        return {
          did: did,
          handle: handle,
          avatar: profile.data.avatar,
          displayName: profile.data.displayName || handle
        };
      }
    } catch (error) {
      console.error('Failed to get user profile:', error);
    }
    
    // Fallback to basic user info
    return {
      did: did,
      handle: handle,
      avatar: generatePlaceholderAvatar(handle),
      displayName: handle
    };
  };

  const generatePlaceholderAvatar = (handle: string): string => {
    const initial = handle ? handle.charAt(0).toUpperCase() : 'U';
    return `https://via.placeholder.com/48x48/1185fe/ffffff?text=${initial}`;
  };

  const loadUserComments = async (did: string) => {
    try {
      console.log('Loading comments for DID:', did);
      const agent = atprotoOAuthService.getAgent();
      if (!agent) {
        console.log('No agent available');
        return;
      }

      // Get comments from current user
      const response = await agent.api.com.atproto.repo.listRecords({
        repo: did,
        collection: appConfig.collections.comment,
        limit: 100,
      });

      console.log('User comments loaded:', response.data);
      const userComments = response.data.records || [];
      
      // Enhance comments with profile information if missing
      const enhancedComments = await Promise.all(
        userComments.map(async (record) => {
          if (!record.value.author?.avatar && record.value.author?.handle) {
            try {
              const profile = await agent.getProfile({ actor: record.value.author.handle });
              return {
                ...record,
                value: {
                  ...record.value,
                  author: {
                    ...record.value.author,
                    avatar: profile.data.avatar,
                    displayName: profile.data.displayName || record.value.author.handle,
                  }
                }
              };
            } catch (err) {
              console.warn('Failed to enhance comment with profile:', err);
              return record;
            }
          }
          return record;
        })
      );
      
      setComments(enhancedComments);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setComments([]);
    }
  };

  // JSONからユーザーリストを取得
  const loadUsersFromRecord = async () => {
    try {
      // 管理者のユーザーリストを取得
      const adminDid = appConfig.adminDid;
      console.log('Fetching user list from admin DID:', adminDid);
      const response = await fetch(`https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(adminDid)}&collection=${encodeURIComponent(appConfig.collections.user)}&limit=100`);
      
      if (!response.ok) {
        console.warn('Failed to fetch user list from admin, using default users. Status:', response.status);
        return getDefaultUsers();
      }
      
      const data = await response.json();
      const userRecords = data.records || [];
      console.log('User records found:', userRecords.length);
      
      if (userRecords.length === 0) {
        console.log('No user records found, using default users');
        return getDefaultUsers();
      }
      
      // レコードからユーザーリストを構築し、プレースホルダーDIDを実際のDIDに解決
      const allUsers = [];
      for (const record of userRecords) {
        if (record.value.users) {
          // プレースホルダーDIDを実際のDIDに解決
          const resolvedUsers = await Promise.all(
            record.value.users.map(async (user) => {
              if (user.did && user.did.includes('-placeholder')) {
                console.log(`Resolving placeholder DID for ${user.handle}`);
                try {
                  const profileResponse = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(user.handle)}`);
                  if (profileResponse.ok) {
                    const profileData = await profileResponse.json();
                    if (profileData.did) {
                      console.log(`Resolved ${user.handle}: ${user.did} -> ${profileData.did}`);
                      return {
                        ...user,
                        did: profileData.did
                      };
                    }
                  }
                } catch (err) {
                  console.warn(`Failed to resolve DID for ${user.handle}:`, err);
                }
              }
              return user;
            })
          );
          allUsers.push(...resolvedUsers);
        }
      }
      
      console.log('Loaded and resolved users from admin records:', allUsers);
      return allUsers;
    } catch (err) {
      console.warn('Failed to load users from records, using defaults:', err);
      return getDefaultUsers();
    }
  };

  // ユーザーリスト一覧を読み込み
  const loadUserListRecords = async () => {
    try {
      console.log('Loading user list records...');
      const adminDid = appConfig.adminDid;
      const response = await fetch(`https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(adminDid)}&collection=${encodeURIComponent(appConfig.collections.user)}&limit=100`);
      
      if (!response.ok) {
        console.warn('Failed to fetch user list records');
        setUserListRecords([]);
        return;
      }
      
      const data = await response.json();
      const records = data.records || [];
      
      // 新しい順にソート
      const sortedRecords = records.sort((a, b) => 
        new Date(b.value.createdAt).getTime() - new Date(a.value.createdAt).getTime()
      );
      
      console.log(`Loaded ${sortedRecords.length} user list records`);
      setUserListRecords(sortedRecords);
    } catch (err) {
      console.error('Failed to load user list records:', err);
      setUserListRecords([]);
    }
  };

  const getDefaultUsers = () => {
    const defaultUsers = [
      // Default admin user
      { did: appConfig.adminDid, handle: 'syui.ai', pds: 'https://bsky.social' },
    ];
    
    // 現在ログインしているユーザーも追加（重複チェック）
    if (user && user.did && user.handle && !defaultUsers.find(u => u.did === user.did)) {
      defaultUsers.push({
        did: user.did,
        handle: user.handle,
        pds: user.handle.endsWith('.syu.is') ? 'https://syu.is' : 'https://bsky.social'
      });
    }
    
    console.log('Default users list (including current user):', defaultUsers);
    return defaultUsers;
  };

  // 新しい関数: 全ユーザーからコメントを収集
  const loadAllComments = async (pageUrl?: string) => {
    try {
      console.log('Loading comments from all users...');
      console.log('Page URL filter:', pageUrl);
      
      // ユーザーリストを動的に取得
      const knownUsers = await loadUsersFromRecord();
      console.log('Known users for comment fetching:', knownUsers);

      const allComments = [];

      // 各ユーザーからコメントを収集
      for (const user of knownUsers) {
        try {
          console.log(`Fetching comments from user: ${user.handle} (${user.did}) at ${user.pds}`);
          
          // Public API使用（認証不要）
          const response = await fetch(`${user.pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(user.did)}&collection=${encodeURIComponent(appConfig.collections.comment)}&limit=100`);
          
          if (!response.ok) {
            console.warn(`Failed to fetch from ${user.handle} (${response.status}): ${response.statusText}`);
            continue;
          }
          
          const data = await response.json();
          const userComments = data.records || [];
          console.log(`Found ${userComments.length} comments from ${user.handle}`);
          
          // ページURLでフィルタリング（指定された場合）
          const filteredComments = pageUrl 
            ? userComments.filter(record => record.value.url === pageUrl)
            : userComments;

          console.log(`After URL filtering (${pageUrl}): ${filteredComments.length} comments from ${user.handle}`);
          console.log('All comments from this user:', userComments.map(r => ({ url: r.value.url, text: r.value.text })));
          allComments.push(...filteredComments);
        } catch (err) {
          console.warn(`Failed to load comments from ${user.handle}:`, err);
        }
      }

      // 時間順にソート（新しい順）
      const sortedComments = allComments.sort((a, b) => 
        new Date(b.value.createdAt).getTime() - new Date(a.value.createdAt).getTime()
      );

      // プロフィール情報で拡張（認証なしでも取得可能）
      const enhancedComments = await Promise.all(
        sortedComments.map(async (record) => {
          if (!record.value.author?.avatar && record.value.author?.handle) {
            try {
              // Public API でプロフィール取得
              const profileResponse = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(record.value.author.handle)}`);
              
              if (profileResponse.ok) {
                const profileData = await profileResponse.json();
                return {
                  ...record,
                  value: {
                    ...record.value,
                    author: {
                      ...record.value.author,
                      avatar: profileData.avatar,
                      displayName: profileData.displayName || record.value.author.handle,
                    }
                  }
                };
              }
            } catch (err) {
              console.warn('Failed to enhance comment with profile:', err);
            }
          }
          return record;
        })
      );

      console.log(`Loaded ${enhancedComments.length} comments from all users`);
      
      // デバッグ情報を追加
      console.log('Final enhanced comments:', enhancedComments);
      console.log('Known users used:', knownUsers);
      
      setComments(enhancedComments);
      
      // キャッシュに保存（5分間有効）
      if (pageUrl) {
        const cacheKey = 'cached_comments_' + new URL(pageUrl).pathname;
        const cacheData = {
          comments: enhancedComments,
          timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      }
    } catch (err) {
      console.error('Failed to load all comments:', err);
      setComments([]);
    }
  };


  const handlePostComment = async () => {
    if (!user || !commentText.trim()) {
      return;
    }

    setIsPosting(true);
    setError(null);

    try {
      const agent = atprotoOAuthService.getAgent();
      if (!agent) {
        throw new Error('No agent available');
      }

      // Create comment record with post-specific rkey
      const now = new Date();
      // Use post rkey if on post page, otherwise use timestamp-based rkey
      const rkey = appConfig.rkey || now.toISOString().replace(/[:.]/g, '-');
      
      const record = {
        $type: appConfig.collections.comment,
        text: commentText,
        url: window.location.href,
        createdAt: now.toISOString(),
        author: {
          did: user.did,
          handle: user.handle,
          avatar: user.avatar,
          displayName: user.displayName || user.handle,
        },
      };

      // Post to ATProto with rkey
      const response = await agent.api.com.atproto.repo.putRecord({
        repo: user.did,
        collection: appConfig.collections.comment,
        rkey: rkey,
        record: record,
      });

      console.log('Comment posted:', response);

      // Clear form and reload all comments
      setCommentText('');
      await loadAllComments(window.location.href);
    } catch (err: any) {
      console.error('Failed to post comment:', err);
      setError('コメントの投稿に失敗しました: ' + err.message);
    } finally {
      setIsPosting(false);
    }
  };

  const handleDeleteComment = async (uri: string) => {
    if (!user) {
      alert('ログインが必要です');
      return;
    }

    if (!confirm('このコメントを削除しますか？')) {
      return;
    }

    try {
      const agent = atprotoOAuthService.getAgent();
      if (!agent) {
        throw new Error('No agent available');
      }

      // Extract rkey from URI: at://did:plc:xxx/ai.syui.log/rkey
      const uriParts = uri.split('/');
      const rkey = uriParts[uriParts.length - 1];
      
      console.log('Deleting comment with rkey:', rkey);

      // Delete the record
      await agent.api.com.atproto.repo.deleteRecord({
        repo: user.did,
        collection: appConfig.collections.comment,
        rkey: rkey,
      });

      console.log('Comment deleted successfully');

      // Reload all comments to reflect the deletion
      await loadAllComments(window.location.href);

    } catch (err: any) {
      console.error('Failed to delete comment:', err);
      alert('コメントの削除に失敗しました: ' + err.message);
    }
  };

  const handleLogout = async () => {
    // Logout from both services
    await authService.logout();
    atprotoOAuthService.logout();
    setUser(null);
    setComments([]);
  };

  // 管理者チェック
  const isAdmin = (user: User | null): boolean => {
    return user?.did === appConfig.adminDid;
  };

  // ユーザーリスト投稿
  const handlePostUserList = async () => {
    if (!user || !userListInput.trim()) {
      return;
    }

    if (!isAdmin(user)) {
      alert('管理者のみがユーザーリストを更新できます');
      return;
    }

    setIsPostingUserList(true);
    setError(null);

    try {
      const agent = atprotoOAuthService.getAgent();
      if (!agent) {
        throw new Error('No agent available');
      }

      // ユーザーリストをパース
      const userHandles = userListInput
        .split(',')
        .map(handle => handle.trim())
        .filter(handle => handle.length > 0);

      // ユーザーリストを各PDS用に分類し、実際のDIDを解決
      const users = await Promise.all(userHandles.map(async (handle) => {
        const pds = handle.endsWith('.syu.is') ? 'https://syu.is' : 'https://bsky.social';
        
        // 実際のDIDを解決
        let resolvedDid = `did:plc:${handle.replace(/\./g, '-')}-placeholder`; // フォールバック
        
        try {
          // Public APIでプロフィールを取得してDIDを解決
          const profileResponse = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            if (profileData.did) {
              resolvedDid = profileData.did;
              console.log(`Resolved ${handle} -> ${resolvedDid}`);
            }
          }
        } catch (err) {
          console.warn(`Failed to resolve DID for ${handle}:`, err);
        }
        
        return {
          handle: handle,
          pds: pds,
          did: resolvedDid
        };
      }));

      // Create user list record with ISO datetime rkey
      const now = new Date();
      const rkey = now.toISOString().replace(/[:.]/g, '-');
      
      const record = {
        $type: appConfig.collections.user,
        users: users,
        createdAt: now.toISOString(),
        updatedBy: {
          did: user.did,
          handle: user.handle,
        },
      };

      // Post to ATProto with rkey
      const response = await agent.api.com.atproto.repo.putRecord({
        repo: user.did,
        collection: appConfig.collections.user,
        rkey: rkey,
        record: record,
      });

      console.log('User list posted:', response);

      // Clear form and reload user list records
      setUserListInput('');
      loadUserListRecords();
      alert('ユーザーリストが更新されました');
    } catch (err: any) {
      console.error('Failed to post user list:', err);
      setError('ユーザーリストの投稿に失敗しました: ' + err.message);
    } finally {
      setIsPostingUserList(false);
    }
  };

  // ユーザーリスト削除
  const handleDeleteUserList = async (uri: string) => {
    if (!user || !isAdmin(user)) {
      alert('管理者のみがユーザーリストを削除できます');
      return;
    }

    if (!confirm('このユーザーリストを削除しますか？')) {
      return;
    }

    try {
      const agent = atprotoOAuthService.getAgent();
      if (!agent) {
        throw new Error('No agent available');
      }

      // Extract rkey from URI
      const uriParts = uri.split('/');
      const rkey = uriParts[uriParts.length - 1];
      
      console.log('Deleting user list with rkey:', rkey);

      // Delete the record
      await agent.api.com.atproto.repo.deleteRecord({
        repo: user.did,
        collection: appConfig.collections.user,
        rkey: rkey,
      });

      console.log('User list deleted successfully');
      loadUserListRecords();
      alert('ユーザーリストが削除されました');

    } catch (err: any) {
      console.error('Failed to delete user list:', err);
      alert('ユーザーリストの削除に失敗しました: ' + err.message);
    }
  };

  // JSON表示のトグル
  const toggleJsonDisplay = (uri: string) => {
    if (showJsonFor === uri) {
      setShowJsonFor(null);
    } else {
      setShowJsonFor(uri);
    }
  };

  // OAuth実行関数
  const executeOAuth = async () => {
    if (!handleInput.trim()) {
      alert('Please enter your Bluesky handle first');
      return;
    }
    try {
      await atprotoOAuthService.initiateOAuthFlow(handleInput);
    } catch (err) {
      console.error('OAuth failed:', err);
      alert('認証の開始に失敗しました。再度お試しください。');
    }
  };

  // ユーザーハンドルからプロフィールURLを生成
  const generateProfileUrl = (handle: string, did: string): string => {
    if (handle.endsWith('.syu.is')) {
      return `https://web.syu.is/profile/${did}`;
    } else {
      return `https://bsky.app/profile/${did}`;
    }
  };

  // Rkey-based comment filtering
  // If on post page (/posts/xxx.html), only show comments with rkey=xxx
  const shouldShowComment = (record: any): boolean => {
    // If not on a post page, show all comments
    if (!appConfig.rkey) {
      return true;
    }
    
    // Extract rkey from comment URI: at://did:plc:xxx/collection/rkey
    const uriParts = record.uri.split('/');
    const commentRkey = uriParts[uriParts.length - 1];
    
    // Show comment only if rkey matches current post
    return commentRkey === appConfig.rkey;
  };

  // OAuth callback is now handled by React Router in main.tsx
  console.log('=== APP.TSX URL CHECK ===');
  console.log('Full URL:', window.location.href);
  console.log('Pathname:', window.location.pathname);
  console.log('Search params:', window.location.search);
  console.log('=== END URL CHECK ===');


  return (
    <div className="app">

      <main className="app-main">
        <section className="comment-section">
          {/* Authentication Section */}
          {!user ? (
            <div className="auth-section">
              <button 
                onClick={executeOAuth}
                className="atproto-button"
              >
                atproto
              </button>
              <div className="username-input-section">
                <input 
                  type="text" 
                  placeholder="user.bsky.social" 
                  className="handle-input"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      executeOAuth();
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="user-section">
              <div className="user-info">
                <div className="user-profile">
                  <img 
                    src={user.avatar || generatePlaceholderAvatar(user.handle)} 
                    alt="User Avatar" 
                    className="user-avatar"
                  />
                  <div className="user-details">
                    <h3>{user.displayName || user.handle}</h3>
                    <p className="user-handle">@{user.handle}</p>
                    <p className="user-did">DID: {user.did}</p>
                  </div>
                </div>
                <button onClick={handleLogout} className="logout-button">
                  Logout
                </button>
              </div>

              {/* Admin Section - User Management */}
              {isAdmin(user) && (
                <div className="admin-section">
                  <h3>管理者機能 - ユーザーリスト管理</h3>
                  
                  {/* User List Form */}
                  <div className="user-list-form">
                    <textarea
                      value={userListInput}
                      onChange={(e) => setUserListInput(e.target.value)}
                      placeholder="ユーザーハンドルをカンマ区切りで入力&#10;例: syui.ai, yui.syui.ai, user.bsky.social"
                      rows={3}
                      disabled={isPostingUserList}
                    />
                    <div className="form-actions">
                      <span className="admin-hint">カンマ区切りでハンドルを入力してください</span>
                      <button 
                        onClick={handlePostUserList}
                        disabled={isPostingUserList || !userListInput.trim()}
                        className="post-button"
                      >
                        {isPostingUserList ? 'Posting...' : 'Post User List'}
                      </button>
                    </div>
                  </div>

                  {/* User List Records */}
                  <div className="user-list-records">
                    <h4>ユーザーリスト一覧 ({userListRecords.length}件)</h4>
                    {userListRecords.length === 0 ? (
                      <p className="no-user-lists">ユーザーリストが見つかりません</p>
                    ) : (
                      userListRecords.map((record, index) => (
                        <div key={index} className="user-list-item">
                          <div className="user-list-header">
                            <span className="user-list-date">
                              {new Date(record.value.createdAt).toLocaleString()}
                            </span>
                            <div className="user-list-actions">
                              <button 
                                onClick={() => toggleJsonDisplay(record.uri)}
                                className="json-button"
                                title="Show/Hide JSON"
                              >
                                {showJsonFor === record.uri ? '📄 Hide JSON' : '📄 Show JSON'}
                              </button>
                              <button 
                                onClick={() => handleDeleteUserList(record.uri)}
                                className="delete-button"
                                title="Delete user list"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                          <div className="user-list-content">
                            <div className="user-handles">
                              {record.value.users && record.value.users.map((user, userIndex) => (
                                <span key={userIndex} className="user-handle-tag">
                                  {user.handle}
                                  <small className="pds-info">({new URL(user.pds).hostname})</small>
                                </span>
                              ))}
                            </div>
                            <div className="user-list-meta">
                              <small>URI: {record.uri}</small>
                              <br />
                              <small>Updated by: {record.value.updatedBy?.handle || 'unknown'}</small>
                            </div>
                            
                            {/* JSON Display */}
                            {showJsonFor === record.uri && (
                              <div className="json-display">
                                <h5>JSON Record:</h5>
                                <pre className="json-content">
                                  {JSON.stringify(record, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Comments List */}
          <div className="comments-list">
            <div className="comments-header">
              <h3>Comments</h3>
            </div>
            {comments.filter(shouldShowComment).length === 0 ? (
              <p className="no-comments">
                {appConfig.rkey ? `No comments for this post yet` : `No comments yet`}
              </p>
            ) : (
              comments.filter(shouldShowComment).map((record, index) => (
                <div key={index} className="comment-item">
                  <div className="comment-header">
                    <img 
                      src={record.value.author?.avatar || generatePlaceholderAvatar(record.value.author?.handle || 'unknown')} 
                      alt="User Avatar" 
                      className="comment-avatar"
                    />
                    <div className="comment-author-info">
                      <span className="comment-author">
                        {record.value.author?.displayName || record.value.author?.handle || 'unknown'}
                      </span>
                      <a 
                        href={generateProfileUrl(record.value.author?.handle || '', record.value.author?.did || '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="comment-handle"
                      >
                        @{record.value.author?.handle || 'unknown'}
                      </a>
                    </div>
                    <span className="comment-date">
                      {new Date(record.value.createdAt).toLocaleString()}
                    </span>
                    {/* Show delete button only for current user's comments */}
                    {user && record.value.author?.did === user.did && (
                      <button 
                        onClick={() => handleDeleteComment(record.uri)}
                        className="delete-button"
                        title="Delete comment"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                  <div className="comment-content">
                    {record.value.text}
                  </div>
                  <div className="comment-meta">
                    <small>{record.uri}</small>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Comment Form - Only show on post pages */}
          {user && appConfig.rkey && (
            <div className="comment-form">
              <h3>Post a Comment</h3>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write your comment..."
                rows={4}
                disabled={isPosting}
              />
              <div className="form-actions">
                <span className="char-count">{commentText.length} / 1000</span>
                <button 
                  onClick={handlePostComment}
                  disabled={isPosting || !commentText.trim() || commentText.length > 1000}
                  className="post-button"
                >
                  {isPosting ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
              {error && <p className="error">{error}</p>}
            </div>
          )}

          {/* Show authentication status on non-post pages */}
          {user && !appConfig.rkey && (
            <div className="auth-status">
              <p>✅ Authenticated as @{user.handle}</p>
              <p><small>Visit a post page to comment</small></p>
            </div>
          )}
        </section>
      </main>

    </div>
  );
}

export default App;