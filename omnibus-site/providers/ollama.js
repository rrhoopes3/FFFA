/**
 * ollama.js - Ollama local/remote AI provider
 *
 * Connects to Ollama's OpenAI-compatible API (localhost or remote via tunnel).
 * Supports Cloudflare Tunnel auth via CF-Access-Client-Id/Secret headers.
 *
 * Recommended models for RTX 3090 (24GB VRAM):
 *   Quality (divisions):  qwen2.5:32b-instruct-q4_K_M  (128K context, ~20GB)
 *   Fast (sections):      qwen2.5:14b-instruct-q5_K_M  (128K context, ~12GB)
 *   Fastest:              llama3.1:8b-instruct           (128K context, ~5GB)
 */

const http = require('http');
const https = require('https');
const { AIProvider } = require('./base');

const MODELS = {
  fast: process.env.OLLAMA_FAST_MODEL || 'qwen2.5:14b-instruct-q5_K_M',
  smart: process.env.OLLAMA_SMART_MODEL || 'qwen2.5:32b-instruct-q4_K_M',
};

class OllamaProvider extends AIProvider {
  constructor() {
    super('Ollama');
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.cfClientId = process.env.CF_ACCESS_CLIENT_ID;
    this.cfClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
    this.numCtx = parseInt(process.env.OLLAMA_NUM_CTX || '32768', 10);
  }

  get maxContext() {
    return this.numCtx;
  }

  get inputCostPer1k() {
    return 0; // Local = free
  }

  get outputCostPer1k() {
    return 0;
  }

  isAvailable() {
    // Available if explicitly enabled or if no cloud providers are set
    const explicit = process.env.AI_PROVIDER === 'ollama';
    const hasUrl = !!process.env.OLLAMA_BASE_URL;
    return explicit || hasUrl;
  }

  async complete(systemPrompt, userPrompt, options = {}) {
    const model = options.model || (options.quality === 'high' ? MODELS.smart : MODELS.fast);
    const maxTokens = options.maxTokens || 4096;

    const url = new URL('/v1/chat/completions', this.baseUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      stream: false,
      options: {
        num_ctx: this.numCtx,
      },
    });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ollama', // Required but ignored by Ollama
    };

    // Cloudflare Access auth for remote tunnels
    if (this.cfClientId && this.cfClientSecret) {
      headers['CF-Access-Client-Id'] = this.cfClientId;
      headers['CF-Access-Client-Secret'] = this.cfClientSecret;
    }

    return new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers,
        // Longer timeout for local inference (large models can be slow)
        timeout: 600000, // 10 minutes
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Ollama API ${res.statusCode}: ${data.slice(0, 300)}`));
            return;
          }
          try {
            const resp = JSON.parse(data);
            const text = resp.choices?.[0]?.message?.content || '';
            resolve({
              text,
              model,
              usage: {
                inputTokens: resp.usage?.prompt_tokens || 0,
                outputTokens: resp.usage?.completion_tokens || 0,
              },
            });
          } catch (e) {
            reject(new Error(`Ollama parse error: ${e.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Ollama request timed out after ${600}s — model may still be loading`));
      });
      req.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          reject(new Error(`Ollama not running at ${this.baseUrl} — start with: ollama serve`));
        } else {
          reject(err);
        }
      });
      req.write(body);
      req.end();
    });
  }

  /**
   * Check if Ollama is reachable and list available models.
   */
  async listModels() {
    const url = new URL('/api/tags', this.baseUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const headers = {};
    if (this.cfClientId && this.cfClientSecret) {
      headers['CF-Access-Client-Id'] = this.cfClientId;
      headers['CF-Access-Client-Secret'] = this.cfClientSecret;
    }

    return new Promise((resolve, reject) => {
      transport.get({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        headers,
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Ollama ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            const resp = JSON.parse(data);
            resolve(resp.models || []);
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Pre-pull a model if not already downloaded.
   */
  async ensureModel(modelName) {
    const models = await this.listModels();
    const names = models.map(m => m.name);
    if (names.includes(modelName)) {
      console.log(`  Ollama: ${modelName} already available`);
      return;
    }
    console.log(`  Ollama: pulling ${modelName} (this may take a while)...`);
    // Pull is a long operation — just log the instruction
    console.log(`  Run: ollama pull ${modelName}`);
  }
}

module.exports = { OllamaProvider, MODELS };
