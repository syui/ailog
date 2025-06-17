// Simple console test for OAuth app
// This runs before 'npm run preview' to display test results

// Mock import.meta.env for Node.js environment
(global as any).import = {
  meta: {
    env: {
      VITE_ATPROTO_PDS: process.env.VITE_ATPROTO_PDS || 'syu.is',
      VITE_ADMIN_HANDLE: process.env.VITE_ADMIN_HANDLE || 'ai.syui.ai',
      VITE_AI_HANDLE: process.env.VITE_AI_HANDLE || 'ai.syui.ai',
      VITE_OAUTH_COLLECTION: process.env.VITE_OAUTH_COLLECTION || 'ai.syui.log',
      VITE_ATPROTO_HANDLE_LIST: process.env.VITE_ATPROTO_HANDLE_LIST || '["syui.ai", "ai.syui.ai", "yui.syui.ai"]',
      VITE_APP_HOST: process.env.VITE_APP_HOST || 'https://log.syui.ai'
    }
  }
};

// Simple implementation of functions for testing
function detectPdsFromHandle(handle: string): string {
  if (handle.endsWith('.syu.is') || handle.endsWith('.syui.ai')) {
    return 'syu.is';
  }
  if (handle.endsWith('.bsky.social')) {
    return 'bsky.social';
  }
  // Default case - check if it's in the allowed list
  const allowedHandles = JSON.parse((global as any).import.meta.env.VITE_ATPROTO_HANDLE_LIST || '[]');
  if (allowedHandles.includes(handle)) {
    return (global as any).import.meta.env.VITE_ATPROTO_PDS || 'syu.is';
  }
  return 'bsky.social';
}

function getNetworkConfig(pds: string) {
  switch (pds) {
    case 'bsky.social':
    case 'bsky.app':
      return {
        pdsApi: `https://${pds}`,
        plcApi: 'https://plc.directory',
        bskyApi: 'https://public.api.bsky.app',
        webUrl: 'https://bsky.app'
      };
    case 'syu.is':
      return {
        pdsApi: 'https://syu.is',
        plcApi: 'https://plc.syu.is',
        bskyApi: 'https://bsky.syu.is',
        webUrl: 'https://web.syu.is'
      };
    default:
      return {
        pdsApi: `https://${pds}`,
        plcApi: 'https://plc.directory',
        bskyApi: 'https://public.api.bsky.app',
        webUrl: 'https://bsky.app'
      };
  }
}

// Main test execution
console.log('\n=== OAuth App Configuration Tests ===\n');

// Test 1: Handle input behavior
console.log('1. Handle Input → PDS Detection:');
const testHandles = [
  'syui.ai',
  'syui.syu.is', 
  'syui.syui.ai',
  'test.bsky.social',
  'unknown.handle'
];

testHandles.forEach(handle => {
  const pds = detectPdsFromHandle(handle);
  const config = getNetworkConfig(pds);
  console.log(`   ${handle.padEnd(20)} → PDS: ${pds.padEnd(12)} → API: ${config.pdsApi}`);
});

// Test 2: Environment variable impact
console.log('\n2. Current Environment Configuration:');
const env = (global as any).import.meta.env;
console.log(`   VITE_ATPROTO_PDS:      ${env.VITE_ATPROTO_PDS}`);
console.log(`   VITE_ADMIN_HANDLE:     ${env.VITE_ADMIN_HANDLE}`);
console.log(`   VITE_AI_HANDLE:        ${env.VITE_AI_HANDLE}`);
console.log(`   VITE_OAUTH_COLLECTION: ${env.VITE_OAUTH_COLLECTION}`);
console.log(`   VITE_ATPROTO_HANDLE_LIST: ${env.VITE_ATPROTO_HANDLE_LIST}`);

// Test 3: API endpoint generation
console.log('\n3. Generated API Endpoints:');
const adminPds = detectPdsFromHandle(env.VITE_ADMIN_HANDLE);
const adminConfig = getNetworkConfig(adminPds);
console.log(`   Admin PDS detection: ${env.VITE_ADMIN_HANDLE} → ${adminPds}`);
console.log(`   Admin API endpoints:`);
console.log(`     - PDS API:  ${adminConfig.pdsApi}`);
console.log(`     - Bsky API: ${adminConfig.bskyApi}`);
console.log(`     - Web URL:  ${adminConfig.webUrl}`);

// Test 4: Collection URLs
console.log('\n4. Collection API URLs:');
const baseCollection = env.VITE_OAUTH_COLLECTION;
console.log(`   User list: ${adminConfig.pdsApi}/xrpc/com.atproto.repo.listRecords?repo=${env.VITE_ADMIN_HANDLE}&collection=${baseCollection}.user`);
console.log(`   Chat:      ${adminConfig.pdsApi}/xrpc/com.atproto.repo.listRecords?repo=${env.VITE_ADMIN_HANDLE}&collection=${baseCollection}.chat`);
console.log(`   Lang:      ${adminConfig.pdsApi}/xrpc/com.atproto.repo.listRecords?repo=${env.VITE_ADMIN_HANDLE}&collection=${baseCollection}.chat.lang`);
console.log(`   Comment:   ${adminConfig.pdsApi}/xrpc/com.atproto.repo.listRecords?repo=${env.VITE_ADMIN_HANDLE}&collection=${baseCollection}.chat.comment`);

// Test 5: OAuth routing logic
console.log('\n5. OAuth Authorization Logic:');
const allowedHandles = JSON.parse(env.VITE_ATPROTO_HANDLE_LIST || '[]');
console.log(`   Allowed handles: ${JSON.stringify(allowedHandles)}`);
console.log(`   OAuth scenarios:`);

const oauthTestCases = [
  'syui.ai',         // Should use syu.is (in allowed list)
  'test.syu.is',     // Should use syu.is (*.syu.is pattern)
  'user.bsky.social' // Should use bsky.social (default)
];

oauthTestCases.forEach(handle => {
  const pds = detectPdsFromHandle(handle);
  const isAllowed = allowedHandles.includes(handle);
  const reason = handle.endsWith('.syu.is') ? '*.syu.is pattern' : 
                 isAllowed ? 'in allowed list' : 
                 'default';
  console.log(`     ${handle.padEnd(20)} → https://${pds}/oauth/authorize (${reason})`);
});

// Test 6: AI Profile Resolution
console.log('\n6. AI Profile Resolution:');
const aiPds = detectPdsFromHandle(env.VITE_AI_HANDLE);
const aiConfig = getNetworkConfig(aiPds);
console.log(`   AI Handle: ${env.VITE_AI_HANDLE} → PDS: ${aiPds}`);
console.log(`   AI Profile API: ${aiConfig.bskyApi}/xrpc/app.bsky.actor.getProfile?actor=${env.VITE_AI_HANDLE}`);

console.log('\n=== Tests Complete ===\n');