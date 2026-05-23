/**
 * Services Index
 *
 * Barrel export for all service modules.
 * Provides a single import point: `import { ... } from '@/services'`
 *
 * Subdirectories with their own barrel exports:
 * - services/ai/           - AI provider management
 * - services/api/          - Backend API client
 * - services/compaction/   - Context compaction
 * - services/context/      - Context management (file tracking, tokens)
 * - services/errorFix/     - Error analysis and auto-fix
 * - services/fluidflow/    - .fluidflow config management
 * - services/generation/   - Code generation business logic
 *
 * @module services
 */

// ============================================================================
// AI Services
// ============================================================================
export * from './ai';

// ============================================================================
// API Services (named exports to avoid AIHistoryEntry conflict with generation)
// ============================================================================
export {
  type ProjectMeta,
  type Project,
  type ProjectUpdateResponse,
  type HistoryEntry,
  type GitStatus,
  type GitCommit,
  type CommitFileChange,
  type CommitDetails,
  type GitRemote,
  type GitHubUser,
  type GitHubRepo,
  type StoredProviderConfig,
  type CustomSnippet,
  type GlobalSettings,
  type RunningProjectInfo,
  API_BASE,
  apiCall,
  checkServerHealth,
  isBackendOnline,
  startHealthMonitor,
  stopHealthMonitor,
  projectApi,
  gitApi,
  githubApi,
  settingsApi,
  runnerApi,
  autoSave,
} from './projectApi';

// ============================================================================
// Generation Services
// ============================================================================
export * from './generation';

// ============================================================================
// Project Services
// ============================================================================
export {
  getProjectContext,
  getProjectContexts,
  saveProjectContext,
  deleteProjectContext,
  getContextForPrompt,
  generateStyleGuide,
  generateProjectSummary,
  generateProjectContext,
  getStyleGuide,
  formatStyleGuideForPrompt,
  type StyleGuide,
  type ProjectSummary,
  type ProjectContext,
} from './projectContext';

export {
  checkProjectHealth,
  applyFixes,
  getFileTemplate,
  getProjectScaffold,
  getQuickHealthStatus,
  CRITICAL_FILES,
  type HealthStatus,
  type HealthIssue,
  type HealthCheckResult,
  type CriticalFile,
} from './projectHealth';

// ============================================================================
// Storage Services
// ============================================================================
export {
  getPromptHistory,
  addPromptToHistory,
  updatePromptHistory,
  deletePromptFromHistory,
  clearPromptHistory,
  togglePromptFavorite,
  searchPromptHistory,
  getFavoritePrompts,
  getRecentPrompts,
  getPromptHistoryStats,
  getResponsePreview,
  exportPromptHistory,
  importPromptHistory,
  type PromptHistoryItem,
  type PromptHistoryStats,
} from './promptHistory';

export {
  getPromptTemplates,
  getPromptTemplateById,
  addPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  toggleTemplateFavorite,
  incrementTemplateUsage,
  getTemplatesByCategory,
  getFavoriteTemplates,
  searchPromptTemplates,
  getPromptTemplateStats,
  extractVariablesFromPrompt,
  applyVariablesToPrompt,
  duplicateTemplate,
  exportPromptTemplates,
  importPromptTemplates,
  resetToDefaultTemplates,
  clearAllTemplates,
  type PromptTemplate,
  type PromptTemplateCategory,
  type PromptTemplateVariable,
  type PromptTemplateStats,
} from './promptTemplateStorage';

export {
  addUsageRecord,
  getAllRecords,
  getRecordsByDateRange,
  getTodayRecords,
  getRecentRecords,
  clearAllRecords,
  deleteOldRecords,
  calculateStats,
  getStats,
  getTodayStats,
  exportRecords,
  importRecords,
} from './analyticsStorage';

export {
  getWIP,
  saveWIP,
  clearWIP,
  getChatMessages,
  saveChatMessages,
  clearChatMessages,
  SCRATCH_WIP_ID,
  type WIPData,
} from './wipStorage';

// ============================================================================
// Context Services
// ============================================================================
export {
  getContextManager,
  CONTEXT_IDS,
  type ContextMessage,
  type ConversationContext,
  type ContextManagerConfig,
} from './conversationContext';

export {
  checkNeedsCompaction,
  getContextStats,
  getCompactionInfo,
  triggerCompaction,
  checkAndAutoCompact,
  ensureTokenSpace,
  type CompactionResult,
  type CompactionInfo,
  type ContextStats,
  type TokenSpaceResult,
} from './contextCompaction';

export {
  exportContext,
  importContext,
  exportAllContexts,
  importContexts,
  type ContextExport,
} from './contextExport';

// ============================================================================
// Prompt Services
// ============================================================================
export {
  getPromptTemplate,
  getPrompt,
  listTemplates,
  hasTemplate,
  getGenerationPrompt,
  PROMPTS,
  type PromptTemplateId,
  type TemplateVariables,
} from './promptTemplates';

// ============================================================================
// Config Services
// ============================================================================
export {
  getFluidFlowConfig,
  type FluidFlowConfig,
  type AIResponseFormat,
  type AgentConfig,
  type ContextSettings,
  type CompactionLog,
} from './fluidflowConfig';

// ============================================================================
// Batch Generation
// ============================================================================
export { BatchGenerator, type BatchGenerationOptions, type BatchResult } from './batchGeneration';

// ============================================================================
// Utility Services
// ============================================================================
export {
  activityLogger,
  type ActivityLogEntry,
  type LogLevel,
  type LogCategory,
} from './activityLogger';

export {
  calculateCost,
  getModelPricing,
  formatCost,
  MODEL_PRICING,
  type ModelPricing,
  type CostEstimate,
} from './tokenCostEstimator';

export {
  screenshotService,
  saveScreenshot,
  updateProjectScreenshot,
  getProjectScreenshots,
  getLatestThumbnail,
  deleteScreenshot,
  requestScreenshotCapture,
  type ScreenshotMeta,
  type ProjectScreenshots,
} from './screenshotService';

export {
  getSnippets,
  addSnippet,
  updateSnippet,
  deleteSnippet,
  toggleSnippetFavorite,
  searchSnippets,
  getFavoriteSnippets,
  getSnippetsByLanguage,
  getSnippetsByTag,
  getSnippetStats,
  exportSnippets,
  importSnippets,
  initializeDefaultSnippets,
  type Snippet,
  type SnippetStats,
} from './snippetLibrary';

export {
  webContainerService,
  type WebContainerStatus,
  type WebContainerState,
} from './webcontainer';

export {
  APP_VERSION,
  APP_NAME,
  getVersionInfo,
  compareVersions,
  checkForUpdates,
  parseChangelog,
  checkForUpdatesWithCache,
  clearUpdateCache,
  type VersionInfo,
  type ReleaseInfo,
  type UpdateCheckResult,
  type ChangelogEntry,
} from './version';
