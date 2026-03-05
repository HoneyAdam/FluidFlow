import React, { useState, useEffect } from 'react';
import { Package, Check, Info } from 'lucide-react';
import { TechStackConfig, TECH_STACK_OPTIONS, DEFAULT_TECH_STACK } from '../../../types';
import { STORAGE_KEYS } from '../../../constants/storage';

type TechCategory = keyof TechStackConfig;

const CATEGORY_INFO: Record<TechCategory, { label: string; description: string }> = {
  styling: { label: 'Styling', description: 'CSS framework or styling approach' },
  icons: { label: 'Icons', description: 'Icon library for UI elements' },
  uiComponents: { label: 'UI Components', description: 'Pre-built component libraries' },
  stateManagement: { label: 'State Management', description: 'How to manage application state' },
  routing: { label: 'Routing', description: 'Navigation and URL handling' },
  dataFetching: { label: 'Data Fetching', description: 'HTTP client and data loading' },
  forms: { label: 'Forms', description: 'Form handling and validation' },
  animations: { label: 'Animations', description: 'Motion and transitions' },
  charts: { label: 'Charts', description: 'Data visualization and graphs' },
  dateTime: { label: 'Date & Time', description: 'Date manipulation utilities' },
  media: { label: 'Media', description: 'File uploads and media handling' },
  testing: { label: 'Testing', description: 'Testing framework and utilities' }
};

export const TechStackPanel: React.FC = () => {
  const [techStack, setTechStack] = useState<TechStackConfig>(DEFAULT_TECH_STACK);
  const [selectedCategory, setSelectedCategory] = useState<TechCategory>('styling');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TECH_STACK);
    if (saved) {
      try {
        setTechStack({ ...DEFAULT_TECH_STACK, ...JSON.parse(saved) });
      } catch {
        setTechStack(DEFAULT_TECH_STACK);
      }
    }
  }, []);

  const updateTechStack = (category: TechCategory, library: string) => {
    const updated = {
      ...techStack,
      [category]: { library, version: 'latest' }
    };
    setTechStack(updated);
    localStorage.setItem(STORAGE_KEYS.TECH_STACK, JSON.stringify(updated));
  };

  const options = TECH_STACK_OPTIONS[selectedCategory] || [];

  return (
    <div className="flex h-full">
      {/* Category List - Left */}
      <div className="w-48 flex flex-col" style={{ borderRight: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>Categories</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {(Object.entries(CATEGORY_INFO) as [TechCategory, { label: string; description: string }][]).map(([key, info]) => {
            const isSelected = selectedCategory === key;
            const currentValue = techStack[key]?.library || 'none';
            const option = TECH_STACK_OPTIONS[key]?.find(o => o.value === currentValue);

            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className="w-full p-2.5 rounded-lg text-left transition-all"
                style={{
                  backgroundColor: isSelected ? 'var(--theme-sidebar-item-active)' : 'transparent',
                  border: isSelected ? '1px solid var(--theme-border)' : '1px solid transparent'
                }}
              >
                <div className="text-sm" style={{ color: 'var(--theme-text-primary)' }}>{info.label}</div>
                <div className="text-[10px] truncate" style={{ color: 'var(--theme-text-dim)' }}>
                  {option?.label || 'None'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Options - Right */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--theme-accent-subtle)' }}>
              <Package className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>{CATEGORY_INFO[selectedCategory].label}</h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{CATEGORY_INFO[selectedCategory].description}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Info Box */}
          <div className="flex items-start gap-3 p-3 rounded-lg mb-4" style={{ backgroundColor: 'var(--color-info-subtle)', border: '1px solid var(--color-info-border)' }}>
            <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-info)' }} />
            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
              Selected technologies will be used as defaults when generating new code.
              The AI will follow these preferences unless you specify otherwise.
            </p>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-2 gap-3">
            {options.map(option => {
              const isSelected = techStack[selectedCategory]?.library === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => updateTechStack(selectedCategory, option.value)}
                  className="p-4 rounded-lg text-left transition-all"
                  style={{
                    backgroundColor: isSelected ? 'var(--theme-accent-subtle)' : 'var(--theme-glass-100)',
                    border: isSelected ? '1px solid var(--theme-accent-muted)' : '1px solid var(--theme-border-light)'
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>{option.label}</div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}>
                          {option.version}
                        </span>
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--theme-text-dim)' }}>{option.description}</div>
                    </div>
                    {isSelected && (
                      <div className="p-1 rounded-full shrink-0 ml-2" style={{ backgroundColor: 'var(--theme-accent)' }}>
                        <Check className="w-3 h-3" style={{ color: 'var(--theme-text-on-accent)' }} />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Current Stack Summary */}
        <div className="p-3" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
          <div className="text-xs mb-2" style={{ color: 'var(--theme-text-dim)' }}>Current Stack:</div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(techStack) as [TechCategory, { library: string; version: string }][])
              .filter(([_, val]) => val.library !== 'none')
              .map(([key, val]) => {
                const option = TECH_STACK_OPTIONS[key]?.find(o => o.value === val.library);
                return (
                  <span
                    key={key}
                    className="px-2 py-1 rounded text-xs"
                    style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
                  >
                    {option?.label || val.library}
                  </span>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechStackPanel;
