// Cloudflare Worker for secure Ollama proxy
export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': 'https://log.syui.ai',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-User-Token',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Verify origin
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    
    // 許可されたオリジンのみ
    const allowedOrigins = [
      'https://log.syui.ai',
      'https://log.pages.dev' // Cloudflare Pages preview
    ];
    
    if (!origin || !allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return new Response('Forbidden', { status: 403 });
    }

    // ユーザー認証トークン検証（オプション）
    const userToken = request.headers.get('X-User-Token');
    if (env.REQUIRE_AUTH && !userToken) {
      return new Response('Unauthorized', { status: 401 });
    }

    // リクエストボディを取得
    const body = await request.json();
    
    // プロンプトサイズ制限
    if (body.prompt && body.prompt.length > 1000) {
      return new Response(JSON.stringify({
        error: 'Prompt too long. Maximum 1000 characters.'
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // レート制限（CF Workers KV使用）
    if (env.RATE_LIMITER) {
      const clientIP = request.headers.get('CF-Connecting-IP');
      const rateLimitKey = `rate:${clientIP}`;
      const currentCount = await env.RATE_LIMITER.get(rateLimitKey) || 0;
      
      if (currentCount >= 20) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded. Try again later.'
        }), { 
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // カウント増加（1時間TTL）
      await env.RATE_LIMITER.put(rateLimitKey, currentCount + 1, {
        expirationTtl: 3600
      });
    }

    // Ollamaへプロキシ
    const ollamaResponse = await fetch(env.OLLAMA_API_URL || 'https://ollama.syui.ai/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 内部認証ヘッダー（必要に応じて）
        'X-Internal-Token': env.OLLAMA_INTERNAL_TOKEN || ''
      },
      body: JSON.stringify(body)
    });

    // レスポンスを返す
    const responseData = await ollamaResponse.text();
    
    return new Response(responseData, {
      status: ollamaResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Cache-Control': 'no-store'
      }
    });
  }
};