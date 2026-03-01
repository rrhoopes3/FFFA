/**
 * providers/index.js - Provider factory with automatic fallback
 */

const { ClaudeProvider } = require('./claude');
const { OpenAIProvider } = require('./openai');

function getProviders() {
  const providers = [];
  const preferred = (process.env.AI_PROVIDER || 'claude').toLowerCase();

  const claude = new ClaudeProvider();
  const openai = new OpenAIProvider();

  if (preferred === 'claude') {
    if (claude.isAvailable()) providers.push(claude);
    if (openai.isAvailable()) providers.push(openai);
  } else {
    if (openai.isAvailable()) providers.push(openai);
    if (claude.isAvailable()) providers.push(claude);
  }

  if (providers.length === 0) {
    throw new Error(
      'No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env'
    );
  }

  return providers;
}

/**
 * Run a completion with automatic fallback between providers.
 */
async function completeWithFallback(systemPrompt, userPrompt, options = {}) {
  const providers = getProviders();
  let lastError;

  for (const provider of providers) {
    try {
      const result = await provider.complete(systemPrompt, userPrompt, options);
      result.provider = provider.name;
      return result;
    } catch (err) {
      console.error(`  ${provider.name} failed: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(`All providers failed. Last error: ${lastError.message}`);
}

module.exports = { getProviders, completeWithFallback };
