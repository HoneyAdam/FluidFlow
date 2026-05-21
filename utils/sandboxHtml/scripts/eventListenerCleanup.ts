/**
 * Event Listener Cleanup Script
 *
 * Tracks addEventListener/removeEventListener calls to detect memory leaks
 * and provide cleanup functionality when the sandbox is refreshed.
 */

/**
 * Generate the event listener cleanup script for the sandbox
 */
export function getEventListenerCleanupScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // EVENT LISTENER CLEANUP SYSTEM
    // Tracks event listeners for leak detection and cleanup
    // ═══════════════════════════════════════════════════════════

    (function() {
      // Store for tracking listeners
      var listenerRegistry = new WeakMap();
      var globalListenerCount = 0;
      var listenerStats = {
        added: 0,
        removed: 0,
        active: 0
      };

      // Common event types for categorization
      var eventCategories = {
        mouse: ['click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'mouseenter', 'mouseleave', 'mouseover', 'mouseout', 'contextmenu'],
        keyboard: ['keydown', 'keyup', 'keypress'],
        touch: ['touchstart', 'touchend', 'touchmove', 'touchcancel'],
        focus: ['focus', 'blur', 'focusin', 'focusout'],
        form: ['submit', 'reset', 'change', 'input', 'invalid'],
        window: ['load', 'unload', 'beforeunload', 'resize', 'scroll', 'hashchange', 'popstate'],
        media: ['play', 'pause', 'ended', 'volumechange', 'timeupdate', 'loadeddata'],
        animation: ['animationstart', 'animationend', 'animationiteration', 'transitionend'],
        drag: ['drag', 'dragstart', 'dragend', 'dragenter', 'dragleave', 'dragover', 'drop']
      };

      // Get or create listener array for an element
      function getListeners(element) {
        if (!listenerRegistry.has(element)) {
          listenerRegistry.set(element, []);
        }
        return listenerRegistry.get(element);
      }

      // Generate unique ID for a listener
      var listenerId = 0;
      function generateListenerId() {
        return ++listenerId;
      }

      // Store original methods
      var originalAddEventListener = EventTarget.prototype.addEventListener;
      var originalRemoveEventListener = EventTarget.prototype.removeEventListener;

      // Enhanced addEventListener with tracking
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (!listener) return;

        var element = this;
        var listeners = getListeners(element);

        // Check if this exact listener already exists
        var exists = listeners.some(function(l) {
          return l.type === type && l.listener === listener;
        });

        if (!exists) {
          var id = generateListenerId();
          var entry = {
            id: id,
            type: type,
            listener: listener,
            options: options,
            added: Date.now(),
            stack: new Error().stack
          };

          listeners.push(entry);
          globalListenerCount++;
          listenerStats.added++;
          listenerStats.active++;
        }

        // Call original
        return originalAddEventListener.call(this, type, listener, options);
      };

      // Enhanced removeEventListener with tracking
      EventTarget.prototype.removeEventListener = function(type, listener, options) {
        if (!listener) return;

        var element = this;
        var listeners = getListeners(element);

        // Find and remove from tracking
        var index = -1;
        for (var i = 0; i < listeners.length; i++) {
          if (listeners[i].type === type && listeners[i].listener === listener) {
            index = i;
            break;
          }
        }

        if (index !== -1) {
          listeners.splice(index, 1);
          globalListenerCount--;
          listenerStats.removed++;
          listenerStats.active--;
        }

        // Call original
        return originalRemoveEventListener.call(this, type, listener, options);
      };

      // Get category for event type
      function getEventCategory(type) {
        for (var category in eventCategories) {
          if (eventCategories[category].indexOf(type) !== -1) {
            return category;
          }
        }
        return 'other';
      }

      // Cleanup all tracked listeners for an element
      function cleanupElement(element) {
        var listeners = listenerRegistry.get(element);
        if (!listeners) return 0;

        var count = 0;
        listeners.forEach(function(entry) {
          try {
            originalRemoveEventListener.call(element, entry.type, entry.listener, entry.options);
            count++;
            globalListenerCount--;
            listenerStats.active--;
          } catch (e) {
            // Ignore errors during cleanup
          }
        });

        listenerRegistry.delete(element);
        return count;
      }

      // Cleanup all listeners globally
      function cleanupAll() {
        var total = 0;

        // Clean window listeners
        total += cleanupElement(window);

        // Clean document listeners
        total += cleanupElement(document);

        // Clean all DOM elements
        document.querySelectorAll('*').forEach(function(el) {
          total += cleanupElement(el);
        });

        if (total > 0) {
          console.log('[EventListener] Cleaned up ' + total + ' listeners');
        }

        return total;
      }

      // Detect potential memory leaks
      function detectLeaks() {
        var leaks = [];
        var now = Date.now();
        var oldThreshold = 30000; // 30 seconds

        // Check for old listeners on removed elements
        document.querySelectorAll('*').forEach(function(el) {
          var listeners = listenerRegistry.get(el);
          if (listeners && listeners.length > 0) {
            listeners.forEach(function(entry) {
              if (now - entry.added > oldThreshold) {
                // Check if element is still in DOM
                if (!document.contains(el)) {
                  leaks.push({
                    type: entry.type,
                    age: Math.round((now - entry.added) / 1000) + 's',
                    element: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
                    issue: 'Element removed but listener not cleaned up'
                  });
                }
              }
            });
          }
        });

        // Check window/document for excessive listeners
        var windowListeners = listenerRegistry.get(window) || [];
        var documentListeners = listenerRegistry.get(document) || [];

        if (windowListeners.length > 20) {
          leaks.push({
            type: 'multiple',
            count: windowListeners.length,
            element: 'window',
            issue: 'Too many window listeners (possible leak)'
          });
        }

        if (documentListeners.length > 20) {
          leaks.push({
            type: 'multiple',
            count: documentListeners.length,
            element: 'document',
            issue: 'Too many document listeners (possible leak)'
          });
        }

        return leaks;
      }

      // Get listener statistics by category
      function getStatsByCategory() {
        var stats = {};

        function processElement(el) {
          var listeners = listenerRegistry.get(el);
          if (listeners) {
            listeners.forEach(function(entry) {
              var category = getEventCategory(entry.type);
              if (!stats[category]) {
                stats[category] = { count: 0, types: {} };
              }
              stats[category].count++;
              stats[category].types[entry.type] = (stats[category].types[entry.type] || 0) + 1;
            });
          }
        }

        processElement(window);
        processElement(document);
        document.querySelectorAll('*').forEach(processElement);

        return stats;
      }

      // Register cleanup on page unload
      window.addEventListener('beforeunload', cleanupAll);
      window.addEventListener('pagehide', cleanupAll);

      // Listen for cleanup message from parent
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'CLEANUP_LISTENERS') {
          cleanupAll();
        }
      });

      // Expose event listener API
      window.__SANDBOX_LISTENERS__ = {
        // Get total listener count
        getCount: function() {
          return listenerStats.active;
        },

        // Get listener statistics
        getStats: function() {
          return {
            added: listenerStats.added,
            removed: listenerStats.removed,
            active: listenerStats.active
          };
        },

        // Get listeners by category
        getByCategory: function() {
          return getStatsByCategory();
        },

        // Get listeners for a specific element
        getForElement: function(element) {
          return (listenerRegistry.get(element) || []).map(function(entry) {
            return {
              id: entry.id,
              type: entry.type,
              age: Date.now() - entry.added
            };
          });
        },

        // Detect potential memory leaks
        detectLeaks: function() {
          return detectLeaks();
        },

        // Cleanup specific element
        cleanup: function(element) {
          return cleanupElement(element);
        },

        // Cleanup all listeners
        cleanupAll: cleanupAll,

        // Reset statistics
        reset: function() {
          listenerStats.added = 0;
          listenerStats.removed = 0;
        }
      };

      // Periodic leak check (every 30 seconds)
      setInterval(function() {
        var leaks = detectLeaks();
        if (leaks.length > 0) {
          console.warn('[EventListener] Potential memory leaks detected:', leaks.length);
          window.__postToParent({
            type: 'MEMORY_LEAK_WARNING',
            leaks: leaks,
            timestamp: Date.now()
          });
        }
      }, 30000);

    })();
  `;
}
