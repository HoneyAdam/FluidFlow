import { OpenAICompatibleProvider } from './base/OpenAICompatibleProvider';
import type { ProviderConfig, ModelOption } from '../types';

/**
 * Cerebras AI Provider
 * Uses OpenAI-compatible chat completions API
 * Known for extremely fast inference (~2000-3000 tokens/sec)
 */
export class CerebrasProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getApiEndpoint(): string {
    return `${this.config.baseUrl}/chat/completions`;
  }

  protected getModelsEndpoint(): string {
    return `${this.config.baseUrl}/models`;
  }

  protected getAuthHeader(): string {
    return `Bearer ${this.config.apiKey}`;
  }

  protected getDefaultMaxTokens(): number {
    return 8192;
  }

  protected mapModel(m: { id: string }): ModelOption {
    return {
      id: m.id,
      name: m.id,
      description: `Cerebras ${m.id}`,
      supportsVision: false,
      supportsStreaming: true,
    };
  }
}

// Re-export for convenience
export { CerebrasProvider as default };