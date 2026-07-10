'use strict';

const anthropic = require('./anthropicProvider');
const openai    = require('./openaiProvider');
const gemini    = require('./geminiProvider');

const PROVIDERS = { anthropic, openai, gemini };

/**
 * Returns the active AI provider based on the AI_PROVIDER env var.
 * Defaults to 'anthropic' if unset.
 * Throws at call time (not at startup) so the server boots even without keys —
 * the route's 503 guard handles the unconfigured case gracefully.
 *
 * @returns {{ name: string, isConfigured: () => boolean, streamChat: Function }}
 */
function getProvider() {
  const name = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(
      `Unknown AI_PROVIDER "${name}". Valid values: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return provider;
}

module.exports = { getProvider };
