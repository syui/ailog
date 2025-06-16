import React, { useState, useEffect } from 'react';
import { AtprotoAgent } from '@atproto/api';

interface AIProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
}

interface AIProfileProps {
  aiDid: string;
}

export const AIProfile: React.FC<AIProfileProps> = ({ aiDid }) => {
  const [profile, setProfile] = useState<AIProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAIProfile = async () => {
      try {
        // Use public API to get profile information
        const agent = new AtprotoAgent({ service: 'https://bsky.social' });
        const response = await agent.getProfile({ actor: aiDid });
        
        setProfile({
          did: response.data.did,
          handle: response.data.handle,
          displayName: response.data.displayName,
          avatar: response.data.avatar,
          description: response.data.description,
        });
      } catch (error) {
        // Failed to fetch AI profile
        // Fallback to basic info
        setProfile({
          did: aiDid,
          handle: 'ai-assistant',
          displayName: 'AI Assistant',
          description: 'AI assistant for this blog',
        });
      } finally {
        setLoading(false);
      }
    };

    if (aiDid) {
      fetchAIProfile();
    }
  }, [aiDid]);

  if (loading) {
    return <div className="ai-profile-loading">Loading AI profile...</div>;
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="ai-profile">
      <div className="ai-avatar">
        {profile.avatar ? (
          <img src={profile.avatar} alt={profile.displayName || profile.handle} />
        ) : (
          <div className="ai-avatar-placeholder">🤖</div>
        )}
      </div>
      <div className="ai-info">
        <div className="ai-name">{profile.displayName || profile.handle}</div>
        <div className="ai-handle">@{profile.handle}</div>
        {profile.description && (
          <div className="ai-description">{profile.description}</div>
        )}
      </div>
    </div>
  );
};