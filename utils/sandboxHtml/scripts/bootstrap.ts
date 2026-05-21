/**
 * Bootstrap Script
 *
 * Generates the bootstrap script that compiles and runs the user's code.
 * Includes Babel transpilation, import map generation, and React mounting.
 */

import type { FileSystem } from '@/types';
import { getKnownLucideIconsScript } from './lucideIcons';

/**
 * Generate the bootstrap script that compiles and runs the user's code
 */
export function getBootstrapScript(files: FileSystem): string {
  return `
    (async () => {
      const files = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(files))}"));

      // ═══════════════════════════════════════════════════════════
      // BLOB URL MEMORY MANAGEMENT
      // Tracks and cleans up blob URLs to prevent memory leaks
      // ═══════════════════════════════════════════════════════════
      window.__SANDBOX_BLOB_URLS__ = [];

      // Wrapper for URL.createObjectURL that tracks URLs
      const createTrackedBlobURL = (blob) => {
        const url = URL.createObjectURL(blob);
        window.__SANDBOX_BLOB_URLS__.push(url);
        return url;
      };

      // Cleanup function to revoke all blob URLs
      const cleanupBlobURLs = () => {
        const urls = window.__SANDBOX_BLOB_URLS__ || [];
        urls.forEach(url => {
          try {
            URL.revokeObjectURL(url);
          } catch (e) {
            // Ignore errors from already-revoked URLs
          }
        });
        window.__SANDBOX_BLOB_URLS__ = [];
      };

      // Register cleanup on page unload/before refresh
      window.addEventListener('beforeunload', cleanupBlobURLs);
      window.addEventListener('pagehide', cleanupBlobURLs);

      // Listen for cleanup message from parent
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CLEANUP_BLOB_URLS') {
          cleanupBlobURLs();
        }
      });

      // Expose cleanup function globally for manual invocation
      window.__SANDBOX_CLEANUP__ = cleanupBlobURLs;
      // Create a custom react-router-dom wrapper that makes BrowserRouter work in sandbox
      const routerShimCode = \`
        import * as ReactRouterDom from 'https://esm.sh/react-router-dom@6.28.0?external=react,react-dom';
        import React from 'https://esm.sh/react@19.0.0';

        // Re-export utility functions that do not need Router context
        export {
          generatePath, matchPath, matchRoutes, resolvePath,
          createRoutesFromElements, createRoutesFromChildren,
          MemoryRouter, HashRouter, Router, RouterProvider, createBrowserRouter,
          createHashRouter, createMemoryRouter, Form, ScrollRestoration,
          renderMatches
        } from 'https://esm.sh/react-router-dom@6.28.0?external=react,react-dom';

        // Our own safe useInRouterContext that never throws
        // This checks for the NavigationContext which react-router uses
        const _originalUseInRouterContext = ReactRouterDom.useInRouterContext;
        export function useInRouterContext() {
          try {
            return _originalUseInRouterContext();
          } catch (e) {
            return false;
          }
        }

        // Store references to original components
        const OriginalRoutes = ReactRouterDom.Routes;
        const OriginalRoute = ReactRouterDom.Route;
        const OriginalNavigate = ReactRouterDom.Navigate;
        const OriginalOutlet = ReactRouterDom.Outlet;

        // AutoRouter wrapper - automatically wraps children with MemoryRouter if not already in Router context
        function AutoRouterWrapper({ children }) {
          const inRouter = useInRouterContext();
          if (inRouter) {
            return children;
          }
          // No Router context - wrap with MemoryRouter
          const initialPath = window.__SANDBOX_ROUTER__?.currentPath || '/';
          return React.createElement(ReactRouterDom.MemoryRouter, { initialEntries: [initialPath] }, children);
        }

        // Extract route configuration from React children (for route context registration)
        function extractRouteConfig(children, parentPath = '') {
          const routes = [];
          React.Children.forEach(children, (child) => {
            if (!child || !child.props) return;
            const { path, index, element, children: childRoutes } = child.props;

            const routeConfig = {
              path: path || '',
              index: !!index,
              element: element ? (element.type?.name || element.type?.displayName || 'Component') : null,
              children: childRoutes ? extractRouteConfig(childRoutes, path || parentPath) : []
            };

            routes.push(routeConfig);
          });
          return routes;
        }

        // Safe Routes that auto-wraps with Router if needed AND registers routes with context
        export function Routes(props) {
          // Extract and register routes with route context on mount
          React.useEffect(() => {
            if (window.__SANDBOX_ROUTE_CONTEXT__ && props.children) {
              const routeConfigs = extractRouteConfig(props.children);
              window.__SANDBOX_ROUTE_CONTEXT__.registerRoutes(routeConfigs);
            }
          }, [props.children]);

          // Sync with sandbox router location changes
          const [location, setLocation] = React.useState(() =>
            window.__SANDBOX_ROUTER__?.getLocation() || { pathname: '/', search: '', hash: '' }
          );

          React.useEffect(() => {
            if (window.__SANDBOX_ROUTER__) {
              return window.__SANDBOX_ROUTER__.subscribe((loc) => {
                setLocation({ ...loc });
              });
            }
          }, []);

          return React.createElement(AutoRouterWrapper, null,
            React.createElement(SyncedRoutes, { ...props, currentLocation: location })
          );
        }

        // Internal component that syncs MemoryRouter with sandbox location
        function SyncedRoutes({ currentLocation, ...props }) {
          const navigate = ReactRouterDom.useNavigate();
          const routerLocation = ReactRouterDom.useLocation();

          React.useEffect(() => {
            const targetPath = currentLocation.pathname + currentLocation.search + currentLocation.hash;
            const currentPath = routerLocation.pathname + routerLocation.search + routerLocation.hash;
            if (targetPath !== currentPath) {
              navigate(targetPath, { replace: true });
            }
          }, [currentLocation, navigate, routerLocation]);

          return React.createElement(OriginalRoutes, props);
        }

        // Re-export Route directly (it's used inside Routes which handles context)
        export const Route = OriginalRoute;

        // Safe Navigate that auto-wraps with Router if needed
        export function Navigate(props) {
          return React.createElement(AutoRouterWrapper, null,
            React.createElement(OriginalNavigate, props)
          );
        }

        // Enhanced Outlet that works with both React Router context and sandbox route context
        export function Outlet(props) {
          // First try to use React Router's Outlet if we're in a Router context
          if (useInRouterContext()) {
            return React.createElement(OriginalOutlet, props);
          }

          // Fallback: use sandbox route context for nested rendering
          const [outletMatch, setOutletMatch] = React.useState(null);

          React.useEffect(() => {
            if (window.__SANDBOX_ROUTE_CONTEXT__) {
              // Get the next outlet element
              const nextMatch = window.__SANDBOX_ROUTE_CONTEXT__.getOutletElement();
              setOutletMatch(nextMatch);
            }
          }, []);

          // If we have a match from route context, we could render it here
          // But for now, wrap with AutoRouterWrapper to let React Router handle it
          return React.createElement(AutoRouterWrapper, null,
            React.createElement(OriginalOutlet, props)
          );
        }

        // Safe hook wrappers - return fallback values when outside Router context
        // All use our safe useInRouterContext() which never throws
        export function useMatch(pattern) {
          if (!useInRouterContext()) return null;
          return ReactRouterDom.useMatch(pattern);
        }

        export function useMatches() {
          if (!useInRouterContext()) return [];
          return ReactRouterDom.useMatches();
        }

        export function useResolvedPath(to) {
          if (!useInRouterContext()) {
            const path = typeof to === 'string' ? to : to.pathname || '/';
            return { pathname: path, search: '', hash: '' };
          }
          return ReactRouterDom.useResolvedPath(to);
        }

        export function useHref(to) {
          if (!useInRouterContext()) {
            return typeof to === 'string' ? to : to.pathname || '/';
          }
          return ReactRouterDom.useHref(to);
        }

        export function useNavigationType() {
          if (!useInRouterContext()) return 'POP';
          return ReactRouterDom.useNavigationType();
        }

        export function useOutlet(context) {
          if (!useInRouterContext()) return null;
          return ReactRouterDom.useOutlet(context);
        }

        export function useOutletContext() {
          if (!useInRouterContext()) return undefined;
          return ReactRouterDom.useOutletContext();
        }

        export function useRoutes(routes, location) {
          if (!useInRouterContext()) return null;
          return ReactRouterDom.useRoutes(routes, location);
        }

        // Data router hooks - return null/undefined when outside context
        export function useFetcher() {
          if (!useInRouterContext()) return { state: 'idle', data: undefined, load: () => {}, submit: () => {} };
          return ReactRouterDom.useFetcher();
        }

        export function useFetchers() {
          if (!useInRouterContext()) return [];
          return ReactRouterDom.useFetchers();
        }

        export function useFormAction(action) {
          if (!useInRouterContext()) return action || '';
          return ReactRouterDom.useFormAction(action);
        }

        export function useLoaderData() {
          if (!useInRouterContext()) return undefined;
          return ReactRouterDom.useLoaderData();
        }

        export function useActionData() {
          if (!useInRouterContext()) return undefined;
          return ReactRouterDom.useActionData();
        }

        export function useNavigation() {
          if (!useInRouterContext()) return { state: 'idle', location: undefined, formMethod: undefined, formAction: undefined, formEncType: undefined, formData: undefined };
          return ReactRouterDom.useNavigation();
        }

        export function useRevalidator() {
          if (!useInRouterContext()) return { state: 'idle', revalidate: () => {} };
          return ReactRouterDom.useRevalidator();
        }

        export function useRouteError() {
          if (!useInRouterContext()) return undefined;
          return ReactRouterDom.useRouteError();
        }

        export function useRouteLoaderData(routeId) {
          if (!useInRouterContext()) return undefined;
          return ReactRouterDom.useRouteLoaderData(routeId);
        }

        export function useSubmit() {
          if (!useInRouterContext()) return () => {};
          return ReactRouterDom.useSubmit();
        }

        export function useBeforeUnload(callback) {
          React.useEffect(() => {
            if (callback) {
              window.addEventListener('beforeunload', callback);
              return () => window.removeEventListener('beforeunload', callback);
            }
          }, [callback]);
        }

        export function unstable_usePrompt() {
          // No-op outside Router
        }

        export function unstable_useBlocker() {
          if (!useInRouterContext()) return { state: 'unblocked', proceed: () => {}, reset: () => {} };
          return ReactRouterDom.unstable_useBlocker();
        }

        // Standalone useLocation - uses sandbox router, doesn't need Router context
        // This is always safe to call and provides reactive updates
        export function useLocation() {
          const [location, setLocation] = React.useState(() => {
            return window.__SANDBOX_ROUTER__?.getLocation() || { pathname: '/', search: '', hash: '', state: null, key: 'default' };
          });

          React.useEffect(() => {
            if (window.__SANDBOX_ROUTER__) {
              return window.__SANDBOX_ROUTER__.subscribe((loc) => setLocation(loc));
            }
          }, []);

          return location;
        }

        // Standalone useParams - uses sandbox route context for path parameter extraction
        // Reactively updates when route changes
        export function useParams() {
          const [params, setParams] = React.useState(() => {
            return window.__SANDBOX_ROUTE_CONTEXT__?.getParams() || {};
          });

          React.useEffect(() => {
            if (window.__SANDBOX_ROUTE_CONTEXT__) {
              return window.__SANDBOX_ROUTE_CONTEXT__.subscribe((data) => {
                setParams(data.params || {});
              });
            }
          }, []);

          // Also check React Router context if available (for components inside Routes)
          if (useInRouterContext()) {
            try {
              const routerParams = ReactRouterDom.useParams();
              // Merge both - React Router params take precedence
              return { ...params, ...routerParams };
            } catch (e) {
              // Fall back to our params
            }
          }

          return params;
        }

        // Standalone useSearchParams - parses from sandbox router
        export function useSearchParams() {
          const [params, setParamsState] = React.useState(() => {
            const search = window.__SANDBOX_ROUTER__?.search || '';
            return new URLSearchParams(search);
          });

          React.useEffect(() => {
            if (window.__SANDBOX_ROUTER__) {
              return window.__SANDBOX_ROUTER__.subscribe((loc) => {
                setParamsState(new URLSearchParams(loc.search || ''));
              });
            }
          }, []);

          const setParams = React.useCallback((newParams) => {
            const currentParams = new URLSearchParams(window.__SANDBOX_ROUTER__?.search || '');
            const searchString = typeof newParams === 'function'
              ? newParams(currentParams).toString()
              : new URLSearchParams(newParams).toString();
            window.__SANDBOX_ROUTER__?.navigate(
              window.__SANDBOX_ROUTER__.currentPath + (searchString ? '?' + searchString : '') + window.__SANDBOX_ROUTER__.hash
            );
          }, []);

          return [params, setParams];
        }

        // Custom BrowserRouter that uses MemoryRouter internally for sandbox compatibility
        export function BrowserRouter({ children, ...props }) {
          const [location, setLocation] = React.useState(window.__SANDBOX_ROUTER__.getLocation());

          React.useEffect(() => {
            return window.__SANDBOX_ROUTER__.subscribe((loc) => {
              setLocation({ ...loc });
            });
          }, []);

          return React.createElement(
            ReactRouterDom.MemoryRouter,
            {
              initialEntries: [location.pathname + location.search + location.hash],
              ...props
            },
            React.createElement(SandboxRouterSync, { location }, children)
          );
        }

        // Internal component to sync MemoryRouter with our sandbox router
        function SandboxRouterSync({ location, children }) {
          const navigate = ReactRouterDom.useNavigate();
          const routerLocation = ReactRouterDom.useLocation();

          React.useEffect(() => {
            const fullPath = location.pathname + location.search + location.hash;
            const currentPath = routerLocation.pathname + routerLocation.search + routerLocation.hash;
            if (fullPath !== currentPath) {
              navigate(fullPath, { replace: true });
            }
          }, [location, navigate, routerLocation]);

          return children;
        }

        // Standalone useNavigate - uses sandbox history, doesn't need Router context
        export function useNavigate() {
          return React.useCallback((to, options) => {
            // Update sandbox router for URL display
            if (typeof to === 'string') {
              if (options?.replace) {
                window.__SANDBOX_HISTORY__.replaceState(options?.state || null, '', to);
              } else {
                window.__SANDBOX_HISTORY__.pushState(options?.state || null, '', to);
              }
            } else if (typeof to === 'number') {
              window.__SANDBOX_HISTORY__.go(to);
            }
          }, []);
        }

        // Custom Link that updates both MemoryRouter AND sandbox router
        export function Link({ to, replace, state, children, ...props }) {
          const navigate = useNavigate();

          const handleClick = (e) => {
            // Allow default behavior for modified clicks (new tab, etc)
            if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
              return;
            }
            e.preventDefault();
            navigate(to, { replace, state });
            if (props.onClick) props.onClick(e);
          };

          return React.createElement('a', {
            ...props,
            href: typeof to === 'string' ? to : to.pathname,
            onClick: handleClick
          }, children);
        }

        // Custom NavLink that updates both MemoryRouter AND sandbox router
        // Safe version that works even without Router context
        export function NavLink({ to, replace, state, children, className, style, end, ...props }) {
          // Use our safe hooks which handle missing Router context internally
          const location = useLocation();
          const navigate = useNavigate();

          // Determine if this NavLink is active
          const toPath = typeof to === 'string' ? to : to.pathname;
          const isActive = end
            ? location.pathname === toPath
            : location.pathname.startsWith(toPath);

          const handleClick = (e) => {
            if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
              return;
            }
            e.preventDefault();
            navigate(to, { replace, state });
            if (props.onClick) props.onClick(e);
          };

          // Handle className as function or string
          const computedClassName = typeof className === 'function'
            ? className({ isActive, isPending: false })
            : className;

          // Handle style as function or object
          const computedStyle = typeof style === 'function'
            ? style({ isActive, isPending: false })
            : style;

          return React.createElement('a', {
            ...props,
            href: toPath,
            onClick: handleClick,
            className: computedClassName,
            style: computedStyle,
            'aria-current': isActive ? 'page' : undefined
          }, typeof children === 'function' ? children({ isActive, isPending: false }) : children);
        }
      \`;
      const routerShimUrl = createTrackedBlobURL(new Blob([routerShimCode], { type: 'application/javascript' }));

      // Dynamic imports detected from user code (proactive resolution)
      const dynamicImports = __DYNAMIC_IMPORTS_PLACEHOLDER__;

      // Remove react-router and react-router-dom from dynamic imports - we always use our shim
      const filteredDynamicImports = { ...dynamicImports };
      delete filteredDynamicImports['react-router'];
      delete filteredDynamicImports['react-router-dom'];

      const importMap = {
        imports: {
          // Dynamic imports first (auto-detected from code) - can be overridden by our explicit mappings
          ...filteredDynamicImports,
          // React core
          "react": "https://esm.sh/react@19.0.0",
          "react/jsx-runtime": "https://esm.sh/react@19.0.0/jsx-runtime",
          "react/jsx-dev-runtime": "https://esm.sh/react@19.0.0/jsx-dev-runtime",
          "react-dom": "https://esm.sh/react-dom@19.0.0",
          "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
          // React Router - MUST use our custom shim for sandbox compatibility
          // This handles cases where AI imports from 'react-router' instead of 'react-router-dom'
          "react-router-dom": routerShimUrl,
          "react-router": routerShimUrl,
          // Icons
          "lucide-react": "https://esm.sh/lucide-react@0.469.0",
          // Utilities
          "clsx": "https://esm.sh/clsx@2.1.1",
          "classnames": "https://esm.sh/classnames@2.5.1",
          "tailwind-merge": "https://esm.sh/tailwind-merge@2.5.4",
          // Animation
          "framer-motion": "https://esm.sh/framer-motion@11.11.17?external=react,react-dom",
          "motion": "https://esm.sh/motion@12.0.0?external=react,react-dom",
          "motion/react": "https://esm.sh/motion@12.0.0/react?external=react,react-dom",
          // Date handling
          "date-fns": "https://esm.sh/date-fns@4.1.0",
          // State management (lightweight)
          "zustand": "https://esm.sh/zustand@5.0.1?external=react",
          // Form handling
          "react-hook-form": "https://esm.sh/react-hook-form@7.53.2?external=react"
        }
      };

      const dynamicKeys = Object.keys(dynamicImports);

      // Helper to resolve relative paths to absolute
      function resolvePath(fromFile, importPath) {
        if (!importPath.startsWith('.')) return importPath;
        const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
        const parts = fromDir.split('/').filter(Boolean);
        const importParts = importPath.split('/');

        for (const part of importParts) {
          if (part === '.') continue;
          if (part === '..') parts.pop();
          else parts.push(part);
        }
        return parts.join('/');
      }

      // Helper to find actual file (handles missing extensions)
      function findFile(path) {
        if (files[path]) return path;
        const extensions = ['.tsx', '.ts', '.jsx', '.js'];
        for (const ext of extensions) {
          if (files[path + ext]) return path + ext;
        }
        // Try index files
        for (const ext of extensions) {
          if (files[path + '/index' + ext]) return path + '/index' + ext;
        }
        return null;
      }

      ${getKnownLucideIconsScript()}

      // Transform lucide-react imports to replace unknown icons with HelpCircle
      function transformLucideImports(code) {
        return code.replace(
          /import\\s*{([^}]+)}\\s*from\\s*['"]lucide-react['"]/g,
          (match, imports) => {
            const iconList = imports.split(',').map(s => s.trim()).filter(Boolean);
            const transformed = iconList.map(icon => {
              // Handle 'as' aliasing like "Star as StarIcon"
              const [iconName, alias] = icon.split(/\\s+as\\s+/).map(s => s.trim());
              if (KNOWN_LUCIDE_ICONS.has(iconName)) {
                return icon; // Keep as is
              }
              // Replace unknown icon with HelpCircle
              return alias ? 'HelpCircle as ' + alias : 'HelpCircle as ' + iconName;
            });
            return 'import { ' + transformed.join(', ') + " } from 'lucide-react'";
          }
        );
      }

      // Bare specifier directories that need resolution
      const bareSpecifierDirs = ['src/', 'components/', 'hooks/', 'utils/', 'services/', 'contexts/', 'types/', 'lib/', 'pages/', 'features/', 'modules/', 'assets/', 'styles/', 'api/'];

      // ═══════════════════════════════════════════════════════════
      // CSS MODULES PROCESSOR
      // Scopes class names for .module.css files
      // ═══════════════════════════════════════════════════════════

      function processCssModule(cssContent, filename) {
        // Simple hash function
        function hashStr(str) {
          let hash = 5381;
          for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
          }
          return Math.abs(hash).toString(36).substring(0, 5);
        }

        // Find class names in CSS using matchAll
        const classNames = [];
        const matches = cssContent.matchAll(/\\.([a-zA-Z_][a-zA-Z0-9_-]*)/g);
        const pseudoClasses = ['hover', 'focus', 'active', 'visited', 'disabled', 'first-child', 'last-child',
          'nth-child', 'before', 'after', 'placeholder', 'checked', 'required', 'valid', 'invalid',
          'empty', 'not', 'is', 'where', 'has', 'focus-visible', 'focus-within', 'first-of-type',
          'last-of-type', 'only-child', 'root', 'target', 'enabled', 'selection', 'backdrop'];
        const seen = {};

        for (const match of matches) {
          const className = match[1];
          if (!pseudoClasses.includes(className) && !seen[className]) {
            classNames.push(className);
            seen[className] = true;
          }
        }

        // Generate scoped names and replace in CSS
        const basename = filename.split('/').pop().replace(/\\.module\\.css$/, '');
        const mapping = {};
        let scopedCss = cssContent;

        for (const className of classNames) {
          const scopedName = basename + '_' + className + '__' + hashStr(filename + className);
          mapping[className] = scopedName;

          // Replace .className with .scopedName in CSS
          const regex = new RegExp('\\\\.(' + className.replace(/[-]/g, '\\\\-') + ')(?=[^a-zA-Z0-9_-]|$)', 'g');
          scopedCss = scopedCss.replace(regex, '.' + scopedName);
        }

        return { scopedCss: scopedCss, mapping: mapping };
      }

      // Transform imports in code to use absolute paths
      function transformImports(code, fromFile) {
        // First transform lucide imports
        code = transformLucideImports(code);

        // Helper to resolve import path
        function resolveImport(importPath) {
          // Handle relative imports
          if (importPath.startsWith('.')) {
            const resolved = resolvePath(fromFile, importPath);
            const actualFile = findFile(resolved);
            return actualFile || resolved;
          }

          // Handle bare specifiers like 'src/components/X' or 'components/X'
          const isBareSpecifier = bareSpecifierDirs.some(dir => importPath.startsWith(dir));
          if (isBareSpecifier) {
            // Try to find the file directly
            const actualFile = findFile(importPath);
            if (actualFile) return actualFile;

            // Try adding src/ prefix if not present
            if (!importPath.startsWith('src/')) {
              const withSrc = 'src/' + importPath;
              const actualWithSrc = findFile(withSrc);
              if (actualWithSrc) return actualWithSrc;
            }
          }

          return importPath;
        }

        let result = code.replace(
          /(import\\s+(?:[\\w{},\\s*]+\\s+from\\s+)?['"])([^'"]+)(['"])/g,
          (match, prefix, importPath, suffix) => {
            const resolved = resolveImport(importPath);
            if (resolved !== importPath) {
              return prefix + resolved + suffix;
            }
            return match;
          }
        ).replace(
          /(export\\s+(?:[\\w{},\\s*]+\\s+from\\s+)?['"])([^'"]+)(['"])/g,
          (match, prefix, importPath, suffix) => {
            const resolved = resolveImport(importPath);
            if (resolved !== importPath) {
              return prefix + resolved + suffix;
            }
            return match;
          }
        );

        // ═══════════════════════════════════════════════════════════
        // ENVIRONMENT VARIABLE TRANSFORMATION
        // Replace import.meta.env with window.__VITE_ENV__
        // ═══════════════════════════════════════════════════════════

        // Pattern 1: import.meta.env.VARIABLE_NAME
        result = result.replace(
          /import\\.meta\\.env\\.([A-Z_][A-Z0-9_]*)/g,
          'window.__VITE_ENV__.$1'
        );

        // Pattern 2: import.meta.env (the whole object)
        result = result.replace(
          /import\\.meta\\.env(?![.\\w])/g,
          'window.__VITE_ENV__'
        );

        return result;
      }

      // Process all files
      const errors = [];

      // Comprehensive auto-fix function for common syntax errors
      function autoFixCode(code) {
        let fixed = code;

        // ═══════════════════════════════════════════════════════════
        // PHASE 0: Reserved name conflicts with browser globals
        // ═══════════════════════════════════════════════════════════
        // Component names that conflict with browser APIs (window.History, etc.)
        // These cause "Illegal constructor" errors when used as component names
        const reservedNames = {
          'History': 'HistoryView',
          'Location': 'LocationView',
          'Navigator': 'NavigatorView',
          'Document': 'DocumentView',
          'Window': 'WindowView',
          'Event': 'EventView',
          'Error': 'ErrorView',
          'Storage': 'StorageView',
          'Headers': 'HeadersView',
          'Request': 'RequestView',
          'Response': 'ResponseView',
          'URL': 'URLView',
          'FormData': 'FormDataView',
          'Node': 'NodeView',
          'Element': 'ElementView',
          'Text': 'TextView',
          'Comment': 'CommentView',
          'Image': 'ImageView',
          'Audio': 'AudioView',
          'Video': 'VideoView',
          'Map': 'MapView',
          'Set': 'SetView',
          'Date': 'DateView',
          'Object': 'ObjectView',
          'Array': 'ArrayView',
          'Function': 'FunctionView',
          'Number': 'NumberView',
          'String': 'StringView',
          'Boolean': 'BooleanView',
          'Symbol': 'SymbolView',
          'Promise': 'PromiseView',
          'Proxy': 'ProxyView',
          'Reflect': 'ReflectView',
          'JSON': 'JSONView',
          'Math': 'MathView',
          'Infinity': 'InfinityView',
          'NaN': 'NaNView',
          'Console': 'ConsoleView',
          'Blob': 'BlobView',
          'File': 'FileView',
          'FileReader': 'FileReaderView',
          'FileList': 'FileListView',
          'Worker': 'WorkerView',
          'WebSocket': 'WebSocketView',
          'MessageEvent': 'MessageEventView',
          'CustomEvent': 'CustomEventView',
          'Range': 'RangeView',
          'Selection': 'SelectionView',
          'Option': 'OptionView',
          'Form': 'FormView',
          'Input': 'InputView',
          'Button': 'ButtonView',
          'Label': 'LabelView',
          'Table': 'TableView',
          'Canvas': 'CanvasView',
          'Screen': 'ScreenView',
        };

        for (const [reserved, replacement] of Object.entries(reservedNames)) {
          // Create a regex that matches the reserved name as a whole word
          // in common component declaration patterns
          const patterns = [
            // function History() or function History(props)
            new RegExp('\\\\bfunction\\\\s+' + reserved + '\\\\s*\\\\(', 'g'),
            // const History = or let History = or var History =
            new RegExp('\\\\b(const|let|var)\\\\s+' + reserved + '\\\\s*=', 'g'),
            // export function History or export const History
            new RegExp('\\\\bexport\\\\s+(default\\\\s+)?(function\\\\s+|const\\\\s+|let\\\\s+|var\\\\s+)?' + reserved + '\\\\b', 'g'),
            // <History or </History
            new RegExp('<\\\\/?\\\\s*' + reserved + '(?=[\\\\s/>])', 'g'),
            // {History} in imports/exports
            new RegExp('\\\\{\\\\s*' + reserved + '\\\\s*\\\\}', 'g'),
          ];

          let wasFixed = false;
          for (const pattern of patterns) {
            if (pattern.test(fixed)) {
              wasFixed = true;
              break;
            }
          }

          if (wasFixed) {
            // Replace the reserved name with the safe replacement
            // Use word boundary to avoid partial matches
            const wholeWordPattern = new RegExp('\\\\b' + reserved + '\\\\b', 'g');
            const beforeReplace = fixed;
            fixed = fixed.replace(wholeWordPattern, replacement);
          }
        }

        // ═══════════════════════════════════════════════════════════
        // PHASE 1: Arrow function fixes
        // ═══════════════════════════════════════════════════════════

        // FIRST: Fix space in arrow = > → => (must run before function fix)
        fixed = fixed.replace(/=\\s+>/g, '=>');

        // CRITICAL: Fix hybrid function/arrow syntax - "function Name() => {" → "function Name() {"
        // AI commonly generates this invalid mix of function declaration and arrow function

        // Pattern 1: Simple case - no params: function Name() => {
        fixed = fixed.replace(/function\\s+(\\w+)\\s*\\(\\)\\s*=>\\s*\\{/g, function(m, name) {
          return 'function ' + name + '() {';
        });

        // Pattern 2: With params but no nested parens: function Name(a, b) => {
        fixed = fixed.replace(/function\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*=>\\s*\\{/g, function(m, name, params) {
          return 'function ' + name + '(' + params + ') {';
        });

        // Pattern 3: Complex - any content between function and => { (non-greedy)
        fixed = fixed.replace(/(\\bfunction\\s+\\w+[\\s\\S]*?)\\s*=>\\s*\\{/g, function(m, decl) {
          return decl + ' {';
        });

        // ( ) => → () =>
        fixed = fixed.replace(/\\(\\s+\\)\\s*=>/g, '() =>');

        // Fix missing arrow in arrow functions (NOT function declarations)
        // Pattern: "= () {" or "= async () {" → "= () => {" or "= async () => {"
        // This catches: const fn = () {, const fn = async () {, but NOT function Name() {
        fixed = fixed.replace(/(=\\s*)(async\\s+)?\\(([^)]*)\\)\\s*\\{/g, function(match, eq, asyncKw, params) {
          if (match.includes('=>')) return match;
          return eq + (asyncKw || '') + '(' + params + ') => {';
        });

        // Fix: useEffect(() { → useEffect(() => {
        // Pattern: identifier( followed by (() { - callback without arrow
        fixed = fixed.replace(/(\\w+)\\s*\\(\\s*\\(([^)]*)\\)\\s*\\{(?!\\s*=>)/g, function(match, fnName, params) {
          if (fnName === 'function') return match;
          return fnName + '((' + params + ') => {';
        });

        // Fix: return () { → return () => { (useEffect cleanup functions)
        fixed = fixed.replace(/return\\s+\\(([^)]*)\\)\\s*\\{/g, function(match, params) {
          if (match.includes('=>')) return match;
          return 'return (' + params + ') => {';
        });

        // Fix: onClick={() { → onClick={() => { (JSX event handlers)
        // Pattern: ={ followed by (params) and { without =>
        fixed = fixed.replace(/=\\{\\s*\\(([^)]*)\\)\\s*\\{(?!\\s*=>)/g, function(match, params) {
          if (match.includes('=>')) return match;
          return '={(' + params + ') => {';
        });

        // Fix: render: (value) { → render: (value) => { (object property arrow)
        // Pattern: propertyName: (params) { without =>
        fixed = fixed.replace(/(\\w+)\\s*:\\s*\\(([^)]*)\\)\\s*\\{(?!\\s*=>)/g, function(match, prop, params) {
          if (match.includes('=>')) return match;
          // Skip if it looks like a destructuring pattern
          if (/^\\s*\\{/.test(params)) return match;
          return prop + ': (' + params + ') => {';
        });

        // ═══════════════════════════════════════════════════════════
        // PHASE 2: JSX attribute fixes
        // ═══════════════════════════════════════════════════════════

        // className"value" → className="value"
        fixed = fixed.replace(/(className)"([^"]+)"/g, '$1="$2"');
        fixed = fixed.replace(/(onClick)"([^"]+)"/g, '$1={$2}');
        fixed = fixed.replace(/(onChange)"([^"]+)"/g, '$1={$2}');
        fixed = fixed.replace(/(onSubmit)"([^"]+)"/g, '$1={$2}');
        fixed = fixed.replace(/(style)"([^"]+)"/g, '$1={{$2}}');
        fixed = fixed.replace(/(key)"([^"]+)"/g, '$1="$2"');
        fixed = fixed.replace(/(href)"([^"]+)"/g, '$1="$2"');
        fixed = fixed.replace(/(src)"([^"]+)"/g, '$1="$2"');

        // className=="" → className=""
        fixed = fixed.replace(/(className|style|onClick|key|href|src)=="/g, '$1="');

        // Missing closing brace in expression: {value onClick → {value} onClick
        fixed = fixed.replace(/=\\{([a-zA-Z_][a-zA-Z0-9_]*)(\\s+[a-z])/gi, '={$1}$2');

        // ═══════════════════════════════════════════════════════════
        // PHASE 3: Ternary operator fixes
        // ═══════════════════════════════════════════════════════════

        // ) : condition && ( → ) : (condition && (
        fixed = fixed.replace(/\\)\\s*:\\s*([a-zA-Z_][a-zA-Z0-9_.]*)\\s*&&\\s*\\(/g, ') : ($1 && (');

        // Incomplete ternary: ? <JSX /> } → ? <JSX /> : null }
        fixed = fixed.replace(/(\\?\\s*<[A-Z][^}]*(?:\\/>|<\\/[A-Z][a-zA-Z0-9]*>))(\\s*\\})/g, function(match, jsx, closing) {
          if (jsx.indexOf(':') !== -1 && jsx.indexOf('className:') === -1 && jsx.indexOf('style:') === -1) {
            return match;
          }
          return jsx + ' : null' + closing;
        });

        // ═══════════════════════════════════════════════════════════
        // PHASE 4: TypeScript fixes
        // ═══════════════════════════════════════════════════════════

        // : : type → : type
        fixed = fixed.replace(/:\\s*:\\s*/g, ': ');

        // Trailing comma before }
        fixed = fixed.replace(/,\\s*\\}/g, ' }');

        // Missing closing > in generics: React.FC<Props = → React.FC<Props> =
        fixed = fixed.replace(/(React\\.FC<[a-zA-Z_][a-zA-Z0-9_]*)(\\s*=)/g, '$1>$2');

        // ═══════════════════════════════════════════════════════════
        // PHASE 5: Bracket balance (simplified for sandbox)
        // ═══════════════════════════════════════════════════════════

        // Count brackets (simple approach - ignores strings for performance)
        var braces = 0, parens = 0, brackets = 0;
        var chars = fixed.split('');
        for (var k = 0; k < chars.length; k++) {
          var c = chars[k];
          if (c === '{') braces++;
          else if (c === '}') braces--;
          else if (c === '(') parens++;
          else if (c === ')') parens--;
          else if (c === '[') brackets++;
          else if (c === ']') brackets--;
        }

        // Add missing closers at end
        if (braces > 0) fixed = fixed.trimEnd() + '\\n' + '}'.repeat(braces);
        if (parens > 0) fixed = fixed.trimEnd() + ')'.repeat(parens);
        if (brackets > 0) fixed = fixed.trimEnd() + ']'.repeat(brackets);

        return fixed;
      }

      // Try transpile with auto-fix (apply fix BEFORE first compile attempt)
      // Detect if code contains JSX syntax
      function containsJSX(code) {
        // Remove comments and strings to avoid false positives
        const cleaned = code
          .replace(/\\/\\/.*$/gm, '')  // Remove single-line comments
          .replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')  // Remove multi-line comments
          .replace(/"(?:[^"\\\\\\\\]|\\\\\\\\.)*"/g, '""')  // Remove double-quoted strings
          .replace(/'(?:[^'\\\\\\\\]|\\\\\\\\.)*'/g, "''")  // Remove single-quoted strings
          .replace(/\`(?:[^\`\\\\\\\\]|\\\\\\\\.)*\`/g, '""');  // Remove template literals

        // Look for JSX patterns: <Component, </Component, <div, </div, <>, </>
        // Must start with < followed by uppercase letter (component) or lowercase (HTML element)
        const jsxPattern = /<\\/?[A-Za-z][A-Za-z0-9]*(?:\\s|>|\\/|$)/;
        const fragmentPattern = /<>|<\\/>/;

        return jsxPattern.test(cleaned) || fragmentPattern.test(cleaned);
      }

      function tryTranspile(code, filename, maxRetries = 2) {
        // ALWAYS apply auto-fix first - this catches common AI syntax errors
        // like "function Name() => {" before they cause compile errors
        let currentCode = autoFixCode(code);
        let lastError = null;

        // If .ts file contains JSX, treat it as .tsx for Babel
        let babelFilename = filename;
        if (filename.endsWith('.ts') && !filename.endsWith('.tsx') && containsJSX(currentCode)) {
          babelFilename = filename.replace(/\\.ts$/, '.tsx');
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const transformedContent = transformImports(currentCode, filename);
            const transpiled = Babel.transform(transformedContent, {
              presets: ['react', ['env', { modules: false }], 'typescript'],
              filename: babelFilename
            }).code;
            return { success: true, code: transpiled };
          } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
              const fixedCode = autoFixCode(currentCode);
              if (fixedCode !== currentCode) {
                currentCode = fixedCode;
              } else {
                break;
              }
            }
          }
        }

        // Extract line context from error
        let errorMsg = lastError.message;
        const lineMatch = errorMsg.match(/\\((\\d+):(\\d+)\\)/);
        if (lineMatch) {
          const line = parseInt(lineMatch[1], 10);
          const lines = currentCode.split('\\n');
          if (lines[line - 1]) {
            const start = Math.max(0, line - 3);
            const end = Math.min(lines.length, line + 2);
            let context = '';
            for (let i = start; i < end; i++) {
              const marker = (i + 1) === line ? '>>>' : '   ';
              context += marker + ' ' + (i + 1) + ': ' + lines[i] + '\\n';
            }
            errorMsg = errorMsg + '\\n\\nContext:\\n' + context;
          }
        }

        return { success: false, error: errorMsg };
      }

      for (const [filename, content] of Object.entries(files)) {
        if (/\\.(tsx|ts|jsx|js)$/.test(filename)) {
          const result = tryTranspile(content, filename);
          if (result.success) {
            const url = createTrackedBlobURL(new Blob([result.code], { type: 'application/javascript' }));

            // Add multiple import map entries for flexibility
            importMap.imports[filename] = url;
            importMap.imports[filename.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;

            // Also add relative-style entries from src
            if (filename.startsWith('src/')) {
              const relativePath = './' + filename.substring(4);
              importMap.imports[relativePath] = url;
              importMap.imports[relativePath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;

              // Also support imports without src/ prefix
              const withoutSrc = filename.substring(4);
              importMap.imports[withoutSrc] = url;
              importMap.imports[withoutSrc.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
            }

            // Support component folder imports (e.g., 'components/Header' -> 'src/components/Header.tsx')
            if (filename.includes('/components/')) {
              const componentPath = filename.split('/components/')[1];
              if (componentPath) {
                importMap.imports['components/' + componentPath] = url;
                importMap.imports['components/' + componentPath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
                importMap.imports['./components/' + componentPath] = url;
                importMap.imports['./components/' + componentPath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
              }
            }

          } else {
            console.error('[Sandbox] Transpilation failed for ' + filename + ': ' + result.error);
            errors.push({ file: filename, error: result.error });
          }
        } else if (/\\.module\\.css$/.test(filename)) {
          // Handle CSS Modules - scope class names and export mapping
          const processedCss = processCssModule(content, filename);

          // Inject scoped CSS
          const style = document.createElement('style');
          style.textContent = processedCss.scopedCss;
          style.setAttribute('data-file', filename);
          style.setAttribute('data-css-module', 'true');
          document.head.appendChild(style);

          // Create module that exports the class name mapping
          const mappingJson = JSON.stringify(processedCss.mapping);
          const cssModuleCode = 'const styles = ' + mappingJson + ';\\nexport default styles;\\n' +
            Object.keys(processedCss.mapping).map(function(key) {
              return 'export const ' + key + ' = ' + JSON.stringify(processedCss.mapping[key]) + ';';
            }).join('\\n');

          const url = createTrackedBlobURL(new Blob([cssModuleCode], { type: 'application/javascript' }));
          importMap.imports[filename] = url;
          importMap.imports[filename.replace(/\\.module\\.css$/, '.module')] = url;
          importMap.imports[filename.replace(/\\.module\\.css$/, '')] = url;

          // Also support relative imports
          if (filename.startsWith('src/')) {
            const relativePath = './' + filename.substring(4);
            importMap.imports[relativePath] = url;
            importMap.imports[relativePath.replace(/\\.module\\.css$/, '.module')] = url;
          }

        } else if (/\\.css$/.test(filename)) {
          // Handle regular CSS files - inject as style tag
          const style = document.createElement('style');
          style.textContent = content;
          style.setAttribute('data-file', filename);
          document.head.appendChild(style);
          // Create dummy module for CSS imports
          const cssModule = 'export default {};';
          const url = createTrackedBlobURL(new Blob([cssModule], { type: 'application/javascript' }));
          importMap.imports[filename] = url;
          importMap.imports[filename.replace(/\\.css$/, '')] = url;
        } else if (/\\.json$/.test(filename)) {
          // Handle JSON files
          try {
            const jsonModule = 'export default ' + content + ';';
            const url = createTrackedBlobURL(new Blob([jsonModule], { type: 'application/javascript' }));
            importMap.imports[filename] = url;
            importMap.imports[filename.replace(/\\.json$/, '')] = url;
          } catch (err) {
            console.error('[Sandbox] JSON parse failed for ' + filename);
          }
        }
      }

      if (errors.length > 0) {
        // Show compilation errors prominently
        errors.forEach(e => {
          console.error('[Sandbox] COMPILE ERROR in ' + e.file + ': ' + e.error);
        });
        // Notify parent about compilation failures
        window.__postToParent({
          type: 'CONSOLE_LOG',
          logType: 'error',
          message: 'Compilation failed for: ' + errors.map(e => e.file).join(', ') + '. Check console for details.',
          timestamp: Date.now()
        });

        // Show visual error in preview
        const root = document.getElementById('root');
        if (root) {
          root.textContent = '';
          const errorContainer = document.createElement('div');
          errorContainer.style.cssText = 'padding: 20px; font-family: ui-monospace, monospace; background: #1a1a2e; color: #eee; min-height: 100vh;';

          const title = document.createElement('h2');
          title.style.cssText = 'color: #ff6b6b; margin: 0 0 20px 0; font-size: 18px;';
          title.textContent = '⚠️ Compilation Error' + (errors.length > 1 ? 's' : '');
          errorContainer.appendChild(title);

          errors.forEach(e => {
            const errorBlock = document.createElement('div');
            errorBlock.style.cssText = 'background: #252542; border-left: 4px solid #ff6b6b; padding: 12px 16px; margin-bottom: 12px; border-radius: 0 8px 8px 0;';

            const fileName = document.createElement('div');
            fileName.style.cssText = 'color: #4ecdc4; font-weight: bold; margin-bottom: 8px;';
            fileName.textContent = '📄 ' + e.file;
            errorBlock.appendChild(fileName);

            const errorMsg = document.createElement('pre');
            errorMsg.style.cssText = 'color: #ff9999; margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 13px;';
            errorMsg.textContent = e.error;
            errorBlock.appendChild(errorMsg);

            errorContainer.appendChild(errorBlock);
          });

          const hint = document.createElement('p');
          hint.style.cssText = 'color: #888; font-size: 12px; margin-top: 20px;';
          hint.textContent = 'Tip: Check for syntax errors like malformed ternary operators, missing closing brackets, or invalid JSX.';
          errorContainer.appendChild(hint);

          root.appendChild(errorContainer);
        }
        return; // do not try to mount app if compilation failed
      }

      const mapScript = document.createElement('script');
      mapScript.type = "importmap";
      mapScript.textContent = JSON.stringify(importMap);
      document.head.appendChild(mapScript);

      // Find App entry point - try multiple possible paths
      const appPaths = ['src/App.tsx', 'src/App.jsx', 'src/App.ts', 'src/App.js', 'App.tsx', 'App.jsx', 'App.ts', 'App.js'];
      let appPath = null;
      for (const path of appPaths) {
        if (importMap.imports[path]) {
          appPath = path;
          break;
        }
      }
      if (!appPath) {
        // Last resort - find any file with "App" in the name
        const appKey = Object.keys(importMap.imports).find(k => k.includes('App') && /\\.(tsx|jsx|ts|js)$/.test(k));
        appPath = appKey || 'src/App.tsx'; // Default fallback
      }

      // Bootstrap code that makes React hooks globally available
      const bootstrapCode = \`
        import * as React from 'react';
        import { createRoot } from 'react-dom/client';
        import App from '\${appPath}';

        // Make React and hooks globally available
        window.React = React;
        window.useState = React.useState;
        window.useEffect = React.useEffect;
        window.useCallback = React.useCallback;
        window.useMemo = React.useMemo;
        window.useRef = React.useRef;
        window.useContext = React.useContext;
        window.useReducer = React.useReducer;
        window.useLayoutEffect = React.useLayoutEffect;
        window.createContext = React.createContext;
        window.forwardRef = React.forwardRef;
        window.memo = React.memo;
        window.Fragment = React.Fragment;

        // Error Boundary component to catch runtime errors
        class ErrorBoundary extends React.Component {
          constructor(props) {
            super(props);
            this.state = { hasError: false, error: null, errorInfo: null };
          }

          static getDerivedStateFromError(error) {
            return { hasError: true, error };
          }

          componentDidCatch(error, errorInfo) {
            this.setState({ errorInfo });
            console.error('[Sandbox] React Error Boundary caught error:', error.message);
            console.error('[Sandbox] Component stack:', errorInfo?.componentStack);
          }

          render() {
            if (this.state.hasError) {
              const { error, errorInfo } = this.state;
              return React.createElement('div', {
                style: {
                  padding: '20px',
                  fontFamily: '"JetBrains Mono", monospace',
                  backgroundColor: '#1e1e2e',
                  color: '#f38ba8',
                  minHeight: '100vh',
                  boxSizing: 'border-box'
                }
              },
                React.createElement('h2', {
                  style: { color: '#f38ba8', marginBottom: '10px' }
                }, '⚠️ Runtime Error'),
                React.createElement('pre', {
                  style: {
                    backgroundColor: '#313244',
                    padding: '15px',
                    borderRadius: '8px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }
                }, error?.message || 'Unknown error'),
                errorInfo?.componentStack && React.createElement('details', {
                  style: { marginTop: '15px' }
                },
                  React.createElement('summary', {
                    style: { cursor: 'pointer', color: '#89b4fa' }
                  }, 'Component Stack'),
                  React.createElement('pre', {
                    style: {
                      backgroundColor: '#313244',
                      padding: '10px',
                      borderRadius: '8px',
                      marginTop: '10px',
                      fontSize: '12px',
                      color: '#a6adc8'
                    }
                  }, errorInfo.componentStack)
                )
              );
            }
            return this.props.children;
          }
        }

        // Render the app with ErrorBoundary
        try {
          const rootEl = document.getElementById('root');

          // Create scroll container for app content
          // This allows internal scrolling while keeping outer elements locked
          let scrollContainer = document.getElementById('__app_scroll_container__');
          if (!scrollContainer) {
            scrollContainer = document.createElement('div');
            scrollContainer.id = '__app_scroll_container__';
            // Use textContent to clear loading state atomically
            // This is safer than removeChild which can conflict with animation libraries
            rootEl.textContent = '';
            rootEl.appendChild(scrollContainer);
          }

          const root = createRoot(scrollContainer);
          // Note: StrictMode disabled because it causes issues with animation libraries
          // like framer-motion (double renders confuse AnimatePresence exit animations)
          root.render(
            React.createElement(ErrorBoundary, null,
              React.createElement(App)
            )
          );
          window.__SANDBOX_READY__ = true;
        } catch (err) {
          console.error('[Sandbox] Failed to mount app:', err.message);
          showSafeError('Error', err);
        }
      \`;

      const script = document.createElement('script');
      script.type = 'module';
      try {
        const transpiledBootstrap = Babel.transform(bootstrapCode, {
          presets: ['react', ['env', { modules: false }], 'typescript'],
          filename: 'bootstrap.tsx'
        }).code;
        script.src = createTrackedBlobURL(new Blob([transpiledBootstrap], { type: 'application/javascript' }));

        // Handle script loading errors (module resolution failures)
        script.onerror = function(event) {
          console.error('[Sandbox] Bootstrap script failed to load');
          showSafeError('Module Load Error', { message: 'Failed to load application modules. Check console for details.' });
        };

        document.body.appendChild(script);
      } catch (err) {
        console.error('[Sandbox] Bootstrap transpilation failed:', err.message);
        showSafeError('Bootstrap Error', err);
      }
    })().catch(err => {
      console.error('[Sandbox] Initialization failed:', err.message);
      showSafeError('Init Error', err);
    });
  `;
}
