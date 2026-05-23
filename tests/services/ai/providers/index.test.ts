import { describe, it, expect } from 'vitest';
import * as providers from '../../../../services/ai/providers';

describe('providers/index', () => {
  it('exports all providers', () => {
    expect(providers.GeminiProvider).toBeDefined();
    expect(providers.OpenAIProvider).toBeDefined();
    expect(providers.AnthropicProvider).toBeDefined();
    expect(providers.OllamaProvider).toBeDefined();
    expect(providers.LMStudioProvider).toBeDefined();
    expect(providers.ZAIProvider).toBeDefined();
    expect(providers.CerebrasProvider).toBeDefined();
    expect(providers.MiniMaxProvider).toBeDefined();
  });
});
