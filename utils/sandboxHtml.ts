/**
 * Sandbox HTML Generator
 *
 * Generates the complete HTML document for the iframe preview sandbox.
 * Includes React, Babel transpilation, router emulation, and console forwarding.
 *
 * Module structure:
 * - scripts/inspectMode.ts: Element selection and highlighting
 * - scripts/routerEmulation.ts: History, link, and location handling
 * - scripts/sandboxHooks.ts: React Router-like hooks
 * - scripts/bootstrap.ts: Main app compilation and mounting
 * - scripts/lucideIcons.ts: Icon validation
 */

import type { FileSystem } from '@/types';
import { analyzeFilesForImports } from './importResolver';

// Import script generators from submodules
import {
  getPostToParentScript,
  getInspectModeScript,
  getFetchMockingScript,
  getAssetHandlingScript,
  getHistoryEmulationScript,
  getLinkInterceptionScript,
  getLocationOverrideScript,
  getSandboxHooksScript,
  getBootstrapScript,
  getComponentTreeScript,
  getComputedStylesScript,
  getRouteContextScript,
  getEnvVariablesScript,
  getStoragePersistenceScript,
  getConsoleEnhancementsScript,
  getTimerManagementScript,
  getErrorRecoveryScript,
  getPerformanceMetricsScript,
  getEventListenerCleanupScript,
  getClipboardMockScript,
  getIntersectionObserverScript,
  getMediaQueryHooksScript,
  getDragDropEnhancementScript,
  getNetworkStatusScript,
  getFormHelpersScript,
  getScrollUtilitiesScript,
  getScreenshotCaptureScript,
  getStatePreservationScript,
} from './sandboxHtml/scripts';

// Re-export script generators for potential external use
export {
  getInspectModeScript,
  getHistoryEmulationScript,
  getLinkInterceptionScript,
  getLocationOverrideScript,
  getSandboxHooksScript,
  getBootstrapScript,
  getComponentTreeScript,
  getComputedStylesScript,
  getRouteContextScript,
} from './sandboxHtml/scripts';

// Re-export types
export type { ComponentTreeNode, ComputedStylesResult } from './sandboxHtml/scripts';

/**
 * Build the complete HTML document for the iframe sandbox preview.
 * This includes:
 * - React and React DOM via ESM
 * - Babel transpilation
 * - Custom router emulation for React Router compatibility
 * - Console/error forwarding to parent window
 * - Inspect mode support
 */
export function buildIframeHtml(
  files: FileSystem,
  isInspectMode: boolean = false,
  parentOrigin: string = '',
): string {
  // Analyze files for additional imports (proactive resolution)
  const dynamicImports = analyzeFilesForImports(files);

  // Build HTML with dynamic imports injected
  const html = buildIframeHtmlTemplate(files, isInspectMode);
  return html
    .replace('__DYNAMIC_IMPORTS_PLACEHOLDER__', JSON.stringify(dynamicImports))
    .replace('__PARENT_ORIGIN_PLACEHOLDER__', JSON.stringify(parentOrigin));
}

/**
 * Build the HTML template with all script sections
 */
