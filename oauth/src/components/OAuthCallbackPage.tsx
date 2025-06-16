import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OAuthCallback } from './OAuthCallback';

export const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
  }, []);

  const handleSuccess = (did: string, handle: string) => {
    
    // Add a small delay to ensure state is properly updated
    setTimeout(() => {
      navigate('/', { replace: true });
    }, 100);
  };

  const handleError = (error: string) => {
    
    // Add a small delay before redirect
    setTimeout(() => {
      navigate('/', { replace: true });
    }, 2000); // Give user time to see error
  };

  return (
    <div>
      <h2>Processing OAuth callback...</h2>
      <OAuthCallback
        onSuccess={handleSuccess}
        onError={handleError}
      />
    </div>
  );
};