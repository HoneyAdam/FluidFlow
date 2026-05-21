/**
 * Sandbox Scripts Module Index
 *
 * Barrel export for all sandbox script generators.
 */

// Post-to-parent helper (origin-aware messaging)
export { getPostToParentScript } from './postToParent';

// Inspect Mode
export { getInspectModeScript } from './inspectMode';

// Fetch Mocking
export { getFetchMockingScript } from './fetchMocking';

// Asset Handling
export { getAssetHandlingScript, processAssetImports, getImagePlaceholder } from './assetHandling';

// Router Emulation
export {
  getHistoryEmulationScript,
  getLinkInterceptionScript,
  getLocationOverrideScript,
} from './routerEmulation';

// Sandbox Hooks
export { getSandboxHooksScript } from './sandboxHooks';

// Lucide Icons
export { getKnownLucideIconsScript } from './lucideIcons';

// Bootstrap
export { getBootstrapScript } from './bootstrap';

// Component Tree (React Fiber traversal)
export { getComponentTreeScript } from './componentTree';
export type { ComponentTreeNode } from './componentTree';

// Computed Styles (CSS extraction)
export { getComputedStylesScript, CSS_CATEGORIES } from './computedStyles';
export type { ComputedStylesResult } from './computedStyles';

// Route Context (Enhanced nested routing)
export { getRouteContextScript } from './routeContext';
export type { RouteConfig, RouteMatch } from './routeContext';

// CSS Modules (scoped class names)
export { getCssModulesScript, processCssModule } from './cssModules';

// Environment Variables (process.env, import.meta.env)
export {
  getEnvVariablesScript,
  transformEnvReferences,
  parseEnvFile,
  DEFAULT_ENV_VARS,
} from './envVariables';

// Storage Persistence (localStorage/sessionStorage sync)
export { getStoragePersistenceScript } from './storagePersistence';

// Console Enhancements (better formatting, timing, grouping)
export { getConsoleEnhancementsScript } from './consoleEnhancements';

// Timer Management (tracking and cleanup)
export { getTimerManagementScript } from './timerManagement';

// Error Recovery (crash detection and graceful recovery)
export { getErrorRecoveryScript } from './errorRecovery';

// Performance Metrics (FPS, render time, memory usage)
export { getPerformanceMetricsScript } from './performanceMetrics';

// Event Listener Cleanup (tracking and leak detection)
export { getEventListenerCleanupScript } from './eventListenerCleanup';

// Clipboard API Mock (copy/paste support in sandbox)
export { getClipboardMockScript } from './clipboardMock';

// Intersection Observer (lazy loading, infinite scroll)
export { getIntersectionObserverScript } from './intersectionObserver';

// Media Query Hooks (responsive design)
export { getMediaQueryHooksScript } from './mediaQueryHooks';

// Drag & Drop Enhancement (file handling)
export { getDragDropEnhancementScript } from './dragDropEnhancement';

// Network Status (online/offline, connection quality)
export { getNetworkStatusScript } from './networkStatus';

// Form Helpers (validation, auto-save)
export { getFormHelpersScript } from './formHelpers';

// Scroll Utilities (smooth scroll, position tracking)
export { getScrollUtilitiesScript } from './scrollUtilities';

// Screenshot Capture (preview to image)
export { getScreenshotCaptureScript } from './screenshotCapture';

// State Preservation (HMR-like state capture/restore)
export { getStatePreservationScript } from './statePreservation';
