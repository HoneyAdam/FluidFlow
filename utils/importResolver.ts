/**
 * Import Resolver - Self-healing sandbox import system
 *
 * Automatically detects and resolves missing imports in the sandbox.
 * Uses esm.sh as the CDN for npm packages.
 */

export interface PackageConfig {
  package: string;
  version?: string;
  subpath?: string;
  external?: string[];
}

// Registry of known packages and their configurations
export const PACKAGE_REGISTRY: Record<string, PackageConfig> = {
  // React ecosystem
  'react': { package: 'react', version: '19.0.0' },
  'react/jsx-runtime': { package: 'react', version: '19.0.0', subpath: '/jsx-runtime' },
  'react/jsx-dev-runtime': { package: 'react', version: '19.0.0', subpath: '/jsx-dev-runtime' },
  'react-dom': { package: 'react-dom', version: '19.0.0' },
  'react-dom/client': { package: 'react-dom', version: '19.0.0', subpath: '/client' },

  // Animation
  'framer-motion': { package: 'framer-motion', version: '11.11.17', external: ['react', 'react-dom'] },
  'motion': { package: 'motion', version: '12.0.0', external: ['react', 'react-dom'] },
  'motion/react': { package: 'motion', version: '12.0.0', subpath: '/react', external: ['react', 'react-dom'] },

  // Routing - both point to react-router-dom for Link/NavLink compatibility
  'react-router': { package: 'react-router-dom', version: '6.28.0', external: ['react', 'react-dom'] },
  'react-router-dom': { package: 'react-router-dom', version: '6.28.0', external: ['react', 'react-dom'] },

  // State management
  'zustand': { package: 'zustand', version: '5.0.1', external: ['react'] },
  'jotai': { package: 'jotai', version: '2.10.3', external: ['react'] },
  '@tanstack/react-query': { package: '@tanstack/react-query', version: '5.62.0', external: ['react'] },

  // Forms
  'react-hook-form': { package: 'react-hook-form', version: '7.53.2', external: ['react'] },
  'zod': { package: 'zod', version: '3.23.8' },
  'yup': { package: 'yup', version: '1.4.0' },

  // UI Libraries
  'lucide-react': { package: 'lucide-react', version: '0.469.0', external: ['react'] },
  '@heroicons/react/24/solid': { package: '@heroicons/react', version: '2.2.0', subpath: '/24/solid', external: ['react'] },
  '@heroicons/react/24/outline': { package: '@heroicons/react', version: '2.2.0', subpath: '/24/outline', external: ['react'] },
  'react-icons': { package: 'react-icons', version: '5.4.0', external: ['react'] },

  // Radix UI
  '@radix-ui/react-dialog': { package: '@radix-ui/react-dialog', version: '1.1.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-dropdown-menu': { package: '@radix-ui/react-dropdown-menu', version: '2.1.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-popover': { package: '@radix-ui/react-popover', version: '1.1.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-tooltip': { package: '@radix-ui/react-tooltip', version: '1.1.3', external: ['react', 'react-dom'] },
  '@radix-ui/react-tabs': { package: '@radix-ui/react-tabs', version: '1.1.1', external: ['react', 'react-dom'] },
  '@radix-ui/react-select': { package: '@radix-ui/react-select', version: '2.1.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-checkbox': { package: '@radix-ui/react-checkbox', version: '1.1.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-switch': { package: '@radix-ui/react-switch', version: '1.1.1', external: ['react', 'react-dom'] },
  '@radix-ui/react-slider': { package: '@radix-ui/react-slider', version: '1.2.1', external: ['react', 'react-dom'] },
  '@radix-ui/react-slot': { package: '@radix-ui/react-slot', version: '1.1.0', external: ['react', 'react-dom'] },

  // Utilities
  'clsx': { package: 'clsx', version: '2.1.1' },
  'classnames': { package: 'classnames', version: '2.5.1' },
  'tailwind-merge': { package: 'tailwind-merge', version: '2.5.4' },
  'class-variance-authority': { package: 'class-variance-authority', version: '0.7.1' },

  // Date/Time
  'date-fns': { package: 'date-fns', version: '4.1.0' },
  'dayjs': { package: 'dayjs', version: '1.11.13' },

  // HTTP
  'axios': { package: 'axios', version: '1.7.9' },

  // Charts
  'recharts': { package: 'recharts', version: '2.14.1', external: ['react', 'react-dom'] },

  // Tables
  '@tanstack/react-table': { package: '@tanstack/react-table', version: '8.20.5', external: ['react'] },

  // Toast
  'sonner': { package: 'sonner', version: '1.7.0', external: ['react', 'react-dom'] },
  'react-hot-toast': { package: 'react-hot-toast', version: '2.4.1', external: ['react', 'react-dom'] },

  // DnD
  '@dnd-kit/core': { package: '@dnd-kit/core', version: '6.3.1', external: ['react', 'react-dom'] },
  '@dnd-kit/sortable': { package: '@dnd-kit/sortable', version: '10.0.0', external: ['react'] },

  // Carousel
  'swiper': { package: 'swiper', version: '11.1.15' },
  'embla-carousel-react': { package: 'embla-carousel-react', version: '8.5.1', external: ['react'] },

  // Misc
  'uuid': { package: 'uuid', version: '11.0.3' },
  'nanoid': { package: 'nanoid', version: '5.0.9' },
  'lodash': { package: 'lodash', version: '4.17.21' },
  'lodash-es': { package: 'lodash-es', version: '4.17.21' },
  'immer': { package: 'immer', version: '10.1.1' },

  // ═══════════════════════════════════════════════════════════
  // EXPANDED PACKAGE REGISTRY - Additional popular packages
  // ═══════════════════════════════════════════════════════════

  // More Radix UI Components
  '@radix-ui/react-accordion': { package: '@radix-ui/react-accordion', version: '1.2.1', external: ['react', 'react-dom'] },
  '@radix-ui/react-alert-dialog': { package: '@radix-ui/react-alert-dialog', version: '1.1.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-aspect-ratio': { package: '@radix-ui/react-aspect-ratio', version: '1.1.0', external: ['react', 'react-dom'] },
  '@radix-ui/react-avatar': { package: '@radix-ui/react-avatar', version: '1.1.1', external: ['react', 'react-dom'] },
  '@radix-ui/react-collapsible': { package: '@radix-ui/react-collapsible', version: '1.1.1', external: ['react', 'react-dom'] },
  '@radix-ui/react-context-menu': { package: '@radix-ui/react-context-menu', version: '2.2.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-hover-card': { package: '@radix-ui/react-hover-card', version: '1.1.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-label': { package: '@radix-ui/react-label', version: '2.1.0', external: ['react', 'react-dom'] },
  '@radix-ui/react-menubar': { package: '@radix-ui/react-menubar', version: '1.1.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-navigation-menu': { package: '@radix-ui/react-navigation-menu', version: '1.2.1', external: ['react', 'react-dom'] },
  '@radix-ui/react-progress': { package: '@radix-ui/react-progress', version: '1.1.0', external: ['react', 'react-dom'] },
  '@radix-ui/react-radio-group': { package: '@radix-ui/react-radio-group', version: '1.2.1', external: ['react', 'react-dom'] },
  '@radix-ui/react-scroll-area': { package: '@radix-ui/react-scroll-area', version: '1.2.0', external: ['react', 'react-dom'] },
  '@radix-ui/react-separator': { package: '@radix-ui/react-separator', version: '1.1.0', external: ['react', 'react-dom'] },
  '@radix-ui/react-toast': { package: '@radix-ui/react-toast', version: '1.2.2', external: ['react', 'react-dom'] },
  '@radix-ui/react-toggle': { package: '@radix-ui/react-toggle', version: '1.1.0', external: ['react', 'react-dom'] },
  '@radix-ui/react-toggle-group': { package: '@radix-ui/react-toggle-group', version: '1.1.0', external: ['react', 'react-dom'] },

  // Headless UI
  '@headlessui/react': { package: '@headlessui/react', version: '2.2.0', external: ['react', 'react-dom'] },

  // SWR (Data fetching)
  'swr': { package: 'swr', version: '2.2.5', external: ['react'] },

  // React Spring (Animation)
  '@react-spring/web': { package: '@react-spring/web', version: '9.7.5', external: ['react', 'react-dom'] },
  'react-spring': { package: '@react-spring/web', version: '9.7.5', external: ['react', 'react-dom'] },

  // React Use (Hooks collection)
  'react-use': { package: 'react-use', version: '17.5.1', external: ['react', 'react-dom'] },

  // UseHooks-TS
  'usehooks-ts': { package: 'usehooks-ts', version: '3.1.0', external: ['react'] },

  // Markdown/Code
  'react-markdown': { package: 'react-markdown', version: '9.0.1', external: ['react'] },
  'react-syntax-highlighter': { package: 'react-syntax-highlighter', version: '15.6.1', external: ['react'] },
  'remark-gfm': { package: 'remark-gfm', version: '4.0.0' },

  // Media
  'react-player': { package: 'react-player', version: '2.16.0', external: ['react'] },
  'react-dropzone': { package: 'react-dropzone', version: '14.3.5', external: ['react'] },

  // Date Pickers
  'react-day-picker': { package: 'react-day-picker', version: '9.4.3', external: ['react'] },
  'react-datepicker': { package: 'react-datepicker', version: '7.5.0', external: ['react', 'react-dom'] },

  // Select/Combobox
  'react-select': { package: 'react-select', version: '5.8.3', external: ['react', 'react-dom'] },

  // Modals/Drawers
  'vaul': { package: 'vaul', version: '1.1.1', external: ['react', 'react-dom'] },

  // Command Palette
  'cmdk': { package: 'cmdk', version: '1.0.4', external: ['react', 'react-dom'] },

  // Input Masking
  'react-input-mask': { package: 'react-input-mask', version: '2.0.4', external: ['react', 'react-dom'] },
  'react-number-format': { package: 'react-number-format', version: '5.4.2', external: ['react'] },

  // Virtualization
  '@tanstack/react-virtual': { package: '@tanstack/react-virtual', version: '3.10.9', external: ['react', 'react-dom'] },
  'react-virtualized': { package: 'react-virtualized', version: '9.22.5', external: ['react', 'react-dom'] },
  'react-window': { package: 'react-window', version: '1.8.10', external: ['react', 'react-dom'] },

  // Copy to Clipboard
  'react-copy-to-clipboard': { package: 'react-copy-to-clipboard', version: '5.1.0', external: ['react'] },

  // QR Code
  'qrcode.react': { package: 'qrcode.react', version: '4.2.0', external: ['react'] },
  'react-qr-code': { package: 'react-qr-code', version: '2.0.15', external: ['react'] },

  // Confetti
  'react-confetti': { package: 'react-confetti', version: '6.1.0', external: ['react'] },
  'canvas-confetti': { package: 'canvas-confetti', version: '1.9.3' },

  // Error Boundary
  'react-error-boundary': { package: 'react-error-boundary', version: '4.1.2', external: ['react'] },

  // Helmet (SEO)
  'react-helmet-async': { package: 'react-helmet-async', version: '2.0.5', external: ['react', 'react-dom'] },

  // Intersection Observer
  'react-intersection-observer': { package: 'react-intersection-observer', version: '9.13.1', external: ['react'] },

  // Resizable
  'react-resizable-panels': { package: 'react-resizable-panels', version: '2.1.7', external: ['react', 'react-dom'] },
  're-resizable': { package: 're-resizable', version: '6.10.3', external: ['react', 'react-dom'] },

  // Color Picker
  'react-colorful': { package: 'react-colorful', version: '5.6.1', external: ['react', 'react-dom'] },

  // JSON Viewer
  'react-json-view': { package: 'react-json-view', version: '1.21.3', external: ['react', 'react-dom'] },
  '@uiw/react-json-view': { package: '@uiw/react-json-view', version: '2.0.0-alpha.27', external: ['react', 'react-dom'] },

  // PDF
  '@react-pdf/renderer': { package: '@react-pdf/renderer', version: '4.1.5', external: ['react'] },

  // Maps (Note: may need API keys)
  '@react-google-maps/api': { package: '@react-google-maps/api', version: '2.20.3', external: ['react', 'react-dom'] },
  'react-map-gl': { package: 'react-map-gl', version: '7.1.7', external: ['react', 'react-dom'] },

  // Charts (Additional)
  'victory': { package: 'victory', version: '37.3.2', external: ['react'] },
  '@nivo/core': { package: '@nivo/core', version: '0.88.0', external: ['react', 'react-dom'] },
  '@nivo/bar': { package: '@nivo/bar', version: '0.88.0', external: ['react', 'react-dom'] },
  '@nivo/line': { package: '@nivo/line', version: '0.88.0', external: ['react', 'react-dom'] },
  '@nivo/pie': { package: '@nivo/pie', version: '0.88.0', external: ['react', 'react-dom'] },

  // Rich Text Editor
  '@tiptap/react': { package: '@tiptap/react', version: '2.10.4', external: ['react', 'react-dom'] },
  '@tiptap/starter-kit': { package: '@tiptap/starter-kit', version: '2.10.4' },

  // Slider/Range
  'rc-slider': { package: 'rc-slider', version: '11.1.7', external: ['react', 'react-dom'] },

  // Tooltip alternatives
  '@floating-ui/react': { package: '@floating-ui/react', version: '0.26.28', external: ['react', 'react-dom'] },
  'react-tooltip': { package: 'react-tooltip', version: '5.28.0', external: ['react', 'react-dom'] },

  // Icons (Additional sets)
  'react-icons/fa': { package: 'react-icons', version: '5.4.0', subpath: '/fa', external: ['react'] },
  'react-icons/fa6': { package: 'react-icons', version: '5.4.0', subpath: '/fa6', external: ['react'] },
  'react-icons/md': { package: 'react-icons', version: '5.4.0', subpath: '/md', external: ['react'] },
  'react-icons/io': { package: 'react-icons', version: '5.4.0', subpath: '/io', external: ['react'] },
  'react-icons/io5': { package: 'react-icons', version: '5.4.0', subpath: '/io5', external: ['react'] },
  'react-icons/hi': { package: 'react-icons', version: '5.4.0', subpath: '/hi', external: ['react'] },
  'react-icons/hi2': { package: 'react-icons', version: '5.4.0', subpath: '/hi2', external: ['react'] },
  'react-icons/bs': { package: 'react-icons', version: '5.4.0', subpath: '/bs', external: ['react'] },
  'react-icons/ai': { package: 'react-icons', version: '5.4.0', subpath: '/ai', external: ['react'] },
  'react-icons/bi': { package: 'react-icons', version: '5.4.0', subpath: '/bi', external: ['react'] },
  'react-icons/ri': { package: 'react-icons', version: '5.4.0', subpath: '/ri', external: ['react'] },
  'react-icons/fi': { package: 'react-icons', version: '5.4.0', subpath: '/fi', external: ['react'] },
  'react-icons/gi': { package: 'react-icons', version: '5.4.0', subpath: '/gi', external: ['react'] },
  'react-icons/si': { package: 'react-icons', version: '5.4.0', subpath: '/si', external: ['react'] },
  'react-icons/tb': { package: 'react-icons', version: '5.4.0', subpath: '/tb', external: ['react'] },
  'react-icons/lu': { package: 'react-icons', version: '5.4.0', subpath: '/lu', external: ['react'] },

  // Internationalization
  'react-i18next': { package: 'react-i18next', version: '15.1.3', external: ['react'] },
  'i18next': { package: 'i18next', version: '24.0.5' },

  // Validation
  '@hookform/resolvers': { package: '@hookform/resolvers', version: '3.9.1', external: ['react'] },

  // Data utilities
  'match-sorter': { package: 'match-sorter', version: '6.3.4' },
  'fuse.js': { package: 'fuse.js', version: '7.0.0' },
};

/**
 * Build esm.sh URL for a package configuration
 */
export function buildEsmUrl(config: PackageConfig): string {
  let url = `https://esm.sh/${config.package}`;

  if (config.version) {
    url += `@${config.version}`;
  }

  if (config.subpath) {
    url += config.subpath;
  }

  if (config.external && config.external.length > 0) {
    url += `?external=${config.external.join(',')}`;
  }

  return url;
}

/**
 * Try to resolve an unknown package specifier
 */
export function resolveUnknownPackage(specifier: string): string | null {
  // Check registry first
  if (PACKAGE_REGISTRY[specifier]) {
    return buildEsmUrl(PACKAGE_REGISTRY[specifier]);
  }

  // Handle scoped packages (@org/pkg/subpath)
  const parts = specifier.split('/');
  if (specifier.startsWith('@') && parts.length >= 2) {
    const scopedBase = `${parts[0]}/${parts[1]}`;
    if (PACKAGE_REGISTRY[scopedBase]) {
      const config = { ...PACKAGE_REGISTRY[scopedBase] };
      if (parts.length > 2) {
        config.subpath = '/' + parts.slice(2).join('/');
      }
      return buildEsmUrl(config);
    }
    return `https://esm.sh/${specifier}?external=react,react-dom`;
  }

  // Handle regular packages with subpath
  if (parts.length >= 2) {
    const base = parts[0];
    if (base && PACKAGE_REGISTRY[base]) {
      const config = { ...PACKAGE_REGISTRY[base] };
      config.subpath = '/' + parts.slice(1).join('/');
      return buildEsmUrl(config);
    }
  }

  // Skip relative imports
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return null;
  }

  // Skip Node built-ins
  const nodeBuiltins = ['fs', 'path', 'os', 'crypto', 'http', 'https', 'stream', 'util', 'events', 'buffer'];
  if (nodeBuiltins.includes(specifier) || nodeBuiltins.includes(parts[0] ?? '')) {
    return null;
  }

  // Unknown package - try esm.sh
  return `https://esm.sh/${specifier}?external=react,react-dom`;
}

/**
 * Extract all import specifiers from code
 */
export function extractImports(code: string): string[] {
  const imports = new Set<string>();

  const patterns = [
    /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const specifier = match[1];
      if (!specifier || (!specifier.startsWith('.') && !specifier.startsWith('/'))) {
        continue;
      }
      imports.add(specifier);
    }
  }

  return Array.from(imports);
}

/**
 * Analyze files and return required import map entries
 */
export function analyzeFilesForImports(files: Record<string, string>): Record<string, string> {
  const importMap: Record<string, string> = {};
  const allImports = new Set<string>();

  for (const content of Object.values(files)) {
    if (typeof content === 'string') {
      const imports = extractImports(content);
      imports.forEach(imp => allImports.add(imp));
    }
  }

  for (const specifier of allImports) {
    const url = resolveUnknownPackage(specifier);
    if (url) {
      importMap[specifier] = url;
    }
  }

  return importMap;
}

/**
 * Parse bare specifier error and extract module name
 */
export function parseSpecifierError(errorMessage: string): string | null {
  const match = errorMessage.match(/specifier ["']([^"']+)["'] was a bare specifier/i);
  if (match) return match[1] ?? null;

  const altMatch = errorMessage.match(/Failed to resolve module specifier ["']([^"']+)["']/i);
  if (altMatch) return altMatch[1] ?? null;

  return null;
}

/**
 * Get base import map with essential packages
 */
export function getBaseImportMap(): Record<string, string> {
  const base: Record<string, string> = {};
  const essentials = [
    'react', 'react/jsx-runtime', 'react/jsx-dev-runtime',
    'react-dom', 'react-dom/client',
    'lucide-react', 'clsx', 'classnames', 'tailwind-merge',
    'framer-motion', 'motion', 'motion/react',
    'date-fns', 'zustand', 'react-hook-form',
  ];

  for (const pkg of essentials) {
    if (PACKAGE_REGISTRY[pkg]) {
      base[pkg] = buildEsmUrl(PACKAGE_REGISTRY[pkg]);
    }
  }

  return base;
}
