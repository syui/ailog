import React, { useState, useEffect } from 'react';
import { User } from '../services/auth';
import { atprotoOAuthService } from '../services/atproto-oauth';
import { appConfig } from '../config/app';

interface AIChatProps {
  user: User | null;
  isEnabled: boolean;
}

export const AIChat: React.FC<AIChatProps> = ({ user, isEnabled }) => {
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiProfile, setAiProfile] = useState<any>(null);
  
  // Get AI settings from environment variables
  const aiConfig = {
    enabled: import.meta.env.VITE_AI_ENABLED === 'true',
    askAi: import.meta.env.VITE_AI_ASK_AI === 'true',
    provider: import.meta.env.VITE_AI_PROVIDER || 'ollama',
    model: import.meta.env.VITE_AI_MODEL || 'gemma3:4b',
    host: import.meta.env.VITE_AI_HOST || 'https://ollama.syui.ai',
    systemPrompt: import.meta.env.VITE_AI_SYSTEM_PROMPT || 'You are a helpful AI assistant trained on this blog\'s content.',
    aiDid: import.meta.env.VITE_AI_DID || 'did:plc:uqzpqmrjnptsxezjx4xuh2mn',
  };

  // Fetch AI profile on load
  useEffect(() => {
    const fetchAIProfile = async () => {
      if (!aiConfig.aiDid) {
        console.log('No AI DID configured');
        return;
      }
      
      try {
        // Try with agent first
        const agent = atprotoOAuthService.getAgent();
        if (agent) {
          console.log('Fetching AI profile with agent for DID:', aiConfig.aiDid);
          const profile = await agent.getProfile({ actor: aiConfig.aiDid });
          console.log('AI profile fetched successfully:', profile.data);
          setAiProfile({
            did: aiConfig.aiDid,
            handle: profile.data.handle || 'ai-assistant',
            displayName: profile.data.displayName || 'AI Assistant',
            avatar: profile.data.avatar || null,
            description: profile.data.description || null
          });
          return;
        }
        
        // Fallback to public API
        console.log('No agent available, trying public API for AI profile');
        const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(aiConfig.aiDid)}`);
        if (response.ok) {
          const profileData = await response.json();
          console.log('AI profile fetched via public API:', profileData);
          setAiProfile({
            did: aiConfig.aiDid,
            handle: profileData.handle || 'ai-assistant',
            displayName: profileData.displayName || 'AI Assistant',
            avatar: profileData.avatar || null,
            description: profileData.description || null
          });
          return;
        }
      } catch (error) {
        console.log('Failed to fetch AI profile, using defaults:', error);
        setAiProfile({
          did: aiConfig.aiDid,
          handle: 'ai-assistant',
          displayName: 'AI Assistant',
          avatar: null,
          description: 'AI assistant for this blog'
        });
      }
    };

    fetchAIProfile();
  }, [aiConfig.aiDid]);

  useEffect(() => {
    if (!isEnabled || !aiConfig.askAi) return;

    // Listen for AI question posts from base.html
    const handleAIQuestion = async (event: any) => {
      if (!user || !event.detail || !event.detail.question || isProcessing) return;
      
      console.log('AIChat received question:', event.detail.question);
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
      console.log('AIChat event listener registered');
      
      // Notify that AI is ready
      window.dispatchEvent(new CustomEvent('aiChatReady'));
    }, 100);

    return () => {
      window.removeEventListener('postAIQuestion', handleAIQuestion);
    };
  }, [user, isEnabled, isProcessing]);

  const postQuestionAndGenerateResponse = async (question: string) => {
    if (!user || !aiConfig.askAi) return;

    setIsLoading(true);
    
    try {
      const agent = atprotoOAuthService.getAgent();
      if (!agent) throw new Error('No agent available');

      // 1. Post question to ATProto
      const now = new Date();
      const rkey = now.toISOString().replace(/[:.]/g, '-');
      
      const questionRecord = {
        $type: appConfig.collections.chat,
        question: question,
        url: window.location.href,
        createdAt: now.toISOString(),
        author: {
          did: user.did,
          handle: user.handle,
          avatar: user.avatar,
          displayName: user.displayName || user.handle,
        },
        context: {
          page_title: document.title,
          page_url: window.location.href,
        },
      };

      await agent.api.com.atproto.repo.putRecord({
        repo: user.did,
        collection: appConfig.collections.chat,
        rkey: rkey,
        record: questionRecord,
      });

      console.log('Question posted to ATProto');

      // 2. Get chat history
      const chatRecords = await agent.api.com.atproto.repo.listRecords({
        repo: user.did,
        collection: appConfig.collections.chat,
        limit: 10,
      });

      let chatHistoryText = '';
      if (chatRecords.data.records) {
        chatHistoryText = chatRecords.data.records
          .map((r: any) => {
            if (r.value.question) {
              return `User: ${r.value.question}`;
            } else if (r.value.answer) {
              return `AI: ${r.value.answer}`;
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

${chatHistoryText ? `履歴: ${chatHistoryText}` : ''}

質問: ${question}

簡潔に回答:`;

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
              temperature: 0.7,
              top_p: 0.9,
              num_predict: 80, // Shorter responses for faster generation
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
      console.log('Dispatching AI response with profile:', aiProfile);
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
        $type: appConfig.collections.chat,
        answer: aiAnswer,
        question_rkey: rkey,
        url: window.location.href,
        createdAt: now.toISOString(),
        author: {
          did: aiConfig.aiDid,
          handle: 'AI Assistant',
          displayName: 'AI Assistant',
        },
      };

      // Save to ATProto asynchronously (don't wait for it)
      agent.api.com.atproto.repo.putRecord({
        repo: user.did,
        collection: appConfig.collections.chat,
        rkey: answerRkey,
        record: answerRecord,
      }).catch(err => {
        console.error('Failed to save AI response to ATProto:', err);
      });

    } catch (error) {
      console.error('Failed to generate AI response:', error);
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