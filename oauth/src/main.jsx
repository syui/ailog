import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

// Only mount the OAuth app if the target element exists
const targetElement = document.getElementById('comment-atproto')
if (targetElement) {
  ReactDOM.createRoot(targetElement).render(<App />)
}