/*
 * Based on frontpage/atproto-browser
 * Copyright (c) 2025 The Frontpage Authors
 * MIT License
 */

import React from 'react'
import { isDid } from '@atproto/did'
import { parseAtUri, isAtUri } from '../lib/atproto.js'

const JSONString = ({ data, onAtUriClick }) => {
  const handleClick = (uri) => {
    if (onAtUriClick) {
      onAtUriClick(uri)
    }
  }

  return (
    <pre style={{ color: 'darkgreen', margin: 0, display: 'inline' }}>
      {isAtUri(data) ? (
        <>
          &quot;
          <span 
            onClick={() => handleClick(data)}
            style={{ 
              color: 'blue', 
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {data}
          </span>
          &quot;
        </>
      ) : isDid(data) ? (
        <>
          &quot;
          <span 
            onClick={() => handleClick(`at://${data}`)}
            style={{ 
              color: 'blue', 
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {data}
          </span>
          &quot;
        </>
      ) : URL.canParse(data) ? (
        <>
          &quot;
          <a href={data} rel="noopener noreferrer ugc" target="_blank">
            {data}
          </a>
          &quot;
        </>
      ) : (
        `"${data}"`
      )}
    </pre>
  )
}

const JSONValue = ({ data, onAtUriClick }) => {
  if (data === null) {
    return <pre style={{ color: 'gray', margin: 0, display: 'inline' }}>null</pre>
  }

  if (typeof data === 'string') {
    return <JSONString data={data} onAtUriClick={onAtUriClick} />
  }

  if (typeof data === 'number') {
    return <pre style={{ color: 'darkorange', margin: 0, display: 'inline' }}>{data}</pre>
  }

  if (typeof data === 'boolean') {
    return <pre style={{ color: 'darkred', margin: 0, display: 'inline' }}>{data.toString()}</pre>
  }

  if (Array.isArray(data)) {
    return (
      <div style={{ paddingLeft: '20px' }}>
        [
        {data.map((item, index) => (
          <div key={index} style={{ paddingLeft: '20px' }}>
            <JSONValue data={item} onAtUriClick={onAtUriClick} />
            {index < data.length - 1 && ','}
          </div>
        ))}
        ]
      </div>
    )
  }

  if (typeof data === 'object') {
    return (
      <div style={{ paddingLeft: '20px' }}>
        {'{'}
        {Object.entries(data).map(([key, value], index, entries) => (
          <div key={key} style={{ paddingLeft: '20px' }}>
            <span style={{ color: 'darkblue' }}>"{key}"</span>: <JSONValue data={value} onAtUriClick={onAtUriClick} />
            {index < entries.length - 1 && ','}
          </div>
        ))}
        {'}'}
      </div>
    )
  }

  return <pre style={{ margin: 0, display: 'inline' }}>{String(data)}</pre>
}

export default function AtUriJson({ data, onAtUriClick }) {
  return (
    <div style={{ 
      fontFamily: 'monospace', 
      fontSize: '14px',
      padding: '10px',
      backgroundColor: '#f5f5f5',
      border: '1px solid #ddd',
      borderRadius: '4px',
      overflow: 'auto',
      maxHeight: '400px'
    }}>
      <JSONValue data={data} onAtUriClick={onAtUriClick} />
    </div>
  )
}