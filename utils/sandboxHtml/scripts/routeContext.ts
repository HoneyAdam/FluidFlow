/**
 * Route Context Script
 *
 * Provides enhanced routing support for the sandbox:
 * - Path pattern matching with parameter extraction
 * - Nested route matching
 * - Outlet context for nested rendering
 * - useParams support with actual values
 */

/**
 * Route configuration interface
 */
export interface RouteConfig {
  path: string;
  element?: string; // Component name
  children?: RouteConfig[];
  index?: boolean;
}

/**
 * Route match result
 */
export interface RouteMatch {
  route: RouteConfig;
  params: Record<string, string>;
  pathname: string;
  pathnameBase: string;
}

/**
 * Generate the route context script
 */
export function getRouteContextScript(): string {
  return `
    // Route Context for Enhanced Routing Support
    window.__SANDBOX_ROUTE_CONTEXT__ = {
      // Current route configuration (extracted from JSX)
      routes: [],

      // Current matched routes (parent to child order)
      matches: [],

      // Current path parameters
      params: {},

      // Current outlet index for nested rendering
      outletIndex: 0,

      // Subscribers for route changes
      subscribers: [],

      /**
       * Convert path pattern to regex and extract param names
       * /users/:id → { regex: /^\\/users\\/([^\\/]+)$/, paramNames: ['id'] }
       */
      pathToRegex: function(path) {
        if (!path || path === '*') {
          return { regex: /^.*$/, paramNames: [], isWildcard: true };
        }

        var paramNames = [];
        var regexString = '^';
        var parts = path.split('/').filter(Boolean);

        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          regexString += '\\\\/';

          if (part.startsWith(':')) {
            // Dynamic parameter
            var paramName = part.substring(1);
            // Handle optional params (e.g., :id?)
            if (paramName.endsWith('?')) {
              paramName = paramName.slice(0, -1);
              paramNames.push(paramName);
              regexString += '([^\\\\/]*)';
            } else {
              paramNames.push(paramName);
              regexString += '([^\\\\/]+)';
            }
          } else if (part === '*') {
            // Wildcard - match everything
            paramNames.push('*');
            regexString += '(.*)';
          } else {
            // Static part - escape special regex characters
            // Using split/join approach to avoid complex regex escaping
            var escaped = part;
            var specials = ['\\\\', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']'];
            for (var s = 0; s < specials.length; s++) {
              escaped = escaped.split(specials[s]).join('\\\\' + specials[s]);
            }
            regexString += escaped;
          }
        }

        // Handle root path
        if (path === '/' || parts.length === 0) {
          regexString = '^\\\\/';
        }

        return {
          regex: new RegExp(regexString + '(?:\\\\/)?$'),
          paramNames: paramNames,
          isWildcard: false
        };
      },

      /**
       * Match a single route against pathname
       * Returns match result or null
       */
      matchPath: function(pattern, pathname) {
        var parsed = this.pathToRegex(pattern);
        var match = pathname.match(parsed.regex);

        if (!match) return null;

        var params = {};
        for (var i = 0; i < parsed.paramNames.length; i++) {
          var paramName = parsed.paramNames[i];
          var value = match[i + 1];
          if (value !== undefined) {
            params[paramName] = decodeURIComponent(value);
          }
        }

        // Calculate pathname base (path without trailing wildcard match)
        var pathnameBase = pathname;
        if (parsed.isWildcard || pattern.endsWith('*')) {
          var basePattern = pattern.replace(/\\/\\*$/, '').replace(/\\*$/, '');
          if (basePattern) {
            var baseParsed = this.pathToRegex(basePattern);
            var baseMatch = pathname.match(baseParsed.regex);
            if (baseMatch) {
              pathnameBase = baseMatch[0].replace(/\\/$/, '');
            }
          }
        }

        return {
          params: params,
          pathname: pathname,
          pathnameBase: pathnameBase
        };
      },

      /**
       * Match routes recursively (handles nested routes)
       * Returns array of matches from root to leaf
       */
      matchRoutes: function(routes, pathname, parentPath) {
        if (!routes || !routes.length) return [];

        parentPath = parentPath || '';
        var matches = [];

        for (var i = 0; i < routes.length; i++) {
          var route = routes[i];
          var fullPath = route.index ? parentPath : this.joinPaths(parentPath, route.path || '');

          // Try to match this route
          var match = null;

          if (route.index) {
            // Index route - matches exact parent path
            if (pathname === parentPath || pathname === parentPath + '/') {
              match = {
                params: {},
                pathname: pathname,
                pathnameBase: parentPath
              };
            }
          } else if (route.path) {
            match = this.matchPath(fullPath, pathname);
          } else if (!route.path && route.children) {
            // Layout route without path - always matches
            match = {
              params: {},
              pathname: pathname,
              pathnameBase: parentPath
            };
          }

          if (match) {
            var routeMatch = {
              route: route,
              params: match.params,
              pathname: match.pathname,
              pathnameBase: match.pathnameBase
            };

            // Check for nested routes
            if (route.children && route.children.length > 0) {
              var childMatches = this.matchRoutes(route.children, pathname, match.pathnameBase);
              if (childMatches.length > 0) {
                // Parent matched with children
                matches.push(routeMatch);
                matches = matches.concat(childMatches);
                return matches;
              } else if (route.element) {
                // Parent matched but no children - still return parent if it has element
                // This handles layout routes with optional children
                var indexChild = route.children.find(function(c) { return c.index; });
                if (indexChild) {
                  matches.push(routeMatch);
                  matches.push({
                    route: indexChild,
                    params: match.params,
                    pathname: match.pathname,
                    pathnameBase: match.pathnameBase
                  });
                  return matches;
                }
                // Only return parent if exact match or wildcard
                if (match.pathname === match.pathnameBase || match.pathnameBase + '/' === match.pathname || route.path === '*' || (route.path && route.path.endsWith('*'))) {
                  matches.push(routeMatch);
                  return matches;
                }
              }
            } else if (route.element || route.index) {
              // Leaf route with element
              matches.push(routeMatch);
              return matches;
            }
          }
        }

        return matches;
      },

      /**
       * Join path segments
       */
      joinPaths: function(parent, child) {
        if (!parent) return child || '/';
        if (!child) return parent;

        var p = parent.replace(/\\/$/, '');
        var c = child.replace(/^\\//, '');

        if (!c) return p || '/';
        return p + '/' + c;
      },

      /**
       * Update route matches based on current pathname
       */
      updateMatches: function(pathname) {
        var newMatches = this.matchRoutes(this.routes, pathname, '');
        this.matches = newMatches;

        // Merge all params from matches
        var allParams = {};
        for (var i = 0; i < newMatches.length; i++) {
          var match = newMatches[i];
          if (match.params) {
            var keys = Object.keys(match.params);
            for (var j = 0; j < keys.length; j++) {
              allParams[keys[j]] = match.params[keys[j]];
            }
          }
        }
        this.params = allParams;

        // Reset outlet index
        this.outletIndex = 0;

        // Notify subscribers
        this.notifySubscribers();

        return newMatches;
      },

      /**
       * Register routes configuration
       */
      registerRoutes: function(routes) {
        this.routes = routes;

        // Update matches for current path
        var currentPath = window.__SANDBOX_ROUTER__?.currentPath || '/';
        this.updateMatches(currentPath);
      },

      /**
       * Get current params
       */
      getParams: function() {
        return Object.assign({}, this.params);
      },

      /**
       * Get current outlet element (for nested rendering)
       */
      getOutletElement: function() {
        var nextIndex = this.outletIndex + 1;
        if (nextIndex < this.matches.length) {
          return this.matches[nextIndex];
        }
        return null;
      },

      /**
       * Advance outlet index (called when rendering Outlet)
       */
      advanceOutlet: function() {
        this.outletIndex++;
        return this.getOutletElement();
      },

      /**
       * Reset outlet index (for new render cycle)
       */
      resetOutletIndex: function() {
        this.outletIndex = 0;
      },

      /**
       * Subscribe to route changes
       */
      subscribe: function(callback) {
        this.subscribers.push(callback);
        return function() {
          var index = this.subscribers.indexOf(callback);
          if (index > -1) {
            this.subscribers.splice(index, 1);
          }
        }.bind(this);
      },

      /**
       * Notify all subscribers
       */
      notifySubscribers: function() {
        var data = {
          matches: this.matches,
          params: this.params,
          pathname: window.__SANDBOX_ROUTER__?.currentPath || '/'
        };
        for (var i = 0; i < this.subscribers.length; i++) {
          try {
            this.subscribers[i](data);
          } catch (e) {
            console.error('[RouteContext] Subscriber error:', e);
          }
        }
      }
    };

    // Listen for navigation to update route matches
    if (window.__SANDBOX_ROUTER__) {
      window.__SANDBOX_ROUTER__.subscribe(function(location) {
        window.__SANDBOX_ROUTE_CONTEXT__.updateMatches(location.pathname);
      });
    }

    // Listen for route registration from parent
    window.addEventListener('message', function(event) {
      if (!event.data) return;

      if (event.data.type === 'REGISTER_ROUTES') {
        window.__SANDBOX_ROUTE_CONTEXT__.registerRoutes(event.data.routes || []);

        window.__postToParent({
          type: 'ROUTES_REGISTERED',
          requestId: event.data.requestId,
          count: (event.data.routes || []).length
        });
      }

      if (event.data.type === 'GET_ROUTE_PARAMS') {
        window.__postToParent({
          type: 'ROUTE_PARAMS_RESPONSE',
          requestId: event.data.requestId,
          params: window.__SANDBOX_ROUTE_CONTEXT__.getParams()
        });
      }

      if (event.data.type === 'GET_ROUTE_MATCHES') {
        window.__postToParent({
          type: 'ROUTE_MATCHES_RESPONSE',
          requestId: event.data.requestId,
          matches: window.__SANDBOX_ROUTE_CONTEXT__.matches
        });
      }
    });

  `;
}
