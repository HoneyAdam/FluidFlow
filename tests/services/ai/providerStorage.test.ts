import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/clientEncryption', () => ({
  encryptProviderConfigs: vi.fn(async (configs: unknown[]) => configs),
  decryptProviderConfigs: vi.fn(async (configs: unknown[]) => configs),
}));

import {
  loadProvidersFromLocalStorage,
  loadProvidersFromLocalStorageSync,
  saveProvidersToLocalStorage,
  getActiveProviderIdFromLocalStorage,
  setActiveProviderIdInLocalStorage,
  loadProviders,
  saveProviders,
  getActiveProviderId,
  setActiveProviderId,
  loadProvidersSync,
} from '../../../services/ai/providerStorage';

describe('providerStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadProvidersFromLocalStorage', () => {
    it('returns default config when nothing saved', async () => {
      const result = await loadProvidersFromLocalStorage();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('default-gemini');
    });

    it('loads saved providers', async () => {
      const configs = [{ id: 'test', type: 'openai', name: 'Test', models: [], defaultModel: 'gpt-4' }];
      localStorage.setItem('fluidflow_ai_providers', JSON.stringify(configs));

      const result = await loadProvidersFromLocalStorage();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test');
    });

    it('returns default when saved data is not array', async () => {
      localStorage.setItem('fluidflow_ai_providers', '"not an array"');
      const result = await loadProvidersFromLocalStorage();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('default-gemini');
    });

    it('returns default on parse error', async () => {
      localStorage.setItem('fluidflow_ai_providers', 'invalid json');
      const result = await loadProvidersFromLocalStorage();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('default-gemini');
    });
  });

  describe('loadProvidersFromLocalStorageSync', () => {
    it('returns default when nothing saved', () => {
      const result = loadProvidersFromLocalStorageSync();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('default-gemini');
    });

    it('loads saved providers synchronously', () => {
      const configs = [{ id: 'sync-test', type: 'gemini', name: 'Sync', models: [], defaultModel: '' }];
      localStorage.setItem('fluidflow_ai_providers', JSON.stringify(configs));

      const result = loadProvidersFromLocalStorageSync();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sync-test');
    });

    it('returns default when not array', () => {
      localStorage.setItem('fluidflow_ai_providers', '{}');
      const result = loadProvidersFromLocalStorageSync();
      expect(result).toHaveLength(1);
    });

    it('returns default on error', () => {
      localStorage.setItem('fluidflow_ai_providers', 'bad');
      const result = loadProvidersFromLocalStorageSync();
      expect(result).toHaveLength(1);
    });
  });

  describe('saveProvidersToLocalStorage', () => {
    it('saves providers to localStorage', async () => {
      const configs = [{ id: 'save-test', type: 'openai', name: 'Save', models: [], defaultModel: '' }];
      await saveProvidersToLocalStorage(configs);

      const saved = JSON.parse(localStorage.getItem('fluidflow_ai_providers')!);
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('save-test');
    });
  });

  describe('getActiveProviderIdFromLocalStorage', () => {
    it('returns default when nothing saved', () => {
      expect(getActiveProviderIdFromLocalStorage()).toBe('default-gemini');
    });

    it('returns saved active provider ID', () => {
      localStorage.setItem('fluidflow_active_provider', 'my-provider');
      expect(getActiveProviderIdFromLocalStorage()).toBe('my-provider');
    });
  });

  describe('setActiveProviderIdInLocalStorage', () => {
    it('saves active provider ID', () => {
      setActiveProviderIdInLocalStorage('test-id');
      expect(localStorage.getItem('fluidflow_active_provider')).toBe('test-id');
    });
  });

  describe('legacy aliases', () => {
    it('loadProviders is same as loadProvidersFromLocalStorage', () => {
      expect(loadProviders).toBe(loadProvidersFromLocalStorage);
    });

    it('saveProviders is same as saveProvidersToLocalStorage', () => {
      expect(saveProviders).toBe(saveProvidersToLocalStorage);
    });

    it('getActiveProviderId is same as getActiveProviderIdFromLocalStorage', () => {
      expect(getActiveProviderId).toBe(getActiveProviderIdFromLocalStorage);
    });

    it('setActiveProviderId is same as setActiveProviderIdInLocalStorage', () => {
      expect(setActiveProviderId).toBe(setActiveProviderIdInLocalStorage);
    });

    it('loadProvidersSync is same as loadProvidersFromLocalStorageSync', () => {
      expect(loadProvidersSync).toBe(loadProvidersFromLocalStorageSync);
    });
  });
});
