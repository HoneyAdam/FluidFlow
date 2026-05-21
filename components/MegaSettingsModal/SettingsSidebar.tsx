import React from 'react';
import {
  Cpu, MessageSquare, Package, FolderOpen, Code,
  Palette, Bug, Settings2, Info, FileText, BarChart3
} from 'lucide-react';
import { Github } from '../icons/BrandIcons';
import { SettingsCategory, SettingsCategoryConfig } from './types';

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

const SETTINGS_CATEGORIES: SettingsCategoryConfig[] = [
  {
    id: 'ai-providers',
    label: 'AI Providers',
    icon: Cpu,
    description: 'Configure AI models and API keys'
  },
  {
    id: 'ai-usage',
    label: 'AI Usage',
    icon: BarChart3,
    description: 'Token usage and cost analytics'
  },
  {
    id: 'context-manager',
    label: 'Context',
    icon: MessageSquare,
    description: 'Token limits and compaction'
  },
  {
    id: 'tech-stack',
    label: 'Tech Stack',
    icon: Package,
    description: 'Default libraries and frameworks'
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderOpen,
    description: 'Default project settings'
  },
  {
    id: 'prompt-templates',
    label: 'Prompts',
    icon: FileText,
    description: 'Save and reuse prompts'
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: Code,
    description: 'Code editor preferences'
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    description: 'UI theme and layout'
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: Github,
    description: 'Sync, backup, and push settings'
  },
  {
    id: 'debug',
    label: 'Debug',
    icon: Bug,
    description: 'Debugging and monitoring'
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: Settings2,
    description: 'Rules, agents, and more'
  },
  {
    id: 'about',
    label: 'About',
    icon: Info,
    description: 'Version, updates, and changelog'
  }
];

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeCategory,
  onCategoryChange
}) => {
  return (
    <div
      className="w-56 flex flex-col transition-colors"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--theme-background) 50%, transparent)',
        borderRight: '1px solid var(--theme-border)'
      }}
    >
      <div
        className="p-3"
        style={{ borderBottom: '1px solid var(--theme-border)' }}
      >
        <h3
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: 'var(--theme-text-muted)' }}
        >
          Settings
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {SETTINGS_CATEGORIES.map(category => {
          const Icon = category.icon;
          const isActive = activeCategory === category.id;

          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all border"
              style={{
                backgroundColor: isActive ? 'var(--theme-glass-200)' : undefined,
                color: isActive ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)',
                borderColor: isActive ? 'var(--theme-border-hover)' : 'transparent'
              }}
            >
              <Icon
                className="w-4 h-4 shrink-0"
                style={{ color: isActive ? 'var(--theme-accent)' : undefined }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{category.label}</div>
                <div className="text-[10px] truncate" style={{ color: 'var(--theme-text-muted)' }}>{category.description}</div>
              </div>
              {category.badge && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--theme-accent-subtle)', color: 'var(--theme-accent)' }}
                >
                  {category.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export { SETTINGS_CATEGORIES };
export default SettingsSidebar;
