import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import { OAuthCallbackPage } from './components/OAuthCallbackPage'
import { CardList } from './components/CardList'
import { OAuthEndpointHandler } from './utils/oauth-endpoints'

// Initialize OAuth endpoint handlers for dynamic client metadata and JWKS
// DISABLED: This may interfere with BrowserOAuthClient
// OAuthEndpointHandler.init()

// Mount React app to all comment-atproto divs
const mountPoints = document.querySelectorAll('#comment-atproto');
console.log(`Found ${mountPoints.length} comment-atproto mount points`);

mountPoints.forEach((mountPoint, index) => {
  console.log(`Mounting React app to comment-atproto #${index + 1}`);
  ReactDOM.createRoot(mountPoint as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="/list" element={<CardList />} />
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>,
  );
});