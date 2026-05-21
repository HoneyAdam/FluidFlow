/**
 * Models.dev Sync Service
 *
 * Syncs model metadata from providers and external sources.
 * Provides enriched model information including:
 * - Family detection
 * - Tool calling capabilities
 * - Pricing information
 * - Context window limits
 */

import type { ModelOption, ModelFamily, ProviderType, ProviderConfig } from './types';

// ============================================================================
// Types
// ============================================================================

export interface ProviderMetadata {
  id: string;
  name: string;
  api: string;
  env?: string[];
  doc?: string;
  models: Record<string, ModelsDevModel>;
}

export interface ModelsDevModel {
  id: string;
  name: string;
  family: string;
  tool_call: boolean;
  reasoning?: boolean;
  modalities?: {
    input: string[];
    output: string[];
  };
  limit?: {
    context: number;
    output: number;
  };
  cost?: {
    input: number;
    output: number;
  };
  release_date?: string;
  last_updated?: string;
}

export interface SyncResult {
  success: boolean;
  modelsUpdated: number;
  errors: string[];
}

export interface ModelMetadata {
  id?: string;
  family?: ModelFamily;
  group?: string;
  supportsToolCalling?: boolean;
  pricing?: {
    input?: number;
    output?: number;
  };
  contextWindow?: number;
  maxOutput?: number;
  releaseDate?: string;
  isDeprecated?: boolean;
}

