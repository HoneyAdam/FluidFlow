/**
 * Console Enhancements Script
 *
 * Provides enhanced console output with object inspection,
 * grouping, timing, and better formatting for the sandbox.
 */

/**
 * Generate the console enhancements script for the sandbox
 */
export function getConsoleEnhancementsScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // ENHANCED CONSOLE SYSTEM
    // Better formatting, object inspection, timing, and grouping
    // ═══════════════════════════════════════════════════════════

    (function() {
      // Store original console methods (before they get overwritten)
      var originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug,
        group: console.group,
        groupCollapsed: console.groupCollapsed,
        groupEnd: console.groupEnd,
        time: console.time,
        timeEnd: console.timeEnd,
        table: console.table,
        clear: console.clear,
        count: console.count,
        countReset: console.countReset,
        assert: console.assert,
        trace: console.trace,
        dir: console.dir
      };

      // Timing storage
      var timers = {};
      // Count storage
      var counts = {};
      // Group depth
      var groupDepth = 0;

      // Safe serialization of values for display
      function serialize(value, depth) {
        if (depth === undefined) depth = 0;
        if (depth > 3) return '[...]';

        if (value === null) return 'null';
        if (value === undefined) return 'undefined';

        var type = typeof value;

        if (type === 'string') {
          // Truncate long strings
          if (value.length > 500) {
            return '"' + value.substring(0, 500) + '..." (' + value.length + ' chars)';
          }
          return '"' + value + '"';
        }

        if (type === 'number' || type === 'boolean') {
          return String(value);
        }

        if (type === 'function') {
          var fnName = value.name || 'anonymous';
          return '[Function: ' + fnName + ']';
        }

        if (type === 'symbol') {
          return value.toString();
        }

        if (value instanceof Error) {
          return value.name + ': ' + value.message;
        }

        if (value instanceof Date) {
          return value.toISOString();
        }

        if (value instanceof RegExp) {
          return value.toString();
        }

        if (Array.isArray(value)) {
          if (value.length === 0) return '[]';
          if (value.length > 100) {
            return '[Array(' + value.length + ')]';
          }
          if (depth >= 2) {
            return '[Array(' + value.length + ')]';
          }
          var items = value.slice(0, 10).map(function(item) {
            return serialize(item, depth + 1);
          });
          if (value.length > 10) {
            items.push('...(' + (value.length - 10) + ' more)');
          }
          return '[' + items.join(', ') + ']';
        }

        if (type === 'object') {
          // Handle DOM elements
          if (value instanceof Element) {
            var tag = value.tagName.toLowerCase();
            var id = value.id ? '#' + value.id : '';
            var cls = value.className && typeof value.className === 'string'
              ? '.' + value.className.split(' ').join('.')
              : '';
            return '<' + tag + id + cls + '>';
          }

          // Handle other objects
          var keys = Object.keys(value);
          if (keys.length === 0) return '{}';
          if (keys.length > 20) {
            return '{Object with ' + keys.length + ' keys}';
          }
          if (depth >= 2) {
            return '{...}';
          }
          var pairs = keys.slice(0, 10).map(function(key) {
            return key + ': ' + serialize(value[key], depth + 1);
          });
          if (keys.length > 10) {
            pairs.push('...(' + (keys.length - 10) + ' more)');
          }
          return '{' + pairs.join(', ') + '}';
        }

        return String(value);
      }

      // Format arguments for display
      function formatArgs(args) {
        return Array.prototype.map.call(args, function(arg) {
          if (typeof arg === 'string') return arg;
          return serialize(arg, 0);
        }).join(' ');
      }

      // Send to parent with enhanced formatting
      function notify(type, message, extra) {
        var indent = '  '.repeat(groupDepth);
        window.__postToParent({
          type: 'CONSOLE_LOG',
          logType: type,
          message: indent + message,
          timestamp: Date.now(),
          extra: extra || null
        });
      }

      // Enhanced console.log
      console.log = function() {
        var msg = formatArgs(arguments);
        notify('log', msg);
        originalConsole.log.apply(console, arguments);
      };

      // Enhanced console.warn
      console.warn = function() {
        var msg = formatArgs(arguments);
        notify('warn', msg);
        originalConsole.warn.apply(console, arguments);
      };

      // Enhanced console.error (with stack traces for Error objects)
      console.error = function() {
        var args = Array.prototype.slice.call(arguments);
        var msg = formatArgs(args);

        // Check if first arg is an Error
        if (args[0] instanceof Error) {
          var err = args[0];
          msg = err.name + ': ' + err.message;
          if (err.stack) {
            msg += '\\n' + err.stack.split('\\n').slice(1, 4).join('\\n');
          }
        }

        notify('error', msg);
        originalConsole.error.apply(console, arguments);
      };

      // Enhanced console.info
      console.info = function() {
        var msg = formatArgs(arguments);
        notify('info', msg);
        originalConsole.info.apply(console, arguments);
      };

      // Enhanced console.debug
      console.debug = function() {
        var msg = formatArgs(arguments);
        notify('debug', msg);
        if (originalConsole.debug) {
          originalConsole.debug.apply(console, arguments);
        }
      };

      // Console grouping
      console.group = function(label) {
        notify('log', '▼ ' + (label || 'Group'));
        groupDepth++;
        if (originalConsole.group) {
          originalConsole.group.apply(console, arguments);
        }
      };

      console.groupCollapsed = function(label) {
        notify('log', '▶ ' + (label || 'Group'));
        groupDepth++;
        if (originalConsole.groupCollapsed) {
          originalConsole.groupCollapsed.apply(console, arguments);
        }
      };

      console.groupEnd = function() {
        if (groupDepth > 0) groupDepth--;
        if (originalConsole.groupEnd) {
          originalConsole.groupEnd.apply(console, arguments);
        }
      };

      // Console timing
      console.time = function(label) {
        label = label || 'default';
        timers[label] = performance.now();
        if (originalConsole.time) {
          originalConsole.time.apply(console, arguments);
        }
      };

      console.timeEnd = function(label) {
        label = label || 'default';
        if (timers[label] !== undefined) {
          var duration = performance.now() - timers[label];
          notify('log', label + ': ' + duration.toFixed(2) + 'ms');
          delete timers[label];
        }
        if (originalConsole.timeEnd) {
          originalConsole.timeEnd.apply(console, arguments);
        }
      };

      console.timeLog = function(label) {
        label = label || 'default';
        if (timers[label] !== undefined) {
          var duration = performance.now() - timers[label];
          var args = Array.prototype.slice.call(arguments, 1);
          var extra = args.length > 0 ? ' ' + formatArgs(args) : '';
          notify('log', label + ': ' + duration.toFixed(2) + 'ms' + extra);
        }
      };

      // Console counting
      console.count = function(label) {
        label = label || 'default';
        counts[label] = (counts[label] || 0) + 1;
        notify('log', label + ': ' + counts[label]);
        if (originalConsole.count) {
          originalConsole.count.apply(console, arguments);
        }
      };

      console.countReset = function(label) {
        label = label || 'default';
        counts[label] = 0;
        if (originalConsole.countReset) {
          originalConsole.countReset.apply(console, arguments);
        }
      };

      // Console assert
      console.assert = function(condition) {
        if (!condition) {
          var args = Array.prototype.slice.call(arguments, 1);
          var msg = 'Assertion failed: ' + (args.length > 0 ? formatArgs(args) : '');
          notify('error', msg);
        }
        if (originalConsole.assert) {
          originalConsole.assert.apply(console, arguments);
        }
      };

      // Console table (simplified)
      console.table = function(data) {
        if (Array.isArray(data) && data.length > 0) {
          notify('log', '[Table: ' + data.length + ' rows]');
          // Send first few rows as preview
          var preview = data.slice(0, 5).map(function(row, i) {
            return '  [' + i + '] ' + serialize(row, 1);
          }).join('\\n');
          if (data.length > 5) {
            preview += '\\n  ... (' + (data.length - 5) + ' more rows)';
          }
          notify('log', preview);
        } else if (typeof data === 'object' && data !== null) {
          notify('log', '[Table]');
          notify('log', serialize(data, 1));
        }
        if (originalConsole.table) {
          originalConsole.table.apply(console, arguments);
        }
      };

      // Console dir (object inspection)
      console.dir = function(obj) {
        notify('log', serialize(obj, 0));
        if (originalConsole.dir) {
          originalConsole.dir.apply(console, arguments);
        }
      };

      // Console trace (simplified stack trace)
      console.trace = function(label) {
        var stack;
        try {
          throw new Error();
        } catch (e) {
          stack = e.stack || '';
        }
        var lines = stack.split('\\n').slice(2, 7);
        notify('log', 'Trace: ' + (label || ''));
        lines.forEach(function(line) {
          notify('log', '  ' + line.trim());
        });
        if (originalConsole.trace) {
          originalConsole.trace.apply(console, arguments);
        }
      };

      // Console clear
      console.clear = function() {
        notify('clear', '[Console cleared]');
        if (originalConsole.clear) {
          originalConsole.clear.apply(console, arguments);
        }
      };

      // Expose original console for debugging
      window.__ORIGINAL_CONSOLE__ = originalConsole;
    })();
  `;
}
