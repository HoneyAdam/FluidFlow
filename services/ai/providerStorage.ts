/**
 * Provider Storage
 *
 * Handles localStorage persistence for AI provider configurations.
 * Includes encryption/decryption of API keys.
 */

import type { ProviderConfig } from './types';
import { DEFAULT_PROVIDERS } from './types';
import { encryptProviderConfigs, decryptProviderConfigs } from '../../utils/clientEncryption';

// Storage keys
const STORAGE_KEY = 'fluidflow_ai_providers';
const ACTIVE_PROVIDER_KEY = 'fluidflow_active_provider';

/**
 * Creates default provider config (Gemini without API key)
 * SEC-004 fix: Users must configure their API key through Settings UI
 */
function createDefaultConfig(): ProviderConfig {
  return {
    id: 'default-gemini',
    ...DEFAULT_PROVIDERS.gemini,
    apiKey: '', // Key must be configured through settings
  };
}

/**
 * Load saved providers from localStorage (async with decryption)
 * @returns Array of provider configurations with decrypted API keys
 */
export async function loadProvidersFromLocalStorage(): Promise<ProviderConfig[]> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // FIX-21: Runtime validation before type assertion
      if (!Array.isArray(parsed)) return [createDefaultConfig()];
      const providers = parsed as ProviderConfig[];
      // Decrypt API keys
      return await decryptProviderConfigs(providers);
    }
  } catch (e) {
    console.error('Failed to load providers from localStorage:', e);
  }

  return [createDefaultConfig()];
}

/**
 * Synchronous load for initial fast startup
 * Note: May return encrypted keys that need async decryption
 * @returns Array of provider configurations (potentially encrypted)
 */
export function loadProvidersFromLocalStorageSync(): ProviderConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // FIX-21: Runtime validation
      if (!Array.isArray(parsed)) return [createDefaultConfig()];
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load providers from localStorage:', e);
  }

  return [createDefaultConfig()];
}

/**
 * Save providers to localStorage (with encryption)
 * @param providers - Array of provider configurations to save
 */
export async function saveProvidersToLocalStorage(providers: ProviderConfig[]): Promise<void> {
  try {
    // Encrypt API keys before saving
    const encryptedProviders = await encryptProviderConfigs(providers);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(encryptedProviders));
  } catch (e) {
    console.error('Failed to save providers to localStorage:', e);
  }
}

/**
 * Get active provider ID from localStorage
 * @returns The active provider ID or default
 */
export function getActiveProviderIdFromLocalStorage(): string {
  return localStorage.getItem(ACTIVE_PROVIDER_KEY) || 'default-gemini';
}

/**
 * Set active provider ID in localStorage
 * @param id - The provider ID to set as active
 */
export function setActiveProviderIdInLocalStorage(id: string): void {
  localStorage.setItem(ACTIVE_PROVIDER_KEY, id);
}

// Legacy exports for backwards compatibility
export const loadProviders = loadProvidersFromLocalStorage;
export const saveProviders = saveProvidersToLocalStorage;
export const getActiveProviderId = getActiveProviderIdFromLocalStorage;
export const setActiveProviderId = setActiveProviderIdInLocalStorage;
export const loadProvidersSync = loadProvidersFromLocalStorageSync;
