# Avatar Fetching System

This document describes the avatar fetching system implemented for the oauth_new application.

## Overview

The avatar system provides intelligent avatar fetching with fallback mechanisms, caching, and error handling. It follows the design specified in the project instructions:

1. **Primary Source**: Try to use avatar from record JSON first
2. **Fallback**: If avatar is broken/missing, fetch fresh data from ATProto
3. **Fresh Data Flow**: handle → PDS → DID → profile → avatar URI
4. **Caching**: Avoid excessive API calls with intelligent caching

## Files Structure

```
src/
├── utils/
│   └── avatar.js          # Core avatar fetching logic
├── components/
│   ├── Avatar.jsx         # React avatar component
│   └── AvatarTest.jsx     # Test component
└── App.css               # Avatar styling
```

## Core Functions

### `getAvatar(options)`
Main function to fetch avatar with intelligent fallback.

```javascript
const avatar = await getAvatar({
  record: recordObject,     // Optional: record containing avatar data
  handle: 'user.handle',    // Required if no record
  did: 'did:plc:xxx',      // Optional: user DID
  forceFresh: false        // Optional: force fresh fetch
})
```

### `batchFetchAvatars(users)`
Fetch avatars for multiple users in parallel with concurrency control.

```javascript
const avatarMap = await batchFetchAvatars([
  { handle: 'user1.handle', did: 'did:plc:xxx1' },
  { handle: 'user2.handle', did: 'did:plc:xxx2' }
])
```

### `prefetchAvatar(handle)`
Prefetch and cache avatar for a specific handle.

```javascript
await prefetchAvatar('user.handle')
```

## React Components

### `<Avatar>`
Basic avatar component with loading states and fallbacks.

```jsx
<Avatar
  record={record}
  handle="user.handle"
  did="did:plc:xxx"
  size={40}
  showFallback={true}
  onLoad={() => console.log('loaded')}
  onError={(err) => console.log('error', err)}
/>
```

### `<AvatarWithCard>`
Avatar with hover card showing user information.

```jsx
<AvatarWithCard
  record={record}
  displayName="User Name"
  apiConfig={apiConfig}
  size={60}
/>
```

### `<AvatarList>`
Display multiple avatars with overlap effect.

```jsx
<AvatarList 
  users={userArray}
  maxDisplay={5}
  size={30}
/>
```

## Data Flow

1. **Record Check**: Extract avatar from record.value.author.avatar
2. **URL Validation**: Verify avatar URL is accessible (HEAD request)
3. **Fresh Fetch**: If broken, fetch fresh data:
   - Get PDS from handle using `getPdsFromHandle()`
   - Get API config using `getApiConfig()`
   - Get DID from PDS using `atproto.getDid()`
   - Get profile from bsky API using `atproto.getProfile()`
   - Extract avatar from profile
4. **Cache**: Store result in cache with 30-minute TTL
5. **Fallback**: Show initial-based fallback if no avatar found

## Caching Strategy

- **Cache Key**: `avatar:{handle}`
- **Duration**: 30 minutes (configurable)
- **Cache Provider**: Uses existing `dataCache` utility
- **Invalidation**: Manual cache clearing functions available

## Error Handling

- **Network Errors**: Gracefully handled with fallback UI
- **Broken URLs**: Automatically detected and re-fetched fresh
- **Missing Handles**: Throws descriptive error messages
- **API Failures**: Logged but don't break UI

## Integration

The avatar system is integrated into the existing RecordList component:

```jsx
// Old approach
{record.value.author?.avatar && (
  <img src={record.value.author.avatar} alt="avatar" className="avatar" />
)}

// New approach
<Avatar
  record={record}
  handle={record.value.author?.handle}
  did={record.value.author?.did}
  size={40}
  showFallback={true}
/>
```

## Testing

The system includes a comprehensive test component (`AvatarTest.jsx`) that can be accessed through the Test UI in the app. It demonstrates:

1. Avatar from record data
2. Avatar from handle only
3. Broken avatar URL handling
4. Batch fetching
5. Prefetch functionality
6. Various avatar components

To test:
1. Open the app
2. Click "Test" button in header
3. Switch to "Avatar System" tab
4. Use the test controls to verify functionality

## Performance Considerations

- **Concurrent Fetching**: Batch operations use concurrency limits (5 parallel requests)
- **Caching**: Reduces API calls by caching results
- **Lazy Loading**: Avatar images use lazy loading
- **Error Recovery**: Broken avatars are automatically retried with fresh data

## Future Enhancements

1. **Persistent Cache**: Consider localStorage for cross-session caching
2. **Image Optimization**: Add WebP support and size optimization
3. **Preloading**: Implement smarter preloading strategies
4. **CDN Integration**: Add CDN support for avatar delivery
5. **Placeholder Variations**: More diverse fallback avatar styles