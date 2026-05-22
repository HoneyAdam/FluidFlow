/**
 * Local Fixes
 *
 * Pattern-based error fixing without AI assistance.
 * Handles common import, syntax, and runtime errors.
 */

import { FileSystem } from '../../types';
import { LocalFixResult, ImportInfo } from './types';

// ============================================================================
// Common Import Mappings
// ============================================================================

const COMMON_IMPORTS: Record<string, ImportInfo> = {
  // React
  React: { from: 'react', isDefault: true },
  useState: { from: 'react' },
  useEffect: { from: 'react' },
  useCallback: { from: 'react' },
  useMemo: { from: 'react' },
  useRef: { from: 'react' },
  useContext: { from: 'react' },
  useReducer: { from: 'react' },
  useLayoutEffect: { from: 'react' },
  useId: { from: 'react' },
  createContext: { from: 'react' },
  forwardRef: { from: 'react' },
  memo: { from: 'react' },
  lazy: { from: 'react' },
  Suspense: { from: 'react' },
  Fragment: { from: 'react' },

  // React Types
  FC: { from: 'react', isType: true },
  ReactNode: { from: 'react', isType: true },
  ReactElement: { from: 'react', isType: true },
  CSSProperties: { from: 'react', isType: true },
  ChangeEvent: { from: 'react', isType: true },
  FormEvent: { from: 'react', isType: true },
  MouseEvent: { from: 'react', isType: true },
  KeyboardEvent: { from: 'react', isType: true },

  // Common Lucide Icons
  Search: { from: 'lucide-react' },
  X: { from: 'lucide-react' },
  Check: { from: 'lucide-react' },
  ChevronDown: { from: 'lucide-react' },
  ChevronUp: { from: 'lucide-react' },
  ChevronLeft: { from: 'lucide-react' },
  ChevronRight: { from: 'lucide-react' },
  Menu: { from: 'lucide-react' },
  Settings: { from: 'lucide-react' },
  User: { from: 'lucide-react' },
  Home: { from: 'lucide-react' },
  Plus: { from: 'lucide-react' },
  Minus: { from: 'lucide-react' },
  Edit: { from: 'lucide-react' },
  Trash: { from: 'lucide-react' },
  Trash2: { from: 'lucide-react' },
  Download: { from: 'lucide-react' },
  Upload: { from: 'lucide-react' },
  Eye: { from: 'lucide-react' },
  EyeOff: { from: 'lucide-react' },
  Lock: { from: 'lucide-react' },
  Info: { from: 'lucide-react' },
  AlertCircle: { from: 'lucide-react' },
  AlertTriangle: { from: 'lucide-react' },
  Loader2: { from: 'lucide-react' },
  RefreshCw: { from: 'lucide-react' },
  Copy: { from: 'lucide-react' },
  ExternalLink: { from: 'lucide-react' },
  Send: { from: 'lucide-react' },
  Play: { from: 'lucide-react' },
  Pause: { from: 'lucide-react' },
  Save: { from: 'lucide-react' },
  Undo: { from: 'lucide-react' },
  Redo: { from: 'lucide-react' },
  Bot: { from: 'lucide-react' },
  Sparkles: { from: 'lucide-react' },
  Code: { from: 'lucide-react' },
  Terminal: { from: 'lucide-react' },

  // Motion/Framer
  motion: { from: 'motion/react' },
  AnimatePresence: { from: 'motion/react' },
  useAnimation: { from: 'motion/react' },
  useMotionValue: { from: 'motion/react' },

  // Utilities
  clsx: { from: 'clsx', isDefault: true },
  cn: { from: 'clsx', isDefault: true },
  axios: { from: 'axios', isDefault: true },
};

