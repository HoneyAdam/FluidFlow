/**
 * Screenshot Capture Script
 *
 * Captures the sandbox preview as an image using html2canvas.
 * Supports full page, viewport, and element screenshots.
 */

/**
 * Generate the screenshot capture script for the sandbox
 */
export function getScreenshotCaptureScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // SCREENSHOT CAPTURE
    // Capture sandbox preview as image using html2canvas
    // ═══════════════════════════════════════════════════════════

    (function() {
      // Load html2canvas dynamically
      var html2canvasLoaded = false;
      var html2canvasLoading = false;
      var loadCallbacks = [];

      function loadHtml2Canvas() {
        return new Promise(function(resolve, reject) {
          if (html2canvasLoaded && window.html2canvas) {
            resolve(window.html2canvas);
            return;
          }

          loadCallbacks.push({ resolve: resolve, reject: reject });

          if (html2canvasLoading) return;
          html2canvasLoading = true;

          var script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = function() {
            html2canvasLoaded = true;
            loadCallbacks.forEach(function(cb) { cb.resolve(window.html2canvas); });
            loadCallbacks = [];
          };
          script.onerror = function() {
            loadCallbacks.forEach(function(cb) { cb.reject(new Error('Failed to load html2canvas')); });
            loadCallbacks = [];
          };
          document.head.appendChild(script);
        });
      }

      // Preload html2canvas
      loadHtml2Canvas().catch(function() { /* Best-effort preload, retried on demand */ });

      // Capture options
      var defaultOptions = {
        format: 'png',
        quality: 0.92,
        scale: 1,
        backgroundColor: '#ffffff'
      };

      // Convert element to canvas using DOM-to-canvas approach
      function elementToCanvas(element, options) {
        return new Promise(function(resolve, reject) {
          try {
            var rect = element.getBoundingClientRect();
            var width = Math.ceil(rect.width * options.scale);
            var height = Math.ceil(rect.height * options.scale);

            // Create canvas
            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext('2d');

            if (!ctx) {
              reject(new Error('Could not get canvas context'));
              return;
            }

            // Fill background
            ctx.fillStyle = options.backgroundColor;
            ctx.fillRect(0, 0, width, height);

            // Use foreignObject to render HTML
            var data = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
              '<foreignObject width="100%" height="100%">' +
              '<div xmlns="http://www.w3.org/1999/xhtml">' +
              element.outerHTML +
              '</div>' +
              '</foreignObject>' +
              '</svg>';

            var img = new Image();
            img.onload = function() {
              ctx.drawImage(img, 0, 0);
              resolve(canvas);
            };
            img.onerror = function() {
              // Fallback: create a simple placeholder
              ctx.fillStyle = '#1e1e2e';
              ctx.fillRect(0, 0, width, height);
              ctx.fillStyle = '#cdd6f4';
              ctx.font = '14px system-ui';
              ctx.textAlign = 'center';
              ctx.fillText('Preview Screenshot', width / 2, height / 2);
              resolve(canvas);
            };

            var blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
            img.src = URL.createObjectURL(blob);
          } catch (e) {
            reject(e);
          }
        });
      }

      // Capture viewport screenshot
      function captureViewport(options) {
        options = Object.assign({}, defaultOptions, options);

        return new Promise(function(resolve, reject) {
          try {
            var scrollContainer = document.getElementById('__app_scroll_container__');
            var target = scrollContainer || document.getElementById('root') || document.body;

            // Get viewport dimensions
            var width = Math.ceil(window.innerWidth * options.scale);
            var height = Math.ceil(window.innerHeight * options.scale);

            // Create canvas
            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext('2d');

            if (!ctx) {
              reject(new Error('Could not get canvas context'));
              return;
            }

            // Fill background
            ctx.fillStyle = options.backgroundColor;
            ctx.fillRect(0, 0, width, height);

            // Clone the target for serialization
            var clone = target.cloneNode(true);

            // Inline all computed styles
            inlineStyles(target, clone);

            // Create SVG with foreignObject
            var svgData = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
              '<foreignObject width="100%" height="100%">' +
              new XMLSerializer().serializeToString(clone) +
              '</foreignObject>' +
              '</svg>';

            var img = new Image();
            img.onload = function() {
              ctx.drawImage(img, 0, 0, width, height);

              // Convert to data URL
              var dataUrl = canvas.toDataURL('image/' + options.format, options.quality);
              resolve({
                dataUrl: dataUrl,
                width: width,
                height: height,
                format: options.format
              });
            };

            img.onerror = function(e) {
              // Fallback: simple screenshot representation
              createFallbackScreenshot(ctx, width, height, options);
              var dataUrl = canvas.toDataURL('image/' + options.format, options.quality);
              resolve({
                dataUrl: dataUrl,
                width: width,
                height: height,
                format: options.format,
                fallback: true
              });
            };

            var blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            img.src = URL.createObjectURL(blob);

          } catch (e) {
            reject(e);
          }
        });
      }

      // Inline styles for accurate rendering
      function inlineStyles(source, target) {
        try {
          var sourceStyles = window.getComputedStyle(source);
          var importantStyles = [
            'background-color', 'background-image', 'color', 'font-family',
            'font-size', 'font-weight', 'border', 'border-radius', 'padding',
            'margin', 'display', 'flex-direction', 'justify-content',
            'align-items', 'gap', 'width', 'height', 'max-width', 'max-height',
            'position', 'top', 'left', 'right', 'bottom', 'transform',
            'opacity', 'box-shadow', 'text-align', 'line-height'
          ];

          importantStyles.forEach(function(prop) {
            target.style[prop] = sourceStyles.getPropertyValue(prop);
          });

          // Recursively inline for children
          var sourceChildren = source.children;
          var targetChildren = target.children;
          for (var i = 0; i < sourceChildren.length && i < targetChildren.length; i++) {
            inlineStyles(sourceChildren[i], targetChildren[i]);
          }
        } catch (e) {
          // Ignore inline style errors
        }
      }

      // Create fallback screenshot with app info
      function createFallbackScreenshot(ctx, width, height, options) {
        // Dark gradient background
        var gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#1e1e2e');
        gradient.addColorStop(1, '#2d2d44');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // App icon placeholder
        ctx.fillStyle = '#89b4fa';
        ctx.beginPath();
        ctx.arc(width / 2, height / 2 - 20, 30, 0, Math.PI * 2);
        ctx.fill();

        // FluidFlow text
        ctx.fillStyle = '#cdd6f4';
        ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FluidFlow Preview', width / 2, height / 2 + 30);

        // Timestamp
        ctx.fillStyle = '#6c7086';
        ctx.font = '12px system-ui';
        ctx.fillText(new Date().toLocaleString(), width / 2, height / 2 + 50);
      }

      // Capture using html2canvas (modern approach)
      function captureModern(options) {
        options = Object.assign({}, defaultOptions, options);

        return loadHtml2Canvas().then(function(html2canvas) {
          // Get the scroll container or root
          var container = document.getElementById('__app_scroll_container__') ||
                         document.getElementById('root') ||
                         document.body;

          return html2canvas(container, {
            scale: options.scale,
            backgroundColor: options.backgroundColor,
            logging: false,
            useCORS: true,
            allowTaint: true,
            foreignObjectRendering: true,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight
          }).then(function(canvas) {
            var dataUrl = canvas.toDataURL('image/' + options.format, options.quality);
            return {
              dataUrl: dataUrl,
              width: canvas.width,
              height: canvas.height,
              format: options.format
            };
          });
        });
      }

      // Main capture function
      function capture(options) {
        options = Object.assign({}, defaultOptions, options);

        // Try html2canvas first, fallback to SVG foreignObject, then fallback placeholder
        return captureModern(options).catch(function(err) {
          console.warn('[Screenshot] html2canvas failed:', err.message, '- trying SVG fallback');
          return captureViewport(options).catch(function(err2) {
            console.warn('[Screenshot] SVG fallback failed:', err2.message, '- using placeholder');
            // Last resort: create a simple fallback
            return new Promise(function(resolve) {
              var width = Math.ceil(window.innerWidth * options.scale);
              var height = Math.ceil(window.innerHeight * options.scale);
              var canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              var ctx = canvas.getContext('2d');
              if (ctx) {
                createFallbackScreenshot(ctx, width, height, options);
              }
              resolve({
                dataUrl: canvas.toDataURL('image/' + options.format, options.quality),
                width: width,
                height: height,
                format: options.format,
                fallback: true
              });
            });
          });
        });
      }

      // Capture and send to parent
      function captureAndSend(options) {
        return capture(options).then(function(result) {
          window.__postToParent({
            type: 'SCREENSHOT_CAPTURED',
            dataUrl: result.dataUrl,
            width: result.width,
            height: result.height,
            format: result.format,
            timestamp: Date.now()
          }, '*');
          return result;
        });
      }

      // Listen for screenshot requests from parent
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'CAPTURE_SCREENSHOT') {
          captureAndSend(event.data.options || {}).then(function(result) {
            console.log('[Screenshot] Captured:', result.width + 'x' + result.height);
          }).catch(function(e) {
            console.error('[Screenshot] Capture failed:', e.message);
            window.__postToParent({
              type: 'SCREENSHOT_ERROR',
              error: e.message,
              timestamp: Date.now()
            }, '*');
          });
        }
      });

      // Expose API
      window.__SANDBOX_SCREENSHOT__ = {
        // Capture screenshot
        capture: capture,

        // Capture and send to parent
        captureAndSend: captureAndSend,

        // Get as blob
        captureAsBlob: function(options) {
          return capture(options).then(function(result) {
            return fetch(result.dataUrl).then(function(res) {
              return res.blob();
            });
          });
        },

        // Download screenshot
        download: function(filename, options) {
          return capture(options).then(function(result) {
            var link = document.createElement('a');
            link.download = filename || 'screenshot.' + (options?.format || 'png');
            link.href = result.dataUrl;
            link.click();
            return result;
          });
        }
      };

    })();
  `;
}
