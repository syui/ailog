import React from 'react'

export default function LoadingSkeleton({ count = 3, showTitle = false }) {
  return (
    <div className="loading-skeleton">
      {showTitle && (
        <div className="skeleton-title">
          <div className="skeleton-line title"></div>
        </div>
      )}
      
      {Array(count).fill(0).map((_, i) => (
        <div key={i} className="skeleton-item">
          <div className="skeleton-avatar"></div>
          <div className="skeleton-content">
            <div className="skeleton-line name"></div>
            <div className="skeleton-line text"></div>
            <div className="skeleton-line text short"></div>
            <div className="skeleton-line meta"></div>
          </div>
        </div>
      ))}
      
      <style jsx>{`
        .loading-skeleton {
          padding: 10px;
        }
        
        .skeleton-title {
          margin-bottom: 20px;
        }
        
        .skeleton-item {
          display: flex;
          padding: 15px;
          border: 1px solid #eee;
          margin: 10px 0;
          border-radius: 8px;
          background: #fafafa;
        }
        
        .skeleton-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          margin-right: 12px;
          flex-shrink: 0;
        }
        
        .skeleton-content {
          flex: 1;
          min-width: 0;
        }
        
        .skeleton-line {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          margin-bottom: 8px;
          border-radius: 4px;
        }
        
        .skeleton-line.title {
          height: 20px;
          width: 30%;
        }
        
        .skeleton-line.name {
          height: 14px;
          width: 25%;
        }
        
        .skeleton-line.text {
          height: 12px;
          width: 90%;
        }
        
        .skeleton-line.text.short {
          width: 60%;
        }
        
        .skeleton-line.meta {
          height: 10px;
          width: 40%;
          margin-bottom: 0;
        }
        
        @keyframes skeleton-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}