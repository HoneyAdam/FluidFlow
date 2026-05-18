import { OpenAICompatibleProvider } from './base/OpenAICompatibleProvider';
import type { ProviderConfig, ModelOption } from '../types';

/**
 * LM Studio AI Provider
 * Local OpenAI-compatible inference server
 * Supports vision models and JSON output
 */
export class LMStudioProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getApiEndpoint(): string {
    return `${this.config.baseUrl}/chat/completions`;
  }

  protected getModelsEndpoint(): string {
    // LM Studio uses /api/tags for model listing
    return `${this.config.baseUrl}/api/tags`;
  }

  protected getAuthHeader(): string {
    // LM Studio typically doesn't require auth, but can use optional API key
    return this.config.apiKey ? `Bearer ${this.config.apiKey}` : '';
  }

  protected getDefaultMaxTokens(): number {
    return 4096;
  }

  protected getAdditionalHeaders(): Record<string, string> {
    return this.config.headers || {};
  }

  protected mapModel(m: { name: string }): ModelOption {
    return {
      id: m.name,
      name: m.name,
      description: 'Local model',
      supportsVision: true, // LM Studio can support vision models
      supportsStreaming: true,
    };
  }
}

// Re-export for convenience
export { LMStudioProvider as default };