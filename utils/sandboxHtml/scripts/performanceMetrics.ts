/**
 * Performance Metrics Script
 *
 * Tracks FPS, render times, memory usage, and provides performance insights.
 * Helps identify performance bottlenecks in sandbox applications.
 */

/**
 * Generate the performance metrics script for the sandbox
 */
export function getPerformanceMetricsScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // PERFORMANCE METRICS SYSTEM
    // Tracks FPS, render times, memory usage
    // ═══════════════════════════════════════════════════════════

    (function() {
      // FPS tracking
      var frameCount = 0;
      var lastFpsTime = performance.now();
      var currentFps = 60;
      var fpsHistory = [];
      var maxFpsHistory = 60; // Keep last 60 samples

      // Render timing
      var renderTimes = [];
      var maxRenderHistory = 100;
      var lastRenderStart = 0;

      // Memory tracking (if available)
      var memoryHistory = [];
      var maxMemoryHistory = 30;

      // Performance marks
      var marks = {};
      var measures = [];

      // FPS calculation using requestAnimationFrame
      function calculateFps() {
        frameCount++;
        var now = performance.now();
        var elapsed = now - lastFpsTime;

        if (elapsed >= 1000) {
          currentFps = Math.round((frameCount * 1000) / elapsed);
          fpsHistory.push(currentFps);
          if (fpsHistory.length > maxFpsHistory) {
            fpsHistory.shift();
          }
          frameCount = 0;
          lastFpsTime = now;

          // Track memory if available
          if (performance.memory) {
            memoryHistory.push({
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
              limit: performance.memory.jsHeapSizeLimit,
              timestamp: Date.now()
            });
            if (memoryHistory.length > maxMemoryHistory) {
              memoryHistory.shift();
            }
          }
        }

        requestAnimationFrame(calculateFps);
      }

      // Start FPS tracking
      requestAnimationFrame(calculateFps);

      // Enhanced performance.mark with tracking
      var originalMark = performance.mark.bind(performance);
      performance.mark = function(name, options) {
        marks[name] = performance.now();
        try {
          return originalMark(name, options);
        } catch (e) {
          // Fallback for older browsers
          return undefined;
        }
      };

      // Enhanced performance.measure with tracking
      var originalMeasure = performance.measure.bind(performance);
      performance.measure = function(name, startMark, endMark) {
        try {
          var result = originalMeasure(name, startMark, endMark);
          measures.push({
            name: name,
            duration: result ? result.duration : (performance.now() - (marks[startMark] || 0)),
            timestamp: Date.now()
          });
          if (measures.length > 100) {
            measures.shift();
          }
          return result;
        } catch (e) {
          // Manual calculation fallback
          var start = marks[startMark] || 0;
          var end = endMark ? (marks[endMark] || performance.now()) : performance.now();
          var duration = end - start;
          measures.push({ name: name, duration: duration, timestamp: Date.now() });
          return { name: name, duration: duration };
        }
      };

      // Track React render times (if React DevTools hook is available)
      function trackReactRenders() {
        if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
          var hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
          var originalOnCommitFiberRoot = hook.onCommitFiberRoot;

          if (originalOnCommitFiberRoot) {
            hook.onCommitFiberRoot = function(rendererID, root, priorityLevel) {
              var renderEnd = performance.now();
              var renderDuration = renderEnd - lastRenderStart;

              if (lastRenderStart > 0 && renderDuration > 0 && renderDuration < 10000) {
                renderTimes.push({
                  duration: renderDuration,
                  timestamp: Date.now()
                });
                if (renderTimes.length > maxRenderHistory) {
                  renderTimes.shift();
                }

                // Warn about slow renders
                if (renderDuration > 16.67) { // More than one frame (60fps)
                  console.warn('[Perf] Slow render detected: ' + renderDuration.toFixed(2) + 'ms');
                }
              }

              lastRenderStart = performance.now();
              return originalOnCommitFiberRoot.apply(this, arguments);
            };
          }
        }
      }

      // Try to track React renders after a delay (React might not be loaded yet)
      setTimeout(trackReactRenders, 1000);

      // Long task observer (tasks > 50ms)
      if (typeof PerformanceObserver !== 'undefined') {
        try {
          var longTaskObserver = new PerformanceObserver(function(list) {
            list.getEntries().forEach(function(entry) {
              if (entry.duration > 50) {
                console.warn('[Perf] Long task detected: ' + entry.duration.toFixed(2) + 'ms');
                window.__postToParent({
                  type: 'PERFORMANCE_LONG_TASK',
                  duration: entry.duration,
                  timestamp: Date.now()
                }, '*');
              }
            });
          });
          longTaskObserver.observe({ entryTypes: ['longtask'] });
        } catch (e) {
          // Long task observer not supported
        }
      }

      // Layout shift observer
      if (typeof PerformanceObserver !== 'undefined') {
        try {
          var clsObserver = new PerformanceObserver(function(list) {
            var clsValue = 0;
            list.getEntries().forEach(function(entry) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            });
            if (clsValue > 0.1) {
              console.warn('[Perf] Cumulative Layout Shift: ' + clsValue.toFixed(3));
            }
          });
          clsObserver.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {
          // Layout shift observer not supported
        }
      }

      // Expose performance API
      window.__SANDBOX_PERF__ = {
        // Get current FPS
        getFps: function() {
          return currentFps;
        },

        // Get FPS history
        getFpsHistory: function() {
          return fpsHistory.slice();
        },

        // Get average FPS
        getAverageFps: function() {
          if (fpsHistory.length === 0) return 60;
          var sum = fpsHistory.reduce(function(a, b) { return a + b; }, 0);
          return Math.round(sum / fpsHistory.length);
        },

        // Get render times
        getRenderTimes: function() {
          return renderTimes.slice();
        },

        // Get average render time
        getAverageRenderTime: function() {
          if (renderTimes.length === 0) return 0;
          var sum = renderTimes.reduce(function(a, b) { return a + b.duration; }, 0);
          return sum / renderTimes.length;
        },

        // Get memory usage (if available)
        getMemory: function() {
          if (performance.memory) {
            return {
              used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
              total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
              limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
              unit: 'MB'
            };
          }
          return null;
        },

        // Get memory history
        getMemoryHistory: function() {
          return memoryHistory.map(function(m) {
            return {
              used: Math.round(m.used / 1024 / 1024),
              total: Math.round(m.total / 1024 / 1024),
              timestamp: m.timestamp
            };
          });
        },

        // Get performance measures
        getMeasures: function() {
          return measures.slice();
        },

        // Get performance summary
        getSummary: function() {
          var avgFps = this.getAverageFps();
          var avgRender = this.getAverageRenderTime();
          var memory = this.getMemory();

          return {
            fps: {
              current: currentFps,
              average: avgFps,
              min: fpsHistory.length > 0 ? Math.min.apply(null, fpsHistory) : 60,
              max: fpsHistory.length > 0 ? Math.max.apply(null, fpsHistory) : 60
            },
            render: {
              average: avgRender.toFixed(2) + 'ms',
              count: renderTimes.length
            },
            memory: memory,
            status: avgFps >= 55 ? 'good' : (avgFps >= 30 ? 'moderate' : 'poor')
          };
        },

        // Start a performance mark
        mark: function(name) {
          performance.mark('sandbox_' + name);
        },

        // Measure between two marks
        measure: function(name, startMark, endMark) {
          return performance.measure(
            'sandbox_' + name,
            'sandbox_' + startMark,
            endMark ? 'sandbox_' + endMark : undefined
          );
        },

        // Clear all metrics
        reset: function() {
          frameCount = 0;
          fpsHistory = [];
          renderTimes = [];
          memoryHistory = [];
          measures = [];
          marks = {};
        }
      };

      // Send periodic performance updates to parent
      setInterval(function() {
        window.__postToParent({
          type: 'PERFORMANCE_UPDATE',
          fps: currentFps,
          memory: window.__SANDBOX_PERF__.getMemory(),
          timestamp: Date.now()
        }, '*');
      }, 2000);

    })();
  `;
}
