/**
 * Storage Constants
 *
 * Database names, keys, and storage-related constants.
 */

// IndexedDB
export const WIP_DB_NAME = 'fluidflow-wip';
export const WIP_DB_VERSION = 3; // Bumped to fix missing chat store migration
export const WIP_STORE_NAME = 'wip';
export const CHAT_STORE_NAME = 'chat';

// Analytics IndexedDB
export const ANALYTICS_DB_NAME = 'fluidflow-analytics';
export const ANALYTICS_DB_VERSION = 1;
export const ANALYTICS_STORE_NAME = 'usage-records';

// LocalStorage keys
export const STORAGE_KEYS = {
  AI_PROVIDERS: 'ai-providers',
  ACTIVE_PROVIDER: 'active-provider',
  SELECTED_MODEL: 'selected-model',
  EDITOR_SETTINGS: 'editor-settings',
  TECH_STACK: 'fluidflow-tech-stack',
  DIFF_MODE_ENABLED: 'diffModeEnabled',
  AUTO_COMMIT_ENABLED: 'autoCommitEnabled',
  HAS_VISITED: 'fluidflow-visited',
  CREDITS_SEEN: 'fluidflow-credits-seen',
  DEBUG_MODE: 'debug-mode',
  DEBUG_ENABLED: 'fluidflow_debug_enabled',
  THEME: 'theme',
  CONTEXTS: 'fluidflow_contexts',
  CONFIG: 'fluidflow_config',
  PROMPT_CONFIRMATION: 'prompt-confirmation-enabled',
  FILE_CONTEXT_ENABLED: 'file-context-delta-enabled',
  GITHUB_PUSH_SETTINGS: 'fluidflow_github_push_settings',
  DEBUG_SETTINGS: 'fluidflow_debug_settings',
} as const;

// Context IDs
export const CONTEXT_IDS = {
  MAIN_CHAT: 'main-chat',
  PROMPT_IMPROVER: 'prompt-improver',
  GIT_COMMIT: 'git-commit',
  QUICK_EDIT: 'quick-edit',
} as const;
