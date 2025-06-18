import React, { useState } from 'react'
import RecordList from './RecordList.jsx'

export default function RecordTabs({ langRecords, commentRecords, userComments, chatRecords, apiConfig, pageContext }) {
  const [activeTab, setActiveTab] = useState('lang')

  // Filter records based on page context
  const filterRecords = (records) => {
    if (pageContext.isTopPage) {
      // Top page: show latest 3 records
      return records.slice(0, 3)
    } else {
      // Individual page: show records matching the URL
      return records.filter(record => {
        const recordUrl = record.value.post?.url
        if (!recordUrl) return false
        
        try {
          const recordRkey = new URL(recordUrl).pathname.split('/').pop()?.replace(/\.html$/, '')
          return recordRkey === pageContext.rkey
        } catch {
          return false
        }
      })
    }
  }

  const filteredLangRecords = filterRecords(langRecords)
  const filteredCommentRecords = filterRecords(commentRecords)
  const filteredUserComments = filterRecords(userComments || [])
  const filteredChatRecords = filterRecords(chatRecords || [])

  return (
    <div className="record-tabs">
      <div className="tab-header">
        <button 
          className={`tab-btn ${activeTab === 'lang' ? 'active' : ''}`}
          onClick={() => setActiveTab('lang')}
        >
          Lang Records ({filteredLangRecords.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'comment' ? 'active' : ''}`}
          onClick={() => setActiveTab('comment')}
        >
          Comment Records ({filteredCommentRecords.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'collection' ? 'active' : ''}`}
          onClick={() => setActiveTab('collection')}
        >
          Collection ({filteredChatRecords.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          User Comments ({filteredUserComments.length})
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'lang' && (
          <RecordList 
            title={pageContext.isTopPage ? "Latest Lang Records" : "Lang Records for this page"}
            records={filteredLangRecords} 
            apiConfig={apiConfig} 
          />
        )}
        {activeTab === 'comment' && (
          <RecordList 
            title={pageContext.isTopPage ? "Latest Comment Records" : "Comment Records for this page"}
            records={filteredCommentRecords} 
            apiConfig={apiConfig} 
          />
        )}
        {activeTab === 'collection' && (
          <RecordList 
            title={pageContext.isTopPage ? "Latest Collection Records" : "Collection Records for this page"}
            records={filteredChatRecords} 
            apiConfig={apiConfig} 
          />
        )}
        {activeTab === 'users' && (
          <RecordList 
            title={pageContext.isTopPage ? "Latest User Comments" : "User Comments for this page"}
            records={filteredUserComments} 
            apiConfig={apiConfig} 
          />
        )}
      </div>

      <div className="page-info">
        <small>
          {pageContext.isTopPage 
            ? "トップページ: 最新3件を表示" 
            : `個別ページ: ${pageContext.rkey} に関連するレコードを表示`
          }
        </small>
      </div>

      <style jsx>{`
        .record-tabs {
          margin: 20px 0;
        }
        .tab-header {
          display: flex;
          border-bottom: 2px solid #ddd;
          margin-bottom: 10px;
        }
        .tab-btn {
          padding: 10px 20px;
          border: none;
          background: #f8f9fa;
          border-top: 2px solid transparent;
          border-left: 1px solid #ddd;
          border-right: 1px solid #ddd;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }
        .tab-btn:first-child {
          border-left: none;
        }
        .tab-btn:last-child {
          border-right: none;
        }
        .tab-btn.active {
          background: white;
          border-top-color: #007bff;
          border-bottom: 2px solid white;
          margin-bottom: -2px;
          font-weight: bold;
        }
        .tab-btn:hover:not(.active) {
          background: #e9ecef;
        }
        .tab-content {
          min-height: 200px;
        }
        .page-info {
          margin-top: 10px;
          padding: 5px 10px;
          background: #f8f9fa;
          border-radius: 3px;
          color: #666;
        }
      `}</style>
    </div>
  )
}