// Prop typo corrections
const PROP_TYPOS: Record<string, string> = {
  classname: 'className',
  onclick: 'onClick',
  onchange: 'onChange',
  onsubmit: 'onSubmit',
  onfocus: 'onFocus',
  onblur: 'onBlur',
  onkeydown: 'onKeyDown',
  onkeyup: 'onKeyUp',
  onkeypress: 'onKeyPress',
  onmouseenter: 'onMouseEnter',
  onmouseleave: 'onMouseLeave',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  htmlfor: 'htmlFor',
  srcset: 'srcSet',
  rowspan: 'rowSpan',
  colspan: 'colSpan',
  cellpadding: 'cellPadding',
  cellspacing: 'cellSpacing',
  maxlength: 'maxLength',
  minlength: 'minLength',
  contenteditable: 'contentEditable',
  crossorigin: 'crossOrigin',
  datetime: 'dateTime',
  enctype: 'encType',
  formaction: 'formAction',
  formenctype: 'formEncType',
  formmethod: 'formMethod',
  formnovalidate: 'formNoValidate',
  formtarget: 'formTarget',
  frameborder: 'frameBorder',
  marginheight: 'marginHeight',
  marginwidth: 'marginWidth',
  novalidate: 'noValidate',
  spellcheck: 'spellCheck',
  srcdoc: 'srcDoc',
  usemap: 'useMap',
};

// Self-closing HTML tags
const SELF_CLOSING_TAGS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed',
  'param', 'source', 'track', 'wbr',
]);

// ============================================================================
// Main Fix Functions
// ============================================================================

/**
 * Try all local fixes for an error
 */
export function tryLocalFix(
  errorMessage: string,
  code: string,
  files?: FileSystem
): LocalFixResult {
  const errorLower = errorMessage.toLowerCase();

  // 1. Bare specifier errors (most common)
  if (errorLower.includes('bare specifier') || errorLower.includes('was not remapped')) {
    if (files) {
      const result = tryFixBareSpecifierMultiFile(errorMessage, files);
      if (result.success) return result;
    }
    const result = tryFixBareSpecifier(errorMessage, code);
    if (result.success) return result;
  }

  // 2. Missing imports
  const importFix = tryFixMissingImport(errorMessage, code);
  if (importFix.success) return importFix;

  // 3. Prop typos
  const typoFix = tryFixPropTypo(errorMessage, code);
  if (typoFix.success) return typoFix;

  // 4. React not defined
  if (errorLower.includes('react is not defined')) {
    const result = tryFixMissingReact(code);
    if (result.success) return result;
  }

  // 5. JSX issues
  const jsxFix = tryFixJSXIssues(errorMessage, code);
  if (jsxFix.success) return jsxFix;

  // 6. Missing brackets
  const bracketFix = tryFixMissingClosing(errorMessage, code);
  if (bracketFix.success) return bracketFix;

  // 7. Runtime errors (optional chaining)
  const runtimeFix = tryFixRuntimeError(errorMessage, code);
  if (runtimeFix.success) return runtimeFix;

  // 8. Variable typos
  const varFix = tryFixUndefinedVariable(errorMessage, code);
  if (varFix.success) return varFix;

  // 9. Missing exports (non-existent icons, etc.)
  const exportFix = tryFixMissingExport(errorMessage, code);
  if (exportFix.success) return exportFix;

  // 10. Missing arrow in arrow functions (e.g., .map(f { → .map(f => {)
  const arrowFix = tryFixMissingArrow(errorMessage, code);
  if (arrowFix.success) return arrowFix;

  return noFix();
}

/**
 * Multi-file bare specifier fix
 */
export function tryFixBareSpecifierMultiFile(
  errorMessage: string,
  files: FileSystem
): LocalFixResult {
  const bareSpecifier = extractBareSpecifier(errorMessage);
  if (!bareSpecifier) return noFix();

  const multiFileChanges: Record<string, string> = {};
  let totalFixes = 0;
  const bareWithoutExt = bareSpecifier.replace(/\.(tsx?|jsx?)$/, '');

  for (const [filePath, content] of Object.entries(files)) {
    if (!content || !filePath.match(/\.(tsx?|jsx?)$/)) continue;

    const patterns = [bareSpecifier, bareWithoutExt];
    let newContent = content;
    let fileModified = false;

    for (const pattern of patterns) {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(
        `(import\\s+(?:[\\w,{}\\s*]+)\\s+from\\s*)(['"])${escaped}\\2`,
        'g'
      );

      if (regex.test(newContent)) {
        const relativePath = calculateRelativeImportPath(filePath, bareSpecifier);
        regex.lastIndex = 0;
        newContent = newContent.replace(regex, `$1$2${relativePath}$2`);
        fileModified = true;
      }
    }

    if (fileModified && newContent !== content) {
      multiFileChanges[filePath] = newContent;
      totalFixes++;
    }
  }

  if (totalFixes > 0) {
    return {
      success: true,
      fixedFiles: multiFileChanges,
      description: `Fixed bare specifier in ${totalFixes} file(s)`,
      fixType: 'bare-specifier',
    };
  }

  return noFix();
}

