/*
 * Based on frontpage/atproto-browser
 * Copyright (c) 2025 The Frontpage Authors
 * MIT License
 */

import React, { useState, useEffect } from 'react'
import { parseAtUri, getRecord } from '../lib/atproto.js'
import AtUriJson from './AtUriJson.jsx'

export default function AtUriViewer({ uri, onAtUriClick }) {
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadRecord = async () => {
      if (!uri) return

      setLoading(true)
      setError(null)

      try {
        const atUri = parseAtUri(uri)
        if (!atUri) {
          throw new Error('Invalid AT URI')
        }


        const result = await getRecord(atUri.hostname, atUri.collection, atUri.rkey)
        
        
        if (!result.success) {
          throw new Error(result.error)
        }

        setRecord(result.data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadRecord()
  }, [uri])

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <div><strong>Error:</strong> {error}</div>
        <div style={{ marginTop: '10px', fontSize: '12px' }}>
          <strong>URI:</strong> {uri}
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
          デバッグ情報: このAT URIは有効ではないか、レコードが存在しません。
        </div>
      </div>
    )
  }

  if (!record) {
    return (
      <div style={{ padding: '20px' }}>
        <div>No record found</div>
      </div>
    )
  }

  const atUri = parseAtUri(uri)

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '18px' }}>AT URI Record</h3>
        <div style={{ 
          fontSize: '14px', 
          color: '#666',
          fontFamily: 'monospace',
          wordBreak: 'break-all'
        }}>
          {uri}
        </div>
        <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
          DID: {atUri.hostname} | Collection: {atUri.collection} | RKey: {atUri.rkey}
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Record Data</h4>
        <AtUriJson data={record} onAtUriClick={onAtUriClick} />
      </div>
    </div>
  )
}