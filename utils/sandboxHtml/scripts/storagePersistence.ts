/**
 * Storage Persistence Script
 *
 * Provides persistent localStorage/sessionStorage for the sandbox.
 * Data is synced with the parent window to survive iframe refreshes.
 */

/**
 * Generate the storage persistence script for the sandbox
 */
export function getStoragePersistenceScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // PERSISTENT STORAGE SYSTEM
    // Syncs localStorage/sessionStorage with parent to survive refreshes
    // ═══════════════════════════════════════════════════════════

    (function() {
      // Create persistent storage that syncs with parent
      function createPersistentStorage(storageType) {
        var data = {};
        var synced = false;

        // Request initial data from parent
        window.__postToParent({
          type: 'STORAGE_GET_ALL',
          storageType: storageType
        });

        // Listen for storage data from parent
        window.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'STORAGE_DATA' && event.data.storageType === storageType) {
            // Merge received data (don't overwrite local changes)
            var received = event.data.data || {};
            for (var key in received) {
              if (received.hasOwnProperty(key) && !data.hasOwnProperty(key)) {
                data[key] = received[key];
              }
            }
            synced = true;
          }
        });

        return {
          getItem: function(key) {
            return data.hasOwnProperty(key) ? data[key] : null;
          },

          setItem: function(key, value) {
            var strValue = String(value);
            data[key] = strValue;
            // Sync to parent
            window.__postToParent({
              type: 'STORAGE_SET',
              storageType: storageType,
              key: key,
              value: strValue
            });
          },

          removeItem: function(key) {
            delete data[key];
            // Sync to parent
            window.__postToParent({
              type: 'STORAGE_REMOVE',
              storageType: storageType,
              key: key
            });
          },

          clear: function() {
            data = {};
            // Sync to parent
            window.__postToParent({
              type: 'STORAGE_CLEAR',
              storageType: storageType
            });
          },

          key: function(index) {
            var keys = Object.keys(data);
            return index < keys.length ? keys[index] : null;
          },

          get length() {
            return Object.keys(data).length;
          },

          // Get all data (for debugging)
          _getData: function() {
            return { ...data };
          },

          // Check if synced with parent
          _isSynced: function() {
            return synced;
          }
        };
      }

      // Install persistent storage (only if not already installed by basic shim)
      try {
        // Test if we can access storage
        window.localStorage.getItem('__test__');
        // Native storage works, enhance it with sync capabilities

        // Store original references
        var originalLocalStorage = window.localStorage;
        var originalSessionStorage = window.sessionStorage;

        // Create proxy to intercept and sync
        var localStorageProxy = new Proxy(originalLocalStorage, {
          get: function(target, prop) {
            if (prop === 'setItem') {
              return function(key, value) {
                target.setItem(key, value);
                window.__postToParent({
                  type: 'STORAGE_SET',
                  storageType: 'localStorage',
                  key: key,
                  value: String(value)
                });
              };
            }
            if (prop === 'removeItem') {
              return function(key) {
                target.removeItem(key);
                window.__postToParent({
                  type: 'STORAGE_REMOVE',
                  storageType: 'localStorage',
                  key: key
                });
              };
            }
            if (prop === 'clear') {
              return function() {
                target.clear();
                window.__postToParent({
                  type: 'STORAGE_CLEAR',
                  storageType: 'localStorage'
                });
              };
            }
            var value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
          }
        });

        // Note: Can't replace window.localStorage directly in some browsers
        // The in-memory shim will be used as fallback

      } catch (e) {
        // Storage blocked - install persistent shim
        var persistentLocalStorage = createPersistentStorage('localStorage');
        var persistentSessionStorage = createPersistentStorage('sessionStorage');

        Object.defineProperty(window, 'localStorage', {
          value: persistentLocalStorage,
          writable: false,
          configurable: false
        });

        Object.defineProperty(window, 'sessionStorage', {
          value: persistentSessionStorage,
          writable: false,
          configurable: false
        });
      }

      // Expose storage sync API for manual operations
      window.__SANDBOX_STORAGE__ = {
        // Request full sync from parent
        requestSync: function() {
          window.__postToParent({ type: 'STORAGE_GET_ALL', storageType: 'localStorage' });
          window.__postToParent({ type: 'STORAGE_GET_ALL', storageType: 'sessionStorage' });
        },

        // Export all storage data
        exportData: function() {
          var local = {};
          var session = {};

          try {
            for (var i = 0; i < localStorage.length; i++) {
              var key = localStorage.key(i);
              if (key) local[key] = localStorage.getItem(key);
            }
          } catch (e) { /* Storage may be unavailable in sandboxed iframes */ }

          try {
            for (var j = 0; j < sessionStorage.length; j++) {
              var skey = sessionStorage.key(j);
              if (skey) session[skey] = sessionStorage.getItem(skey);
            }
          } catch (e) { /* Storage may be unavailable in sandboxed iframes */ }

          return { localStorage: local, sessionStorage: session };
        }
      };

    })();
  `;
}