// ============================================================================
// Individual Fix Functions
// ============================================================================

function tryFixBareSpecifier(errorMessage: string, code: string): LocalFixResult {
  const bareSpecifier = extractBareSpecifier(errorMessage);
  if (!bareSpecifier) return noFix();

  let relativePath = bareSpecifier.replace(/^src\//, './');
  relativePath = relativePath.replace(/\.(tsx?|jsx?)$/, '');

  const patterns = [bareSpecifier, bareSpecifier.replace(/\.(tsx?|jsx?)$/, '')];

  for (const pattern of patterns) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(import\\s+(?:[\\w,{}\\s*]+)\\s+from\\s*)(['"])${escaped}\\2`,
      'g'
    );

    if (regex.test(code)) {
      regex.lastIndex = 0;
      const newCode = code.replace(regex, `$1$2${relativePath}$2`);
      if (newCode !== code) {
        return {
          success: true,
          fixedFiles: { 'current': newCode },
          description: `Fixed import: "${bareSpecifier}" → "${relativePath}"`,
          fixType: 'bare-specifier',
        };
      }
    }
  }

  return noFix();
}

function tryFixMissingImport(errorMessage: string, code: string): LocalFixResult {
  const patterns = [
    /['"]?(\w+)['"]?\s+is not defined/i,
    /cannot find name\s+['"]?(\w+)['"]?/i,
    /ReferenceError:\s*['"]?(\w+)['"]?\s+is not defined/i,
  ];

  let identifier: string | null = null;
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      identifier = match[1] ?? null;
      break;
    }
  }

  if (!identifier) return noFix();

  // Check if already imported
  if (isAlreadyImported(code, identifier)) return noFix();

  // Check known imports
  const importInfo = COMMON_IMPORTS[identifier];
  if (!importInfo) return noFix();

  const newCode = addImport(code, identifier, importInfo);
  return {
    success: true,
    fixedFiles: { 'current': newCode },
    description: `Added import: ${identifier} from '${importInfo.from}'`,
    fixType: 'missing-import',
  };
}

function tryFixPropTypo(errorMessage: string, code: string): LocalFixResult {
  const invalidPropMatch =
    errorMessage.match(/invalid dom property ['"`](\w+)['"`]/i) ||
    errorMessage.match(/react does not recognize the ['"`](\w+)['"`] prop/i);

  if (invalidPropMatch) {
    const wrongProp = invalidPropMatch[1] ?? '';
    const correctProp = PROP_TYPOS[wrongProp.toLowerCase()];

    if (correctProp && wrongProp !== correctProp) {
      const regex = new RegExp(`\\b${wrongProp}\\s*=`, 'g');
      const newCode = code.replace(regex, `${correctProp}=`);

      if (newCode !== code) {
        return {
          success: true,
          fixedFiles: { 'current': newCode },
          description: `Fixed prop: ${wrongProp} → ${correctProp}`,
          fixType: 'typo',
        };
      }
    }
  }

  return noFix();
}

function tryFixMissingReact(code: string): LocalFixResult {
  if (/import\s+React/i.test(code) || /import\s*\*\s*as\s*React/i.test(code)) {
    return noFix();
  }

  const newCode = `import React from 'react';\n${code}`;
  return {
    success: true,
    fixedFiles: { 'current': newCode },
    description: 'Added React import',
    fixType: 'missing-import',
  };
}

function tryFixJSXIssues(errorMessage: string, code: string): LocalFixResult {
  const errorLower = errorMessage.toLowerCase();

  // Adjacent JSX elements
  if (errorLower.includes('adjacent jsx elements') || errorLower.includes('must be wrapped')) {
    const returnMatch = code.match(/return\s*\(\s*\n?([\s\S]*?)\s*\);?\s*$/m);
    if (returnMatch) {
      const jsxContent = (returnMatch[1] ?? '').trim();
      if (!jsxContent.startsWith('<>') && !jsxContent.startsWith('<Fragment')) {
        const wrappedJsx = `<>\n      ${jsxContent}\n    </>`;
        const newCode = code.replace(returnMatch[0], `return (\n    ${wrappedJsx}\n  );`);
        if (newCode !== code) {
          return {
            success: true,
            fixedFiles: { 'current': newCode },
            description: 'Wrapped JSX in Fragment',
            fixType: 'jsx',
          };
        }
      }
    }
  }

  // Self-closing tags
  for (const tag of SELF_CLOSING_TAGS) {
    const badPattern = new RegExp(`<${tag}(\\s[^>]*)?>\\s*<\\/${tag}>`, 'gi');
    if (badPattern.test(code)) {
      const newCode = code.replace(badPattern, `<${tag}$1 />`);
      return {
        success: true,
        fixedFiles: { 'current': newCode },
        description: `Fixed self-closing <${tag} />`,
        fixType: 'jsx',
      };
    }
  }

  return noFix();
}

function tryFixMissingClosing(errorMessage: string, code: string): LocalFixResult {
  const counts = countBrackets(code);
  const fixes: string[] = [];
  let newCode = code;

  if (counts['('] > counts[')']) {
    const missing = counts['('] - counts[')'];
    newCode = newCode.trimEnd() + ')'.repeat(missing);
    fixes.push(`${missing} closing )`);
  }

  if (counts['{'] > counts['}']) {
    const missing = counts['{'] - counts['}'];
    newCode = newCode.trimEnd() + '\n' + '}'.repeat(missing);
    fixes.push(`${missing} closing }`);
  }

  if (counts['['] > counts[']']) {
    const missing = counts['['] - counts[']'];
    newCode = newCode.trimEnd() + ']'.repeat(missing);
    fixes.push(`${missing} closing ]`);
  }

  if (fixes.length > 0 && newCode !== code) {
    return {
      success: true,
      fixedFiles: { 'current': newCode },
      description: `Added: ${fixes.join(', ')}`,
      fixType: 'syntax',
    };
  }

  return noFix();
}

function tryFixRuntimeError(errorMessage: string, code: string): LocalFixResult {
  const propMatch =
    errorMessage.match(/cannot read propert(?:y|ies) (?:of (?:undefined|null) \(reading )?['"](\w+)['"]/i) ||
    errorMessage.match(/cannot read ['"](\w+)['"] of (?:undefined|null)/i);

  if (propMatch) {
    const propName = propMatch[1];
    const accessPatterns = [
      new RegExp(`(\\b\\w+)\\s*\\.\\s*${propName}\\b`, 'g'),
      new RegExp(`(\\b\\w+(?:\\.\\w+)+)\\s*\\.\\s*${propName}\\b`, 'g'),
    ];

    let newCode = code;
    let fixed = false;

    for (const pattern of accessPatterns) {
      newCode = newCode.replace(pattern, (match, prefix) => {
        if (match.includes('?.')) return match;
        if (/^(const|let|var|function)\s/.test(prefix)) return match;
        fixed = true;
        return `${prefix}?.${propName}`;
      });
    }

    if (fixed && newCode !== code) {
      return {
        success: true,
        fixedFiles: { 'current': newCode },
        description: `Added optional chaining for '${propName}'`,
        fixType: 'runtime',
      };
    }
  }

  return noFix();
}

function tryFixUndefinedVariable(errorMessage: string, code: string): LocalFixResult {
  const match = errorMessage.match(/['"]?(\w+)['"]?\s+is not defined/i);
  if (!match) return noFix();

  const undefinedVar = match[1];
  if (!undefinedVar) return noFix();

  // Skip if it's a known import we couldn't find
  if (COMMON_IMPORTS[undefinedVar]) return noFix();

  const definedVars = extractDefinedVariables(code);
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const definedVar of definedVars) {
    if (definedVar === undefinedVar) continue;
    const score = similarity(undefinedVar, definedVar);
    if (score > bestScore && score > 0.6) {
      bestScore = score;
      bestMatch = definedVar;
    }
  }

  if (bestMatch) {
    const replaceRegex = new RegExp(`\\b${undefinedVar}\\b`, 'g');
    const newCode = code.replace(replaceRegex, bestMatch);
    if (newCode !== code) {
      return {
        success: true,
        fixedFiles: { 'current': newCode },
        description: `Fixed typo: ${undefinedVar} → ${bestMatch}`,
        fixType: 'typo',
      };
    }
  }

  return noFix();
}

// Known export corrections for common libraries
const EXPORT_CORRECTIONS: Record<string, Record<string, string>> = {
  // @react-three/drei
  '@react-three/drei': {
    'TextView': 'Text',
    'Text3d': 'Text3D',
    'OrbitControl': 'OrbitControls',
    'TransformControl': 'TransformControls',
    'Enviroment': 'Environment',
    'Enviroments': 'Environment',
  },
  // motion/framer-motion
  'motion/react': {
    'Motion': 'motion',
  },
  'framer-motion': {
    'Motion': 'motion',
  },
  // react-router
  'react-router': {
    'Router': 'BrowserRouter',
    'Switch': 'Routes',
    'Redirect': 'Navigate',
    'useHistory': 'useNavigate',
  },
  'react-router-dom': {
    'Router': 'BrowserRouter',
    'Switch': 'Routes',
    'Redirect': 'Navigate',
    'useHistory': 'useNavigate',
  },
};

// Fallback icon for non-existent lucide-react icons
const LUCIDE_FALLBACK_ICON = 'CircleHelp';

// Known valid lucide icons (partial list for quick validation)
const KNOWN_LUCIDE_ICONS = new Set([
  'Search', 'X', 'Check', 'ChevronDown', 'ChevronUp', 'ChevronLeft', 'ChevronRight',
  'Menu', 'Settings', 'User', 'Home', 'Plus', 'Minus', 'Edit', 'Trash', 'Trash2',
  'Download', 'Upload', 'Eye', 'EyeOff', 'Lock', 'Info', 'AlertCircle', 'AlertTriangle',
  'Loader2', 'RefreshCw', 'Copy', 'ExternalLink', 'Send', 'Play', 'Pause', 'Save',
  'Undo', 'Redo', 'Bot', 'Sparkles', 'Code', 'Terminal', 'Heart', 'Star', 'Mail',
  'Phone', 'Calendar', 'Clock', 'MapPin', 'Image', 'File', 'Folder', 'Link', 'Share',
  'Filter', 'MoreHorizontal', 'MoreVertical', 'ArrowUp', 'ArrowDown', 'ArrowLeft',
  'ArrowRight', 'LogIn', 'LogOut', 'Bell', 'Sun', 'Moon', 'Zap', 'Coffee', 'Music',
  'Camera', 'Video', 'Mic', 'Volume2', 'VolumeX', 'Wifi', 'Battery', 'Power',
  'CircleHelp', 'HelpCircle', 'CircleAlert', 'CircleCheck', 'CircleX', 'Circle',
  'Square', 'Triangle', 'Hexagon', 'Octagon', 'Diamond', 'Shield', 'Flag',
  'Bookmark', 'Tag', 'Hash', 'AtSign', 'Globe', 'Languages', 'Palette', 'Wand2',
  'Wrench', 'Hammer', 'Scissors', 'Pen', 'Pencil', 'Eraser', 'Lightbulb', 'Target',
  'Award', 'Trophy', 'Crown', 'Gift', 'Package', 'ShoppingCart', 'ShoppingBag',
  'CreditCard', 'Wallet', 'DollarSign', 'Euro', 'Bitcoin', 'TrendingUp', 'TrendingDown',
  'BarChart', 'PieChart', 'LineChart', 'Activity', 'Cpu', 'Database', 'Server',
  'HardDrive', 'Monitor', 'Smartphone', 'Tablet', 'Laptop', 'Watch', 'Headphones',
  'Speaker', 'Printer', 'Keyboard', 'Mouse', 'Gamepad', 'Github', 'Twitter', 'Facebook',
  'Instagram', 'Linkedin', 'Youtube', 'Twitch', 'MessageSquare', 'MessageCircle',
  'Megaphone', 'Rss', 'Radio', 'Podcast', 'Tv', 'Film', 'Clapperboard', 'Popcorn',
  'Car', 'Bus', 'Train', 'Plane', 'Rocket', 'Ship', 'Bike', 'Footprints',
]);

function tryFixMissingExport(errorMessage: string, code: string): LocalFixResult {
  // Pattern: doesn't provide an export named: 'IconName'
  const match = errorMessage.match(
    /(?:module\s+['"]([^'"]+)['"]\s+)?does(?:n't| not) provide an export named[:\s]+['"]?(\w+)['"]?/i
  );

  if (!match) return noFix();

  const modulePath = match[1] || '';
  const wrongExport = match[2];
  if (!wrongExport) return noFix();

  // Detect library from module path or import in code
  let libraryName = '';
  for (const lib of Object.keys(EXPORT_CORRECTIONS)) {
    if (modulePath.includes(lib)) {
      libraryName = lib;
      break;
    }
  }

  // Check for lucide-react
  const isLucide = modulePath.includes('lucide-react') ||
    /import\s*{[^}]*\b${wrongExport}\b[^}]*}\s*from\s*['"]lucide-react['"]/.test(code);

  // If it's lucide-react and the icon doesn't exist, replace with fallback
  if (isLucide || modulePath.includes('lucide-react')) {
    if (!KNOWN_LUCIDE_ICONS.has(wrongExport)) {
      // Replace the non-existent icon with fallback in imports and usages
      const importRegex = new RegExp(
        `(import\\s*{[^}]*)\\b${wrongExport}\\b([^}]*}\\s*from\\s*['"]lucide-react['"])`,
        'g'
      );

      let newCode = code.replace(importRegex, (match, before, after) => {
        // Check if fallback is already imported
        if (before.includes(LUCIDE_FALLBACK_ICON)) {
          // Just remove the non-existent icon
          return before.replace(new RegExp(`,?\\s*${wrongExport}\\s*,?`), '') + after;
        }
        // Replace with fallback
        return before.replace(wrongExport, LUCIDE_FALLBACK_ICON) + after;
      });

      // Also replace usages in JSX
      const usageRegex = new RegExp(`<${wrongExport}(\\s|\\/)`, 'g');
      newCode = newCode.replace(usageRegex, `<${LUCIDE_FALLBACK_ICON}$1`);

      // Replace closing tags if any
      const closingRegex = new RegExp(`</${wrongExport}>`, 'g');
      newCode = newCode.replace(closingRegex, `</${LUCIDE_FALLBACK_ICON}>`);

      if (newCode !== code) {
        return {
          success: true,
          fixedFiles: { 'current': newCode },
          description: `Replaced non-existent icon "${wrongExport}" with "${LUCIDE_FALLBACK_ICON}"`,
          fixType: 'missing-export',
        };
      }
    }
  }

  // Check for known corrections in other libraries
  const correctExport = libraryName ? EXPORT_CORRECTIONS[libraryName]?.[wrongExport] : undefined;
  if (correctExport) {

    // Replace in imports
    const importRegex = new RegExp(
      `(import\\s*{[^}]*)\\b${wrongExport}\\b([^}]*}\\s*from\\s*['"]${libraryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"])`,
      'g'
    );

    let newCode = code.replace(importRegex, `$1${correctExport}$2`);

    // Replace usages
    const usageRegex = new RegExp(`\\b${wrongExport}\\b`, 'g');
    newCode = newCode.replace(usageRegex, correctExport);

    if (newCode !== code) {
      return {
        success: true,
        fixedFiles: { 'current': newCode },
        description: `Fixed export: "${wrongExport}" → "${correctExport}"`,
        fixType: 'missing-export',
      };
    }
  }

  return noFix();
}

function tryFixMissingArrow(errorMessage: string, code: string): LocalFixResult {
  const errorLower = errorMessage.toLowerCase();

  // Check for syntax errors that might indicate missing arrow
  if (
    !errorLower.includes('unexpected token') &&
    !errorLower.includes('expected') &&
    !errorLower.includes('did not expect')
  ) {
    return noFix();
  }

  // Fix patterns like: .map(f { → .map(f => {
  let newCode = code;
  let fixed = false;

  // Fix arrow function declaration missing arrow: (params): type { → (params): type => {
  // Pattern: const foo = (x: type): returnType { → const foo = (x: type): returnType => {
  newCode = newCode.replace(
    /(\w+\s*=\s*\([^)]*\)\s*:\s*\w+(?:\[\])?)\s*(\{)/g,
    (match, signature, brace) => {
      if (match.includes('=>')) return match;
      fixed = true;
      return `${signature} =>${brace}`;
    }
  );

  // Fix single param pattern: .map(f { → .map(f => {
  newCode = newCode.replace(
    /(\.\w+\s*\(\s*)(\w+)(\s*\{)/g,
    (match, before, param, brace) => {
      // Skip if it's already an arrow function or object destructuring in params
      if (match.includes('=>')) return match;
      fixed = true;
      return `${before}${param} =>${brace}`;
    }
  );

  // Fix multi-param pattern: .reduce((acc, val) { → .reduce((acc, val) => {
  newCode = newCode.replace(
    /(\.\w+\s*\(\s*\([^)]+\))(\s*\{)/g,
    (match, params, brace) => {
      if (match.includes('=>')) return match;
      fixed = true;
      return `${params} =>${brace}`;
    }
  );

  // Fix destructured param: .map(({ id }) { → .map(({ id }) => {
  newCode = newCode.replace(
    /(\.\w+\s*\(\s*)(\{[^}]+\})(\s*\{)/g,
    (match, before, destructure, brace) => {
      if (match.includes('=>')) return match;
      // Make sure it's a destructured param, not an object literal
      if (/^\.\w+\s*\(\s*\{/.test(match)) {
        fixed = true;
        return `${before}(${destructure}) =>${brace}`;
      }
      return match;
    }
  );

  if (fixed && newCode !== code) {
    return {
      success: true,
      fixedFiles: { 'current': newCode },
      description: 'Fixed missing arrow (=>) in arrow function',
      fixType: 'syntax',
    };
  }

  return noFix();
}

// ============================================================================
// Helper Functions
// ============================================================================

function noFix(): LocalFixResult {
  return {
    success: false,
    fixedFiles: {},
    description: '',
    fixType: 'none',
  };
}

function extractBareSpecifier(errorMessage: string): string | null {
  const patterns = [
    /["']?(src\/[\w./-]+)["']?\s*was a bare specifier/i,
    /["']?(src\/[\w./-]+)["']?\s*was not remapped/i,
    /specifier\s*["'](src\/[\w./-]+)["']/i,
    /cannot find module\s*["'](src\/[\w./-]+)["']/i,
    /failed to resolve\s*["'](src\/[\w./-]+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) return match[1] ?? null;
  }
  return null;
}

function calculateRelativeImportPath(fromFile: string, bareSpecifier: string): string {
  const fromParts = fromFile.replace(/\\/g, '/').split('/');
  fromParts.pop();

  const toPath = bareSpecifier.replace(/^src\//, '');
  const toPathWithoutExt = toPath.replace(/\.(tsx?|jsx?)$/, '');
  const toParts = toPathWithoutExt.split('/');

  const fromDir = fromParts.filter(p => p && p !== 'src');
  const toDir = toParts.slice(0, -1);
  const toFile = toParts[toParts.length - 1];

  let commonLength = 0;
  for (let i = 0; i < Math.min(fromDir.length, toDir.length); i++) {
    if (fromDir[i] === toDir[i]) {
      commonLength++;
    } else {
      break;
    }
  }

  const upCount = fromDir.length - commonLength;
  const downPath = [...toDir.slice(commonLength), toFile];

  if (upCount === 0) {
    return './' + downPath.join('/');
  } else {
    return '../'.repeat(upCount) + downPath.join('/');
  }
}

function isAlreadyImported(code: string, identifier: string): boolean {
  return [
    new RegExp(`import\\s*{[^}]*\\b${identifier}\\b[^}]*}\\s*from`),
    new RegExp(`import\\s+${identifier}\\s+from`),
    new RegExp(`import\\s*\\*\\s*as\\s+${identifier}\\s+from`),
  ].some(pattern => pattern.test(code));
}

function addImport(code: string, identifier: string, info: ImportInfo): string {
  // Check for existing import from same source
  const existingRegex = new RegExp(
    `import\\s*{([^}]*)}\\s*from\\s*['"]${info.from}['"]`
  );
  const existingMatch = code.match(existingRegex);

  if (existingMatch && !info.isDefault) {
    const currentImports = (existingMatch[1] ?? '').trim();
    const newImports = currentImports ? `${currentImports}, ${identifier}` : identifier;
    return code.replace(existingRegex, `import { ${newImports} } from '${info.from}'`);
  }

  // Create new import statement
  let importStatement: string;
  if (info.isDefault) {
    importStatement = `import ${identifier} from '${info.from}';\n`;
  } else if (info.isType) {
    importStatement = `import type { ${identifier} } from '${info.from}';\n`;
  } else {
    importStatement = `import { ${identifier} } from '${info.from}';\n`;
  }

  // Insert after last import
  const lastImportMatch = code.match(/^(import\s+.+from\s+['"][^'"]+['"];?\s*\n?)+/m);
  if (lastImportMatch && lastImportMatch.index !== undefined) {
    const pos = lastImportMatch.index + lastImportMatch[0].length;
    return code.slice(0, pos) + importStatement + code.slice(pos);
  }

  return importStatement + code;
}

type BracketChar = '(' | ')' | '{' | '}' | '[' | ']';
type BracketCounts = Record<BracketChar, number>;

function isBracketChar(c: string): c is BracketChar {
  return c === '(' || c === ')' || c === '{' || c === '}' || c === '[' || c === ']';
}

function countBrackets(code: string): BracketCounts {
  const counts: BracketCounts = { '(': 0, ')': 0, '{': 0, '}': 0, '[': 0, ']': 0 };
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === undefined) continue;
    const nextChar = code[i + 1] || '';
    const prevChar = i > 0 ? code[i - 1] : '';

    // Comments
    if (!inString && !inBlockComment && char === '/' && nextChar === '/') {
      inLineComment = true;
      continue;
    }
    if (inLineComment && char === '\n') {
      inLineComment = false;
      continue;
    }
    if (!inString && !inLineComment && char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false;
      i++;
      continue;
    }
    if (inLineComment || inBlockComment) continue;

    // Strings
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString && isBracketChar(char)) {
      counts[char]++;
    }
  }

  return counts;
}

function extractDefinedVariables(code: string): string[] {
  const vars: string[] = [];

  for (const match of code.matchAll(/(const|let|var)\s+(\w+)/g)) {
    if (match[2]) vars.push(match[2]);
  }
  for (const match of code.matchAll(/function\s+(\w+)/g)) {
    if (match[1]) vars.push(match[1]);
  }
  for (const match of code.matchAll(/const\s+\[(\w+),\s*(\w+)\]/g)) {
    if (match[1]) vars.push(match[1]);
    if (match[2]) vars.push(match[2]);
  }

  return [...new Set(vars)];
}

function similarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const s1Lower = s1.toLowerCase();
  const s2Lower = s2.toLowerCase();

  if (s1Lower === s2Lower) return 0.95;

  const chars1 = new Set(s1Lower);
  const chars2 = new Set(s2Lower);
  let common = 0;
  for (const c of chars1) {
    if (chars2.has(c)) common++;
  }

  const unionSize = new Set([...chars1, ...chars2]).size;
  const charSimilarity = common / unionSize;
  const lengthSimilarity = 1 - Math.abs(s1.length - s2.length) / Math.max(s1.length, s2.length);

  let prefixLength = 0;
  for (let i = 0; i < Math.min(s1Lower.length, s2Lower.length); i++) {
    if (s1Lower[i] === s2Lower[i]) prefixLength++;
    else break;
  }
  const prefixBonus = (prefixLength / Math.max(s1.length, s2.length)) * 0.2;

  return charSimilarity * 0.5 + lengthSimilarity * 0.3 + prefixBonus;
}

// ============================================================================
// Exports
// ============================================================================

export { COMMON_IMPORTS, PROP_TYPOS, SELF_CLOSING_TAGS };
