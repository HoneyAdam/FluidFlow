/**
 * Post-To-Parent Helper Script
 *
 * Defines a global `__postToParent(message)` function inside the iframe so
 * sandbox scripts can broadcast back to the parent without each callsite
 * hardcoding `'*'` as the target origin.
 *
 * Strategy:
 * 1. First try `window.parent.location.origin` — works when the sandbox has
 *    `allow-same-origin` (current preview configuration).
 * 2. Fall back to `window.__PARENT_ORIGIN__` if the host pre-injected it
 *    (needed when sandbox drops `allow-same-origin` in the future).
 * 3. Last resort: `'*'`. Logged in debug so we know fallback is in use.
 *
 * This keeps message receivers (parent listeners) free to validate
 * `event.origin` against the known FluidFlow origin and reject any frame
 * that managed to inherit the iframe handle.
 */
export function getPostToParentScript(): string {
  return `
    // Resolve parent origin once at startup; recompute on demand to handle
    // navigation. Helper itself never throws.
    window.__postToParent = function(message) {
      var target = '*';
      try {
        // Same-origin sandbox path
        target = window.parent.location.origin;
      } catch (_e1) {
        // Cross-origin sandbox path: host must inject window.__PARENT_ORIGIN__
        if (typeof window.__PARENT_ORIGIN__ === 'string' && window.__PARENT_ORIGIN__) {
          target = window.__PARENT_ORIGIN__;
        }
      }
      try {
        window.parent.postMessage(message, target);
      } catch (_e2) {
        // Parent unreachable (iframe destroyed); silently drop.
      }
    };
  `;
}
