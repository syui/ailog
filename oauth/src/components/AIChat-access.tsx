// Cloudflare Access対応版の例
const response = await fetch(`${aiConfig.host}/api/generate`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Cloudflare Access Service Token
    'CF-Access-Client-Id': import.meta.env.VITE_CF_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret': import.meta.env.VITE_CF_ACCESS_CLIENT_SECRET,
  },
  body: JSON.stringify({
    model: aiConfig.model,
    prompt: prompt,
    stream: false,
    options: {
      temperature: 0.9,
      top_p: 0.9,
      num_predict: 200,
      repeat_penalty: 1.1,
    }
  }),
});