/**
 * Clipboard API Mock Script
 *
 * Provides clipboard functionality in sandboxed iframes where
 * the native Clipboard API is blocked due to security restrictions.
 */

/**
 * Generate the clipboard mock script for the sandbox
 */
export function getClipboardMockScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // CLIPBOARD API MOCK
    // Provides clipboard functionality in sandboxed iframes
    // ═══════════════════════════════════════════════════════════

    (function() {
      // In-memory clipboard storage
      var clipboardData = {
        text: '',
        html: '',
        lastModified: 0
      };

      // Track if we have real clipboard access
      var hasNativeAccess = false;

      // Check for native clipboard access
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          // Try a test write to see if it's actually available
          navigator.clipboard.writeText('').then(function() {
            hasNativeAccess = true;
          }).catch(function() {
            hasNativeAccess = false;
          });
        }
      } catch (e) {
        hasNativeAccess = false;
      }

      // Create mock clipboard API
      var mockClipboard = {
        writeText: function(text) {
          return new Promise(function(resolve, reject) {
            try {
              clipboardData.text = String(text);
              clipboardData.lastModified = Date.now();

              // Notify parent window
              window.__postToParent({
                type: 'CLIPBOARD_WRITE',
                text: clipboardData.text,
                timestamp: Date.now()
              });

              resolve();
            } catch (e) {
              reject(new DOMException('Failed to write to clipboard', 'NotAllowedError'));
            }
          });
        },

        readText: function() {
          return new Promise(function(resolve, reject) {
            // First try to get from parent
            var timeout = setTimeout(function() {
              // Return local clipboard if parent doesn't respond
              resolve(clipboardData.text);
            }, 100);

            // Request clipboard from parent
            var handler = function(event) {
              if (event.data && event.data.type === 'CLIPBOARD_CONTENT') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                clipboardData.text = event.data.text || '';
                resolve(clipboardData.text);
              }
            };

            window.addEventListener('message', handler);
            window.__postToParent({ type: 'CLIPBOARD_READ_REQUEST' });
          });
        },

        write: function(data) {
          return new Promise(function(resolve, reject) {
            try {
              // Handle ClipboardItem array
              if (Array.isArray(data) && data.length > 0) {
                var item = data[0];
                if (item && typeof item.getType === 'function') {
                  // Try to get text/plain
                  item.getType('text/plain').then(function(blob) {
                    return blob.text();
                  }).then(function(text) {
                    clipboardData.text = text;
                    clipboardData.lastModified = Date.now();
                    resolve();
                  }).catch(function() {
                    // Try text/html
                    item.getType('text/html').then(function(blob) {
                      return blob.text();
                    }).then(function(html) {
                      clipboardData.html = html;
                      clipboardData.lastModified = Date.now();
                      resolve();
                    }).catch(reject);
                  });
                } else {
                  resolve();
                }
              } else {
                resolve();
              }
            } catch (e) {
              reject(new DOMException('Failed to write to clipboard', 'NotAllowedError'));
            }
          });
        },

        read: function() {
          return new Promise(function(resolve, reject) {
            try {
              // Create ClipboardItem-like objects
              var items = [];

              if (clipboardData.text) {
                items.push({
                  types: ['text/plain'],
                  getType: function(type) {
                    if (type === 'text/plain') {
                      return Promise.resolve(new Blob([clipboardData.text], { type: 'text/plain' }));
                    }
                    return Promise.reject(new Error('Type not found'));
                  }
                });
              }

              if (clipboardData.html) {
                items.push({
                  types: ['text/html'],
                  getType: function(type) {
                    if (type === 'text/html') {
                      return Promise.resolve(new Blob([clipboardData.html], { type: 'text/html' }));
                    }
                    return Promise.reject(new Error('Type not found'));
                  }
                });
              }

              resolve(items);
            } catch (e) {
              reject(new DOMException('Failed to read from clipboard', 'NotAllowedError'));
            }
          });
        }
      };

      // Override navigator.clipboard if not available or blocked
      if (!hasNativeAccess) {
        try {
          Object.defineProperty(navigator, 'clipboard', {
            value: mockClipboard,
            writable: false,
            configurable: true
          });
        } catch (e) {
          // Can't override, try to extend
          if (navigator.clipboard) {
            navigator.clipboard.writeText = mockClipboard.writeText;
            navigator.clipboard.readText = mockClipboard.readText;
            navigator.clipboard.write = mockClipboard.write;
            navigator.clipboard.read = mockClipboard.read;
          }
        }
      }

      // Override document.execCommand for copy/cut/paste
      var originalExecCommand = document.execCommand.bind(document);
      document.execCommand = function(command, showUI, value) {
        var lowerCommand = command.toLowerCase();

        if (lowerCommand === 'copy' || lowerCommand === 'cut') {
          // Get selected text
          var selection = window.getSelection();
          var selectedText = selection ? selection.toString() : '';

          if (selectedText) {
            clipboardData.text = selectedText;
            clipboardData.lastModified = Date.now();

            window.__postToParent({
              type: 'CLIPBOARD_WRITE',
              text: selectedText,
              timestamp: Date.now()
            });

            // For cut, try to delete the selection
            if (lowerCommand === 'cut') {
              try {
                return originalExecCommand('delete');
              } catch (e) {
                // Ignore
              }
            }

            return true;
          }
        }

        if (lowerCommand === 'paste') {
          // Try to paste from our clipboard
          if (clipboardData.text) {
            var activeElement = document.activeElement;
            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
              // Insert text at cursor
              if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
                var start = activeElement.selectionStart || 0;
                var end = activeElement.selectionEnd || 0;
                var value = activeElement.value;
                activeElement.value = value.substring(0, start) + clipboardData.text + value.substring(end);
                activeElement.selectionStart = activeElement.selectionEnd = start + clipboardData.text.length;

                // Dispatch input event
                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              } else if (activeElement.isContentEditable) {
                document.execCommand('insertText', false, clipboardData.text);
                return true;
              }
            }
          }
        }

        // Fall back to original for other commands
        try {
          return originalExecCommand(command, showUI, value);
        } catch (e) {
          return false;
        }
      };

      // Handle copy/cut/paste events
      document.addEventListener('copy', function(e) {
        var selection = window.getSelection();
        var selectedText = selection ? selection.toString() : '';
        if (selectedText) {
          clipboardData.text = selectedText;
          clipboardData.lastModified = Date.now();
          if (e.clipboardData) {
            e.clipboardData.setData('text/plain', selectedText);
          }
        }
      }, true);

      document.addEventListener('cut', function(e) {
        var selection = window.getSelection();
        var selectedText = selection ? selection.toString() : '';
        if (selectedText) {
          clipboardData.text = selectedText;
          clipboardData.lastModified = Date.now();
          if (e.clipboardData) {
            e.clipboardData.setData('text/plain', selectedText);
          }
        }
      }, true);

      document.addEventListener('paste', function(e) {
        // If we have clipboard data from our mock, use it
        if (clipboardData.text && e.clipboardData) {
          // Prevent default only if we're handling it
          var activeElement = document.activeElement;
          if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
            // Let the mock execCommand handle it
          }
        }
      }, true);

      // Listen for clipboard content from parent
      window.addEventListener('message', function(event) {
        if (event.data) {
          if (event.data.type === 'CLIPBOARD_CONTENT') {
            clipboardData.text = event.data.text || '';
            clipboardData.lastModified = Date.now();
          }
          if (event.data.type === 'CLIPBOARD_SYNC') {
            clipboardData.text = event.data.text || '';
            clipboardData.html = event.data.html || '';
            clipboardData.lastModified = Date.now();
          }
        }
      });

      // Expose clipboard API
      window.__SANDBOX_CLIPBOARD__ = {
        // Get current clipboard text
        getText: function() {
          return clipboardData.text;
        },

        // Set clipboard text
        setText: function(text) {
          clipboardData.text = String(text);
          clipboardData.lastModified = Date.now();
          window.__postToParent({
            type: 'CLIPBOARD_WRITE',
            text: clipboardData.text,
            timestamp: Date.now()
          });
        },

        // Get clipboard HTML
        getHtml: function() {
          return clipboardData.html;
        },

        // Set clipboard HTML
        setHtml: function(html) {
          clipboardData.html = String(html);
          clipboardData.lastModified = Date.now();
        },

        // Check if has content
        hasContent: function() {
          return clipboardData.text.length > 0 || clipboardData.html.length > 0;
        },

        // Get last modified time
        getLastModified: function() {
          return clipboardData.lastModified;
        },

        // Clear clipboard
        clear: function() {
          clipboardData.text = '';
          clipboardData.html = '';
          clipboardData.lastModified = Date.now();
        },

        // Check native access
        hasNativeAccess: function() {
          return hasNativeAccess;
        }
      };

    })();
  `;
}
