import React, { useState, useEffect } from 'react';
import { OAuthCallback } from './components/OAuthCallback';
import { AIChat } from './components/AIChat';
import { authService, User } from './services/auth';
import { atprotoOAuthService } from './services/atproto-oauth';
import { appConfig, getCollectionNames } from './config/app';
import { getProfileForUser, detectPdsFromHandle, getApiUrlForUser, verifyPdsDetection, getNetworkConfigFromPdsEndpoint, getNetworkConfig } from './utils/pds-detection';
import './App.css';

function App() {
  // Handle OAuth callback detection
  if (window.location.search.includes('code=') || window.location.search.includes('state=')) {
    const urlInfo = `OAuth callback detected!\n\nURL: ${window.location.href}\nSearch: ${window.location.search}`;
    alert(urlInfo);
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
  const [activeTab, setActiveTab] = useState<'comments' | 'ai-chat' | 'lang-en' | 'ai-comment'>('comments');
  const [aiChatHistory, setAiChatHistory] = useState<any[]>([]);
  const [langEnRecords, setLangEnRecords] = useState<any[]>([]);
  const [aiCommentRecords, setAiCommentRecords] = useState<any[]>([]);
  const [aiProfile, setAiProfile] = useState<any>(null);

  useEffect(() => {
    // Setup Jetstream WebSocket for real-time comments (optional)
    const setupJetstream = () => {
      try {
        const ws = new WebSocket('wss://jetstream2.us-east.bsky.network/subscribe');
        
        const collections = getCollectionNames(appConfig.collections.base);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            wantedCollections: [collections.comment]
          }));
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.collection === collections.comment && data.commit?.operation === 'create') {
              // Optionally reload comments
              // loadAllComments(window.location.href);
            }
          } catch (err) {
            // Ignore parsing errors
          }
        };
        
        ws.onerror = (err) => {
          // Ignore Jetstream errors
        };
        
        return ws;
      } catch (err) {
        return null;
      }
    };
    
    // Jetstream + Cache example (disabled for now)
    // const jetstream = setupJetstream();
    
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
    
    // Load AI chat history (認証状態に関係なく、全ユーザーのチャット履歴を表示)
    loadAiChatHistory();
    
    // Load AI profile from handle
    const loadAiProfile = async () => {
      try {
        // Use VITE_AI_HANDLE to detect PDS and get profile
        const handle = appConfig.aiHandle;
        if (!handle) {
          throw new Error('No AI handle configured');
        }

        // Detect PDS: Use VITE_ATPROTO_PDS if handle matches admin/ai handles
        let pds;
        if (handle === appConfig.adminHandle || handle === appConfig.aiHandle) {
          // Use configured PDS for admin/ai handles
          pds = appConfig.atprotoPds || 'syu.is';
        } else {
          // Use handle-based detection for other handles
          pds = detectPdsFromHandle(handle);
        }
        
        const config = getNetworkConfigFromPdsEndpoint(`https://${pds}`);
        const apiEndpoint = config.bskyApi;

        // Get profile from appropriate bsky API
        const profileResponse = await fetch(`${apiEndpoint}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setAiProfile({
            did: profileData.did || appConfig.aiDid,
            handle: profileData.handle || handle,
            displayName: profileData.displayName || appConfig.aiDisplayName || 'ai',
            avatar: profileData.avatar || generatePlaceholderAvatar(handle),
            description: profileData.description || appConfig.aiDescription || ''
          });
        } else {
          // Fallback to config values
          setAiProfile({
            did: appConfig.aiDid,
            handle: handle,
            displayName: appConfig.aiDisplayName || 'ai',
            avatar: generatePlaceholderAvatar(handle),
            description: appConfig.aiDescription || ''
          });
        }
      } catch (err) {
        console.error('Failed to load AI profile:', err);
        // Fallback to config values
        setAiProfile({
          did: appConfig.aiDid,
          handle: appConfig.aiHandle,
          displayName: appConfig.aiDisplayName || 'ai',
          avatar: generatePlaceholderAvatar(appConfig.aiHandle || 'ai'),
          description: appConfig.aiDescription || ''
        });
      }
    };
    loadAiProfile();

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
      const oauthResult = await atprotoOAuthService.checkSession();
      
      if (oauthResult) {
        // Ensure handle is not DID
        const handle = oauthResult.handle !== oauthResult.did ? oauthResult.handle : oauthResult.handle;
        
        // Check if handle is allowed
        if (appConfig.allowedHandles.length > 0 && !appConfig.allowedHandles.includes(handle)) {
          console.warn(`Handle ${handle} is not in allowed list:`, appConfig.allowedHandles);
          setError(`Access denied: ${handle} is not authorized for this application.`);
          setIsLoading(false);
          return;
        }
        
        // Get user profile including avatar
        const userProfile = await getUserProfile(oauthResult.did, handle);
        setUser(userProfile);
        
        // Load all comments for display (this will be the default view)
        // Temporarily disable URL filtering to see all comments
        loadAllComments();
        
        // Load AI chat history
        loadAiChatHistory();
        
        // Load user list records if admin
        if (userProfile.did === appConfig.adminDid) {
          loadUserListRecords();
        }
        
        setIsLoading(false);
        return;
      }

      // Fallback to legacy auth
      const verifiedUser = await authService.verify();
      if (verifiedUser) {
        // Check if handle is allowed
        if (appConfig.allowedHandles.length > 0 && !appConfig.allowedHandles.includes(verifiedUser.handle)) {
          console.warn(`Handle ${verifiedUser.handle} is not in allowed list:`, appConfig.allowedHandles);
          setError(`Access denied: ${verifiedUser.handle} is not authorized for this application.`);
          setIsLoading(false);
          return;
        }
        
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
    
    // Load AI generated content (public)
    loadAIGeneratedContent();

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
      // Failed to get user profile
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
    const svg = `<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" fill="#1185fe"/>
      <text x="24" y="32" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="white" text-anchor="middle">${initial}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  const loadAiChatHistory = async () => {
    try {
      // Load all chat records from users in admin's user list
      const adminDid = appConfig.adminDid;
      const atprotoApi = appConfig.atprotoApi || 'https://bsky.social';
      const collections = getCollectionNames(appConfig.collections.base);
      
      // First, get user list from admin using their proper PDS
      let adminPdsEndpoint;
      try {
        const resolved = await import('./utils/pds-detection').then(m => m.resolvePdsFromRepo(adminDid));
        const config = await import('./utils/pds-detection').then(m => m.getNetworkConfigFromPdsEndpoint(resolved.pds));
        adminPdsEndpoint = config.pdsApi;
      } catch {
        adminPdsEndpoint = atprotoApi;
      }
      
      const userListResponse = await fetch(`${adminPdsEndpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(adminDid)}&collection=${encodeURIComponent(collections.user)}&limit=100`);
      
      if (!userListResponse.ok) {
        setAiChatHistory([]);
        return;
      }
      
      const userListData = await userListResponse.json();
      const userRecords = userListData.records || [];
      
      // Extract unique DIDs from user records (including admin DID for their own chats)
      const allUserDids = [];
      userRecords.forEach(record => {
        if (record.value.users && Array.isArray(record.value.users)) {
          record.value.users.forEach(user => {
            if (user.did) {
              allUserDids.push(user.did);
            }
          });
        }
      });
      
      // Always include admin DID to check admin's own chats
      allUserDids.push(adminDid);
      
      const userDids = [...new Set(allUserDids)];
      
      // Load chat records from all registered users (including admin) using per-user PDS detection
      const allChatRecords = [];
      for (const userDid of userDids) {
        try {
          // Use per-user PDS detection for each user's chat records
          let userPdsEndpoint;
          try {
            const resolved = await import('./utils/pds-detection').then(m => m.resolvePdsFromRepo(userDid));
            const config = await import('./utils/pds-detection').then(m => m.getNetworkConfigFromPdsEndpoint(resolved.pds));
            userPdsEndpoint = config.pdsApi;
          } catch {
            userPdsEndpoint = atprotoApi; // Fallback
          }
          
          const chatResponse = await fetch(`${userPdsEndpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(userDid)}&collection=${encodeURIComponent(collections.chat)}&limit=100`);
          
          if (chatResponse.ok) {
            const chatData = await chatResponse.json();
            const records = chatData.records || [];
            allChatRecords.push(...records);
          }
        } catch (err) {
          continue;
        }
      }
      
      // Filter for page-specific content if on a post page
      let filteredRecords = allChatRecords;
      if (appConfig.rkey) {
        // On post page: show only chats for this specific post
        filteredRecords = allChatRecords.filter(record => {
          const recordRkey = record.value.post?.url ? new URL(record.value.post.url).pathname.split('/').pop()?.replace(/\.html$/, '') : '';
          return recordRkey === appConfig.rkey;
        });
      } else {
        // On top page: show latest 3 records from all pages
        filteredRecords = allChatRecords.slice(0, 3);
      }
      
      // Filter out old records with invalid AI profile data (temporary fix for migration)
      const validRecords = filteredRecords.filter(record => {
        if (record.value.type === 'answer') {
          // This is an AI answer - check if it has valid AI profile
          return record.value.author?.handle && 
                 record.value.author?.handle !== 'ai-assistant' &&
                 record.value.author?.displayName !== 'AI Assistant';
        }
        return true; // Keep all questions
      });
      
      // Sort by creation time
      const sortedRecords = validRecords.sort((a, b) => 
        new Date(b.value.createdAt).getTime() - new Date(a.value.createdAt).getTime()
      );
      
      setAiChatHistory(sortedRecords);
    } catch (err) {
      setAiChatHistory([]);
    }
  };

  // Load AI generated content from admin DID
  const loadAIGeneratedContent = async () => {
    try {
      const adminDid = appConfig.adminDid;
      const atprotoApi = appConfig.atprotoApi || 'https://bsky.social';
      const collections = getCollectionNames(appConfig.collections.base);
      
      // Load lang:en records
      const langResponse = await fetch(`${atprotoApi}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(adminDid)}&collection=${encodeURIComponent(collections.chatLang)}&limit=100`);
      if (langResponse.ok) {
        const langData = await langResponse.json();
        const langRecords = langData.records || [];
        
        // Filter by current page rkey if on post page
        const filteredLangRecords = appConfig.rkey 
          ? langRecords.filter(record => {
              // Compare rkey only (last part of path)
              const recordRkey = record.value.post?.url ? new URL(record.value.post.url).pathname.split('/').pop()?.replace(/\.html$/, '') : '';
              return recordRkey === appConfig.rkey;
            })
          : langRecords.slice(0, 3); // Top page: latest 3
          
        setLangEnRecords(filteredLangRecords);
      }
      
      // Load AI comment records
      const commentResponse = await fetch(`${atprotoApi}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(adminDid)}&collection=${encodeURIComponent(collections.chatComment)}&limit=100`);
      if (commentResponse.ok) {
        const commentData = await commentResponse.json();
        const commentRecords = commentData.records || [];
        
        // Filter by current page rkey if on post page
        const filteredCommentRecords = appConfig.rkey 
          ? commentRecords.filter(record => {
              // Compare rkey only (last part of path)
              const recordRkey = record.value.post?.url ? new URL(record.value.post.url).pathname.split('/').pop()?.replace(/\.html$/, '') : '';
              return recordRkey === appConfig.rkey;
            })
          : commentRecords.slice(0, 3); // Top page: latest 3
          
        setAiCommentRecords(filteredCommentRecords);
      }
    } catch (err) {
      // Ignore errors
    }
  };

  const loadUserComments = async (did: string) => {
    try {
      const agent = atprotoOAuthService.getAgent();
      if (!agent) {
        return;
      }

      // Get comments from current user
      const response = await agent.api.com.atproto.repo.listRecords({
        repo: did,
        collection: getCollectionNames(appConfig.collections.base).comment,
        limit: 100,
      });
      const userComments = response.data.records || [];
      
      // Enhance comments with fresh profile information
      const enhancedComments = await Promise.all(
        userComments.map(async (record) => {
          if (record.value.author?.handle) {
            try {
              // Use existing PDS detection logic
              const handle = record.value.author.handle;
              const pds = detectPdsFromHandle(handle);
              const config = getNetworkConfigFromPdsEndpoint(`https://${pds}`);
              const apiEndpoint = config.bskyApi;
              
              const profileResponse = await fetch(`${apiEndpoint}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
              if (profileResponse.ok) {
                const profileData = await profileResponse.json();
                return {
                  ...record,
                  value: {
                    ...record.value,
                    author: {
                      ...record.value.author,
                      avatar: profileData.avatar,
                      displayName: profileData.displayName || handle,
                      _pdsEndpoint: `https://${pds}`, // Store PDS info for later use
                      _webUrl: config.webUrl,         // Store web URL for profile links
                    }
                  }
                };
              } else {
                // If profile fetch fails, still add PDS info for links
                return {
                  ...record,
                  value: {
                    ...record.value,
                    author: {
                      ...record.value.author,
                      _pdsEndpoint: `https://${pds}`,
                      _webUrl: config.webUrl,
                    }
                  }
                };
              }
            } catch (err) {
              // Ignore enhancement errors, use existing data
            }
          }
          return record;
        })
      );
      
      setComments(enhancedComments);
    } catch (err) {
      // Ignore load errors
      setComments([]);
    }
  };

  // JSONからユーザーリストを取得
  const loadUsersFromRecord = async () => {
    try {
      // 管理者のユーザーリストを取得 using proper PDS detection
      const adminDid = appConfig.adminDid;
      
      // Use per-user PDS detection for admin's records
      let adminPdsEndpoint;
      try {
        const resolved = await import('./utils/pds-detection').then(m => m.resolvePdsFromRepo(adminDid));
        const config = await import('./utils/pds-detection').then(m => m.getNetworkConfigFromPdsEndpoint(resolved.pds));
        adminPdsEndpoint = config.pdsApi;
      } catch {
        adminPdsEndpoint = 'https://bsky.social'; // Fallback
      }
      
      const response = await fetch(`${adminPdsEndpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(adminDid)}&collection=${encodeURIComponent(getCollectionNames(appConfig.collections.base).user)}&limit=100`);
      
      if (!response.ok) {
        // Failed to fetch user list from admin, using default users
        return getDefaultUsers();
      }
      
      const data = await response.json();
      const userRecords = data.records || [];
      // User records found
      
      if (userRecords.length === 0) {
        // No user records found, using default users
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
                // Resolving placeholder DID using proper PDS detection
                try {
                  const profile = await import('./utils/pds-detection').then(m => m.getProfileForUser(user.handle));
                  if (profile && profile.did) {
                    // Resolved DID
                    return {
                      ...user,
                      did: profile.did
                    };
                  }
                } catch (err) {
                  // Failed to resolve DID
                }
              }
              return user;
            })
          );
          allUsers.push(...resolvedUsers);
        }
      }
      
      // Loaded and resolved users from admin records
      return allUsers;
    } catch (err) {
      // Failed to load users from records, using defaults
      return getDefaultUsers();
    }
  };

  // ユーザーリスト一覧を読み込み
  const loadUserListRecords = async () => {
    try {
      // Loading user list records using proper PDS detection
      const adminDid = appConfig.adminDid;
      
      // Use per-user PDS detection for admin's records
      let adminPdsEndpoint;
      try {
        const resolved = await import('./utils/pds-detection').then(m => m.resolvePdsFromRepo(adminDid));
        const config = await import('./utils/pds-detection').then(m => m.getNetworkConfigFromPdsEndpoint(resolved.pds));
        adminPdsEndpoint = config.pdsApi;
      } catch {
        adminPdsEndpoint = 'https://bsky.social'; // Fallback
      }
      
      const response = await fetch(`${adminPdsEndpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(adminDid)}&collection=${encodeURIComponent(getCollectionNames(appConfig.collections.base).user)}&limit=100`);
      
      if (!response.ok) {
        // Failed to fetch user list records
        setUserListRecords([]);
        return;
      }
      
      const data = await response.json();
      const records = data.records || [];
      
      // 新しい順にソート
      const sortedRecords = records.sort((a, b) => 
        new Date(b.value.createdAt).getTime() - new Date(a.value.createdAt).getTime()
      );
      
      // Loaded user list records
      setUserListRecords(sortedRecords);
    } catch (err) {
      // Failed to load user list records
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
    
    // Default users list (including current user)
    return defaultUsers;
  };

  // 新しい関数: 全ユーザーからコメントを収集
  const loadAllComments = async (pageUrl?: string) => {
    try {
      
      // ユーザーリストを動的に取得
      const knownUsers = await loadUsersFromRecord();

      const allComments = [];

      // 各ユーザーからコメントを収集
      for (const user of knownUsers) {
        try {
          
          // Use per-user PDS detection for repo operations
          let pdsEndpoint;
          try {
            const resolved = await import('./utils/pds-detection').then(m => m.resolvePdsFromRepo(user.did));
            const config = await import('./utils/pds-detection').then(m => m.getNetworkConfigFromPdsEndpoint(resolved.pds));
            pdsEndpoint = config.pdsApi;
          } catch {
            // Fallback to user.pds if PDS detection fails
            pdsEndpoint = user.pds;
          }
          
          const collections = getCollectionNames(appConfig.collections.base);
          const response = await fetch(`${pdsEndpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(user.did)}&collection=${encodeURIComponent(collections.comment)}&limit=100`);
          
          if (!response.ok) {
            continue;
          }
          
          const data = await response.json();
          const userRecords = data.records || [];
          
          // Flatten comments from new array format
          const userComments = [];
          for (const record of userRecords) {
            if (record.value.comments && Array.isArray(record.value.comments)) {
              // New format: array of comments
              for (const comment of record.value.comments) {
                userComments.push({
                  ...record,
                  value: comment,
                  originalRecord: record // Keep reference to original record
                });
              }
            } else if (record.value.text) {
              // Old format: single comment
              userComments.push(record);
            }
          }
          
          
          // ページpathでフィルタリング（指定された場合）
          const filteredComments = pageUrl && appConfig.rkey
            ? userComments.filter(record => {
                try {
                  // Compare rkey only (last part of path)
                  const recordRkey = record.value.url ? new URL(record.value.url).pathname.split('/').pop() : '';
                  return recordRkey === appConfig.rkey;
                } catch (err) {
                  return false;
                }
              })
            : userComments;

          allComments.push(...filteredComments);
        } catch (err) {
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
              // Use per-user PDS detection for profile fetching
              const profile = await import('./utils/pds-detection').then(m => m.getProfileForUser(record.value.author.handle));
              
              if (profile) {
                return {
                  ...record,
                  value: {
                    ...record.value,
                    author: {
                      ...record.value.author,
                      avatar: profile.avatar,
                      displayName: profile.displayName || record.value.author.handle,
                    }
                  }
                };
              }
            } catch (err) {
              // Ignore enhancement errors
            }
          }
          return record;
        })
      );

      
      // デバッグ情報を追加
      
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
      
      const newComment = {
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

      // Check if record with this rkey already exists
      let existingComments = [];
      try {
        const existingResponse = await agent.api.com.atproto.repo.getRecord({
          repo: user.did,
          collection: getCollectionNames(appConfig.collections.base).comment,
          rkey: rkey,
        });
        
        // Handle both old single comment format and new array format
        if (existingResponse.data.value.comments) {
          // New format: array of comments
          existingComments = existingResponse.data.value.comments;
        } else if (existingResponse.data.value.text) {
          // Old format: single comment, convert to array
          existingComments = [{
            text: existingResponse.data.value.text,
            url: existingResponse.data.value.url,
            createdAt: existingResponse.data.value.createdAt,
            author: existingResponse.data.value.author,
          }];
        }
      } catch (err) {
        // Record doesn't exist yet, that's fine
      }

      // Add new comment to the array
      existingComments.push(newComment);

      // Create the record with comments array
      const record = {
        $type: getCollectionNames(appConfig.collections.base).comment,
        comments: existingComments,
        url: window.location.href,
        createdAt: now.toISOString(), // Latest update time
      };

      // Post to ATProto with rkey
      const response = await agent.api.com.atproto.repo.putRecord({
        repo: user.did,
        collection: getCollectionNames(appConfig.collections.base).comment,
        rkey: rkey,
        record: record,
      });


      // Clear form and reload all comments
      setCommentText('');
      await loadAllComments(window.location.href);
    } catch (err: any) {
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
      

      // Delete the record
      await agent.api.com.atproto.repo.deleteRecord({
        repo: user.did,
        collection: getCollectionNames(appConfig.collections.base).comment,
        rkey: rkey,
      });


      // Reload all comments to reflect the deletion
      await loadAllComments(window.location.href);

    } catch (err: any) {
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
          const profileResponse = await fetch(`${appConfig.bskyPublicApi}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            if (profileData.did) {
              resolvedDid = profileData.did;
            }
          }
        } catch (err) {
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
        $type: getCollectionNames(appConfig.collections.base).user,
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
        collection: getCollectionNames(appConfig.collections.base).user,
        rkey: rkey,
        record: record,
      });


      // Clear form and reload user list records
      setUserListInput('');
      loadUserListRecords();
      alert('ユーザーリストが更新されました');
    } catch (err: any) {
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
      

      // Delete the record
      await agent.api.com.atproto.repo.deleteRecord({
        repo: user.did,
        collection: getCollectionNames(appConfig.collections.base).user,
        rkey: rkey,
      });

      loadUserListRecords();
      alert('ユーザーリストが削除されました');

    } catch (err: any) {
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
      alert('認証の開始に失敗しました。再度お試しください。');
    }
  };

  // ユーザーハンドルからプロフィールURLを生成
  const generateProfileUrl = (author: any): string => {
    // Use stored PDS info if available (from comment enhancement)
    if (author._webUrl) {
      return `${author._webUrl}/profile/${author.did}`;
    }
    
    // Fallback to handle-based detection
    const pds = detectPdsFromHandle(author.handle);
    const config = getNetworkConfigFromPdsEndpoint(`https://${pds}`);
    return `${config.webUrl}/profile/${author.did}`;
  };

  // Rkey-based comment filtering
  // If on post page (/posts/xxx.html), only show comments with rkey=xxx
  const shouldShowComment = (record: any): boolean => {
    // If not on a post page, show all comments
    if (!appConfig.rkey) {
      return true;
    }
    
    // Extract rkey from comment URI: at://did:plc:xxx/collection/rkey
    // Handle both original records and flattened records from new array format
    const uri = record.uri || record.originalRecord?.uri;
    if (!uri) {
      return false;
    }
    
    const uriParts = uri.split('/');
    const commentRkey = uriParts[uriParts.length - 1];
    
    // Show comment only if rkey matches current post
    return commentRkey === appConfig.rkey;
  };

  // OAuth callback is now handled by React Router in main.tsx

  // Unified rendering function for AI content
  const renderAIContent = (record: any, index: number, className: string) => {
    // Handle both new format (record.value.$type) and old format compatibility
    const value = record.value;
    const isNewFormat = value.$type && value.post && value.author;
    
    // Extract content based on format
    const contentText = isNewFormat ? value.text : (value.content || value.body || '');
    const authorInfo = isNewFormat ? value.author : null;
    const postInfo = isNewFormat ? value.post : null;
    const contentType = value.type || 'unknown';
    const createdAt = value.createdAt || value.generated_at || '';
    
    return (
      <div key={index} className={className}>
        <div className="comment-header">
          <img 
            src={authorInfo?.avatar || generatePlaceholderAvatar('AI')} 
            alt="AI Avatar" 
            className="comment-avatar"
            ref={(img) => {
              // For old format, try to fetch from ai_did
              if (img && !isNewFormat && value.ai_did) {
                fetch(`${appConfig.bskyPublicApi}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(value.ai_did)}`)
                  .then(res => res.json())
                  .then(data => {
                    if (data.avatar && img) {
                      img.src = data.avatar;
                    }
                  })
                  .catch(err => {
                    // Keep placeholder on error
                  });
              }
            }}
          />
          <div className="comment-author-info">
            <span className="comment-author">
              {authorInfo?.displayName || 'AI'}
            </span>
            <span className="comment-handle">
              @{authorInfo?.handle || aiProfile?.handle || 'yui.syui.ai'}
            </span>
          </div>
          <span className="comment-date">
            {new Date(createdAt).toLocaleString()}
          </span>
          <div className="comment-actions">
            <button 
              onClick={() => toggleJsonDisplay(record.uri)}
              className="json-button"
              title="Show/Hide JSON"
            >
              {showJsonFor === record.uri ? 'Hide' : 'JSON'}
            </button>
          </div>
        </div>
        
        <div className="comment-meta">
          {(postInfo?.url || value.post_url) && (
            <small>
              <a href={postInfo?.url || value.post_url}>
                {postInfo?.url || value.post_url}
              </a>
            </small>
          )}
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
        
        <div className="comment-content">
          {contentText?.split('\n').map((line: string, index: number) => (
            <React.Fragment key={index}>
              {line}
              {index < contentText.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };
  
  const getTypeLabel = (collectionType: string, contentType: string) => {
    if (!collectionType) return contentType;
    
    const collections = getCollectionNames(appConfig.collections.base);
    
    if (collectionType === collections.chat) {
      return contentType === 'question' ? '質問' : '回答';
    }
    if (collectionType === collections.chatLang) {
      return `翻訳: ${contentType.toUpperCase()}`;
    }
    if (collectionType === collections.chatComment) {
      return `AI ${contentType}`;
    }
    return contentType;
  };

  return (
    <div className="app">

      <main className="app-main">
        <section className="comment-section">
          {/* Authentication Section */}
          {!user ? (
            <div className="auth-section search-bar-layout">
              <input 
                type="text" 
                id="handle-input"
                name="handle"
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
              <button 
                onClick={executeOAuth}
                className="atproto-button"
              >
                <i class="fab fa-bluesky"></i>
              </button>
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
                    <p className="user-did">{user.did}</p>
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
                      id="user-list-input"
                      name="userList"
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
                                {showJsonFor === record.uri ? 'Hide JSON' : 'Show JSON'}
                              </button>
                              <button 
                                onClick={() => handleDeleteUserList(record.uri)}
                                className="delete-button"
                                title="Delete user list"
                              >
                                Delete
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

          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button 
              className={`tab-button ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              comment ({comments.filter(shouldShowComment).length})
            </button>
            <button 
              className={`tab-button ${activeTab === 'ai-chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai-chat')}
            >
              chat ({aiChatHistory.length})
            </button>
            <button 
              className={`tab-button ${activeTab === 'lang-en' ? 'active' : ''}`}
              onClick={() => setActiveTab('lang-en')}
            >
              en ({langEnRecords.length})
            </button>
            <button 
              className={`tab-button ${activeTab === 'ai-comment' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai-comment')}
            >
              feedback ({aiCommentRecords.length})
            </button>
          </div>

          {/* Comments List */}
          {activeTab === 'comments' && (
            <div className="comments-list">
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
                        href={generateProfileUrl(record.value.author)}
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
                    <div className="comment-actions">
                      <button 
                        onClick={() => toggleJsonDisplay(record.uri)}
                        className="json-button"
                        title="Show/Hide JSON"
                      >
                        {showJsonFor === record.uri ? 'Hide' : 'JSON'}
                      </button>
                      {/* Show delete button only for current user's comments */}
                      {user && record.value.author?.did === user.did && (
                        <button 
                          onClick={() => handleDeleteComment(record.uri)}
                          className="delete-button"
                          title="Delete comment"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="comment-meta">
                    {record.value.url && (
                      <small><a href={record.value.url}>{record.value.url}</a></small>
                    )}
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
                  
                  <div className="comment-content">
                    {record.value.text?.split('\n').map((line: string, index: number) => (
                      <React.Fragment key={index}>
                        {line}
                        {index < record.value.text.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))
            )}
            </div>
          )}

          {/* AI Chat History List */}
          {activeTab === 'ai-chat' && (
            <div className="comments-list">
              {aiChatHistory.length === 0 ? (
                <p className="no-chat">No AI conversations yet. Start chatting with Ask AI!</p>
              ) : (
                aiChatHistory.map((record, index) => {
                  // For AI responses, use AI DID; for user questions, use the actual author
                  const isAiResponse = record.value.type === 'answer';
                  const displayDid = isAiResponse ? appConfig.aiDid : record.value.author?.did;
                  const displayHandle = isAiResponse ? (aiProfile?.handle || 'yui.syui.ai') : record.value.author?.handle;
                  const displayName = isAiResponse ? 'AI' : (record.value.author?.displayName || record.value.author?.handle);
                  
                  return (
                    <div key={index} className="comment-item">
                      <div className="comment-header">
                        <img 
                          src={generatePlaceholderAvatar(displayHandle || 'unknown')} 
                          alt={isAiResponse ? "AI Avatar" : "User Avatar"} 
                          className="comment-avatar"
                          ref={(img) => {
                            // Fetch fresh avatar from API when component mounts
                            if (img && displayDid) {
                              fetch(`${appConfig.bskyPublicApi}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(displayDid)}`)
                                .then(res => res.json())
                                .then(data => {
                                  if (data.avatar && img) {
                                    img.src = data.avatar;
                                  }
                                })
                                .catch(err => {
                                  // Keep placeholder on error
                                });
                            }
                          }}
                        />
                        <div className="comment-author-info">
                          <span className="comment-author">
                            {displayName || 'unknown'}
                          </span>
                          <a 
                            href={generateProfileUrl({ handle: displayHandle, did: displayDid })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="comment-handle"
                          >
                            @{displayHandle || 'unknown'}
                          </a>
                        </div>
                      <span className="comment-date">
                        {new Date(record.value.createdAt).toLocaleString()}
                      </span>
                      <div className="comment-actions">
                        <button 
                          onClick={() => toggleJsonDisplay(record.uri)}
                          className="json-button"
                          title="Show/Hide JSON"
                        >
                          {showJsonFor === record.uri ? 'Hide' : 'JSON'}
                        </button>
                        <button className="chat-type-button">
                          {record.value.type === 'question' ? 'Question' : 'Answer'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="comment-meta">
                      {record.value.post?.url && (
                        <small><a href={record.value.post.url}>{record.value.post.url}</a></small>
                      )}
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
                    
                    <div className="comment-content">
                      {record.value.text?.split('\n').map((line: string, index: number) => (
                        <React.Fragment key={index}>
                          {line}
                          {index < record.value.text.split('\n').length - 1 && <br />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          )}

          {/* Lang: EN List */}
          {activeTab === 'lang-en' && (
            <div className="comments-list">
              {langEnRecords.length === 0 ? (
                <p className="no-content">No English translations yet</p>
              ) : (
                langEnRecords.map((record, index) => 
                  renderAIContent(record, index, 'lang-item')
                )
              )}
            </div>
          )}

          {/* AI Comment List */}
          {activeTab === 'ai-comment' && (
            <div className="comments-list">
              {aiCommentRecords.length === 0 ? (
                <p className="no-content">No AI comments yet</p>
              ) : (
                aiCommentRecords.map((record, index) => (
                  <div key={index} className="comment-item">
                    <div className="comment-header">
                      <img 
                        src={generatePlaceholderAvatar('ai')} 
                        alt="AI Avatar" 
                        className="comment-avatar"
                        ref={(img) => {
                          // Fetch AI avatar
                          if (img && appConfig.aiDid) {
                            fetch(`${appConfig.bskyPublicApi}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(appConfig.aiDid)}`)
                              .then(res => res.json())
                              .then(data => {
                                if (data.avatar && img) {
                                  img.src = data.avatar;
                                }
                              })
                              .catch(err => {
                                // Keep placeholder on error
                              });
                          }
                        }}
                      />
                      <div className="comment-author-info">
                        <span className="comment-author">
                          AI
                        </span>
                        <span className="comment-handle">
                          @{aiProfile?.handle || 'yui.syui.ai'}
                        </span>
                      </div>
                      <span className="comment-date">
                        {new Date(record.value.createdAt || record.value.generated_at).toLocaleString()}
                      </span>
                      <div className="comment-actions">
                        <button 
                          onClick={() => toggleJsonDisplay(record.uri)}
                          className="json-button"
                          title="Show/Hide JSON"
                        >
                          {showJsonFor === record.uri ? 'Hide' : 'JSON'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="comment-meta">
                      {(record.value.post?.url || record.value.post_url) && (
                        <small><a href={record.value.post?.url || record.value.post_url}>{record.value.post?.url || record.value.post_url}</a></small>
                      )}
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
                    
                    <div className="comment-content">
                      {(record.value.text || record.value.comment)?.split('\n').map((line: string, index: number) => (
                        <React.Fragment key={index}>
                          {line}
                          {index < (record.value.text || record.value.comment)?.split('\n').length - 1 && <br />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Comment Form - Only show on post pages when Comments tab is active */}
          {user && appConfig.rkey && activeTab === 'comments' && (
            <div className="comment-form">
              <textarea
                id="comment-text"
                name="commentText"
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

        </section>
      </main>

      {/* AI Chat Component - handles all AI functionality */}
      <AIChat user={user} isEnabled={appConfig.aiEnabled && appConfig.aiAskAi} />
    </div>
  );
}

export default App;
