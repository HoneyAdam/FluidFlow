import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('../../../services/ai/providerStorage', () => ({
  loadProvidersFromLocalStorage: vi.fn().mockResolvedValue([{
    id: 'default-gemini', type: 'gemini', name: 'Gemini', apiKey: '', models: [], defaultModel: 'gemini-2.5-flash',
  }]),
  loadProvidersFromLocalStorageSync: vi.fn().mockReturnValue([{
    id: 'default-gemini', type: 'gemini', name: 'Gemini', apiKey: '', models: [], defaultModel: 'gemini-2.5-flash',
  }]),
  saveProvidersToLocalStorage: vi.fn().mockResolvedValue(undefined),
  getActiveProviderIdFromLocalStorage: vi.fn().mockReturnValue('default-gemini'),
  setActiveProviderIdInLocalStorage: vi.fn(),
}));

vi.mock('../../../services/projectApi', () => ({
  settingsApi: {
    getAIProviders: vi.fn().mockResolvedValue({ providers: [], activeId: 'default-gemini' }),
    saveAIProviders: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../hooks/useDebugStore', () => ({
  debugLog: {
    request: vi.fn().mockReturnValue('req-1'),
    response: vi.fn(),
    error: vi.fn(),
    stream: vi.fn(),
    streamUpdate: vi.fn(),
    toolCall: vi.fn(),
  },
}));

vi.mock('../../../contexts/PromptConfirmationContext', () => ({
  requestPromptConfirmation: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../services/analyticsStorage', () => ({
  addUsageRecord: vi.fn().mockResolvedValue(undefined),
}));

// Must import after mocks
import { ProviderManager } from '../../../services/ai/ProviderManager';
import { loadProvidersFromLocalStorage, loadProvidersFromLocalStorageSync, saveProvidersToLocalStorage, getActiveProviderIdFromLocalStorage, setActiveProviderIdInLocalStorage } from '../../../services/ai/providerStorage';
import { settingsApi } from '../../../services/projectApi';
import { requestPromptConfirmation } from '../../../contexts/PromptConfirmationContext';

const mockLoadSync = loadProvidersFromLocalStorageSync as ReturnType<typeof vi.fn>;
const mockLoadAsync = loadProvidersFromLocalStorage as ReturnType<typeof vi.fn>;
const mockSaveLocal = saveProvidersToLocalStorage as ReturnType<typeof vi.fn>;
const mockGetActiveId = getActiveProviderIdFromLocalStorage as ReturnType<typeof vi.fn>;
const mockSetActiveId = setActiveProviderIdInLocalStorage as ReturnType<typeof vi.fn>;
const mockGetAIProviders = settingsApi.getAIProviders as ReturnType<typeof vi.fn>;
const mockSaveAIProviders = settingsApi.saveAIProviders as ReturnType<typeof vi.fn>;
const mockConfirm = requestPromptConfirmation as ReturnType<typeof vi.fn>;

describe('ProviderManager', () => {
  let pm: ProviderManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSync.mockReturnValue([{
      id: 'test-openai', type: 'openai', name: 'Test OpenAI',
      apiKey: 'sk-test', models: [{ id: 'gpt-4', name: 'GPT-4' }],
      defaultModel: 'gpt-4', baseUrl: 'https://api.openai.com/v1',
    }]);
    mockGetActiveId.mockReturnValue('test-openai');
    mockLoadAsync.mockResolvedValue([{
      id: 'test-openai', type: 'openai', name: 'Test OpenAI',
      apiKey: 'sk-test', models: [{ id: 'gpt-4', name: 'GPT-4' }],
      defaultModel: 'gpt-4', baseUrl: 'https://api.openai.com/v1',
    }]);
    mockGetAIProviders.mockResolvedValue({ providers: [], activeId: 'test-openai' });
    pm = new ProviderManager();
  });

  describe('constructor', () => {
    it('loads from localStorage sync on construction', () => {
      expect(mockLoadSync).toHaveBeenCalled();
    });

    it('gets active provider id', () => {
      expect(mockGetActiveId).toHaveBeenCalled();
    });
  });

  describe('getConfigs', () => {
    it('returns provider configs', () => {
      const configs = pm.getConfigs();
      expect(configs.length).toBeGreaterThan(0);
    });
  });

  describe('getConfig', () => {
    it('returns config by id', () => {
      const config = pm.getConfig('test-openai');
      expect(config).toBeDefined();
      expect(config!.id).toBe('test-openai');
    });

    it('returns undefined for unknown id', () => {
      expect(pm.getConfig('nonexistent')).toBeUndefined();
    });
  });

  describe('getActiveConfig', () => {
    it('returns active provider config', () => {
      const config = pm.getActiveConfig();
      expect(config).toBeDefined();
      expect(config!.id).toBe('test-openai');
    });
  });

  describe('getActiveProviderId', () => {
    it('returns active provider id', () => {
      expect(pm.getActiveProviderId()).toBe('test-openai');
    });
  });

  describe('setActiveProvider', () => {
    it('sets active provider', async () => {
      await pm.setActiveProvider('test-openai');
      expect(pm.getActiveProviderId()).toBe('test-openai');
      expect(mockSaveLocal).toHaveBeenCalled();
    });

    it('does nothing for unknown provider', async () => {
      await pm.setActiveProvider('nonexistent');
      // Should not crash
    });
  });

  describe('addProvider', () => {
    it('adds a new provider', async () => {
      await pm.addProvider({
        id: 'new-provider', type: 'anthropic', name: 'New',
        apiKey: 'key', models: [], defaultModel: 'claude-3',
      });
      expect(pm.getConfig('new-provider')).toBeDefined();
      expect(mockSaveLocal).toHaveBeenCalled();
    });
  });

  describe('updateProvider', () => {
    it('updates existing provider', async () => {
      await pm.updateProvider('test-openai', { name: 'Updated Name' });
      expect(pm.getConfig('test-openai')!.name).toBe('Updated Name');
    });

    it('does nothing for unknown provider', async () => {
      await pm.updateProvider('nonexistent', { name: 'X' });
    });
  });

  describe('deleteProvider', () => {
    it('deletes a provider', async () => {
      await pm.deleteProvider('test-openai');
      expect(pm.getConfig('test-openai')).toBeUndefined();
    });

    it('switches active if deleted was active', async () => {
      await pm.addProvider({
        id: 'other', type: 'gemini', name: 'Other',
        models: [], defaultModel: 'gemini-2.5-flash',
      });
      await pm.deleteProvider('test-openai');
      expect(pm.getActiveProviderId()).toBe('other');
    });
  });

  describe('getProvider', () => {
    it('returns provider instance by id', () => {
      const provider = pm.getProvider('test-openai');
      expect(provider).not.toBeNull();
    });

    it('returns active provider when no id', () => {
      const provider = pm.getProvider();
      expect(provider).not.toBeNull();
    });

    it('returns null for unknown provider', () => {
      expect(pm.getProvider('nonexistent')).toBeNull();
    });

    it('caches provider instances', () => {
      const p1 = pm.getProvider('test-openai');
      const p2 = pm.getProvider('test-openai');
      expect(p1).toBe(p2);
    });
  });

  describe('testProvider', () => {
    it('returns error for unknown provider', async () => {
      const result = await pm.testProvider('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Provider not found');
    });
  });

  describe('generate', () => {
    it('throws when no active provider', async () => {
      // Create PM with no providers
      mockLoadSync.mockReturnValue([]);
      mockGetActiveId.mockReturnValue('');
      const emptyPm = new ProviderManager();
      await expect(emptyPm.generate({ prompt: 'test' })).rejects.toThrow('No active provider');
    });
  });

  describe('generateStream', () => {
    it('throws when no active provider', async () => {
      mockLoadSync.mockReturnValue([]);
      mockGetActiveId.mockReturnValue('');
      const emptyPm = new ProviderManager();
      await expect(emptyPm.generateStream({ prompt: 'test' }, vi.fn())).rejects.toThrow('No active provider');
    });
  });

  describe('waitForInit', () => {
    it('resolves after initialization', async () => {
      await pm.waitForInit();
      // Should not throw
    });
  });
});
