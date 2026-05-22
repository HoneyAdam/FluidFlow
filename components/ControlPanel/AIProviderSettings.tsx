import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Check, X, Loader2,
  ChevronDown, ChevronRight, Eye, EyeOff, RefreshCw,
  ExternalLink, AlertCircle, CheckCircle2, Pencil,
  Download
} from 'lucide-react';
import {
  ProviderConfig, ProviderType, DEFAULT_PROVIDERS, ModelOption,
  getProviderManager
} from '../../services/ai';
import { ProviderIcon } from '../shared/ProviderIcon';

interface AIProviderSettingsProps {
  onProviderChange?: (providerId: string, modelId: string) => void;
}

export const AIProviderSettings: React.FC<AIProviderSettingsProps> = ({ onProviderChange }) => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>('');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>>({});
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderType, setNewProviderType] = useState<ProviderType>('openai');
  const [editingModels, setEditingModels] = useState<string | null>(null);
  const [showAddModel, setShowAddModel] = useState<string | null>(null);
  const [newModel, setNewModel] = useState<Partial<ModelOption>>({ id: '', name: '', description: '' });
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [customModelInput, setCustomModelInput] = useState<Record<string, string>>({});

  // Load providers on mount
  useEffect(() => {
    const manager = getProviderManager();
    setProviders(manager.getConfigs());
    setActiveProviderId(manager.getActiveProviderId());
  }, []);



  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    const manager = getProviderManager();
    manager.updateProvider(id, updates);
    setProviders(manager.getConfigs());
  };

  const deleteProvider = (id: string) => {
    if (providers.length <= 1) return; // Keep at least one

    const manager = getProviderManager();
    manager.deleteProvider(id);
    setProviders(manager.getConfigs());
    setActiveProviderId(manager.getActiveProviderId());
  };

  const testConnection = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { status: 'testing' } }));

    const manager = getProviderManager();
    const result = await manager.testProvider(id);

    setTestResults(prev => ({
      ...prev,
      [id]: {
        status: result.success ? 'success' : 'error',
        message: result.error
      }
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
    setExpandedProvider(newProvider.id);
    setShowAddProvider(false);
  };

  const setActiveProvider = (id: string) => {
    const manager = getProviderManager();
    manager.setActiveProvider(id);
    setActiveProviderId(id);

    const config = manager.getConfig(id);
    if (config && onProviderChange) {
      onProviderChange(id, config.defaultModel);
    }
  };

  const addModel = (providerId: string) => {
    if (!newModel.id || !newModel.name) return;

    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const modelToAdd: ModelOption = {
      id: newModel.id,
      name: newModel.name,
      description: newModel.description || '',
      supportsVision: newModel.supportsVision || false,
      supportsStreaming: newModel.supportsStreaming !== false,
      contextWindow: newModel.contextWindow || 128000
    };

    updateProvider(providerId, {
      models: [...provider.models, modelToAdd]
    });

    setNewModel({ id: '', name: '', description: '' });
    setShowAddModel(null);
  };

  const updateModelInProvider = (providerId: string, modelId: string, updates: Partial<ModelOption>) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const updatedModels = provider.models.map(m =>
      m.id === modelId ? { ...m, ...updates } : m
    );

    updateProvider(providerId, { models: updatedModels });
  };

  const deleteModel = (providerId: string, modelId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider || provider.models.length <= 1) return;

    const updatedModels = provider.models.filter(m => m.id !== modelId);

    // If we're deleting the default model, set a new default
    const updates: Partial<ProviderConfig> = { models: updatedModels };
    if (provider.defaultModel === modelId) {
      const firstModel = updatedModels[0];
      if (firstModel) updates.defaultModel = firstModel.id;
    }

    updateProvider(providerId, updates);
  };

  // Fetch models from provider API (for local providers and OpenRouter)
  const fetchModels = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    setFetchingModels(prev => ({ ...prev, [providerId]: true }));

    try {
      const manager = getProviderManager();
      const providerInstance = manager.getProvider(providerId);

      if (providerInstance?.listModels) {
        const models = await providerInstance.listModels();
        if (models.length > 0) {
          // Merge with existing models, avoiding duplicates
          const existingIds = new Set(provider.models.map(m => m.id));
          const newModels = models.filter(m => !existingIds.has(m.id));
          const mergedModels = [...provider.models, ...newModels];

          updateProvider(providerId, {
            models: mergedModels,
            defaultModel: provider.defaultModel || (mergedModels[0]?.id ?? '')
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setFetchingModels(prev => ({ ...prev, [providerId]: false }));
    }
  };

  // Add custom model by name (for local providers)
  const addCustomModel = (providerId: string) => {
    const modelName = customModelInput[providerId]?.trim();
    if (!modelName) return;

    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    // Check if model already exists
    if (provider.models.some(m => m.id === modelName)) {
      setCustomModelInput(prev => ({ ...prev, [providerId]: '' }));
      return;
    }

    const newModelOption: ModelOption = {
      id: modelName,
      name: modelName,
      description: 'Custom model',
      supportsVision: false,
      supportsStreaming: true,
    };

    updateProvider(providerId, {
      models: [...provider.models, newModelOption],
      defaultModel: provider.defaultModel || modelName
    });

    setCustomModelInput(prev => ({ ...prev, [providerId]: '' }));
  };

  const activeConfig = providers.find(p => p.id === activeProviderId);

  return (
    <div className="space-y-4">
      {/* Active Provider Summary */}
      <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
        <div className="flex items-center gap-2">
          {activeConfig && <ProviderIcon type={activeConfig.type} />}
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>{activeConfig?.name || 'No provider'}</div>
            <div className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>{activeConfig?.defaultModel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeProviderId}
            onChange={(e) => setActiveProvider(e.target.value)}
            className="text-xs rounded px-2 py-1 outline-none"
            style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)' }}
          >
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Provider List */}
      <div className="space-y-2">
        {providers.map(provider => {
          const isExpanded = expandedProvider === provider.id;
          const isActive = activeProviderId === provider.id;
          const testResult = testResults[provider.id];

          return (
            <div
              key={provider.id}
              className="rounded-lg overflow-hidden transition-colors"
              style={{
                border: isActive ? '1px solid var(--color-info-border)' : '1px solid var(--theme-border-light)',
                backgroundColor: isActive ? 'var(--color-info-subtle)' : 'var(--theme-glass-100)'
              }}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                className="w-full flex items-center justify-between p-3 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-3 h-3" style={{ color: 'var(--theme-text-muted)' }} /> : <ChevronRight className="w-3 h-3" style={{ color: 'var(--theme-text-muted)' }} />}
                  <ProviderIcon type={provider.type} />
                  <span className="text-sm" style={{ color: 'var(--theme-text-primary)' }}>{provider.name}</span>
                  {provider.isLocal && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}>LOCAL</span>
                  )}
                  {isActive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>ACTIVE</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {testResult?.status === 'testing' && <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-info)' }} />}
                  {testResult?.status === 'success' && <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--color-success)' }} />}
                  {testResult?.status === 'error' && <AlertCircle className="w-3 h-3" style={{ color: 'var(--color-error)' }} />}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
                  {/* API Key */}
                  {!provider.isLocal && (
                    <div className="pt-3">
                      <label className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--theme-text-dim)' }}>API Key</label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type={showApiKey[provider.id] ? 'text' : 'password'}
                          value={provider.apiKey || ''}
                          onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                          placeholder={`Enter your ${provider.name} API key`}
                          className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                          style={{ backgroundColor: 'var(--theme-surface-dark)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                        />
                        <button
                          onClick={() => setShowApiKey(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                          className="p-1.5 rounded transition-colors"
                        >
                          {showApiKey[provider.id] ? <EyeOff className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} /> : <Eye className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Base URL */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--theme-text-dim)' }}>Base URL</label>
                    <input
                      type="text"
                      value={provider.baseUrl || ''}
                      onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                      placeholder="https://api.example.com"
                      className="w-full mt-1 px-2 py-1.5 rounded text-xs outline-none font-mono"
                      style={{ backgroundColor: 'var(--theme-surface-dark)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                    />
                  </div>

                  {/* Default Model */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--theme-text-dim)' }}>Default Model</label>
                      {/* Fetch Models button for local providers and OpenRouter */}
                      {(provider.isLocal || provider.type === 'openrouter') && (
                        <button
                          onClick={() => fetchModels(provider.id)}
                          disabled={fetchingModels[provider.id]}
                          className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded transition-colors disabled:opacity-50"
                          style={{ color: 'var(--color-info)' }}
                          title="Fetch available models from server"
                        >
                          {fetchingModels[provider.id] ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            <Download className="w-2.5 h-2.5" />
                          )}
                          Fetch Models
                        </button>
                      )}
                    </div>
                    <select
                      value={provider.defaultModel}
                      onChange={(e) => updateProvider(provider.id, { defaultModel: e.target.value })}
                      className="w-full mt-1 px-2 py-1.5 rounded text-xs outline-none"
                      style={{ backgroundColor: 'var(--theme-surface-dark)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                    >
                      {provider.models.map(m => (
                        <option key={m.id} value={m.id}>{m.name} - {m.description}</option>
                      ))}
                    </select>

                    {/* Custom Model Input for local providers */}
                    {provider.isLocal && (
                      <div className="mt-2">
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={customModelInput[provider.id] || ''}
                            onChange={(e) => setCustomModelInput(prev => ({ ...prev, [provider.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addCustomModel(provider.id)}
                            placeholder="Enter model name (e.g., llama3.2, mistral)"
                            className="flex-1 px-2 py-1.5 rounded text-xs outline-none font-mono"
                            style={{ backgroundColor: 'var(--theme-surface-dark)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                          />
                          <button
                            onClick={() => addCustomModel(provider.id)}
                            disabled={!customModelInput[provider.id]?.trim()}
                            className="px-2 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] rounded transition-colors"
                            style={{ backgroundColor: 'var(--color-success)', color: 'var(--theme-text-primary)' }}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-[9px] mt-1" style={{ color: 'var(--theme-text-dim)' }}>
                          Type model name and press Enter or click + to add
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Models List */}
                  <div className="pt-2" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--theme-text-dim)' }}>Models ({provider.models.length})</label>
                      <button
                        onClick={() => setEditingModels(editingModels === provider.id ? null : provider.id)}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors"
                        style={{
                          backgroundColor: editingModels === provider.id ? 'var(--color-info-subtle)' : 'transparent',
                          color: editingModels === provider.id ? 'var(--color-info)' : 'var(--theme-text-muted)'
                        }}
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        {editingModels === provider.id ? 'Done' : 'Edit'}
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {provider.models.map(model => (
                        <div
                          key={model.id}
                          className="flex items-center justify-between p-2 rounded-lg transition-colors"
                          style={{
                            backgroundColor: provider.defaultModel === model.id ? 'var(--color-info-subtle)' : 'var(--theme-surface-dark)',
                            border: provider.defaultModel === model.id ? '1px solid var(--color-info-border)' : '1px solid var(--theme-border-light)'
                          }}
                        >
                          {editingModels === provider.id ? (
                            <div className="flex-1 space-y-1.5">
                              <div className="text-[9px] font-mono px-1" style={{ color: 'var(--theme-text-dim)' }}>{model.id}</div>
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={model.name}
                                  onChange={(e) => updateModelInProvider(provider.id, model.id, { name: e.target.value })}
                                  placeholder="Name"
                                  className="flex-1 px-1.5 py-0.5 rounded text-[10px] outline-none"
                                  style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                                />
                                <input
                                  type="text"
                                  value={model.description || ''}
                                  onChange={(e) => updateModelInProvider(provider.id, model.id, { description: e.target.value })}
                                  placeholder="Description"
                                  className="flex-1 px-1.5 py-0.5 rounded text-[10px] outline-none"
                                  style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-muted)' }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] truncate" style={{ color: 'var(--theme-text-primary)' }}>{model.name}</div>
                              <div className="text-[9px] font-mono truncate" style={{ color: 'var(--theme-text-dim)' }}>{model.id}</div>
                            </div>
                          )}
                          <div className="flex items-center gap-1 ml-2">
                            {model.supportsVision && (
                              <span className="text-[8px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}>👁</span>
                            )}
                            {editingModels === provider.id && provider.models.length > 1 && (
                              <button
                                onClick={() => deleteModel(provider.id, model.id)}
                                className="p-1 rounded transition-colors"
                                title="Delete model"
                              >
                                <Trash2 className="w-3 h-3" style={{ color: 'var(--color-error)' }} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Model */}
                    {editingModels === provider.id && (
                      showAddModel === provider.id ? (
                        <div className="mt-2 p-2 rounded-lg space-y-2" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)' }}>
                          <input
                            type="text"
                            value={newModel.id || ''}
                            onChange={(e) => setNewModel(prev => ({ ...prev, id: e.target.value }))}
                            placeholder="Model ID (e.g., gpt-4o)"
                            className="w-full px-2 py-1 rounded text-[10px] font-mono outline-none"
                            style={{ backgroundColor: 'var(--theme-surface-dark)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                          />
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newModel.name || ''}
                              onChange={(e) => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Display Name"
                              className="flex-1 px-2 py-1 rounded text-[10px] outline-none"
                              style={{ backgroundColor: 'var(--theme-surface-dark)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                            />
                            <input
                              type="text"
                              value={newModel.description || ''}
                              onChange={(e) => setNewModel(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Description"
                              className="flex-1 px-2 py-1 rounded text-[10px] outline-none"
                              style={{ backgroundColor: 'var(--theme-surface-dark)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-muted)' }}
                            />
                          </div>
                          <div className="flex items-center gap-3 text-[10px]">
                            <label className="flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
                              <input
                                type="checkbox"
                                checked={newModel.supportsVision || false}
                                onChange={(e) => setNewModel(prev => ({ ...prev, supportsVision: e.target.checked }))}
                                className="w-3 h-3 rounded"
                              />
                              Vision
                            </label>
                            <label className="flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
                              <input
                                type="checkbox"
                                checked={newModel.supportsStreaming !== false}
                                onChange={(e) => setNewModel(prev => ({ ...prev, supportsStreaming: e.target.checked }))}
                                className="w-3 h-3 rounded"
                              />
                              Streaming
                            </label>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => addModel(provider.id)}
                              disabled={!newModel.id || !newModel.name}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] rounded transition-colors"
                              style={{ backgroundColor: 'var(--color-success)', color: 'var(--theme-text-primary)' }}
                            >
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                            <button
                              onClick={() => {
                                setShowAddModel(null);
                                setNewModel({ id: '', name: '', description: '' });
                              }}
                              className="px-2 py-1 text-[10px] rounded transition-colors"
                              style={{ color: 'var(--theme-text-muted)' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowAddModel(provider.id)}
                          className="w-full mt-2 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded-lg border border-dashed transition-colors"
                          style={{ backgroundColor: 'var(--theme-glass-100)', color: 'var(--theme-text-muted)', borderColor: 'var(--theme-border)' }}
                        >
                          <Plus className="w-3 h-3" />
                          Add Model
                        </button>
                      )
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => testConnection(provider.id)}
                        disabled={testResult?.status === 'testing'}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] disabled:opacity-50 rounded transition-colors"
                        style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)' }}
                      >
                        {testResult?.status === 'testing' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Test Connection
                      </button>
                      {!isActive && (
                        <button
                          onClick={() => setActiveProvider(provider.id)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded transition-colors"
                          style={{ backgroundColor: 'var(--color-info)', color: 'var(--theme-text-primary)' }}
                        >
                          <Check className="w-3 h-3" />
                          Set Active
                        </button>
                      )}
                    </div>
                    {providers.length > 1 && (
                      <button
                        onClick={() => deleteProvider(provider.id)}
                        className="p-1.5 rounded transition-colors"
                        title="Delete provider"
                      >
                        <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
                      </button>
                    )}
                  </div>

                  {/* Test Result Message */}
                  {testResult?.message && (
                    <div className="text-[10px] px-2 py-1 rounded" style={{
                      backgroundColor: testResult.status === 'error' ? 'var(--color-error-subtle)' : 'var(--color-success-subtle)',
                      color: testResult.status === 'error' ? 'var(--color-error)' : 'var(--color-success)'
                    }}>
                      {testResult.status === 'error' ? testResult.message : 'Connection successful!'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Provider */}
      {showAddProvider ? (
        <div className="p-3 rounded-lg space-y-3" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--theme-text-primary)' }}>Add Provider</span>
            <button onClick={() => setShowAddProvider(false)} className="p-1 rounded">
              <X className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(DEFAULT_PROVIDERS) as [ProviderType, typeof DEFAULT_PROVIDERS.gemini][]).map(([type, config]) => (
              <button
                key={type}
                onClick={() => setNewProviderType(type)}
                className="flex flex-col items-center gap-1 p-2 rounded-lg transition-colors"
                style={{
                  border: newProviderType === type ? '1px solid var(--color-info)' : '1px solid var(--theme-border-light)',
                  backgroundColor: newProviderType === type ? 'var(--color-info-subtle)' : 'var(--theme-surface-dark)'
                }}
              >
                <ProviderIcon type={type} className="w-5 h-5" />
                <span className="text-[10px]" style={{ color: 'var(--theme-text-secondary)' }}>{config.name}</span>
              </button>
            ))}
          </div>
          <button
            onClick={addProvider}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--color-success)', color: 'var(--theme-text-primary)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add {DEFAULT_PROVIDERS[newProviderType].name}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddProvider(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-dashed transition-colors"
          style={{ backgroundColor: 'var(--theme-glass-100)', color: 'var(--theme-text-muted)', borderColor: 'var(--theme-border)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Provider
        </button>
      )}

      {/* Help Links */}
      <div className="pt-2" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
        <div className="text-[10px] mb-2" style={{ color: 'var(--theme-text-dim)' }}>Get API Keys:</div>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'Google AI', url: 'https://aistudio.google.com/apikey' },
            { name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
            { name: 'Anthropic', url: 'https://console.anthropic.com/settings/keys' },
            { name: 'OpenRouter', url: 'https://openrouter.ai/keys' },
          ].map(link => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] transition-colors"
              style={{ color: 'var(--color-info)' }}
            >
              {link.name}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
