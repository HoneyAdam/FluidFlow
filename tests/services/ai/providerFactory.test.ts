import { describe, it, expect } from 'vitest';
import { createProvider } from '../../../services/ai/providerFactory';
import type { ProviderConfig } from '../../../services/ai/types';

function makeConfig(type: string): ProviderConfig {
  return {
    id: `test-${type}`,
    type: type as ProviderConfig['type'],
    name: `Test ${type}`,
    models: [],
    defaultModel: 'test-model',
    apiKey: 'test-key',
  };
}

describe('createProvider', () => {
  it('creates GeminiProvider for gemini', () => {
    const provider = createProvider(makeConfig('gemini'));
    expect(provider).toBeDefined();
    expect(provider.config.type).toBe('gemini');
  });

  it('creates OpenAIProvider for openai', () => {
    const provider = createProvider(makeConfig('openai'));
    expect(provider.config.type).toBe('openai');
  });

  it('creates OpenAIProvider for openrouter', () => {
    const provider = createProvider(makeConfig('openrouter'));
    expect(provider.config.type).toBe('openrouter');
  });

  it('creates OpenAIProvider for custom', () => {
    const provider = createProvider(makeConfig('custom'));
    expect(provider.config.type).toBe('custom');
  });

  it('creates ZAIProvider for zai', () => {
    const provider = createProvider(makeConfig('zai'));
    expect(provider.config.type).toBe('zai');
  });

  it('creates CerebrasProvider for cerebras', () => {
    const provider = createProvider(makeConfig('cerebras'));
    expect(provider.config.type).toBe('cerebras');
  });

  it('creates AnthropicProvider for anthropic', () => {
    const provider = createProvider(makeConfig('anthropic'));
    expect(provider.config.type).toBe('anthropic');
  });

  it('creates OllamaProvider for ollama', () => {
    const provider = createProvider(makeConfig('ollama'));
    expect(provider.config.type).toBe('ollama');
  });

  it('creates LMStudioProvider for lmstudio', () => {
    const provider = createProvider(makeConfig('lmstudio'));
    expect(provider.config.type).toBe('lmstudio');
  });

  it('creates MiniMaxProvider for minimax', () => {
    const provider = createProvider(makeConfig('minimax'));
    expect(provider.config.type).toBe('minimax');
  });

  it('throws for unknown provider type', () => {
    expect(() => createProvider(makeConfig('unknown'))).toThrow('Unknown provider type: unknown');
  });
});
