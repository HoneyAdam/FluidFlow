/**
 * Provider Storage Utilities
 *
 * Shared provider management functions to avoid code duplication.
 * Extracted from AISettingsModal and AIProviderSettings.
 */

import { getProviderManager } from '../services/ai';
import type { ProviderConfig } from '../services/ai';

/**
 * Save providers to ProviderManager
 * 
 * @param newProviders - Array of provider configs to save
 * @param newActiveId - Optional ID of the provider to set as active
 */
export const saveProviders = async (
  newProviders: ProviderConfig[],
  newActiveId?: string
): Promise<void> => {
  const manager = getProviderManager();
  newProviders.forEach(p => manager.addProvider(p));
  if (newActiveId) {
    manager.setActiveProvider(newActiveId);
  }
};

/**
 * Get all providers from ProviderManager
 * 
 * @returns Array of all provider configs
 */
export const getAllProviders = (): ProviderConfig[] => {
  const manager = getProviderManager();
  return manager.getConfigs();
};

/**
 * Get the currently active provider
 * 
 * @returns Active provider config or null if none
 */
export const getActiveProvider = (): ProviderConfig | null => {
  const manager = getProviderManager();
  return manager.getActiveConfig() ?? null;
};

/**
 * Get the currently active provider ID
 * 
 * @returns Active provider ID or undefined if none
 */
export const getActiveProviderId = (): string | undefined => {
  const manager = getProviderManager();
  return manager.getActiveProviderId();
};

/**
 * Test a provider connection
 * 
 * @param id - Provider ID to test
 * @returns Test result with success status and optional error message
 */
export const testProvider = async (id: string): Promise<{ success: boolean; error?: string }> => {
  const manager = getProviderManager();
  return await manager.testProvider(id);
};
