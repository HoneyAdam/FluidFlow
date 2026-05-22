/**
 * CSS Modules Script
 *
 * Provides CSS Modules support for .module.css files in the sandbox.
 * Scopes class names to prevent conflicts and exports class name mappings.
 */

/**
 * Generate the CSS Modules handling script for the sandbox
 */
export function getCssModulesScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // CSS MODULES SUPPORT
    // Scopes class names and exports mappings for .module.css files
    // ═══════════════════════════════════════════════════════════

    (function() {
      // Simple hash function for generating unique suffixes
      function hashString(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        }
        return Math.abs(hash).toString(36).substring(0, 5);
      }

      // Pull out class names from CSS content
      function findClassNames(cssContent) {
        const classNames = new Set();
        // Match class selectors: .className
        const classRegex = /\\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
        let match;
        while ((match = classRegex.exec(cssContent)) !== null) {
          // Skip pseudo-classes and pseudo-elements
          const className = match[1];
          if (!className.match(/^(hover|focus|active|visited|disabled|first-child|last-child|nth-child|before|after|placeholder|checked|required|valid|invalid|empty|not|is|where|has)$/)) {
            classNames.add(className);
          }
        }
        return Array.from(classNames);
      }

      // Generate scoped class name
      function scopeClassName(className, filename) {
        const basename = filename.split('/').pop().replace(/\\.module\\.css$/, '');
        const hash = hashString(filename + className);
        return basename + '_' + className + '__' + hash;
      }

      // Process CSS Modules content
      function processCssModules(cssContent, filename) {
        const classNames = findClassNames(cssContent);
        const mapping = {};
        let scopedCss = cssContent;

        // Create mapping and replace class names
        for (const className of classNames) {
          const scopedName = scopeClassName(className, filename);
          mapping[className] = scopedName;

          // Replace class name in CSS (with word boundary)
          // Match: .className followed by non-alphanumeric or end
          const regex = new RegExp('\\\\.(' + className + ')(?=[^a-zA-Z0-9_-]|$)', 'g');
          scopedCss = scopedCss.replace(regex, '.' + scopedName);
        }

        return { scopedCss, mapping };
      }

      // Expose the CSS Modules processor globally
      window.__CSS_MODULES__ = {
        process: processCssModules,
        findClassNames: findClassNames,
        scopeClassName: scopeClassName,
        hashString: hashString
      };

    })();
  `;
}

/**
 * Process a CSS Module file and return the scoped CSS and class mappings
 * Used during file processing in the sandbox
 */
export function processCssModule(
  cssContent: string,
  filename: string
): { scopedCss: string; mapping: Record<string, string> } {
  const classNames = findClassNames(cssContent);
  const mapping: Record<string, string> = {};
  let scopedCss = cssContent;

  for (const className of classNames) {
    const scopedName = scopeClassName(className, filename);
    mapping[className] = scopedName;

    // Replace class name in CSS
    const regex = new RegExp(`\\.${escapeRegex(className)}(?=[^a-zA-Z0-9_-]|$)`, 'g');
    scopedCss = scopedCss.replace(regex, '.' + scopedName);
  }

  return { scopedCss, mapping };
}

/**
 * Find class names from CSS content
 */
function findClassNames(cssContent: string): string[] {
  const classNames = new Set<string>();
  const classRegex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;

  // Use matchAll to iterate over all matches
  const matches = cssContent.matchAll(classRegex);

  // Skip pseudo-classes
  const pseudoClasses = new Set([
    'hover', 'focus', 'active', 'visited', 'disabled',
    'first-child', 'last-child', 'nth-child', 'before', 'after',
    'placeholder', 'checked', 'required', 'valid', 'invalid',
    'empty', 'not', 'is', 'where', 'has', 'focus-visible', 'focus-within',
    'first-of-type', 'last-of-type', 'only-child', 'only-of-type',
    'nth-of-type', 'nth-last-child', 'nth-last-of-type', 'root', 'target',
    'enabled', 'read-only', 'read-write', 'optional', 'default', 'indeterminate',
    'in-range', 'out-of-range', 'lang', 'dir', 'selection', 'backdrop',
    'marker', 'file-selector-button', 'first-letter', 'first-line'
  ]);

  for (const match of matches) {
    const className = match[1];
    if (className && !pseudoClasses.has(className)) {
      classNames.add(className);
    }
  }

  return Array.from(classNames);
}

/**
 * Generate scoped class name
 */
function scopeClassName(className: string, filename: string): string {
  const basename = filename.split('/').pop()?.replace(/\.module\.css$/, '') || 'module';
  const hash = hashString(filename + className);
  return `${basename}_${className}__${hash}`;
}

/**
 * Simple string hash function
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash).toString(36).substring(0, 5);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
