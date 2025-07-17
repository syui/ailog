/*
 * AT URI Browser Component
 * Copyright (c) 2025 ai.log
 * MIT License
 */

import React, { useState, useEffect } from 'react'
import { AtUriModal } from './AtUriModal.jsx'
import { isAtUri } from '../lib/atproto.js'

export function AtUriBrowser({ children }) {
  const [modalUri, setModalUri] = useState(null)

  useEffect(() => {
    const handleAtUriClick = (e) => {
      const target = e.target
      
      // Check if clicked element has at-uri data attribute
      if (target.dataset.atUri) {
        e.preventDefault()
        setModalUri(target.dataset.atUri)
        return
      }

      // Check if clicked element contains at-uri text
      const text = target.textContent
      if (text && isAtUri(text)) {
        e.preventDefault()
        setModalUri(text)
        return
      }

      // Check if parent element has at-uri
      const parent = target.parentElement
      if (parent && parent.dataset.atUri) {
        e.preventDefault()
        setModalUri(parent.dataset.atUri)
        return
      }
    }

    document.addEventListener('click', handleAtUriClick)

    return () => {
      document.removeEventListener('click', handleAtUriClick)
    }
  }, [])

  const handleAtUriClick = (uri) => {
    setModalUri(uri)
  }

  const handleCloseModal = () => {
    setModalUri(null)
  }

  return (
    <>
      {children}
      <AtUriModal 
        uri={modalUri} 
        onClose={handleCloseModal}
        onAtUriClick={handleAtUriClick}
      />
    </>
  )
}

// Utility function to wrap at-uri text with clickable spans
export const wrapAtUris = (text) => {
  const atUriRegex = /at:\/\/[^\s]+/g
  return text.replace(atUriRegex, (match) => {
    return `<span data-at-uri="${match}" style="color: blue; cursor: pointer; text-decoration: underline;">${match}</span>`
  })
}