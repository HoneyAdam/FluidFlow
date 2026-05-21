/**
 * Network Status Script
 *
 * Provides network connectivity detection, connection quality info,
 * and offline/online event handling.
 */

/**
 * Generate the network status script for the sandbox
 */
export function getNetworkStatusScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // NETWORK STATUS
    // Online/offline detection and connection quality
    // ═══════════════════════════════════════════════════════════

    (function() {
      // Network state
      var networkState = {
        online: navigator.onLine,
        type: 'unknown',
        effectiveType: 'unknown',
        downlink: 0,
        rtt: 0,
        saveData: false,
        lastChanged: Date.now()
      };

      // Update connection info if available
      function updateConnectionInfo() {
        var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

        if (connection) {
          networkState.type = connection.type || 'unknown';
          networkState.effectiveType = connection.effectiveType || 'unknown';
          networkState.downlink = connection.downlink || 0;
          networkState.rtt = connection.rtt || 0;
          networkState.saveData = connection.saveData || false;
        }
      }

      // Initialize
      updateConnectionInfo();

      // Listeners storage
      var listeners = {
        online: [],
        offline: [],
        change: []
      };

      // Notify listeners
      function notifyListeners(type, data) {
        listeners[type].forEach(function(callback) {
          try {
            callback(data);
          } catch (e) {
            console.error('[Network] Listener error:', e.message);
          }
        });

        // Also notify change listeners
        if (type !== 'change') {
          listeners.change.forEach(function(callback) {
            try {
              callback({ type: type, state: networkState });
            } catch (e) {
              console.error('[Network] Change listener error:', e.message);
            }
          });
        }
      }

      // Handle online event
      window.addEventListener('online', function() {
        networkState.online = true;
        networkState.lastChanged = Date.now();
        updateConnectionInfo();

        console.log('[Network] Connection restored');
        notifyListeners('online', networkState);

        window.__postToParent({
          type: 'NETWORK_STATUS',
          online: true,
          state: networkState,
          timestamp: Date.now()
        }, '*');
      });

      // Handle offline event
      window.addEventListener('offline', function() {
        networkState.online = false;
        networkState.lastChanged = Date.now();

        console.warn('[Network] Connection lost');
        notifyListeners('offline', networkState);

        window.__postToParent({
          type: 'NETWORK_STATUS',
          online: false,
          state: networkState,
          timestamp: Date.now()
        }, '*');
      });

      // Listen for connection changes (if supported)
      var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection) {
        connection.addEventListener('change', function() {
          updateConnectionInfo();
          networkState.lastChanged = Date.now();

          console.log('[Network] Connection changed:', networkState.effectiveType);
          notifyListeners('change', networkState);
        });
      }

      // Simulate network conditions (for testing)
      function simulateOffline() {
        var originalFetch = window.fetch;
        var originalXHR = window.XMLHttpRequest;

        window.fetch = function() {
          return Promise.reject(new Error('Network request failed (simulated offline)'));
        };

        window.XMLHttpRequest = function() {
          var xhr = new originalXHR();
          var originalOpen = xhr.open;
          xhr.open = function() {
            throw new Error('Network request failed (simulated offline)');
          };
          return xhr;
        };

        return function restore() {
          window.fetch = originalFetch;
          window.XMLHttpRequest = originalXHR;
        };
      }

      // Check if connection is slow
      function isSlowConnection() {
        if (networkState.effectiveType === 'slow-2g' || networkState.effectiveType === '2g') {
          return true;
        }
        if (networkState.rtt > 500) {
          return true;
        }
        if (networkState.downlink < 0.5) {
          return true;
        }
        return false;
      }

      // Get connection quality
      function getConnectionQuality() {
        if (!networkState.online) return 'offline';

        var effectiveType = networkState.effectiveType;
        if (effectiveType === '4g') return 'excellent';
        if (effectiveType === '3g') return 'good';
        if (effectiveType === '2g') return 'poor';
        if (effectiveType === 'slow-2g') return 'very-poor';

        // Fallback based on RTT
        if (networkState.rtt < 100) return 'excellent';
        if (networkState.rtt < 300) return 'good';
        if (networkState.rtt < 500) return 'moderate';
        return 'poor';
      }

      // Expose API
      window.__SANDBOX_NETWORK__ = {
        // Check if online
        isOnline: function() {
          return networkState.online;
        },

        // Get full state
        getState: function() {
          return Object.assign({}, networkState);
        },

        // Get connection quality
        getQuality: getConnectionQuality,

        // Check if slow connection
        isSlowConnection: isSlowConnection,

        // Add listener
        on: function(event, callback) {
          if (listeners[event]) {
            listeners[event].push(callback);
          }
          return function() {
            var index = listeners[event].indexOf(callback);
            if (index > -1) {
              listeners[event].splice(index, 1);
            }
          };
        },

        // Remove listener
        off: function(event, callback) {
          if (listeners[event]) {
            var index = listeners[event].indexOf(callback);
            if (index > -1) {
              listeners[event].splice(index, 1);
            }
          }
        },

        // Simulate offline (for testing)
        simulateOffline: simulateOffline,

        // Get time since last change
        timeSinceLastChange: function() {
          return Date.now() - networkState.lastChanged;
        }
      };

      // Also expose as simpler global
      window.isOnline = function() {
        return networkState.online;
      };

    })();
  `;
}