function buildIframeHtmlTemplate(files: FileSystem, isInspectMode: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="about:blank">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    /* CRITICAL: Prevent ANY content from affecting parent layout */
    html {
      font-family: 'Inter', sans-serif;
      background-color: #ffffff;
      color: #1a1a1a;
      /* Fixed positioning locks the viewport */
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      /* Hidden (not clip) allows positioned elements to render */
      overflow: hidden !important;
    }
    body {
      font-family: 'Inter', sans-serif;
      background-color: #ffffff;
      color: #1a1a1a;
      /* Fixed positioning locks the body */
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      /* Hidden (not clip) allows positioned elements to render */
      overflow: hidden !important;
    }
    #root {
      /* Fixed positioning for root as well */
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      /* Visible allows dropdowns/menus to overflow */
      overflow: visible !important;
    }
    /* Scrollable app container - allows internal content scrolling */
    #__app_scroll_container__ {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: auto !important;
      /* Prevent scroll from propagating to parent */
      overscroll-behavior: contain;
    }
    /* NUCLEAR: Hide ALL elements with negative positioning using max specificity */
    body [class*="bottom-\\5b -"],
    body [class*="top-\\5b -"],
    body [class*="left-\\5b -"],
    body [class*="right-\\5b -"],
    body *[class*="bottom-[-"],
    body *[class*="top-[-"],
    body *[class*="left-[-"],
    body *[class*="right-[-"] {
      display: none !important;
      visibility: hidden !important;
      width: 0 !important;
      height: 0 !important;
      opacity: 0 !important;
      overflow: hidden !important;
      position: absolute !important;
      pointer-events: none !important;
    }
    /* Also target by common decorative patterns */
    body .blur-\\[120px\\],
    body .blur-\\[100px\\],
    body .blur-\\[80px\\],
    body [class*="blur-["][class*="rounded-full"][class*="absolute"],
    body [class*="blur-["][class*="rounded-full"][class*="fixed"] {
      display: none !important;
    }
    .sandbox-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .sandbox-loading .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; }
    .sandbox-error { padding: 20px; background: #fee2e2; color: #dc2626; border-radius: 8px; margin: 20px; font-family: monospace; font-size: 14px; white-space: pre-wrap; }
    @keyframes spin { to { transform: rotate(360deg); } }
    ${isInspectMode ? `
    .inspect-highlight { outline: 2px solid #3b82f6 !important; outline-offset: 2px; background-color: rgba(59, 130, 246, 0.1) !important; cursor: crosshair !important; }
    .inspect-selected { outline: 3px solid #8b5cf6 !important; outline-offset: 2px; background-color: rgba(139, 92, 246, 0.1) !important; }
    * { cursor: crosshair !important; }
    ` : ''}
    .tree-highlight { outline: 2px dashed #10b981 !important; outline-offset: 2px; background-color: rgba(16, 185, 129, 0.1) !important; }
  </style>
</head>
<body>
  <div id="root">
    <div class="sandbox-loading">
      <div class="spinner"></div>
      <p style="margin-top: 16px; font-size: 14px;">Loading app...</p>
    </div>
  </div>
  <script>
    // Sandbox environment setup
    window.__SANDBOX_READY__ = false;

    // Host-injected parent origin (used by __postToParent when same-origin
    // access is denied, e.g. when sandbox drops allow-same-origin).
    // Empty string means "no host hint, fall back to '*'".
    window.__PARENT_ORIGIN__ = __PARENT_ORIGIN_PLACEHOLDER__;

    // Post-to-parent helper: defines window.__postToParent for origin-aware
    // messaging. Must come BEFORE any other script that talks to the parent.
    ${getPostToParentScript()}

    // Environment Variables (process.env, import.meta.env)
    ${getEnvVariablesScript()}

    // Storage shim for sandboxed iframe (no allow-same-origin)
    // Provides in-memory localStorage/sessionStorage to prevent SecurityErrors
    (function() {
      function createStorageShim() {
        var data = {};
        return {
          getItem: function(key) { return data.hasOwnProperty(key) ? data[key] : null; },
          setItem: function(key, value) { data[key] = String(value); },
          removeItem: function(key) { delete data[key]; },
          clear: function() { data = {}; },
          key: function(index) { var keys = Object.keys(data); return index < keys.length ? keys[index] : null; },
          get length() { return Object.keys(data).length; }
        };
      }
      try {
        // Test if localStorage is accessible
        window.localStorage.getItem('__test__');
      } catch (e) {
        // localStorage blocked - install shim
        Object.defineProperty(window, 'localStorage', { value: createStorageShim(), writable: false });
        Object.defineProperty(window, 'sessionStorage', { value: createStorageShim(), writable: false });
        console.log('[Sandbox] Storage shim installed (in-memory)');
      }
    })();

    // Storage Persistence (sync with parent window)
    ${getStoragePersistenceScript()}

    // Timer Management (tracking and cleanup)
    ${getTimerManagementScript()}

    // Error Recovery (crash detection and graceful recovery)
    ${getErrorRecoveryScript()}

    // Performance Metrics (FPS, render time, memory tracking)
    ${getPerformanceMetricsScript()}

    // Event Listener Cleanup (tracking and leak detection)
    ${getEventListenerCleanupScript()}

    // Clipboard API Mock (copy/paste support)
    ${getClipboardMockScript()}

    // Intersection Observer (lazy loading, infinite scroll)
    ${getIntersectionObserverScript()}

    // Media Query Hooks (responsive design utilities)
    ${getMediaQueryHooksScript()}

    // Drag & Drop Enhancement (file handling)
    ${getDragDropEnhancementScript()}

    // Network Status (online/offline detection)
    ${getNetworkStatusScript()}

    // Form Helpers (validation, auto-save)
    ${getFormHelpersScript()}

    // Scroll Utilities (smooth scroll, position tracking)
    ${getScrollUtilitiesScript()}

    // Screenshot Capture (preview to image)
    ${getScreenshotCaptureScript()}

    // State Preservation (HMR-like state capture/restore)
    ${getStatePreservationScript()}

    // CRITICAL: Prevent any scroll from happening at document level
    // This ensures negative positioned elements can't trigger scroll
    window.addEventListener('scroll', function(e) {
      window.scrollTo(0, 0);
      e.stopPropagation();
    }, { capture: true, passive: false });

    document.addEventListener('scroll', function(e) {
      window.scrollTo(0, 0);
      e.stopPropagation();
    }, { capture: true, passive: false });

    // Also prevent wheel events from causing any document scroll
    // But allow wheel events inside the app scroll container
    document.addEventListener('wheel', function(e) {
      // Only prevent if target is document or body (not inside scroll container)
      if (e.target === document || e.target === document.body || e.target === document.documentElement) {
        e.preventDefault();
        e.stopPropagation();
      }
      // Allow scrolling inside the app container
      var scrollContainer = document.getElementById('__app_scroll_container__');
      if (scrollContainer && scrollContainer.contains(e.target)) {
        // Allow the event to proceed naturally
        return;
      }
    }, { capture: true, passive: false });

    // CRITICAL: Inject styles AFTER Tailwind loads to override it
    function injectOverrideStyles() {
      const styleId = '__sandbox_override_styles__';
      if (document.getElementById(styleId)) return;

      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = \`
        /* Override Tailwind - highest specificity */
        html body *[class*="bottom-[-"],
        html body *[class*="top-[-"],
        html body *[class*="left-[-"],
        html body *[class*="right-[-"],
        html body div[class*="blur-"][class*="absolute"],
        html body div[class*="blur-"][class*="fixed"] {
          display: none !important;
          visibility: hidden !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
        }
      \`;
      document.head.appendChild(style);
    }

    // Hide decorative elements via CSS only (no DOM removal to avoid framer-motion conflicts)
    function hideDecorativeElements() {
      document.querySelectorAll('*').forEach(el => {
        // Skip critical elements
        if (el.id === 'root' || el.tagName === 'HTML' || el.tagName === 'BODY' || el.tagName === 'HEAD') return;
        if (el.closest('nav') || el.closest('header') || el.closest('[role="navigation"]') || el.closest('[role="menu"]')) return;

        const cn = el.className;
        if (typeof cn !== 'string') return;

        // ONLY target clearly decorative blur backgrounds with negative positioning
        const isNegativelyPositioned = cn.includes('bottom-[-') || cn.includes('top-[-') || cn.includes('left-[-') || cn.includes('right-[-');
        const isDecorativeBlur = cn.includes('blur-') && cn.includes('rounded-full') && (cn.includes('absolute') || cn.includes('fixed'));

        if (isNegativelyPositioned || isDecorativeBlur) {
          // Just hide with CSS, don't remove from DOM
          el.style.cssText += ';display:none!important;visibility:hidden!important;';
        }
      });
    }

    // Inject styles immediately and on DOM ready
    injectOverrideStyles();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectOverrideStyles();
        hideDecorativeElements();
      });
    }

    // Note: MutationObserver removed - was causing conflicts with framer-motion animations
    // CSS hiding is sufficient and won't cause "removeChild" errors

    // Run hideDecorativeElements only a few times at startup (not continuously)
    // This avoids conflicts with framer-motion animations
    [0, 100, 500, 1500].forEach(ms => {
      setTimeout(() => {
        injectOverrideStyles();
        hideDecorativeElements();
      }, ms);
    });

    // XSS-safe error display helper - escapes HTML entities
    const escapeHtmlForError = (text) => {
      const div = document.createElement('div');
      div.textContent = String(text || 'Unknown error');
      return div.innerHTML;
    };

    // Safe error display - prevents XSS via error messages
    const showSafeError = (prefix, err) => {
      const root = document.getElementById('root');
      if (root) {
        root.textContent = ''; // Clear safely
        const errorDiv = document.createElement('div');
        errorDiv.className = 'sandbox-error';
        errorDiv.textContent = prefix + ': ' + (err && err.message ? err.message : String(err || 'Unknown error'));
        root.appendChild(errorDiv);
      }
    };

    // Filter transient/harmless errors that shouldn't trigger auto-fix
    // IMPORTANT: Do NOT ignore fixable errors like "is not defined", "is not a function"
    const isIgnorableError = (msg) => {
      if (!msg) return true;
      const str = String(msg).toLowerCase();

      // These are truly transient/unfixable errors
      const ignorePatterns = [
        'resizeobserver',
        'script error',
        'loading chunk',
        'dynamically imported module',
        'failed to fetch',
        'network error',
        'hydrat',
        'unmounted component',
        'memory leak',
        'perform a react state update',
        'maximum update depth exceeded',
        'each child in a list should have a unique',
        'validatedomnesting',
        'received true for a non-boolean',
        'received false for a non-boolean',
        'unknown prop',
        'invalid prop',
        'failed prop type',
        'minified react error',
        'suspended while rendering',
        '__esmodule',
        'cannot redefine property'
      ];

      // These errors ARE fixable - do NOT ignore them
      // - "X is not defined" → missing import/declaration
      // - "X is not a function" → wrong import or missing export
      // - "cannot read properties of null/undefined" → null check needed
      // - "nothing was returned from render" → missing return statement

      return ignorePatterns.some(p => str.includes(p));
    };

    // Enhanced Console (better formatting, timing, grouping, object inspection)
    ${getConsoleEnhancementsScript()}

    // Global error handlers (use isIgnorableError for auto-fix filtering)
    window.onerror = function(msg) {
      var errMsg = String(msg || 'Unknown error');
      window.parent.postMessage({
        type: 'CONSOLE_LOG',
        logType: 'error',
        message: isIgnorableError(errMsg) ? '[TRANSIENT] ' + errMsg : errMsg,
        timestamp: Date.now()
      }, '*');
      return false;
    };

    // Handle unhandled promise rejections (async errors)
    window.onunhandledrejection = function(event) {
      var msg = event.reason?.message || String(event.reason) || 'Unhandled Promise rejection';
      window.parent.postMessage({
        type: 'CONSOLE_LOG',
        logType: 'error',
        message: isIgnorableError(msg) ? '[TRANSIENT] ' + msg : msg,
        timestamp: Date.now()
      }, '*');
    };

    // Patch URL constructor FIRST - before any library loads
    (function() {
      var OriginalURL = window.URL;
      window.URL = function URL(url, base) {
        // Handle various edge cases
        if (url === undefined || url === null || url === '') {
          url = '/';
        }
        url = String(url);
        // If url is relative, provide default base
        if ((url.startsWith('/') || !url.includes('://')) && !base) {
          base = 'http://localhost';
        }
        try {
          return new OriginalURL(url, base);
        } catch (e) {
          // Last resort fallback
          return new OriginalURL('http://localhost' + (url.startsWith('/') ? url : '/' + url));
        }
      };
      window.URL.prototype = OriginalURL.prototype;
      window.URL.createObjectURL = OriginalURL.createObjectURL;
      window.URL.revokeObjectURL = OriginalURL.revokeObjectURL;
      window.URL.canParse = OriginalURL.canParse;
    })();

    // Fetch/XHR Mocking - intercepts API calls
    ${getFetchMockingScript()}

    // Asset/Image Handling - provides placeholders for missing assets
    ${getAssetHandlingScript()}

    // Inspect Mode
    window.__INSPECT_MODE__ = ${isInspectMode};
    ${isInspectMode ? getInspectModeScript() : ''}

    // Enhanced in-memory router state with full URL support
    window.__SANDBOX_ROUTER__ = {
      currentPath: '/',
      currentState: null,
      search: '',
      hash: '',
      listeners: [],

      navigate: function(path, state, skipNotify) {
        if (state === undefined) state = null;
        // Ensure path is a string
        path = String(path || '/');
        if (!path.startsWith('/')) path = '/' + path;

        // Parse URL manually (URL constructor is unreliable in sandbox)
        var pathname = path;
        var search = '';
        var hash = '';

        // Extract hash
        var hashIndex = path.indexOf('#');
        if (hashIndex >= 0) {
          hash = path.substring(hashIndex);
          pathname = path.substring(0, hashIndex);
        }

        // Extract search/query
        var searchIndex = pathname.indexOf('?');
        if (searchIndex >= 0) {
          search = pathname.substring(searchIndex);
          pathname = pathname.substring(0, searchIndex);
        }

        this.currentPath = pathname || '/';
        this.search = search;
        this.hash = hash;
        this.currentState = state;

        const location = this.getLocation();
        this.listeners.forEach(fn => fn(location));
        console.log('[Router] Navigated to: ' + this.currentPath + this.search + this.hash);

        // Notify parent of URL change (unless skipped for internal operations)
        if (!skipNotify) {
          this.notifyParent();
        }
      },

      notifyParent: function() {
        var historyInfo = window.__HISTORY_INFO__ || { index: 0, length: 1 };
        window.parent.postMessage({
          type: 'URL_CHANGE',
          url: this.currentPath + this.search + this.hash,
          canGoBack: historyInfo.index > 0,
          canGoForward: historyInfo.index < historyInfo.length - 1
        }, '*');
      },

      getLocation: function() {
        return {
          pathname: this.currentPath,
          search: this.search,
          hash: this.hash,
          state: this.currentState,
          key: Math.random().toString(36).substring(2, 8)
        };
      },

      subscribe: function(fn) {
        this.listeners.push(fn);
        return function() {
          window.__SANDBOX_ROUTER__.listeners = window.__SANDBOX_ROUTER__.listeners.filter(function(l) { return l !== fn; });
        };
      },

      getPath: function() { return this.currentPath; }
    };

    ${getHistoryEmulationScript()}
    ${getLinkInterceptionScript()}
    ${getLocationOverrideScript()}
    ${getSandboxHooksScript()}

    // Component Tree and Computed Styles (DevTools support)
    ${getComponentTreeScript()}
    ${getComputedStylesScript()}

    // Route Context (Enhanced nested routing support)
    ${getRouteContextScript()}

    // Heartbeat handler for connection monitoring
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'HEARTBEAT') {
        window.parent.postMessage({ type: 'HEARTBEAT_RESPONSE', timestamp: Date.now() }, '*');
      }
    });
  </script>
  <script type="text/babel" data-presets="react,typescript">
    ${getBootstrapScript(files)}
  </script>
</body>
</html>`;
}
