/**
 * Error Recovery Script
 *
 * Provides graceful error recovery and crash detection for the sandbox.
 * Helps prevent white screens and provides better error feedback.
 */

/**
 * Generate the error recovery script for the sandbox
 */
export function getErrorRecoveryScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // ERROR RECOVERY SYSTEM
    // Graceful error handling and crash detection
    // ═══════════════════════════════════════════════════════════

    (function() {
      var errorCount = 0;
      var lastErrorTime = 0;
      var maxErrorsPerSecond = 10;
      var isInErrorLoop = false;

      // Track render attempts
      var renderAttempts = 0;
      var maxRenderAttempts = 3;

      // Detect error loops (many errors in quick succession)
      function checkErrorLoop() {
        var now = Date.now();
        if (now - lastErrorTime < 1000) {
          errorCount++;
          if (errorCount > maxErrorsPerSecond && !isInErrorLoop) {
            isInErrorLoop = true;
            console.error('[Recovery] Error loop detected! Stopping further execution.');
            showRecoveryUI('Error loop detected. The application may have a critical issue.');
            return true;
          }
        } else {
          errorCount = 1;
        }
        lastErrorTime = now;
        return false;
      }

      // Show recovery UI when app crashes
      function showRecoveryUI(message) {
        var root = document.getElementById('root');
        if (!root) return;

        // Clear the root safely
        while (root.firstChild) {
          root.removeChild(root.firstChild);
        }

        // Create recovery container
        var container = document.createElement('div');
        container.style.cssText = 'min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; font-family: system-ui, -apple-system, sans-serif; background: linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%); color: #fff;';

        // Error icon
        var icon = document.createElement('div');
        icon.style.cssText = 'font-size: 48px; margin-bottom: 16px;';
        icon.textContent = '⚠️';
        container.appendChild(icon);

        // Title
        var title = document.createElement('h2');
        title.style.cssText = 'margin: 0 0 12px 0; font-size: 20px; font-weight: 600; color: #f38ba8;';
        title.textContent = 'Application Error';
        container.appendChild(title);

        // Message
        var msg = document.createElement('p');
        msg.style.cssText = 'margin: 0 0 24px 0; font-size: 14px; color: #a6adc8; text-align: center; max-width: 400px;';
        msg.textContent = message || 'An error occurred while rendering the application.';
        container.appendChild(msg);

        // Retry button
        var retryBtn = document.createElement('button');
        retryBtn.style.cssText = 'padding: 10px 24px; background: #89b4fa; color: #1e1e2e; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s;';
        retryBtn.textContent = 'Retry';
        retryBtn.onmouseover = function() { retryBtn.style.background = '#b4befe'; };
        retryBtn.onmouseout = function() { retryBtn.style.background = '#89b4fa'; };
        retryBtn.onclick = function() {
          // Request parent to refresh the preview
          window.__postToParent({ type: 'REQUEST_REFRESH' });
        };
        container.appendChild(retryBtn);

        // Details section
        var details = document.createElement('details');
        details.style.cssText = 'margin-top: 24px; max-width: 500px; width: 100%;';

        var summary = document.createElement('summary');
        summary.style.cssText = 'cursor: pointer; color: #89b4fa; font-size: 13px;';
        summary.textContent = 'Technical Details';
        details.appendChild(summary);

        var errorLog = document.createElement('pre');
        errorLog.style.cssText = 'margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 12px; color: #cdd6f4; overflow: auto; max-height: 200px; white-space: pre-wrap;';
        errorLog.textContent = window.__SANDBOX_ERROR_LOG__ ? window.__SANDBOX_ERROR_LOG__.join('\\n') : 'No error details available';
        details.appendChild(errorLog);

        container.appendChild(details);
        root.appendChild(container);
      }

      // Store error log
      window.__SANDBOX_ERROR_LOG__ = [];

      // Enhanced error handler
      var originalOnError = window.onerror;
      window.onerror = function(message, source, lineno, colno, error) {
        // Add to error log
        var logEntry = message + ' at ' + source + ':' + lineno + ':' + colno;
        window.__SANDBOX_ERROR_LOG__.push(logEntry);

        // Check for error loop
        if (checkErrorLoop()) {
          return true; // Prevent further handling
        }

        // Call original handler if exists
        if (originalOnError) {
          return originalOnError.apply(this, arguments);
        }
        return false;
      };

      // Enhanced promise rejection handler
      var originalUnhandledRejection = window.onunhandledrejection;
      window.onunhandledrejection = function(event) {
        var message = event.reason?.message || String(event.reason);
        window.__SANDBOX_ERROR_LOG__.push('Promise rejection: ' + message);

        if (checkErrorLoop()) {
          event.preventDefault();
          return;
        }

        if (originalUnhandledRejection) {
          originalUnhandledRejection.call(this, event);
        }
      };

      // Watch for render completion
      function watchRenderCompletion() {
        var checkInterval = setInterval(function() {
          var root = document.getElementById('root');
          var scrollContainer = document.getElementById('__app_scroll_container__');

          // Check if app has rendered content
          if (scrollContainer && scrollContainer.children.length > 0) {
            clearInterval(checkInterval);
            window.__postToParent({ type: 'RENDER_COMPLETE' });
            return;
          }

          // Check if still showing loading spinner after timeout
          renderAttempts++;
          if (renderAttempts > 50) { // 5 seconds (50 * 100ms)
            clearInterval(checkInterval);
            var loadingDiv = root?.querySelector('.sandbox-loading');
            if (loadingDiv) {
              console.warn('[Recovery] Render timeout - still showing loading state');
              window.__postToParent({
                type: 'CONSOLE_LOG',
                logType: 'warn',
                message: 'Application took too long to render. Check for errors in the code.',
                timestamp: Date.now()
              });
            }
          }
        }, 100);
      }

      // Start watching after a short delay
      setTimeout(watchRenderCompletion, 500);

      // Expose recovery API
      window.__SANDBOX_RECOVERY__ = {
        showError: showRecoveryUI,
        getErrorLog: function() { return window.__SANDBOX_ERROR_LOG__; },
        clearErrorLog: function() { window.__SANDBOX_ERROR_LOG__ = []; },
        isInErrorLoop: function() { return isInErrorLoop; },
        reset: function() {
          errorCount = 0;
          isInErrorLoop = false;
          renderAttempts = 0;
          window.__SANDBOX_ERROR_LOG__ = [];
        }
      };

    })();
  `;
}
