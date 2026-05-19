/**
 * AI Service - Provider Management
 *
 * Facade module that re-exports all AI functionality from focused modules.
 *
 * @module services/ai
 *
 * Structure:
 * - services/ai/types.ts          - Type definitions
 * - services/ai/providers/        - Provider implementations
 * - services/ai/providerFactory.ts - Provider creation factory
 * - services/ai/providerStorage.ts - localStorage persistence
 * - services/ai/ProviderManager.ts - State management class
 * - services/ai/utils/            - Utility functions (schemas, jsonOutput)
 */

// Re-export types
export * from './types';

// Re-export providers
export * from './providers';

// Re-export utilities
export * from './utils/schemas';
export * from './utils/jsonOutput';
export * from './utils/toolUtils';
export * from './utils/ToolCallHandler';
export * from './modelsSync';

// Re-export provider factory
export { createProvider } from './providerFactory';

// Re-export models sync service
export * from './modelsSync';

// Re-export storage functions
export {
  loadProvidersFromLocalStorage,
  loadProvidersFromLocalStorageSync,
  saveProvidersToLocalStorage,
  getActiveProviderIdFromLocalStorage,
  setActiveProviderIdInLocalStorage,
  // Legacy aliases
  loadProviders,
  saveProviders,
  getActiveProviderId,
  setActiveProviderId,
  loadProvidersSync,
} from './providerStorage';

// Re-export ProviderManager
export { ProviderManager, getProviderManager } from './ProviderManager';
