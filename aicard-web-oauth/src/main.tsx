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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="/list" element={<CardList />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)