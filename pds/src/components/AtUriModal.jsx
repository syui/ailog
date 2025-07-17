/*
 * AT URI Modal Component
 * Copyright (c) 2025 ai.log
 * MIT License
 */

import React, { useEffect } from 'react'
import AtUriViewer from './AtUriViewer.jsx'

export function AtUriModal({ uri, onClose, onAtUriClick }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const handleClickOutside = (e) => {
      if (e.target.classList.contains('at-uri-modal-overlay')) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('click', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [onClose])

  if (!uri) return null

  return (
    <div className="at-uri-modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        maxWidth: '800px',
        maxHeight: '600px',
        width: '90%',
        height: '80%',
        overflow: 'auto',
        position: 'relative',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            zIndex: 1001,
            padding: '5px 10px'
          }}
        >
          ×
        </button>
        
        <AtUriViewer uri={uri} onAtUriClick={onAtUriClick} />
      </div>
    </div>
  )
}