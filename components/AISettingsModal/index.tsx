import React from 'react';
import { X, Settings2 } from 'lucide-react';
import { useAISettings } from './useAISettings';
import { ProviderSidebar } from './ProviderSidebar';
import { ProviderDetails } from './ProviderDetails';
import type { AISettingsModalProps } from './types';

export type { AISettingsModalProps } from './types';

export const AISettingsModal: React.FC<AISettingsModalProps> = (props) => {
  const settings = useAISettings(props);

  if (!props.isOpen) return null;

  const testResult = settings.selectedProviderId ? settings.testResults[settings.selectedProviderId] : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 backdrop-blur-sm animate-in fade-in duration-200" style={{ backgroundColor: 'var(--theme-overlay)' }} role="dialog" aria-modal="true" aria-label="AI settings">
      <div className="w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto animate-in slide-in-from-bottom-4 duration-300" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--theme-border-light)', background: 'linear-gradient(90deg, var(--color-info-subtle), var(--color-feature-subtle))' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-info-subtle)' }}>
              <Settings2 className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>AI Provider Settings</h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Configure AI providers, models, and API keys</p>
            </div>
          </div>
          <button onClick={props.onClose} className="p-2 rounded-lg transition-colors">
            <X className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          <ProviderSidebar
            providers={settings.providers}
            activeProviderId={settings.activeProviderId}
            selectedProviderId={settings.selectedProviderId}
            setSelectedProviderId={settings.setSelectedProviderId}
            showAddProvider={settings.showAddProvider}
            setShowAddProvider={settings.setShowAddProvider}
            newProviderType={settings.newProviderType}
            setNewProviderType={settings.setNewProviderType}
            addProvider={settings.addProvider}
          />

          {settings.selectedProvider ? (
            <ProviderDetails
              provider={settings.selectedProvider}
              providers={settings.providers}
              activeProviderId={settings.activeProviderId}
              testResult={testResult ?? null}
              showApiKey={settings.showApiKey}
              setShowApiKey={settings.setShowApiKey}
              editingModels={settings.editingModels}
              setEditingModels={settings.setEditingModels}
              showAddModel={settings.showAddModel}
              setShowAddModel={settings.setShowAddModel}
              newModel={settings.newModel}
              setNewModel={settings.setNewModel}
              fetchingModels={settings.fetchingModels}
              customModelInput={settings.customModelInput}
              setCustomModelInput={settings.setCustomModelInput}
              updateProvider={settings.updateProvider}
              deleteProvider={settings.deleteProvider}
              testConnection={settings.testConnection}
              setActiveProvider={settings.setActiveProvider}
              addModel={settings.addModel}
              updateModelInProvider={settings.updateModelInProvider}
              deleteModel={settings.deleteModel}
              fetchModels={settings.fetchModels}
              addCustomModel={settings.addCustomModel}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--theme-text-dim)' }}>
              Select a provider to configure
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
