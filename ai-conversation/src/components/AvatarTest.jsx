import React, { useState, useEffect } from 'react'
import Avatar, { AvatarWithCard, AvatarList } from './Avatar.jsx'
import { getAvatar, batchFetchAvatars, prefetchAvatar } from '../utils/avatar.js'

/**
 * Test component to demonstrate avatar functionality
 */
export default function AvatarTest() {
  const [testResults, setTestResults] = useState({})
  const [loading, setLoading] = useState(false)

  // Test data
  const testUsers = [
    { handle: 'syui.ai', did: 'did:plc:uqzpqmrjnptsxezjx4xuh2mn' },
    { handle: 'ai.syui.ai', did: 'did:plc:4hqjfn7m6n5hno3doamuhgef' },
    { handle: 'yui.syui.ai', did: 'did:plc:6qyecktefllvenje24fcxnie' }
  ]

  const sampleRecord = {
    value: {
      author: {
        handle: 'syui.ai',
        did: 'did:plc:uqzpqmrjnptsxezjx4xuh2mn',
        displayName: 'syui',
        avatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:uqzpqmrjnptsxezjx4xuh2mn/bafkreid6kcc5pnn4b3ar7mj6vi3eiawhxgkcrw3edgbqeacyrlnlcoetea@jpeg'
      },
      text: 'Test message',
      createdAt: new Date().toISOString()
    }
  }

  // Test functions
  const testGetAvatar = async () => {
    setLoading(true)
    try {
      const results = {}
      
      // Test with record
      results.fromRecord = await getAvatar({ record: sampleRecord })
      
      // Test with handle only
      results.fromHandle = await getAvatar({ handle: 'syui.ai' })
      
      // Test with broken record (force fresh fetch)
      const brokenRecord = {
        ...sampleRecord,
        value: {
          ...sampleRecord.value,
          author: {
            ...sampleRecord.value.author,
            avatar: 'https://broken-url.com/avatar.jpg'
          }
        }
      }
      results.brokenRecord = await getAvatar({ record: brokenRecord })
      
      // Test non-existent user
      try {
        results.nonExistent = await getAvatar({ handle: 'nonexistent.user' })
      } catch (error) {
        results.nonExistent = `Error: ${error.message}`
      }
      
      setTestResults(results)
    } catch (error) {
      console.error('Test failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const testBatchFetch = async () => {
    setLoading(true)
    try {
      const avatarMap = await batchFetchAvatars(testUsers)
      setTestResults(prev => ({
        ...prev,
        batchResults: Object.fromEntries(avatarMap)
      }))
    } catch (error) {
      console.error('Batch test failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const testPrefetch = async () => {
    setLoading(true)
    try {
      await prefetchAvatar('syui.ai')
      const cachedAvatar = await getAvatar({ handle: 'syui.ai' })
      setTestResults(prev => ({
        ...prev,
        prefetchResult: cachedAvatar
      }))
    } catch (error) {
      console.error('Prefetch test failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="avatar-test-container">
      <div className="card">
        <div className="card-header">
          <h2>Avatar System Test</h2>
        </div>
        <div className="card-content">
          
          {/* Basic Avatar Examples */}
          <section className="test-section">
            <h3>Basic Avatar Examples</h3>
            <div className="avatar-examples">
              <div className="avatar-example">
                <h4>From Record</h4>
                <Avatar record={sampleRecord} size={60} />
              </div>
              
              <div className="avatar-example">
                <h4>From Handle</h4>
                <Avatar handle="syui.ai" size={60} />
              </div>
              
              <div className="avatar-example">
                <h4>With Fallback</h4>
                <Avatar handle="nonexistent.user" size={60} />
              </div>
              
              <div className="avatar-example">
                <h4>Loading State</h4>
                <div className="avatar-loading" style={{ width: 60, height: 60 }} />
              </div>
            </div>
          </section>

          {/* Avatar with Card */}
          <section className="test-section">
            <h3>Avatar with Hover Card</h3>
            <div className="avatar-examples">
              <AvatarWithCard
                record={sampleRecord}
                displayName="syui"
                apiConfig={{ web: 'https://bsky.app' }}
                size={60}
              />
              <p>Hover over the avatar to see the card</p>
            </div>
          </section>

          {/* Avatar List */}
          <section className="test-section">
            <h3>Avatar List</h3>
            <AvatarList users={testUsers} maxDisplay={3} size={40} />
          </section>

          {/* Test Controls */}
          <section className="test-section">
            <h3>Test Functions</h3>
            <div className="test-controls">
              <button 
                onClick={testGetAvatar} 
                disabled={loading}
                className="btn btn-primary"
              >
                Test getAvatar()
              </button>
              
              <button 
                onClick={testBatchFetch} 
                disabled={loading}
                className="btn btn-primary"
              >
                Test Batch Fetch
              </button>
              
              <button 
                onClick={testPrefetch} 
                disabled={loading}
                className="btn btn-primary"
              >
                Test Prefetch
              </button>
            </div>
          </section>

          {/* Test Results */}
          {Object.keys(testResults).length > 0 && (
            <section className="test-section">
              <h3>Test Results</h3>
              <div className="json-display">
                <pre className="json-content">
                  {JSON.stringify(testResults, null, 2)}
                </pre>
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  )
}