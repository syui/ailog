import React, { useState, useEffect } from 'react';
import { User } from '../services/auth';
import { atprotoOAuthService } from '../services/atproto-oauth';
import { appConfig, getCollectionNames } from '../config/app';

interface AIChatProps {
  user: User | null;
  isEnabled: boolean;
}

export const AIChat: React.FC<AIChatProps> = ({ user, isEnabled }) => {
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiProfile, setAiProfile] = useState<any>(null);
  
  // Get AI settings from appConfig (unified configuration)
  const aiConfig = {
    enabled: appConfig.aiEnabled,
    askAi: appConfig.aiAskAi,
    provider: appConfig.aiProvider,
    model: appConfig.aiModel,
    host: appConfig.aiHost,
    systemPrompt: appConfig.aiSystemPrompt,
    aiDid: appConfig.aiDid,
    bskyPublicApi: appConfig.bskyPublicApi,
  };

  // Fetch AI profile on load
  useEffect(() => {
    const fetchAIProfile = async () => {
      if (!aiConfig.aiDid) {
        return;
      }
      
      try {
        // Try with agent first
        const agent = atprotoOAuthService.getAgent();
        if (agent) {
          const profile = await agent.getProfile({ actor: aiConfig.aiDid });
          const profileData = {
            did: aiConfig.aiDid,
            handle: profile.data.handle,
            displayName: profile.data.displayName,
            avatar: profile.data.avatar,
            description: profile.data.description
          };
          setAiProfile(profileData);
          
          // Dispatch event to update Ask AI button
          window.dispatchEvent(new CustomEvent('aiProfileLoaded', { detail: profileData }));
          return;
        }
        
        // Fallback to public API
        const response = await fetch(`${aiConfig.bskyPublicApi}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(aiConfig.aiDid)}`);
        if (response.ok) {
          const profileData = await response.json();
          const profile = {
            did: aiConfig.aiDid,
            handle: profileData.handle,
            displayName: profileData.displayName,
            avatar: profileData.avatar,
            description: profileData.description
          };
          setAiProfile(profile);
          
          // Dispatch event to update Ask AI button
          window.dispatchEvent(new CustomEvent('aiProfileLoaded', { detail: profile }));
          return;
        }
      } catch (error) {
        setAiProfile(null);
      }
    };

    fetchAIProfile();
  }, [aiConfig.aiDid]);

  useEffect(() => {
    if (!isEnabled || !aiConfig.askAi) return;

    // Listen for AI question posts from base.html
    const handleAIQuestion = async (event: any) => {
      if (!user || !event.detail || !event.detail.question || isProcessing || !aiProfile) return;
      
      setIsProcessing(true);
      try {
        await postQuestionAndGenerateResponse(event.detail.question);
      } finally {
        setIsProcessing(false);
      }
    };

    // Add listener with a small delay to ensure it's ready
    setTimeout(() => {
      window.addEventListener('postAIQuestion', handleAIQuestion);
      
      // Notify that AI is ready
      window.dispatchEvent(new CustomEvent('aiChatReady'));
    }, 100);

    return () => {
      window.removeEventListener('postAIQuestion', handleAIQuestion);
    };
  }, [user, isEnabled, isProcessing, aiProfile]);

  const postQuestionAndGenerateResponse = async (question: string) => {
    if (!user || !aiConfig.askAi || !aiProfile) return;

    setIsLoading(true);
    
    try {
      const agent = atprotoOAuthService.getAgent();
      if (!agent) throw new Error('No agent available');

      // Get collection names
      const collections = getCollectionNames(appConfig.collections.base);

      // 1. Post question to ATProto
      const now = new Date();
      const rkey = now.toISOString().replace(/[:.]/g, '-');
      
      // Extract post metadata from current page
      const currentUrl = window.location.href;
      const postSlug = currentUrl.match(/\/posts\/([^/]+)/)?.[1] || '';
      const postTitle = document.title.replace(' - syui.ai', '') || '';
      
      const questionRecord = {
        $type: collections.chat,
        post: {
          url: currentUrl,
          slug: postSlug,
          title: postTitle,
          date: new Date().toISOString(),
          tags: [],
          language: "ja"
        },
        type: "question",
        text: question,
        author: {
          did: user.did,
          handle: user.handle,
          avatar: user.avatar,
          displayName: user.displayName || user.handle,
        },
        createdAt: now.toISOString(),
      };

      await agent.api.com.atproto.repo.putRecord({
        repo: user.did,
        collection: collections.chat,
        rkey: rkey,
        record: questionRecord,
      });

      // 2. Get chat history
      const chatRecords = await agent.api.com.atproto.repo.listRecords({
        repo: user.did,
        collection: collections.chat,
        limit: 10,
      });

      let chatHistoryText = '';
      if (chatRecords.data.records) {
        chatHistoryText = chatRecords.data.records
          .map((r: any) => {
            if (r.value.type === 'question') {
              return `User: ${r.value.text}`;
            } else if (r.value.type === 'answer') {
              return `AI: ${r.value.text}`;
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');
      }

      // 3. Generate AI response based on provider
      let aiAnswer = '';
      
      // 3. Generate AI response using Ollama via proxy
      if (aiConfig.provider === 'ollama') {
        const prompt = `${aiConfig.systemPrompt}

Question: ${question}

Answer:`;

        const response = await fetch(`${aiConfig.host}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: aiConfig.model,
            prompt: prompt,
            stream: false,
            options: {
              temperature: 0.9,
              top_p: 0.9,
              num_predict: 200, // Longer responses for better answers
              repeat_penalty: 1.1,
            }
          }),
        });

        if (!response.ok) {
          throw new Error('AI API request failed');
        }

        const data = await response.json();
        aiAnswer = data.response;
      }

      // 4. Immediately dispatch event to update UI
      window.dispatchEvent(new CustomEvent('aiResponseReceived', {
        detail: { 
          answer: aiAnswer,
          aiProfile: aiProfile,
          timestamp: now.toISOString()
        }
      }));

      // 5. Save AI response in background
      const answerRkey = now.toISOString().replace(/[:.]/g, '-') + '-answer';
      
      const answerRecord = {
        $type: collections.chat,
        post: {
          url: currentUrl,
          slug: postSlug,
          title: postTitle,
          date: new Date().toISOString(),
          tags: [],
          language: "ja"
        },
        type: "answer",
        text: aiAnswer,
        author: {
          did: aiProfile.did,
          handle: aiProfile.handle,
          displayName: aiProfile.displayName,
          avatar: aiProfile.avatar,
        },
        createdAt: now.toISOString(),
      };

      // Save to ATProto asynchronously (don't wait for it)
      agent.api.com.atproto.repo.putRecord({
        repo: user.did,
        collection: collections.chat,
        rkey: answerRkey,
        record: answerRecord,
      }).catch(err => {
        // Silent fail for AI response saving
      });

    } catch (error) {
      window.dispatchEvent(new CustomEvent('aiResponseError', {
        detail: { error: 'AI応答の生成に失敗しました' }
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // This component doesn't render anything - it just handles the logic
  return null;
};