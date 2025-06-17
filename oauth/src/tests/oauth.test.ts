import { describe, it, expect, beforeEach } from 'vitest';
import { getAppConfig } from '../config/app';
import { detectPdsFromHandle, getNetworkConfig } from '../App';

// Test helper to mock environment variables
const mockEnv = (vars: Record<string, string>) => {
  Object.keys(vars).forEach(key => {
    (import.meta.env as any)[key] = vars[key];
  });
};

describe('OAuth App Tests', () => {
  describe('Handle Input Behavior', () => {
    it('should detect PDS for syui.ai (Bluesky)', () => {
      const pds = detectPdsFromHandle('syui.ai');
      expect(pds).toBe('bsky.social');
    });

    it('should detect PDS for syui.syu.is (syu.is)', () => {
      const pds = detectPdsFromHandle('syui.syu.is');
      expect(pds).toBe('syu.is');
    });

    it('should detect PDS for syui.syui.ai (syu.is)', () => {
      const pds = detectPdsFromHandle('syui.syui.ai');
      expect(pds).toBe('syu.is');
    });

    it('should use network config for different PDS', () => {
      const bskyConfig = getNetworkConfig('bsky.social');
      expect(bskyConfig.pdsApi).toBe('https://bsky.social');
      expect(bskyConfig.bskyApi).toBe('https://public.api.bsky.app');
      expect(bskyConfig.webUrl).toBe('https://bsky.app');

      const syuisConfig = getNetworkConfig('syu.is');
      expect(syuisConfig.pdsApi).toBe('https://syu.is');
      expect(syuisConfig.bskyApi).toBe('https://bsky.syu.is');
      expect(syuisConfig.webUrl).toBe('https://web.syu.is');
    });
  });

  describe('Environment Variable Changes', () => {
    beforeEach(() => {
      // Reset environment variables
      delete (import.meta.env as any).VITE_ATPROTO_PDS;
      delete (import.meta.env as any).VITE_ADMIN_HANDLE;
      delete (import.meta.env as any).VITE_AI_HANDLE;
    });

    it('should use correct PDS for AI profile', () => {
      mockEnv({
        VITE_ATPROTO_PDS: 'syu.is',
        VITE_ADMIN_HANDLE: 'ai.syui.ai',
        VITE_AI_HANDLE: 'ai.syui.ai'
      });

      const config = getAppConfig();
      expect(config.atprotoPds).toBe('syu.is');
      expect(config.adminHandle).toBe('ai.syui.ai');
      expect(config.aiHandle).toBe('ai.syui.ai');

      // Network config should use syu.is endpoints
      const networkConfig = getNetworkConfig(config.atprotoPds);
      expect(networkConfig.bskyApi).toBe('https://bsky.syu.is');
    });

    it('should construct correct API requests for admin userlist', () => {
      mockEnv({
        VITE_ATPROTO_PDS: 'syu.is',
        VITE_ADMIN_HANDLE: 'ai.syui.ai',
        VITE_OAUTH_COLLECTION: 'ai.syui.log'
      });

      const config = getAppConfig();
      const networkConfig = getNetworkConfig(config.atprotoPds);
      const userListUrl = `${networkConfig.pdsApi}/xrpc/com.atproto.repo.listRecords?repo=${config.adminHandle}&collection=${config.collections.base}.user`;
      
      expect(userListUrl).toBe('https://syu.is/xrpc/com.atproto.repo.listRecords?repo=ai.syui.ai&collection=ai.syui.log.user');
    });
  });

  describe('OAuth Login Flow', () => {
    it('should use syu.is OAuth for handles in VITE_ATPROTO_HANDLE_LIST', () => {
      mockEnv({
        VITE_ATPROTO_HANDLE_LIST: '["syui.ai", "ai.syui.ai", "yui.syui.ai"]',
        VITE_ATPROTO_PDS: 'syu.is'
      });

      const config = getAppConfig();
      const handle = 'syui.ai';
      
      // Check if handle is in allowed list
      expect(config.allowedHandles).toContain(handle);
      
      // Should use configured PDS for OAuth
      const expectedAuthUrl = `https://${config.atprotoPds}/oauth/authorize`;
      expect(expectedAuthUrl).toContain('syu.is');
    });

    it('should use syu.is OAuth for *.syu.is handles', () => {
      const handle = 'test.syu.is';
      const pds = detectPdsFromHandle(handle);
      expect(pds).toBe('syu.is');
    });
  });
});

// Terminal display test output
export function runTerminalTests() {
  console.log('\n=== OAuth App Tests ===\n');
  
  // Test 1: Handle input behavior
  console.log('1. Handle Input Detection:');
  const handles = ['syui.ai', 'syui.syu.is', 'syui.syui.ai'];
  handles.forEach(handle => {
    const pds = detectPdsFromHandle(handle);
    console.log(`   ${handle} → PDS: ${pds}`);
  });
  
  // Test 2: Environment variable impact
  console.log('\n2. Environment Variables:');
  const config = getAppConfig();
  console.log(`   VITE_ATPROTO_PDS: ${config.atprotoPds}`);
  console.log(`   VITE_ADMIN_HANDLE: ${config.adminHandle}`);
  console.log(`   VITE_AI_HANDLE: ${config.aiHandle}`);
  console.log(`   VITE_OAUTH_COLLECTION: ${config.collections.base}`);
  
  // Test 3: API endpoints
  console.log('\n3. API Endpoints:');
  const networkConfig = getNetworkConfig(config.atprotoPds);
  console.log(`   Admin PDS API: ${networkConfig.pdsApi}`);
  console.log(`   Admin Bsky API: ${networkConfig.bskyApi}`);
  console.log(`   User list URL: ${networkConfig.pdsApi}/xrpc/com.atproto.repo.listRecords?repo=${config.adminHandle}&collection=${config.collections.base}.user`);
  
  // Test 4: OAuth routing
  console.log('\n4. OAuth Routing:');
  console.log(`   Allowed handles: ${JSON.stringify(config.allowedHandles)}`);
  console.log(`   OAuth endpoint: https://${config.atprotoPds}/oauth/authorize`);
  
  console.log('\n=== End Tests ===\n');
}