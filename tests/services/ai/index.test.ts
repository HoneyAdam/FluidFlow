import { describe, it, expect } from 'vitest';
import * as ai from '../../../services/ai/index';

describe('AI Service index', () => {
  it('exports types', () => {
    expect(ai.DEFAULT_PROVIDERS).toBeDefined();
    expect(ai.withRetry).toBeDefined();
  });

  it('exports providers', () => {
    expect(ai.GeminiProvider).toBeDefined();
    expect(ai.OpenAIProvider).toBeDefined();
    expect(ai.AnthropicProvider).toBeDefined();
    expect(ai.OllamaProvider).toBeDefined();
    expect(ai.LMStudioProvider).toBeDefined();
    expect(ai.ZAIProvider).toBeDefined();
    expect(ai.CerebrasProvider).toBeDefined();
    expect(ai.MiniMaxProvider).toBeDefined();
  });

  it('exports utilities', () => {
    expect(ai.prepareJsonRequest).toBeDefined();
    expect(ai.parseJsonResponse).toBeDefined();
    expect(ai.getJsonCapability).toBeDefined();
    expect(ai.supportsNativeSchema).toBeDefined();
    expect(ai.schemaHasDynamicKeys).toBeDefined();
  });

  it('exports tool utilities', () => {
    expect(ai.parseToolArguments).toBeDefined();
    expect(ai.createToolCallHandler).toBeDefined();
    expect(ai.ToolCallHandler).toBeDefined();
  });

  it('exports modelsSync', () => {
    expect(ai.detectModelFamily).toBeDefined();
    expect(ai.detectModelGroup).toBeDefined();
    expect(ai.enrichModelOption).toBeDefined();
    expect(ai.fetchProvidersFromModelsDev).toBeDefined();
    expect(ai.clearProviderCache).toBeDefined();
  });

  it('exports factory', () => {
    expect(ai.createProvider).toBeDefined();
  });

  it('exports storage', () => {
    expect(ai.loadProvidersFromLocalStorage).toBeDefined();
    expect(ai.saveProvidersToLocalStorage).toBeDefined();
    expect(ai.getActiveProviderIdFromLocalStorage).toBeDefined();
    expect(ai.setActiveProviderIdInLocalStorage).toBeDefined();
    expect(ai.loadProvidersFromLocalStorageSync).toBeDefined();
    expect(ai.loadProviders).toBeDefined();
    expect(ai.saveProviders).toBeDefined();
    expect(ai.getActiveProviderId).toBeDefined();
    expect(ai.setActiveProviderId).toBeDefined();
    expect(ai.loadProvidersSync).toBeDefined();
  });

  it('exports ProviderManager', () => {
    expect(ai.ProviderManager).toBeDefined();
    expect(ai.getProviderManager).toBeDefined();
  });
});
