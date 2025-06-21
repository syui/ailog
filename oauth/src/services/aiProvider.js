/**
 * AI Provider Abstract Interface
 * Supports multiple AI backends (Ollama, Claude, etc.)
 */

export class AIProvider {
  constructor(config) {
    this.config = config
  }

  /**
   * Send a question to the AI and get a response
   * @param {string} question - User's question
   * @param {Object} context - Additional context (user info, etc.)
   * @returns {Promise<{answer: string}>}
   */
  async ask(question, context = {}) {
    throw new Error('ask() method must be implemented by subclass')
  }

  /**
   * Check if the provider is available
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    throw new Error('healthCheck() method must be implemented by subclass')
  }
}

/**
 * Ollama Provider Implementation
 */
export class OllamaProvider extends AIProvider {
  constructor(config) {
    super(config)
    this.host = config.host || 'https://ollama.syui.ai'
    this.model = config.model || 'gemma3:1b'
    this.systemPrompt = config.systemPrompt || ''
  }

  async ask(question, context = {}) {
    // Build enhanced prompt with user context
    const userInfo = context.userProfile 
      ? `相手の名前は${context.userProfile.displayName || context.userProfile.handle}です。` 
      : ''
    const enhancedSystemPrompt = `${this.systemPrompt} ${userInfo}`
    
    const prompt = `${enhancedSystemPrompt}

Question: ${question}

Answer:`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    
    try {
      const response = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://syui.ai',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.9,
            top_p: 0.9,
            num_predict: 200,
            repeat_penalty: 1.1,
          }
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`)
      }

      const data = await response.json()
      return { answer: data.response || 'エラーが発生しました' }
      
    } catch (error) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timeout')
      }
      throw error
    }
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.host}/api/tags`, {
        method: 'GET',
        headers: {
          'Origin': 'https://syui.ai',
        }
      })
      return response.ok
    } catch {
      return false
    }
  }
}

/**
 * Claude MCP Server Provider Implementation
 */
export class ClaudeMCPProvider extends AIProvider {
  constructor(config) {
    super(config)
    this.endpoint = config.endpoint || 'https://your-server.com/api/claude-mcp'
    this.apiKey = config.apiKey // Server-side auth token
    this.systemPrompt = config.systemPrompt || ''
  }

  async ask(question, context = {}) {
    const userInfo = context.userProfile 
      ? `相手の名前は${context.userProfile.displayName || context.userProfile.handle}です。` 
      : ''
    const enhancedSystemPrompt = `${this.systemPrompt} ${userInfo}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000) // Longer timeout for Claude
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          question: question,
          systemPrompt: enhancedSystemPrompt,
          context: context
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Claude MCP error: ${response.status}`)
      }

      const data = await response.json()
      return { answer: data.answer || 'エラーが発生しました' }
      
    } catch (error) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timeout')
      }
      throw error
    }
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      })
      return response.ok
    } catch {
      return false
    }
  }
}

/**
 * AI Provider Factory
 */
export class AIProviderFactory {
  static create(provider, config) {
    switch (provider) {
      case 'ollama':
        return new OllamaProvider(config)
      case 'claude-mcp':
        return new ClaudeMCPProvider(config)
      default:
        throw new Error(`Unknown AI provider: ${provider}`)
    }
  }

  static createFromEnv() {
    const provider = import.meta.env.VITE_AI_PROVIDER || 'ollama'
    
    const config = {
      systemPrompt: import.meta.env.VITE_AI_SYSTEM_PROMPT || '',
    }

    switch (provider) {
      case 'ollama':
        config.host = import.meta.env.VITE_AI_HOST
        config.model = import.meta.env.VITE_AI_MODEL
        break
      case 'claude-mcp':
        config.endpoint = import.meta.env.VITE_CLAUDE_MCP_ENDPOINT
        config.apiKey = import.meta.env.VITE_CLAUDE_MCP_API_KEY
        break
    }

    return AIProviderFactory.create(provider, config)
  }
}