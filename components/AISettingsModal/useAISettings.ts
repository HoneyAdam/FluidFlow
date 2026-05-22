import { useState, useEffect } from 'react';
import {
  ProviderConfig, ProviderType, DEFAULT_PROVIDERS, ModelOption,
  getProviderManager
} from '@/services/ai';
import type { AISettingsModalProps, TestResult, UseAISettingsReturn } from './types';

export function useAISettings({ isOpen, onProviderChange }: AISettingsModalProps): UseAISettingsReturn {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>('');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderType, setNewProviderType] = useState<ProviderType>('openai');
  const [editingModels, setEditingModels] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModel, setNewModel] = useState<Partial<ModelOption>>({ id: '', name: '', description: '' });
  const [fetchingModels, setFetchingModels] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');

  // Load providers on mount
  useEffect(() => {
    if (isOpen) {
      const manager = getProviderManager();
      setProviders(manager.getConfigs());
      const activeId = manager.getActiveProviderId();
      setActiveProviderId(activeId);
      setSelectedProviderId(activeId);
    }
  }, [isOpen]);

  const selectedProvider = providers.find(p => p.id === selectedProviderId);

  // ── Provider operations ──────────────────────────────────────────────

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    const manager = getProviderManager();
    manager.updateProvider(id, updates);
    setProviders(manager.getConfigs());
  };

  const deleteProvider = (id: string) => {
    if (providers.length <= 1) return;
    const manager = getProviderManager();
    manager.deleteProvider(id);
    setProviders(manager.getConfigs());
    const newActiveId = manager.getActiveProviderId();
    setActiveProviderId(newActiveId);
    if (selectedProviderId === id) {
      setSelectedProviderId(newActiveId);
    }
  };

  const testConnection = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { status: 'testing' } }));
    const manager = getProviderManager();
    const result = await manager.testProvider(id);
    setTestResults(prev => ({
      ...prev,
      [id]: { status: result.success ? 'success' : 'error', message: result.error }
    }));
  };

  const addProvider = () => {
    const defaults = DEFAULT_PROVIDERS[newProviderType];
    const newProvider: ProviderConfig = {
      id: `${newProviderType}-${Date.now()}`,
      ...defaults,
      apiKey: '',
    };
    const manager = getProviderManager();
    manager.addProvider(newProvider);
    setProviders(manager.getConfigs());
    setSelectedProviderId(newProvider.id);
    setShowAddProvider(false);
  };

  const setActiveProviderFn = (id: string) => {
    const manager = getProviderManager();
    manager.setActiveProvider(id);
    setActiveProviderId(id);
    const config = manager.getConfig(id);
    if (config && onProviderChange) {
      onProviderChange(id, config.defaultModel);
    }
  };

  // ── Model operations ─────────────────────────────────────────────────

  const addModel = () => {
    if (!newModel.id || !newModel.name || !selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;

    const modelToAdd: ModelOption = {
      id: newModel.id,
      name: newModel.name,
      description: newModel.description || '',
      supportsVision: newModel.supportsVision || false,
      supportsStreaming: newModel.supportsStreaming !== false,
      contextWindow: newModel.contextWindow || 128000
    };

    updateProvider(selectedProviderId, { models: [...provider.models, modelToAdd] });
    setNewModel({ id: '', name: '', description: '' });
    setShowAddModel(false);
  };

  const updateModelInProvider = (modelId: string, updates: Partial<ModelOption>) => {
    if (!selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;
    const updatedModels = provider.models.map(m => m.id === modelId ? { ...m, ...updates } : m);
    updateProvider(selectedProviderId, { models: updatedModels });
  };

  const deleteModel = (modelId: string) => {
    if (!selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider || provider.models.length <= 1) return;
    const updatedModels = provider.models.filter(m => m.id !== modelId);
    const updates: Partial<ProviderConfig> = { models: updatedModels };
    const firstUpdated = updatedModels[0];
    if (provider.defaultModel === modelId && firstUpdated) {
      updates.defaultModel = firstUpdated.id;
    }
    updateProvider(selectedProviderId, updates);
  };

  const fetchModels = async () => {
    if (!selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;

    setFetchingModels(true);
    try {
      const manager = getProviderManager();
      const providerInstance = manager.getProvider(selectedProviderId);
      if (providerInstance?.listModels) {
        const models = await providerInstance.listModels();
        if (models.length > 0) {
          const existingIds = new Set(provider.models.map(m => m.id));
          const newModels = models.filter(m => !existingIds.has(m.id));
          const mergedModels = [...provider.models, ...newModels];
          updateProvider(selectedProviderId, {
            models: mergedModels,
            defaultModel: provider.defaultModel || mergedModels[0]?.id
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setFetchingModels(false);
    }
  };

  const addCustomModel = () => {
    if (!customModelInput.trim() || !selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;
    if (provider.models.some(m => m.id === customModelInput)) {
      setCustomModelInput('');
      return;
    }

    const newModelOption: ModelOption = {
      id: customModelInput,
      name: customModelInput,
      description: 'Custom model',
      supportsVision: false,
      supportsStreaming: true,
    };

    updateProvider(selectedProviderId, {
      models: [...provider.models, newModelOption],
      defaultModel: provider.defaultModel || customModelInput
    });
    setCustomModelInput('');
  };

  return {
    providers, activeProviderId,
    selectedProviderId, setSelectedProviderId,
    selectedProvider,
    showApiKey, setShowApiKey,
    testResults,
    showAddProvider, setShowAddProvider,
    newProviderType, setNewProviderType,
    editingModels, setEditingModels,
    showAddModel, setShowAddModel,
    newModel, setNewModel,
    fetchingModels,
    customModelInput, setCustomModelInput,
    updateProvider, deleteProvider, testConnection,
    addProvider, setActiveProvider: setActiveProviderFn,
    addModel, updateModelInProvider, deleteModel,
    fetchModels, addCustomModel,
  };
}
