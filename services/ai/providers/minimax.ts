/**
 * MiniMax Provider
 *
 * MiniMax API provider with reasoning support.
 * Uses backend proxy for API calls.
 * Extends OpenAICompatibleProvider for shared tool calling functionality.
 */

import type { AIProvider, ProviderConfig, ModelOption } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { OpenAICompatibleProvider } from './base/OpenAICompatibleProvider';

const MINIMAX_BASE_URL = 'https://api.minimax.io/v1';
const DEFAULT_MODEL = 'MiniMax-M2.1';
const DEFAULT_MAX_TOKENS = 16384;
const PROXY_URL = '/api/ai/minimax';

/**
 * MiniMax Provider - uses backend proxy with OpenAI-compatible format
 */
export class MiniMaxProvider extends OpenAICompatibleProvider implements AIProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getApiEndpoint(): string {
    return `${PROXY_URL}/chat/completions`;
  }

  protected getModelsEndpoint(): string {
    return `${PROXY_URL}/models`;
  }

  protected getAuthHeader(): string {
    return `Bearer ${this.config.apiKey}`;
  }

  protected getDefaultMaxTokens(): number {
    return DEFAULT_MAX_TOKENS;
  }

  protected getAdditionalHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.config.apiKey || '',
      'X-Base-URL': this.config.baseUrl || MINIMAX_BASE_URL,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetchWithTimeout(`${PROXY_URL}/test`, {
        headers: {
          'X-API-Key': this.config.apiKey || '',
          'X-Base-URL': this.config.baseUrl || MINIMAX_BASE_URL,
        },
        timeout: 5000,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[MiniMax] Connection test failed:', message);
      return { success: false, error: message };
    }
  }

  async listModels(): Promise<ModelOption[]> {
    return [{
      id: DEFAULT_MODEL,
      name: 'MiniMax M2.1',
      description: 'Flagship with reasoning',
      supportsVision: false,
      supportsStreaming: true,
      contextWindow: 200000,
    }];
  }
}