/**
 * Media Query Hooks Script
 *
 * Provides responsive design utilities including useMediaQuery hook,
 * breakpoint detection, and device type detection.
 */

/**
 * Generate the media query hooks script for the sandbox
 */
export function getMediaQueryHooksScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // MEDIA QUERY HOOKS
    // Responsive design utilities and breakpoint detection
    // ═══════════════════════════════════════════════════════════

    (function() {
      // Common breakpoints (Tailwind CSS defaults)
      var breakpoints = {
        sm: 640,
        md: 768,
        lg: 1024,
        xl: 1280,
        '2xl': 1536
      };

      // Track active media queries
      var mediaQueryListeners = new Map();
      var listenerIdCounter = 0;

      // Current viewport state
      var viewportState = {
        width: window.innerWidth,
        height: window.innerHeight,
        orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
        breakpoint: 'xs',
        isMobile: false,
        isTablet: false,
        isDesktop: false
      };

      // Update viewport state
      function updateViewportState() {
        viewportState.width = window.innerWidth;
        viewportState.height = window.innerHeight;
        viewportState.orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';

        // Determine current breakpoint
        if (viewportState.width >= breakpoints['2xl']) {
          viewportState.breakpoint = '2xl';
        } else if (viewportState.width >= breakpoints.xl) {
          viewportState.breakpoint = 'xl';
        } else if (viewportState.width >= breakpoints.lg) {
          viewportState.breakpoint = 'lg';
        } else if (viewportState.width >= breakpoints.md) {
          viewportState.breakpoint = 'md';
        } else if (viewportState.width >= breakpoints.sm) {
          viewportState.breakpoint = 'sm';
        } else {
          viewportState.breakpoint = 'xs';
        }

        // Device type detection
        viewportState.isMobile = viewportState.width < breakpoints.md;
        viewportState.isTablet = viewportState.width >= breakpoints.md && viewportState.width < breakpoints.lg;
        viewportState.isDesktop = viewportState.width >= breakpoints.lg;

        // Notify parent window
        window.__postToParent({
          type: 'VIEWPORT_CHANGE',
          viewport: viewportState,
          timestamp: Date.now()
        });
      }

      // Initialize viewport state
      updateViewportState();

      // Listen for resize events (debounced)
      var resizeTimeout = null;
      window.addEventListener('resize', function() {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updateViewportState, 100);
      });

      // Create a media query matcher
      function matchMedia(query) {
        var mql = window.matchMedia(query);

        return {
          matches: mql.matches,
          media: mql.media,
          addListener: function(callback) {
            var id = ++listenerIdCounter;
            var handler = function(e) {
              callback(e.matches);
            };

            mediaQueryListeners.set(id, { mql: mql, handler: handler });

            if (mql.addEventListener) {
              mql.addEventListener('change', handler);
            } else if (mql.addListener) {
              mql.addListener(handler);
            }

            return id;
          },
          removeListener: function(id) {
            var entry = mediaQueryListeners.get(id);
            if (entry) {
              if (entry.mql.removeEventListener) {
                entry.mql.removeEventListener('change', entry.handler);
              } else if (entry.mql.removeListener) {
                entry.mql.removeListener(entry.handler);
              }
              mediaQueryListeners.delete(id);
            }
          }
        };
      }

      // Check if matches a breakpoint
      function matchesBreakpoint(breakpoint, mode) {
        mode = mode || 'min';
        var value = breakpoints[breakpoint];
        if (!value) return false;

        if (mode === 'min') {
          return viewportState.width >= value;
        } else if (mode === 'max') {
          return viewportState.width < value;
        } else if (mode === 'only') {
          var breakpointOrder = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
          var index = breakpointOrder.indexOf(breakpoint);
          var nextBreakpoint = breakpointOrder[index + 1];
          var nextValue = nextBreakpoint ? breakpoints[nextBreakpoint] : Infinity;
          return viewportState.width >= value && viewportState.width < nextValue;
        }
        return false;
      }

      // Common media query presets
      var presets = {
        // Orientation
        portrait: '(orientation: portrait)',
        landscape: '(orientation: landscape)',

        // Color scheme
        dark: '(prefers-color-scheme: dark)',
        light: '(prefers-color-scheme: light)',

        // Motion
        reducedMotion: '(prefers-reduced-motion: reduce)',
        noReducedMotion: '(prefers-reduced-motion: no-preference)',

        // Contrast
        highContrast: '(prefers-contrast: high)',
        lowContrast: '(prefers-contrast: low)',

        // Pointer
        touch: '(pointer: coarse)',
        mouse: '(pointer: fine)',
        noPointer: '(pointer: none)',

        // Hover
        canHover: '(hover: hover)',
        noHover: '(hover: none)',

        // Display
        print: 'print',
        screen: 'screen',

        // Breakpoints (min-width)
        sm: '(min-width: 640px)',
        md: '(min-width: 768px)',
        lg: '(min-width: 1024px)',
        xl: '(min-width: 1280px)',
        '2xl': '(min-width: 1536px)',

        // Breakpoints (max-width)
        'max-sm': '(max-width: 639px)',
        'max-md': '(max-width: 767px)',
        'max-lg': '(max-width: 1023px)',
        'max-xl': '(max-width: 1279px)',
        'max-2xl': '(max-width: 1535px)'
      };

      // Check a preset
      function matchesPreset(preset) {
        var query = presets[preset];
        if (!query) return false;
        return window.matchMedia(query).matches;
      }

      // Get all matching presets
      function getMatchingPresets() {
        var matching = [];
        for (var preset in presets) {
          if (matchesPreset(preset)) {
            matching.push(preset);
          }
        }
        return matching;
      }

      // Device detection based on user agent and features
      function getDeviceInfo() {
        var ua = navigator.userAgent.toLowerCase();

        return {
          // OS
          isIOS: /iphone|ipad|ipod/.test(ua),
          isAndroid: /android/.test(ua),
          isWindows: /windows/.test(ua),
          isMacOS: /macintosh/.test(ua) && !('ontouchend' in document),
          isLinux: /linux/.test(ua) && !/android/.test(ua),

          // Browser
          isChrome: /chrome/.test(ua) && !/edge|edg/.test(ua),
          isFirefox: /firefox/.test(ua),
          isSafari: /safari/.test(ua) && !/chrome/.test(ua),
          isEdge: /edge|edg/.test(ua),

          // Device type
          isMobile: viewportState.isMobile,
          isTablet: viewportState.isTablet,
          isDesktop: viewportState.isDesktop,

          // Features
          hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
          hasMouse: matchesPreset('mouse'),
          canHover: matchesPreset('canHover'),
          prefersReducedMotion: matchesPreset('reducedMotion'),
          prefersDark: matchesPreset('dark')
        };
      }

      // CSS custom properties for responsive design
      function injectCSSVariables() {
        var root = document.documentElement;
        root.style.setProperty('--viewport-width', viewportState.width + 'px');
        root.style.setProperty('--viewport-height', viewportState.height + 'px');
        root.style.setProperty('--breakpoint', viewportState.breakpoint);

        // Update on resize
        window.addEventListener('resize', function() {
          root.style.setProperty('--viewport-width', window.innerWidth + 'px');
          root.style.setProperty('--viewport-height', window.innerHeight + 'px');
        });
      }

      injectCSSVariables();

      // Expose API
      window.__SANDBOX_MEDIA__ = {
        // Get current viewport state
        getViewport: function() {
          return Object.assign({}, viewportState);
        },

        // Get breakpoints
        getBreakpoints: function() {
          return Object.assign({}, breakpoints);
        },

        // Set custom breakpoints
        setBreakpoints: function(custom) {
          Object.assign(breakpoints, custom);
          updateViewportState();
        },

        // Match a media query
        matchMedia: matchMedia,

        // Check breakpoint
        matchesBreakpoint: matchesBreakpoint,

        // Check preset
        matchesPreset: matchesPreset,

        // Get all matching presets
        getMatchingPresets: getMatchingPresets,

        // Get presets
        getPresets: function() {
          return Object.assign({}, presets);
        },

        // Get device info
        getDeviceInfo: getDeviceInfo,

        // Utility functions
        isMobile: function() { return viewportState.isMobile; },
        isTablet: function() { return viewportState.isTablet; },
        isDesktop: function() { return viewportState.isDesktop; },
        isPortrait: function() { return viewportState.orientation === 'portrait'; },
        isLandscape: function() { return viewportState.orientation === 'landscape'; },
        prefersDark: function() { return matchesPreset('dark'); },
        prefersReducedMotion: function() { return matchesPreset('reducedMotion'); },

        // Listen for breakpoint changes
        onBreakpointChange: function(callback) {
          var lastBreakpoint = viewportState.breakpoint;
          var handler = function() {
            updateViewportState();
            if (viewportState.breakpoint !== lastBreakpoint) {
              lastBreakpoint = viewportState.breakpoint;
              callback(viewportState.breakpoint, viewportState);
            }
          };
          window.addEventListener('resize', handler);
          return function() {
            window.removeEventListener('resize', handler);
          };
        },

        // Clean up all listeners
        cleanup: function() {
          mediaQueryListeners.forEach(function(entry, id) {
            if (entry.mql.removeEventListener) {
              entry.mql.removeEventListener('change', entry.handler);
            } else if (entry.mql.removeListener) {
              entry.mql.removeListener(entry.handler);
            }
          });
          mediaQueryListeners.clear();
        }
      };

      // Also expose as window.matchesBreakpoint for convenience
      window.matchesBreakpoint = matchesBreakpoint;

    })();
  `;
}
