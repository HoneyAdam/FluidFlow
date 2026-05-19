import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Check, Loader2, Server, Monitor, Cpu,
  Eye, EyeOff, RefreshCw, ExternalLink,
  AlertCircle, CheckCircle2, Pencil, Download,
  Zap, Key, Link2
} from 'lucide-react';
import {
  ProviderConfig, ProviderType, DEFAULT_PROVIDERS, ModelOption,
  getProviderManager, applyKnownMetadataToAll,
  fetchProvidersFromModelsDev, modelsDevProviderToConfig, clearProviderCache,
  type ProviderMetadata
} from '../../../services/ai';
import { ProviderIcon } from '../../shared/ProviderIcon';
import { SettingsToggle } from '../shared/SettingsToggle';

interface AIProvidersPanelProps {
  onProviderChange?: (providerId: string, modelId: string) => void;
}

export const AIProvidersPanel: React.FC<AIProvidersPanelProps> = ({ onProviderChange }) => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>('');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>>({});
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderType, setNewProviderType] = useState<ProviderType>('openai');
  const [editingModels, setEditingModels] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [modelsDevProviders, setModelsDevProviders] = useState<ProviderMetadata[]>([]);
  const [loadingModelsDev, setLoadingModelsDev] = useState(false);
  const [syncingModels, setSyncingModels] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');

  // Load providers on mount
  useEffect(() => {
    const manager = getProviderManager();
    setProviders(manager.getConfigs());
    const activeId = manager.getActiveProviderId();
    setActiveProviderId(activeId);
    setSelectedProviderId(activeId);
  }, []);

  const selectedProvider = providers.find(p => p.id === selectedProviderId);

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    const manager = getProviderManager();
    manager.updateProvider(id, updates);
    setProviders(manager.getConfigs());

    // If updating the active provider's default model, notify parent
    if (id === activeProviderId && updates.defaultModel && onProviderChange) {
      onProviderChange(id, updates.defaultModel);
    }
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

  const addProviderFromModelsDev = (providerMetadata: ProviderMetadata) => {
    const config = modelsDevProviderToConfig(providerMetadata);
    const newProvider: ProviderConfig = {
      id: `modelsdev-${providerMetadata.id}-${Date.now()}`,
      ...config,
      apiKey: '',
      syncEnabled: true,
    };
    const manager = getProviderManager();
    manager.addProvider(newProvider);
    setProviders(manager.getConfigs());
    setSelectedProviderId(newProvider.id);
    setShowAddProvider(false);
  };

  const loadModelsDevProviders = async () => {
    setLoadingModelsDev(true);
    try {
      const providers = await fetchProvidersFromModelsDev();
      setModelsDevProviders(providers);
    } catch (error) {
      console.error('Failed to load models.dev providers:', error);
    } finally {
      setLoadingModelsDev(false);
    }
  };

  const filteredModelsDevProviders = providerSearch
    ? modelsDevProviders.filter(p =>
        p.name.toLowerCase().includes(providerSearch.toLowerCase()) ||
        (p.api && p.api.toLowerCase().includes(providerSearch.toLowerCase()))
      )
    : modelsDevProviders;

  const setActiveProvider = (id: string) => {
    const manager = getProviderManager();
    manager.setActiveProvider(id);
    setActiveProviderId(id);
    const config = manager.getConfig(id);
    if (config && onProviderChange) {
      onProviderChange(id, config.defaultModel);
    }
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
    if (provider.defaultModel === modelId) {
      updates.defaultModel = updatedModels[0].id;
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
        let models = await providerInstance.listModels();
        if (models.length > 0) {
          // Apply known metadata enrichment (family, tool calling, pricing)
          models = applyKnownMetadataToAll(models, provider.type);

          const existingIds = new Set(provider.models.map(m => m.id));
          const newModels = models.filter(m => !existingIds.has(m.id));
          const mergedModels = [...provider.models, ...newModels];
          updateProvider(selectedProviderId, {
            models: mergedModels,
            defaultModel: provider.defaultModel || mergedModels[0].id
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setFetchingModels(false);
    }
  };

  const syncModelsFromModelsDev = async () => {
    if (!selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider || !provider.syncEnabled) return;

    setSyncingModels(true);
    try {
      clearProviderCache(); // Force fresh fetch
      const allProviders = await fetchProvidersFromModelsDev();

      // Find matching provider in models.dev
      const modelsDevProvider = allProviders.find(p =>
        p.api && (p.api === provider.baseUrl || p.name.toLowerCase().includes(provider.name.toLowerCase()))
      );

      if (modelsDevProvider) {
        const models = Object.values(modelsDevProvider.models).map(m => ({
          id: m.id,
          name: m.name.replace(/^[^:]+:\s*/, ''),
          description: m.tool_call ? 'Tool calling supported' : 'No tool calling',
          supportsVision: m.modalities?.input.includes('image') ?? false,
          supportsStreaming: true,
          supportsToolCalling: m.tool_call,
          contextWindow: m.limit?.context,
          maxOutput: m.limit?.output,
          pricing: m.cost ? { input: m.cost.input, output: m.cost.output } : undefined,
          releaseDate: m.release_date,
        }));

        if (models.length > 0) {
          // Apply metadata enrichment
          const enrichedModels = applyKnownMetadataToAll(models, provider.type);
          const existingIds = new Set(provider.models.map(m => m.id));
          const newModels = enrichedModels.filter(m => !existingIds.has(m.id));
          const mergedModels = [...provider.models, ...newModels];

          updateProvider(selectedProviderId, {
            models: mergedModels,
            defaultModel: provider.defaultModel || mergedModels[0].id
          });
        }
      }
    } catch (error) {
      console.error('Failed to sync from models.dev:', error);
    } finally {
      setSyncingModels(false);
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

  const testResult = selectedProviderId ? testResults[selectedProviderId] : null;

  return (
    <div className="flex h-full">
      {/* Provider List - Left */}
      <div className="w-64 flex flex-col" style={{ borderRight: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Providers</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {providers.map(provider => (
            <button
              key={provider.id}
              onClick={() => setSelectedProviderId(provider.id)}
              className="w-full flex items-center gap-3 p-3 rounded-lg transition-all"
              style={{
                backgroundColor: selectedProviderId === provider.id ? 'var(--theme-accent-subtle)' : 'transparent',
                border: selectedProviderId === provider.id ? '1px solid var(--theme-accent-muted)' : '1px solid transparent'
              }}
            >
              <ProviderIcon type={provider.type} />
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm truncate" style={{ color: 'var(--theme-text-primary)' }}>{provider.name}</div>
                <div className="text-[10px] truncate" style={{ color: 'var(--theme-text-dim)' }}>{provider.defaultModel}</div>
              </div>
              <div className="flex items-center gap-1">
                {activeProviderId === provider.id && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>ACTIVE</span>
                )}
                {provider.isLocal ? (
                  <Server className="w-3 h-3" style={{ color: 'var(--theme-ai-accent)' }} />
                ) : provider.apiKey ? (
                  <Key className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
                ) : (
                  <AlertCircle className="w-3 h-3" style={{ color: 'var(--color-warning)' }} />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Add Provider */}
        <div className="p-2" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
          {showAddProvider ? (
            <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--theme-text-secondary)' }}>
                Add Provider
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Search providers..."
                className="w-full px-2 py-1.5 text-xs rounded outline-none"
                style={{
                  backgroundColor: 'var(--theme-glass-200)',
                  border: '1px solid var(--theme-border-light)',
                  color: 'var(--theme-text-primary)'
                }}
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
              />

              {/* models.dev Providers */}
              {loadingModelsDev ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--theme-accent)' }} />
                  <span className="ml-2 text-xs" style={{ color: 'var(--theme-text-dim)' }}>Loading...</span>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--theme-text-muted)' }}>
                    From models.dev ({filteredModelsDevProviders.length})
                  </div>
                  {filteredModelsDevProviders.map(provider => (
                    <button
                      key={provider.id}
                      onClick={() => addProviderFromModelsDev(provider)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left"
                      style={{
                        border: '1px solid var(--theme-border-light)',
                        backgroundColor: 'var(--theme-glass-200)'
                      }}
                    >
                      <ProviderIcon type="openrouter" className="w-4 h-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate" style={{ color: 'var(--theme-text-primary)' }}>{provider.name}</div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--theme-text-dim)' }}>
                          {Object.keys(provider.models).length} models
                        </div>
                      </div>
                    </button>
                  ))}
                  {!loadingModelsDev && modelsDevProviders.length === 0 && (
                    <button
                      onClick={loadModelsDevProviders}
                      className="w-full py-2 text-xs rounded-lg"
                      style={{ color: 'var(--theme-accent)' }}
                    >
                      Load models.dev providers
                    </button>
                  )}
                  {!loadingModelsDev && providerSearch && filteredModelsDevProviders.length === 0 && (
                    <p className="text-xs text-center py-2" style={{ color: 'var(--theme-text-dim)' }}>
                      No providers found for "{providerSearch}"
                    </p>
                  )}
                </div>
              )}

              {/* Local LLM Options */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                  Local LLM
                </div>
                <button
                  onClick={() => { setNewProviderType('ollama'); addProvider(); }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left"
                  style={{ border: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-200)' }}
                >
                  <Server className="w-4 h-4" style={{ color: 'var(--color-feature)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs" style={{ color: 'var(--theme-text-primary)' }}>Ollama</div>
                    <div className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>localhost:11434</div>
                  </div>
                </button>
                <button
                  onClick={() => { setNewProviderType('lmstudio'); addProvider(); }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left"
                  style={{ border: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-200)' }}
                >
                  <Monitor className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs" style={{ color: 'var(--theme-text-primary)' }}>LM Studio</div>
                    <div className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>localhost:1234</div>
                  </div>
                </button>
              </div>

              {/* Custom Provider */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                  Custom
                </div>
                <button
                  onClick={() => { setNewProviderType('custom'); addProvider(); }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left"
                  style={{ border: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-200)' }}
                >
                  <Cpu className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs" style={{ color: 'var(--theme-text-primary)' }}>Custom Provider</div>
                    <div className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>Enter custom API endpoint</div>
                  </div>
                </button>
              </div>

              <button
                onClick={() => setShowAddProvider(false)}
                className="w-full py-1.5 text-xs rounded transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setShowAddProvider(true);
                if (modelsDevProviders.length === 0) {
                  loadModelsDevProviders();
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg transition-colors text-sm"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <Plus className="w-4 h-4" />
              Add Provider
            </button>
          )}
        </div>
      </div>

      {/* Provider Details - Right */}
      {selectedProvider ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Provider Header */}
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
            <div className="flex items-center gap-3">
              <ProviderIcon type={selectedProvider.type} className="w-8 h-8" />
              <div>
                <h3 className="text-lg font-medium" style={{ color: 'var(--theme-text-primary)' }}>{selectedProvider.name}</h3>
                <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                  {selectedProvider.isLocal ? 'Local Provider' : 'Cloud Provider'} • {selectedProvider.models.length} models
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => testConnection(selectedProvider.id)}
                disabled={testResult?.status === 'testing'}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--theme-button-secondary)', color: 'var(--theme-text-primary)' }}
              >
                {testResult?.status === 'testing' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Test
              </button>
              {activeProviderId !== selectedProvider.id && (
                <button
                  onClick={() => setActiveProvider(selectedProvider.id)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
                >
                  <Check className="w-4 h-4" />
                  Set Active
                </button>
              )}
              {providers.length > 1 && (
                <button
                  onClick={() => deleteProvider(selectedProvider.id)}
                  className="p-1.5 rounded-lg transition-colors"
                  title="Delete provider"
                  style={{ color: 'var(--color-error)' }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Test Result */}
          {testResult && testResult.status !== 'idle' && (
            <div
              className="mx-4 mt-4 px-4 py-2 rounded-lg text-sm flex items-center gap-2"
              style={{
                backgroundColor: testResult.status === 'testing' ? 'var(--color-info-subtle)' :
                  testResult.status === 'success' ? 'var(--color-success-subtle)' : 'var(--color-error-subtle)',
                color: testResult.status === 'testing' ? 'var(--color-info)' :
                  testResult.status === 'success' ? 'var(--color-success)' : 'var(--color-error)'
              }}
            >
              {testResult.status === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
              {testResult.status === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {testResult.status === 'error' && <AlertCircle className="w-4 h-4" />}
              {testResult.status === 'testing' ? 'Testing connection...' :
               testResult.status === 'success' ? 'Connection successful!' :
               testResult.message || 'Connection failed'}
            </div>
          )}

          {/* Provider Settings */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Connection Settings */}
            <div className="grid grid-cols-2 gap-4">
              {/* API Key */}
              {!selectedProvider.isLocal && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                    <Key className="w-4 h-4" />
                    API Key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey[selectedProvider.id] ? 'text' : 'password'}
                      value={selectedProvider.apiKey || ''}
                      onChange={(e) => updateProvider(selectedProvider.id, { apiKey: e.target.value })}
                      placeholder={`Enter your ${selectedProvider.name} API key`}
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                    />
                    <button
                      onClick={() => setShowApiKey(prev => ({ ...prev, [selectedProvider.id]: !prev[selectedProvider.id] }))}
                      className="p-2 rounded-lg transition-colors"
                    >
                      {showApiKey[selectedProvider.id] ? <EyeOff className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} /> : <Eye className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Base URL */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  <Link2 className="w-4 h-4" />
                  Base URL
                </label>
                <input
                  type="text"
                  value={selectedProvider.baseUrl || ''}
                  onChange={(e) => updateProvider(selectedProvider.id, { baseUrl: e.target.value })}
                  placeholder="https://api.example.com"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
                  style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                />
              </div>
            </div>

            {/* Default Model */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  <Zap className="w-4 h-4" />
                  Default Model
                </label>
                <div className="flex gap-2">
                  {selectedProvider.syncEnabled && (
                    <button
                      onClick={syncModelsFromModelsDev}
                      disabled={syncingModels}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors disabled:opacity-50"
                      style={{ color: 'var(--color-success)' }}
                      title="Sync from models.dev"
                    >
                      {syncingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      Sync
                    </button>
                  )}
                  {(selectedProvider.isLocal || selectedProvider.type === 'openrouter') && (
                    <button
                      onClick={fetchModels}
                      disabled={fetchingModels}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors disabled:opacity-50"
                      style={{ color: 'var(--theme-accent)' }}
                    >
                      {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                      Fetch
                    </button>
                  )}
                </div>
              </div>
              <select
                value={selectedProvider.defaultModel}
                onChange={(e) => updateProvider(selectedProvider.id, { defaultModel: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              >
                {[...selectedProvider.models].sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                  <option key={m.id} value={m.id}>{m.name} - {m.description}</option>
                ))}
              </select>

              {/* Custom Model Input for Local */}
              {selectedProvider.isLocal && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomModel()}
                    placeholder="Enter custom model name..."
                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
                    style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                  />
                  <button
                    onClick={addCustomModel}
                    disabled={!customModelInput.trim()}
                    className="px-4 py-2 disabled:opacity-50 text-sm rounded-lg transition-colors"
                    style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Models List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
                  Available Models ({selectedProvider.models.length})
                </h4>
                <button
                  onClick={() => setEditingModels(!editingModels)}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors"
                  style={{
                    backgroundColor: editingModels ? 'var(--theme-accent-subtle)' : 'transparent',
                    color: editingModels ? 'var(--theme-accent)' : 'var(--theme-text-muted)'
                  }}
                >
                  <Pencil className="w-3 h-3" />
                  {editingModels ? 'Done' : 'Edit'}
                </button>
              </div>

              {/* Models Grid */}
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {[...selectedProvider.models].sort((a, b) => a.name.localeCompare(b.name)).map(model => (
                  <div
                    key={model.id}
                    className="p-3 rounded-lg transition-colors"
                    style={{
                      backgroundColor: selectedProvider.defaultModel === model.id ? 'var(--theme-accent-subtle)' : 'var(--theme-glass-100)',
                      border: selectedProvider.defaultModel === model.id ? '1px solid var(--theme-accent-muted)' : '1px solid var(--theme-border-light)'
                    }}
                  >
                    {editingModels ? (
                      <div className="space-y-2">
                        <div className="text-xs font-mono truncate" style={{ color: 'var(--theme-text-dim)' }}>{model.id}</div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs">
                            <label className="flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
                              <input
                                type="checkbox"
                                checked={model.supportsVision || false}
                                onChange={(e) => updateModelInProvider(model.id, { supportsVision: e.target.checked })}
                                className="w-3 h-3"
                              />
                              Vision
                            </label>
                          </div>
                          {selectedProvider.models.length > 1 && (
                            <button
                              onClick={() => deleteModel(model.id)}
                              className="p-1 rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" style={{ color: 'var(--color-error)' }} />
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>{model.name}</div>
                          <div className="text-xs font-mono truncate" style={{ color: 'var(--theme-text-dim)' }}>{model.id}</div>
                          {model.family && model.family !== 'unknown' && (
                            <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--theme-text-dim)' }}>
                              Family: {model.family}{model.group ? ` (${model.group})` : ''}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          {model.supportsVision && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-ai-subtle)', color: 'var(--theme-ai-accent)' }}>V</span>
                          )}
                          {model.supportsToolCalling && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>TC</span>
                          )}
                          {model.pricing && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-dim)' }}>
                              ${model.pricing.input?.toFixed(2) || '?'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tool Calling Settings */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
                Tool Calling
              </h4>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}>
                <SettingsToggle
                  label="Enable Tool Calling"
                  description="Allow AI to use file operation tools"
                  checked={selectedProvider.toolCallingEnabled || false}
                  onChange={(checked) => updateProvider(selectedProvider.id, { toolCallingEnabled: checked })}
                />
                {selectedProvider.toolCallingEnabled && (
                  <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
                    <SettingsToggle
                      label="Allow Tool Writes"
                      description="Allow tools to modify project files"
                      checked={selectedProvider.allowToolWrites || false}
                      onChange={(checked) => updateProvider(selectedProvider.id, { allowToolWrites: checked })}
                    />
                    <SettingsToggle
                      label="Sync with models.dev"
                      description="Sync model metadata and capabilities"
                      checked={selectedProvider.syncEnabled || false}
                      onChange={(checked) => updateProvider(selectedProvider.id, { syncEnabled: checked })}
                    />
                    {selectedProvider.syncEnabled && (
                      <div className="pl-4">
                        <label className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                          models.dev API Key (optional)
                        </label>
                        <input
                          type="password"
                          className="w-full mt-1 px-3 py-1.5 rounded text-sm"
                          style={{
                            backgroundColor: 'var(--theme-glass-200)',
                            border: '1px solid var(--theme-border-light)',
                            color: 'var(--theme-text)',
                          }}
                          placeholder="Premium API key for enhanced sync"
                          value={selectedProvider.syncApiKey || ''}
                          onChange={(e) => updateProvider(selectedProvider.id, { syncApiKey: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Help Links Footer */}
          <div className="p-3" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
            <div className="flex items-center gap-4 text-xs">
              <span style={{ color: 'var(--theme-text-dim)' }}>Get API Keys:</span>
              {[
                { name: 'Google', url: 'https://aistudio.google.com/apikey' },
                { name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
                { name: 'Anthropic', url: 'https://console.anthropic.com/settings/keys' },
                { name: 'OpenRouter', url: 'https://openrouter.ai/keys' },
              ].map(link => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 transition-colors"
                  style={{ color: 'var(--theme-accent)' }}
                >
                  {link.name}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--theme-text-dim)' }}>
          Select a provider to configure
        </div>
      )}
    </div>
  );
};

export default AIProvidersPanel;
