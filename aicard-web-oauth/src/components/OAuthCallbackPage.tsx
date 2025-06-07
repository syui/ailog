import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OAuthCallback } from './OAuthCallback';

export const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    console.log('=== OAUTH CALLBACK PAGE MOUNTED ===');
    console.log('Current URL:', window.location.href);
    console.log('Search params:', window.location.search);
    console.log('Pathname:', window.location.pathname);
  }, []);

  const handleSuccess = (did: string, handle: string) => {
    console.log('OAuth success, redirecting to home:', { did, handle });
    
    // Add a small delay to ensure state is properly updated
    setTimeout(() => {
      navigate('/', { replace: true });
    }, 100);
  };

  const handleError = (error: string) => {
    console.error('OAuth error, redirecting to home:', error);
    
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