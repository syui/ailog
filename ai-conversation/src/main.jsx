import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

// Only mount the AI conversation app if the target element exists
const targetElement = document.getElementById('ai-conversation-atproto')
if (targetElement) {
  ReactDOM.createRoot(targetElement).render(<App />)
}