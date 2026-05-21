/**
 * API Client
 *
 * Base API client with helper functions for making API calls.
 * Includes timeout, retry logic, and connection health monitoring.
 */

// Use relative URL - Vite proxies /api to backend (avoids mixed content with HTTPS frontend)
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Default timeout for API calls (10 seconds)
const DEFAULT_TIMEOUT = 10000;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second initial delay

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generic API call helper with timeout and retry
 */
export async function apiCall<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number; retries?: number }
): Promise<T> {
  const { retries = MAX_RETRIES, timeout, ...fetchOptions } = options || {};
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        timeout,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions?.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(data.error || data.details || 'API request failed');
        }
        throw new Error(data.error || data.details || `Server error: ${response.status}`);
      }

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort (timeout) or if it's the last attempt
      if (lastError.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout || DEFAULT_TIMEOUT}ms`, { cause: error });
      }

      if (attempt < retries) {
        // Exponential backoff
        const delay = RETRY_DELAY * Math.pow(2, attempt);
        console.warn(`[API] Retry ${attempt + 1}/${retries} for ${endpoint} in ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('API request failed after retries');
}

/**
 * Check if the backend server is online
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/health`, { timeout: 5000 });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Backend connection status
 */
let isBackendConnected = true;
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Get current backend connection status
 */
export function isBackendOnline(): boolean {
  return isBackendConnected;
}

/**
 * Start monitoring backend health
 */
export function startHealthMonitor(
  onStatusChange?: (online: boolean) => void,
  intervalMs = 30000
): void {
  if (healthCheckInterval) return;

  const check = async () => {
    const wasConnected = isBackendConnected;
    isBackendConnected = await checkServerHealth();

    if (wasConnected !== isBackendConnected) {
      console.log(`[API] Backend ${isBackendConnected ? 'connected' : 'disconnected'}`);
      onStatusChange?.(isBackendConnected);
    }
  };

  // Initial check
  check();

  // Periodic checks
  healthCheckInterval = setInterval(check, intervalMs);
}

/**
 * Stop health monitoring
 */
export function stopHealthMonitor(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}