// Cached providers from models.dev
let cachedProviders: ProviderMetadata[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Models.dev API Fetching
// ============================================================================

/**
 * Fetch all providers from models.dev API
 */
export async function fetchProvidersFromModelsDev(): Promise<ProviderMetadata[]> {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedProviders && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedProviders;
  }

  try {
    // 10s timeout — provider catalog refresh should not hang on remote outages.
    const response = await fetch('https://models.dev/api.json', {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data: Record<string, ProviderMetadata> = await response.json();

    // Convert to array and cache
    cachedProviders = Object.values(data);
    cacheTimestamp = now;

    return cachedProviders;
  } catch (error) {
    console.error('[modelsSync] Failed to fetch providers:', error);
    // Return cache on error if available
    if (cachedProviders) {
      return cachedProviders;
    }
    throw error;
  }
}

/**
 * Convert models.dev model to ModelOption
 */
export function modelsDevModelToModelOption(
  model: ModelsDevModel,
  _providerId: string
): ModelOption {
  return {
    id: model.id,
    name: model.name.replace(/^[^:]+:\s*/, ''), // Remove provider prefix
    description: model.tool_call ? 'Tool calling supported' : 'No tool calling',
    supportsVision: model.modalities?.input.includes('image') ?? false,
    supportsStreaming: true, // Assume streaming supported unless noted
    supportsToolCalling: model.tool_call,
    contextWindow: model.limit?.context,
    maxOutput: model.limit?.output,
    pricing: model.cost ? { input: model.cost.input, output: model.cost.output } : undefined,
    releaseDate: model.release_date,
    family: detectModelFamily(model.id),
    group: detectModelGroup(model.id),
    mode: model.reasoning ? 'reasoning' : 'chat',
  };
}

/**
 * Convert models.dev provider to ProviderConfig
 */
export function modelsDevProviderToConfig(
  provider: ProviderMetadata,
  defaultModelId?: string
): Omit<ProviderConfig, 'id' | 'apiKey'> {
  const models = Object.values(provider.models).map(m =>
    modelsDevModelToModelOption(m, provider.id)
  );

  // Find best default model (prefer tool calling capable, non-reasoning)
  const defaultModel = defaultModelId ||
    models.find(m => m.supportsToolCalling && m.mode !== 'reasoning')?.id ||
    models[0]?.id ||
    '';

  // Detect provider type and determine baseUrl
  const providerType = detectProviderType(provider);
  let baseUrl = provider.api;

  // Some providers need proxy or special handling
  if (providerType === 'minimax') {
    // MiniMax uses its own provider class with PROXY_URL hardcoded
    // baseUrl here is just for reference
    baseUrl = provider.api;
  } else if (providerType === 'openrouter' || providerType === 'openai' || providerType === 'anthropic' || providerType === 'gemini') {
    // These use standard OpenAI-compatible endpoints directly
  } else if (providerType === 'ollama') {
    baseUrl = 'http://localhost:11434';
  } else if (providerType === 'lmstudio') {
    baseUrl = 'http://localhost:1234/v1';
  } else if (providerType === 'custom') {
    // Custom providers use their baseUrl directly
  }

  return {
    type: providerType,
    name: provider.name,
    baseUrl,
    models,
    defaultModel,
  };
}

/**
 * Detect provider type from models.dev provider ID
 */
function detectProviderType(provider: ProviderMetadata): ProviderType {
  const id = provider.id.toLowerCase();
  const name = provider.name.toLowerCase();

  // Order matters - check specific providers first
  if (id.includes('minimax')) return 'minimax';
  if (id.includes('openai') || name.includes('openai')) return 'openai';
  if (id.includes('anthropic') || name.includes('anthropic') || name.includes('claude')) return 'anthropic';
  if (id.includes('google') || id.includes('gemini')) return 'gemini';
  if (id.includes('mistral')) return 'openrouter';
  if (id.includes('llama') || id.includes('meta')) return 'openrouter';
  if (id.includes('qwen') || id.includes('alibaba')) return 'openrouter';
  if (id.includes('deepseek')) return 'openrouter';
  if (id.includes('ollama')) return 'ollama';
  if (id.includes('lmstudio') || id.includes('lm-studio')) return 'lmstudio';

  return 'custom'; // Default to custom instead of openrouter to avoid wrong endpoint mapping
}

/**
 * Clear the provider cache (force refresh)
 */
export function clearProviderCache(): void {
  cachedProviders = null;
  cacheTimestamp = 0;
}

// ============================================================================
// Family Detection
// ============================================================================

/**
 * Detect model family from model ID
 */
export function detectModelFamily(modelId: string): ModelFamily {
  const lower = modelId.toLowerCase();

  if (lower.includes('gpt') || lower.startsWith('o1') || lower.startsWith('o2') || lower.startsWith('o3') || lower.startsWith('o4')) {
    return 'gpt';
  }
  if (lower.includes('claude') || lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
    return 'claude';
  }
  if (lower.includes('gemini')) {
    return 'gemini';
  }
  if (lower.includes('glm') || lower.includes('z-ai') || lower.includes('zai')) {
    return 'glm';
  }
  if (lower.includes('llama')) {
    return 'llama';
  }
  if (lower.includes('qwen') || lower.includes('qwq')) {
    return 'qwen';
  }
  if (lower.includes('mistral') || lower.includes('mixtral') || lower.includes('magistral')) {
    return 'mistral';
  }
  if (lower.includes('phi') || lower.includes('phi-')) {
    return 'custom';
  }

  // Default unknown
  return 'unknown';
}

/**
 * Detect model group from model ID (e.g., "gpt-4", "gemini-2.5")
 */
export function detectModelGroup(modelId: string): string {
  const lower = modelId.toLowerCase();

  // GPT family groups
  if (lower.includes('gpt-5')) return 'gpt-5';
  if (lower.includes('gpt-4o')) return 'gpt-4o';
  if (lower.includes('gpt-4')) return 'gpt-4';
  if (lower.startsWith('o4')) return 'o4';
  if (lower.startsWith('o3')) return 'o3';
  if (lower.startsWith('o1')) return 'o1';

  // Claude family groups
  if (lower.includes('claude-opus')) return 'claude-opus';
  if (lower.includes('claude-sonnet')) return 'claude-sonnet';
  if (lower.includes('claude-haiku')) return 'claude-haiku';

  // Gemini family groups
  if (lower.includes('gemini-3')) return 'gemini-3';
  if (lower.includes('gemini-2.5')) return 'gemini-2.5';
  if (lower.includes('gemini-2')) return 'gemini-2';
  if (lower.includes('gemini-1.5')) return 'gemini-1.5';
  if (lower.includes('gemini-1')) return 'gemini-1';

  // GLM family groups
  if (lower.includes('glm-4')) return 'glm-4';
  if (lower.includes('glm-3')) return 'glm-3';

  // Llama family groups
  if (lower.includes('llama-3.3')) return 'llama-3.3';
  if (lower.includes('llama-3.1')) return 'llama-3.1';
  if (lower.includes('llama-3')) return 'llama-3';
  if (lower.includes('llama-2')) return 'llama-2';

  // Qwen family groups
  if (lower.includes('qwen-3')) return 'qwen-3';
  if (lower.includes('qwen-2.5')) return 'qwen-2.5';
  if (lower.includes('qwen-2')) return 'qwen-2';

  // Return first segment as group
  const segments = modelId.split(/[-.]/);
  return segments.slice(0, 2).join('-');
}

// ============================================================================
// Tool Calling Capability Detection
// ============================================================================

/**
 * Detect if a model likely supports tool calling based on its ID
 * This is a heuristic - actual capability may vary by provider
 */
export function detectToolCallingSupport(modelId: string, providerType: ProviderType): boolean {
  const lower = modelId.toLowerCase();

  // Reasoning models typically don't support tool calling well
  if (lower.startsWith('o1') || lower.startsWith('o2') || lower.startsWith('o3') || lower.startsWith('o4')) {
    return false;
  }

  // Mini models may have limitations
  if (lower.includes('nano') || lower.includes('mini') && lower.includes('gpt')) {
    // GPT mini does support tool calling
    return providerType === 'openai';
  }

  // Flash models generally support it
  if (lower.includes('flash')) {
    return true;
  }

  // Large models support it
  if (lower.includes('pro') || lower.includes('opus') || lower.includes('ultra')) {
    return true;
  }

  // Default to true for most modern models
  return true;
}

// ============================================================================
// Provider-Specific Model Metadata
// ============================================================================

/**
 * Get known model metadata for a specific provider
 */
export function getProviderModelMetadata(_providerType: ProviderType): Record<string, Partial<ModelMetadata>> {
  // This would be populated from actual provider docs
  // For now, return empty - could be extended with API calls to provider docs
  return {};
}

// ============================================================================
// Model Enrichment
// ============================================================================

/**
 * Enrich a model option with detected metadata
 */
export function enrichModelOption(model: ModelOption, providerType: ProviderType): ModelOption {
  const enriched: ModelOption = { ...model };

  // Detect family if not set
  if (!enriched.family) {
    enriched.family = detectModelFamily(model.id);
  }

  // Detect group if not set
  if (!enriched.group) {
    enriched.group = detectModelGroup(model.id);
  }

  // Detect tool calling support if not set
  if (enriched.supportsToolCalling === undefined) {
    enriched.supportsToolCalling = detectToolCallingSupport(model.id, providerType);
  }

  // Set mode based on model ID
  if (!enriched.mode) {
    const lower = model.id.toLowerCase();
    if (lower.includes('codex') || lower.includes('code')) {
      enriched.mode = 'code';
    } else if (lower.startsWith('o1') || lower.startsWith('o2') || lower.startsWith('o3') || lower.startsWith('o4')) {
      enriched.mode = 'reasoning';
    } else {
      enriched.mode = 'chat';
    }
  }

  return enriched;
}

/**
 * Enrich multiple model options
 */
export function enrichModels(models: ModelOption[], providerType: ProviderType): ModelOption[] {
  return models.map(m => enrichModelOption(m, providerType));
}

// ============================================================================
// Sync Functions
// ============================================================================

/**
 * Sync model metadata from a provider's API
 * This is a placeholder - actual implementation would call provider APIs
 */
export async function syncModelsFromProvider(
  models: ModelOption[],
  providerType: ProviderType
): Promise<{ models: ModelOption[]; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Enrich models with detected metadata
    const enriched = enrichModels(models, providerType);

    return { models: enriched, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return { models, errors };
  }
}

// ============================================================================
// Pricing Helpers
// ============================================================================

/**
 * Format price for display
 */
export function formatPrice(price?: number, _currency = 'USD'): string {
  if (price === undefined) return '-';
  return `$${price.toFixed(2)}/M`;
}

/**
 * Check if model is free (based on provider defaults)
 */
export function isFreeModel(modelId: string, providerType: ProviderType): boolean {
  const lower = modelId.toLowerCase();

  // OpenRouter free models
  if (providerType === 'openrouter' && lower.includes(':free')) {
    return true;
  }

  // Local models are "free"
  if (providerType === 'ollama' || providerType === 'lmstudio') {
    return true;
  }

  return false;
}

// ============================================================================
// Model Compatibility Check
// ============================================================================

/**
 * Check if a model supports a specific feature
 */
export function modelSupports(model: ModelOption, feature: 'vision' | 'streaming' | 'tool-calling' | 'json'): boolean {
  switch (feature) {
    case 'vision':
      return model.supportsVision ?? false;
    case 'streaming':
      return model.supportsStreaming ?? true;
    case 'tool-calling':
      return model.supportsToolCalling ?? detectToolCallingSupport(model.id, 'openai');
    case 'json':
      return true; // Most modern models support JSON output via various mechanisms
    default:
      return false;
  }
}

/**
 * Get display name for a model including provider info
 */
export function getModelDisplayName(model: ModelOption, providerName?: string): string {
  const name = model.name || model.id;
  if (providerName) {
    return `${name} (${providerName})`;
  }
  return name;
}

// ============================================================================
// Default Model Metadata (Static Reference)
// ============================================================================

/**
 * Known model metadata from public provider docs
 * Format: provider -> modelId -> metadata
 */
export const KNOWN_MODEL_METADATA: Record<ProviderType, Record<string, ModelMetadata>> = {
  gemini: {
    'gemini-3.1-pro-preview': {
      supportsToolCalling: true,
      contextWindow: 1000000,
      releaseDate: '2026-03',
    },
    'gemini-3.1-flash-lite-preview': {
      supportsToolCalling: true,
      contextWindow: 1000000,
      releaseDate: '2026-03',
    },
    'gemini-2.5-pro': {
      supportsToolCalling: true,
      contextWindow: 1048576,
      releaseDate: '2025-06',
    },
    'gemini-2.5-flash': {
      supportsToolCalling: true,
      contextWindow: 1048576,
      releaseDate: '2025-05',
    },
  },
  openai: {
    'gpt-5.1': {
      supportsToolCalling: true,
      contextWindow: 200000,
      pricing: { input: 1.25, output: 5.0 },
      releaseDate: '2026-02',
    },
    'gpt-5': {
      supportsToolCalling: true,
      contextWindow: 200000,
      pricing: { input: 1.25, output: 5.0 },
      releaseDate: '2025-11',
    },
    'gpt-5-mini': {
      supportsToolCalling: true,
      contextWindow: 128000,
      pricing: { input: 0.15, output: 0.60 },
      releaseDate: '2025-11',
    },
    'o3': {
      supportsToolCalling: false,
      contextWindow: 200000,
      pricing: { input: 2.0, output: 8.0 },
      releaseDate: '2025-06',
    },
  },
  anthropic: {
    'claude-opus-4-5-20251101': {
      supportsToolCalling: true,
      contextWindow: 200000,
      pricing: { input: 15.0, output: 75.0 },
      releaseDate: '2025-11',
    },
    'claude-sonnet-4-5-20250929': {
      supportsToolCalling: true,
      contextWindow: 200000,
      pricing: { input: 3.0, output: 15.0 },
      releaseDate: '2025-09',
    },
    'claude-haiku-4-5-20251001': {
      supportsToolCalling: true,
      contextWindow: 200000,
      pricing: { input: 0.80, output: 4.0 },
      releaseDate: '2025-10',
    },
  },
  zai: {
    'glm-5.1': {
      supportsToolCalling: true,
      contextWindow: 200000,
      pricing: { input: 0.1, output: 0.1 },
      releaseDate: '2026-05',
    },
    'glm-5': {
      supportsToolCalling: true,
      contextWindow: 200000,
      pricing: { input: 0.1, output: 0.1 },
      releaseDate: '2026-03',
    },
    'glm-4.7': {
      supportsToolCalling: true,
      contextWindow: 200000,
      releaseDate: '2026-01',
    },
    'glm-4.6': {
      supportsToolCalling: true,
      contextWindow: 200000,
      releaseDate: '2025-09',
    },
  },
  cerebras: {
    'llama-3.3-70b': {
      supportsToolCalling: true,
      contextWindow: 128000,
      pricing: { input: 0.6, output: 0.6 },
    },
  },
  ollama: {},
  lmstudio: {},
  openrouter: {},
  minimax: {},
  custom: {},
};

/**
 * Get metadata for a specific model
 */
export function getModelMetadata(providerType: ProviderType, modelId: string): ModelMetadata | null {
  const providerMeta = KNOWN_MODEL_METADATA[providerType];
  return providerMeta?.[modelId] || null;
}

/**
 * Apply known metadata to a model option
 */
export function applyKnownMetadata(model: ModelOption, providerType: ProviderType): ModelOption {
  const meta = getModelMetadata(providerType, model.id);

  if (!meta) {
    // Fall back to enrichment
    return enrichModelOption(model, providerType);
  }

  return {
    ...model,
    supportsToolCalling: model.supportsToolCalling ?? meta.supportsToolCalling,
    contextWindow: model.contextWindow ?? meta.contextWindow,
    maxOutput: model.maxOutput ?? meta.maxOutput,
    pricing: model.pricing ?? meta.pricing,
    releaseDate: model.releaseDate ?? meta.releaseDate,
    isDeprecated: model.isDeprecated ?? meta.isDeprecated,
    // Apply family detection if not set
    family: model.family ?? detectModelFamily(model.id),
    group: model.group ?? detectModelGroup(model.id),
  };
}

/**
 * Apply known metadata to multiple models
 */
export function applyKnownMetadataToAll(models: ModelOption[], providerType: ProviderType): ModelOption[] {
  return models.map(m => applyKnownMetadata(m, providerType));
}