/**
 * State Preservation Script
 *
 * Captures and restores UI state across sandbox reloads for HMR-like experience.
 * Preserves:
 * - Form input values (text, checkbox, radio, select, textarea)
 * - Scroll positions (window and scrollable elements)
 * - Focused element
 * - Route state
 *
 * Security Note: This runs in an isolated sandbox iframe with the user's own
 * generated content. State is captured and restored within the same session.
 */

export function getStatePreservationScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // STATE PRESERVATION SYSTEM
    // Captures and restores UI state for HMR-like experience
    // ═══════════════════════════════════════════════════════════

    (function() {
      // State storage key
      const STATE_KEY = '__SANDBOX_PRESERVED_STATE__';

      /**
       * Capture current UI state
       */
      function captureState() {
        const state = {
          timestamp: Date.now(),
          forms: captureFormState(),
          scroll: captureScrollState(),
          focus: captureFocusState(),
          route: captureRouteState(),
        };

        // Store in sessionStorage (survives refresh within session)
        try {
          sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
        } catch (e) {
          // Failed to save state - ignore silently
        }

        return state;
      }

      /**
       * Restore previously captured state
       */
      function restoreState() {
        try {
          const stateJson = sessionStorage.getItem(STATE_KEY);
          if (!stateJson) {
            return false;
          }

          const state = JSON.parse(stateJson);

          // Check if state is too old (> 30 seconds)
          if (Date.now() - state.timestamp > 30000) {
            sessionStorage.removeItem(STATE_KEY);
            return false;
          }

          // Restore route first (before React renders)
          if (state.route) restoreRouteState(state.route);

          // Delay form/scroll/focus restore to allow React to render
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (state.forms) restoreFormState(state.forms);
              if (state.scroll) restoreScrollState(state.scroll);
              if (state.focus) restoreFocusState(state.focus);

              // Clear stored state after restore
              sessionStorage.removeItem(STATE_KEY);
            }, 100);
          });

          return true;
        } catch (e) {
          return false;
        }
      }

      // ═══════════════════════════════════════════════════════════
      // FORM STATE CAPTURE/RESTORE
      // ═══════════════════════════════════════════════════════════

      function captureFormState() {
        const formData = [];

        // Text inputs, textareas
        document.querySelectorAll('input, textarea, select').forEach((el, index) => {
          const input = el;
          const id = input.id || input.name || '__input_' + index;
          const path = getElementPath(input);

          if (input.tagName === 'SELECT') {
            formData.push({
              type: 'select',
              id: id,
              path: path,
              value: input.value,
              selectedIndex: input.selectedIndex
            });
          } else if (input.type === 'checkbox' || input.type === 'radio') {
            formData.push({
              type: input.type,
              id: id,
              path: path,
              name: input.name,
              value: input.value,
              checked: input.checked
            });
          } else if (input.type !== 'password' && input.type !== 'file') {
            // Don't capture passwords or file inputs for security
            formData.push({
              type: 'text',
              id: id,
              path: path,
              value: input.value,
              selectionStart: input.selectionStart,
              selectionEnd: input.selectionEnd
            });
          }
        });

        // ContentEditable elements - capture text content only (safer)
        document.querySelectorAll('[contenteditable="true"]').forEach((el, index) => {
          const path = getElementPath(el);
          formData.push({
            type: 'contenteditable',
            id: el.id || '__ce_' + index,
            path: path,
            text: el.textContent || ''
          });
        });

        return formData;
      }

      function restoreFormState(formData) {
        formData.forEach(function(item) {
          // Try to find element by id first, then by path
          var el = item.id && !item.id.startsWith('__')
            ? document.getElementById(item.id)
            : null;

          if (!el && item.path) {
            el = findElementByPath(item.path);
          }

          if (!el) return;

          try {
            if (item.type === 'select') {
              el.value = item.value;
            } else if (item.type === 'checkbox' || item.type === 'radio') {
              if (item.type === 'radio') {
                // For radio, find by name and value
                var radio = document.querySelector(
                  'input[type="radio"][name="' + item.name + '"][value="' + item.value + '"]'
                );
                if (radio) radio.checked = item.checked;
              } else {
                el.checked = item.checked;
              }
            } else if (item.type === 'contenteditable') {
              // Use textContent for safety (no HTML injection)
              el.textContent = item.text;
            } else {
              el.value = item.value;
              // Restore cursor position
              if (typeof item.selectionStart === 'number' && el.setSelectionRange) {
                try {
                  el.setSelectionRange(item.selectionStart, item.selectionEnd);
                } catch (e) {
                  // Some inputs don't support setSelectionRange
                }
              }
            }

            // Trigger input event for React controlled components
            var event = new Event('input', { bubbles: true });
            el.dispatchEvent(event);
          } catch (e) {
            // Ignore errors for individual elements
          }
        });
      }

      // ═══════════════════════════════════════════════════════════
      // SCROLL STATE CAPTURE/RESTORE
      // ═══════════════════════════════════════════════════════════

      function captureScrollState() {
        var scrollData = [];

        // Window scroll
        scrollData.push({
          type: 'window',
          x: window.scrollX,
          y: window.scrollY
        });

        // Scrollable elements (limit to avoid performance issues)
        var scrollableCount = 0;
        var maxScrollable = 20;

        document.querySelectorAll('*').forEach(function(el) {
          if (scrollableCount >= maxScrollable) return;
          if (el.scrollTop > 0 || el.scrollLeft > 0) {
            var path = getElementPath(el);
            scrollData.push({
              type: 'element',
              path: path,
              x: el.scrollLeft,
              y: el.scrollTop
            });
            scrollableCount++;
          }
        });

        return scrollData;
      }

      function restoreScrollState(scrollData) {
        scrollData.forEach(function(item) {
          if (item.type === 'window') {
            window.scrollTo(item.x, item.y);
          } else if (item.path) {
            var el = findElementByPath(item.path);
            if (el) {
              el.scrollLeft = item.x;
              el.scrollTop = item.y;
            }
          }
        });
      }

      // ═══════════════════════════════════════════════════════════
      // FOCUS STATE CAPTURE/RESTORE
      // ═══════════════════════════════════════════════════════════

      function captureFocusState() {
        var active = document.activeElement;
        if (!active || active === document.body) return null;

        return {
          path: getElementPath(active),
          id: active.id || null
        };
      }

      function restoreFocusState(focusData) {
        if (!focusData) return;

        var el = focusData.id ? document.getElementById(focusData.id) : null;
        if (!el && focusData.path) {
          el = findElementByPath(focusData.path);
        }

        if (el && typeof el.focus === 'function') {
          try {
            el.focus();
          } catch (e) {
            // Ignore focus errors
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // ROUTE STATE CAPTURE/RESTORE
      // ═══════════════════════════════════════════════════════════

      function captureRouteState() {
        if (window.__SANDBOX_ROUTER__) {
          return {
            pathname: window.__SANDBOX_ROUTER__.currentPath || '/',
            search: window.__SANDBOX_ROUTER__.search || '',
            hash: window.__SANDBOX_ROUTER__.hash || ''
          };
        }
        return null;
      }

      function restoreRouteState(routeData) {
        if (window.__SANDBOX_ROUTER__ && routeData) {
          // Set initial path before React mounts
          window.__SANDBOX_ROUTER__.currentPath = routeData.pathname;
          window.__SANDBOX_ROUTER__.search = routeData.search;
          window.__SANDBOX_ROUTER__.hash = routeData.hash;
        }
      }

      // ═══════════════════════════════════════════════════════════
      // HELPER FUNCTIONS
      // ═══════════════════════════════════════════════════════════

      /**
       * Get a unique path to an element for later lookup
       */
      function getElementPath(el) {
        var path = [];
        var current = el;

        while (current && current !== document.body) {
          var selector = current.tagName.toLowerCase();

          if (current.id) {
            selector = '#' + current.id;
            path.unshift(selector);
            break; // ID is unique, stop here
          }

          // Add class names (first 2 only to avoid overly specific paths)
          if (current.className && typeof current.className === 'string') {
            var classes = current.className.split(' ')
              .filter(function(c) { return c && !c.startsWith('__'); })
              .slice(0, 2)
              .join('.');
            if (classes) selector += '.' + classes;
          }

          // Add nth-of-type for disambiguation
          var parent = current.parentElement;
          if (parent) {
            var siblings = Array.from(parent.children).filter(function(c) {
              return c.tagName === current.tagName;
            });
            if (siblings.length > 1) {
              var index = siblings.indexOf(current) + 1;
              selector += ':nth-of-type(' + index + ')';
            }
          }

          path.unshift(selector);
          current = current.parentElement;
        }

        return path.join(' > ');
      }

      /**
       * Find element by path
       */
      function findElementByPath(path) {
        try {
          return document.querySelector(path);
        } catch (e) {
          return null;
        }
      }

      // ═══════════════════════════════════════════════════════════
      // MESSAGE HANDLERS
      // ═══════════════════════════════════════════════════════════

      window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;

        switch (event.data.type) {
          case 'CAPTURE_STATE':
            var state = captureState();
            // Notify parent that state was captured
            window.__postToParent({
              type: 'STATE_CAPTURED',
              success: true,
              summary: {
                forms: state.forms.length,
                scrollPositions: state.scroll.length,
                route: state.route ? state.route.pathname : null
              }
            }, '*');
            break;

          case 'RESTORE_STATE':
            var restored = restoreState();
            window.__postToParent({
              type: 'STATE_RESTORED',
              success: restored
            }, '*');
            break;

          case 'CLEAR_PRESERVED_STATE':
            sessionStorage.removeItem(STATE_KEY);
            break;
        }
      });

      // Expose functions globally for debugging
      window.__SANDBOX_STATE__ = {
        capture: captureState,
        restore: restoreState,
        clear: function() { sessionStorage.removeItem(STATE_KEY); }
      };

      // Auto-restore state on load (if available)
      // This runs after React mounts
      if (document.readyState === 'complete') {
        setTimeout(function() { restoreState(); }, 200);
      } else {
        window.addEventListener('load', function() {
          setTimeout(function() { restoreState(); }, 200);
        });
      }

    })();
  `;
}
