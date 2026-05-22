/**
 * Tailwind CSS Parser
 *
 * Parses Tailwind CSS classes and provides descriptions and CSS equivalents.
 */

export type TailwindCategory =
  | 'layout'
  | 'flexbox'
  | 'grid'
  | 'spacing'
  | 'sizing'
  | 'typography'
  | 'colors'
  | 'borders'
  | 'effects'
  | 'transforms'
  | 'interactivity'
  | 'other';

export interface TailwindClassInfo {
  className: string;
  category: TailwindCategory;
  description: string;
  cssEquivalent: string;
}

// Regex match-group accessors. Under noUncheckedIndexedAccess match[i] is
// string | undefined, but here every capture group is itself \d+ / a literal
// alternation — so when the regex matches, the slot is guaranteed defined.
// These narrow the union so the file stays clean under strictNullChecks.
function num(m: RegExpMatchArray, i: number): number {
  return parseInt(m[i] ?? '0', 10);
}
function str(m: RegExpMatchArray, i: number): string {
  return m[i] ?? '';
}

// Common Tailwind class patterns
const TAILWIND_PATTERNS: Record<string, { category: TailwindCategory; descFn: (value: string) => string; cssFn: (value: string) => string }> = {
  // Layout
  'block': { category: 'layout', descFn: () => 'Display block', cssFn: () => 'display: block' },
  'inline-block': { category: 'layout', descFn: () => 'Display inline-block', cssFn: () => 'display: inline-block' },
  'inline': { category: 'layout', descFn: () => 'Display inline', cssFn: () => 'display: inline' },
  'flex': { category: 'flexbox', descFn: () => 'Display flex', cssFn: () => 'display: flex' },
  'inline-flex': { category: 'flexbox', descFn: () => 'Display inline-flex', cssFn: () => 'display: inline-flex' },
  'grid': { category: 'grid', descFn: () => 'Display grid', cssFn: () => 'display: grid' },
  'hidden': { category: 'layout', descFn: () => 'Hidden element', cssFn: () => 'display: none' },

  // Position
  'static': { category: 'layout', descFn: () => 'Position static', cssFn: () => 'position: static' },
  'fixed': { category: 'layout', descFn: () => 'Position fixed', cssFn: () => 'position: fixed' },
  'absolute': { category: 'layout', descFn: () => 'Position absolute', cssFn: () => 'position: absolute' },
  'relative': { category: 'layout', descFn: () => 'Position relative', cssFn: () => 'position: relative' },
  'sticky': { category: 'layout', descFn: () => 'Position sticky', cssFn: () => 'position: sticky' },

  // Flexbox
  'flex-row': { category: 'flexbox', descFn: () => 'Flex direction row', cssFn: () => 'flex-direction: row' },
  'flex-col': { category: 'flexbox', descFn: () => 'Flex direction column', cssFn: () => 'flex-direction: column' },
  'flex-wrap': { category: 'flexbox', descFn: () => 'Flex wrap', cssFn: () => 'flex-wrap: wrap' },
  'flex-nowrap': { category: 'flexbox', descFn: () => 'Flex no wrap', cssFn: () => 'flex-wrap: nowrap' },
  'flex-1': { category: 'flexbox', descFn: () => 'Flex grow and shrink', cssFn: () => 'flex: 1 1 0%' },
  'flex-auto': { category: 'flexbox', descFn: () => 'Flex auto', cssFn: () => 'flex: 1 1 auto' },
  'flex-none': { category: 'flexbox', descFn: () => 'Flex none', cssFn: () => 'flex: none' },
  'grow': { category: 'flexbox', descFn: () => 'Flex grow', cssFn: () => 'flex-grow: 1' },
  'shrink': { category: 'flexbox', descFn: () => 'Flex shrink', cssFn: () => 'flex-shrink: 1' },

  // Alignment
  'items-start': { category: 'flexbox', descFn: () => 'Align items start', cssFn: () => 'align-items: flex-start' },
  'items-center': { category: 'flexbox', descFn: () => 'Align items center', cssFn: () => 'align-items: center' },
  'items-end': { category: 'flexbox', descFn: () => 'Align items end', cssFn: () => 'align-items: flex-end' },
  'items-stretch': { category: 'flexbox', descFn: () => 'Align items stretch', cssFn: () => 'align-items: stretch' },
  'justify-start': { category: 'flexbox', descFn: () => 'Justify start', cssFn: () => 'justify-content: flex-start' },
  'justify-center': { category: 'flexbox', descFn: () => 'Justify center', cssFn: () => 'justify-content: center' },
  'justify-end': { category: 'flexbox', descFn: () => 'Justify end', cssFn: () => 'justify-content: flex-end' },
  'justify-between': { category: 'flexbox', descFn: () => 'Justify space between', cssFn: () => 'justify-content: space-between' },
  'justify-around': { category: 'flexbox', descFn: () => 'Justify space around', cssFn: () => 'justify-content: space-around' },
  'justify-evenly': { category: 'flexbox', descFn: () => 'Justify space evenly', cssFn: () => 'justify-content: space-evenly' },

  // Sizing
  'w-full': { category: 'sizing', descFn: () => 'Width 100%', cssFn: () => 'width: 100%' },
  'w-screen': { category: 'sizing', descFn: () => 'Width 100vw', cssFn: () => 'width: 100vw' },
  'w-auto': { category: 'sizing', descFn: () => 'Width auto', cssFn: () => 'width: auto' },
  'h-full': { category: 'sizing', descFn: () => 'Height 100%', cssFn: () => 'height: 100%' },
  'h-screen': { category: 'sizing', descFn: () => 'Height 100vh', cssFn: () => 'height: 100vh' },
  'h-auto': { category: 'sizing', descFn: () => 'Height auto', cssFn: () => 'height: auto' },
  'min-h-screen': { category: 'sizing', descFn: () => 'Min height 100vh', cssFn: () => 'min-height: 100vh' },
  'min-w-full': { category: 'sizing', descFn: () => 'Min width 100%', cssFn: () => 'min-width: 100%' },
  'max-w-full': { category: 'sizing', descFn: () => 'Max width 100%', cssFn: () => 'max-width: 100%' },

  // Typography
  'text-left': { category: 'typography', descFn: () => 'Text align left', cssFn: () => 'text-align: left' },
  'text-center': { category: 'typography', descFn: () => 'Text align center', cssFn: () => 'text-align: center' },
  'text-right': { category: 'typography', descFn: () => 'Text align right', cssFn: () => 'text-align: right' },
  'text-justify': { category: 'typography', descFn: () => 'Text align justify', cssFn: () => 'text-align: justify' },
  'font-thin': { category: 'typography', descFn: () => 'Font weight 100', cssFn: () => 'font-weight: 100' },
  'font-light': { category: 'typography', descFn: () => 'Font weight 300', cssFn: () => 'font-weight: 300' },
  'font-normal': { category: 'typography', descFn: () => 'Font weight 400', cssFn: () => 'font-weight: 400' },
  'font-medium': { category: 'typography', descFn: () => 'Font weight 500', cssFn: () => 'font-weight: 500' },
  'font-semibold': { category: 'typography', descFn: () => 'Font weight 600', cssFn: () => 'font-weight: 600' },
  'font-bold': { category: 'typography', descFn: () => 'Font weight 700', cssFn: () => 'font-weight: 700' },
  'italic': { category: 'typography', descFn: () => 'Font style italic', cssFn: () => 'font-style: italic' },
  'not-italic': { category: 'typography', descFn: () => 'Font style normal', cssFn: () => 'font-style: normal' },
  'uppercase': { category: 'typography', descFn: () => 'Text uppercase', cssFn: () => 'text-transform: uppercase' },
  'lowercase': { category: 'typography', descFn: () => 'Text lowercase', cssFn: () => 'text-transform: lowercase' },
  'capitalize': { category: 'typography', descFn: () => 'Text capitalize', cssFn: () => 'text-transform: capitalize' },
  'truncate': { category: 'typography', descFn: () => 'Truncate with ellipsis', cssFn: () => 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap' },
  'underline': { category: 'typography', descFn: () => 'Text underline', cssFn: () => 'text-decoration: underline' },
  'line-through': { category: 'typography', descFn: () => 'Text line-through', cssFn: () => 'text-decoration: line-through' },
  'no-underline': { category: 'typography', descFn: () => 'No text decoration', cssFn: () => 'text-decoration: none' },

  // Borders
  'border': { category: 'borders', descFn: () => 'Border 1px', cssFn: () => 'border-width: 1px' },
  'border-0': { category: 'borders', descFn: () => 'Border 0', cssFn: () => 'border-width: 0px' },
  'border-2': { category: 'borders', descFn: () => 'Border 2px', cssFn: () => 'border-width: 2px' },
  'border-4': { category: 'borders', descFn: () => 'Border 4px', cssFn: () => 'border-width: 4px' },
  'border-solid': { category: 'borders', descFn: () => 'Border solid', cssFn: () => 'border-style: solid' },
  'border-dashed': { category: 'borders', descFn: () => 'Border dashed', cssFn: () => 'border-style: dashed' },
  'border-dotted': { category: 'borders', descFn: () => 'Border dotted', cssFn: () => 'border-style: dotted' },
  'border-none': { category: 'borders', descFn: () => 'Border none', cssFn: () => 'border-style: none' },
  'rounded': { category: 'borders', descFn: () => 'Border radius 0.25rem', cssFn: () => 'border-radius: 0.25rem' },
  'rounded-sm': { category: 'borders', descFn: () => 'Border radius 0.125rem', cssFn: () => 'border-radius: 0.125rem' },
  'rounded-md': { category: 'borders', descFn: () => 'Border radius 0.375rem', cssFn: () => 'border-radius: 0.375rem' },
  'rounded-lg': { category: 'borders', descFn: () => 'Border radius 0.5rem', cssFn: () => 'border-radius: 0.5rem' },
  'rounded-xl': { category: 'borders', descFn: () => 'Border radius 0.75rem', cssFn: () => 'border-radius: 0.75rem' },
  'rounded-2xl': { category: 'borders', descFn: () => 'Border radius 1rem', cssFn: () => 'border-radius: 1rem' },
  'rounded-3xl': { category: 'borders', descFn: () => 'Border radius 1.5rem', cssFn: () => 'border-radius: 1.5rem' },
  'rounded-full': { category: 'borders', descFn: () => 'Border radius full', cssFn: () => 'border-radius: 9999px' },
  'rounded-none': { category: 'borders', descFn: () => 'Border radius none', cssFn: () => 'border-radius: 0px' },

  // Effects
  'shadow': { category: 'effects', descFn: () => 'Box shadow', cssFn: () => 'box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1)' },
  'shadow-sm': { category: 'effects', descFn: () => 'Small shadow', cssFn: () => 'box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)' },
  'shadow-md': { category: 'effects', descFn: () => 'Medium shadow', cssFn: () => 'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1)' },
  'shadow-lg': { category: 'effects', descFn: () => 'Large shadow', cssFn: () => 'box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1)' },
  'shadow-xl': { category: 'effects', descFn: () => 'Extra large shadow', cssFn: () => 'box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1)' },
  'shadow-2xl': { category: 'effects', descFn: () => '2XL shadow', cssFn: () => 'box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)' },
  'shadow-none': { category: 'effects', descFn: () => 'No shadow', cssFn: () => 'box-shadow: none' },

  // Overflow
  'overflow-auto': { category: 'layout', descFn: () => 'Overflow auto', cssFn: () => 'overflow: auto' },
  'overflow-hidden': { category: 'layout', descFn: () => 'Overflow hidden', cssFn: () => 'overflow: hidden' },
  'overflow-visible': { category: 'layout', descFn: () => 'Overflow visible', cssFn: () => 'overflow: visible' },
  'overflow-scroll': { category: 'layout', descFn: () => 'Overflow scroll', cssFn: () => 'overflow: scroll' },
  'overflow-x-auto': { category: 'layout', descFn: () => 'Overflow-x auto', cssFn: () => 'overflow-x: auto' },
  'overflow-y-auto': { category: 'layout', descFn: () => 'Overflow-y auto', cssFn: () => 'overflow-y: auto' },

  // Interactivity
  'cursor-pointer': { category: 'interactivity', descFn: () => 'Cursor pointer', cssFn: () => 'cursor: pointer' },
  'cursor-default': { category: 'interactivity', descFn: () => 'Cursor default', cssFn: () => 'cursor: default' },
  'cursor-not-allowed': { category: 'interactivity', descFn: () => 'Cursor not allowed', cssFn: () => 'cursor: not-allowed' },
  'pointer-events-none': { category: 'interactivity', descFn: () => 'Pointer events none', cssFn: () => 'pointer-events: none' },
  'pointer-events-auto': { category: 'interactivity', descFn: () => 'Pointer events auto', cssFn: () => 'pointer-events: auto' },
  'select-none': { category: 'interactivity', descFn: () => 'User select none', cssFn: () => 'user-select: none' },
  'select-text': { category: 'interactivity', descFn: () => 'User select text', cssFn: () => 'user-select: text' },
  'select-all': { category: 'interactivity', descFn: () => 'User select all', cssFn: () => 'user-select: all' },

  // Transitions
  'transition': { category: 'effects', descFn: () => 'Transition all', cssFn: () => 'transition-property: all; transition-duration: 150ms' },
  'transition-none': { category: 'effects', descFn: () => 'No transition', cssFn: () => 'transition-property: none' },
  'transition-all': { category: 'effects', descFn: () => 'Transition all properties', cssFn: () => 'transition-property: all' },
  'transition-colors': { category: 'effects', descFn: () => 'Transition colors', cssFn: () => 'transition-property: color, background-color, border-color' },
  'transition-opacity': { category: 'effects', descFn: () => 'Transition opacity', cssFn: () => 'transition-property: opacity' },
  'transition-transform': { category: 'effects', descFn: () => 'Transition transform', cssFn: () => 'transition-property: transform' },
  'duration-75': { category: 'effects', descFn: () => 'Duration 75ms', cssFn: () => 'transition-duration: 75ms' },
  'duration-100': { category: 'effects', descFn: () => 'Duration 100ms', cssFn: () => 'transition-duration: 100ms' },
  'duration-150': { category: 'effects', descFn: () => 'Duration 150ms', cssFn: () => 'transition-duration: 150ms' },
  'duration-200': { category: 'effects', descFn: () => 'Duration 200ms', cssFn: () => 'transition-duration: 200ms' },
  'duration-300': { category: 'effects', descFn: () => 'Duration 300ms', cssFn: () => 'transition-duration: 300ms' },
  'duration-500': { category: 'effects', descFn: () => 'Duration 500ms', cssFn: () => 'transition-duration: 500ms' },
  'ease-linear': { category: 'effects', descFn: () => 'Ease linear', cssFn: () => 'transition-timing-function: linear' },
  'ease-in': { category: 'effects', descFn: () => 'Ease in', cssFn: () => 'transition-timing-function: cubic-bezier(0.4, 0, 1, 1)' },
  'ease-out': { category: 'effects', descFn: () => 'Ease out', cssFn: () => 'transition-timing-function: cubic-bezier(0, 0, 0.2, 1)' },
  'ease-in-out': { category: 'effects', descFn: () => 'Ease in-out', cssFn: () => 'transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)' },

  // Z-index
  'z-0': { category: 'layout', descFn: () => 'Z-index 0', cssFn: () => 'z-index: 0' },
  'z-10': { category: 'layout', descFn: () => 'Z-index 10', cssFn: () => 'z-index: 10' },
  'z-20': { category: 'layout', descFn: () => 'Z-index 20', cssFn: () => 'z-index: 20' },
  'z-30': { category: 'layout', descFn: () => 'Z-index 30', cssFn: () => 'z-index: 30' },
  'z-40': { category: 'layout', descFn: () => 'Z-index 40', cssFn: () => 'z-index: 40' },
  'z-50': { category: 'layout', descFn: () => 'Z-index 50', cssFn: () => 'z-index: 50' },
  'z-auto': { category: 'layout', descFn: () => 'Z-index auto', cssFn: () => 'z-index: auto' },
};

// Dynamic pattern matchers
const DYNAMIC_PATTERNS: Array<{
  regex: RegExp;
  category: TailwindCategory;
  descFn: (match: RegExpMatchArray) => string;
  cssFn: (match: RegExpMatchArray) => string;
}> = [
  // Spacing: p-*, m-*, gap-*
  { regex: /^p-(\d+)$/, category: 'spacing', descFn: (m) => `Padding ${num(m, 1) * 0.25}rem`, cssFn: (m) => `padding: ${num(m, 1) * 0.25}rem` },
  { regex: /^px-(\d+)$/, category: 'spacing', descFn: (m) => `Padding X ${num(m, 1) * 0.25}rem`, cssFn: (m) => `padding-left: ${num(m, 1) * 0.25}rem; padding-right: ${num(m, 1) * 0.25}rem` },
  { regex: /^py-(\d+)$/, category: 'spacing', descFn: (m) => `Padding Y ${num(m, 1) * 0.25}rem`, cssFn: (m) => `padding-top: ${num(m, 1) * 0.25}rem; padding-bottom: ${num(m, 1) * 0.25}rem` },
  { regex: /^pt-(\d+)$/, category: 'spacing', descFn: (m) => `Padding top ${num(m, 1) * 0.25}rem`, cssFn: (m) => `padding-top: ${num(m, 1) * 0.25}rem` },
  { regex: /^pr-(\d+)$/, category: 'spacing', descFn: (m) => `Padding right ${num(m, 1) * 0.25}rem`, cssFn: (m) => `padding-right: ${num(m, 1) * 0.25}rem` },
  { regex: /^pb-(\d+)$/, category: 'spacing', descFn: (m) => `Padding bottom ${num(m, 1) * 0.25}rem`, cssFn: (m) => `padding-bottom: ${num(m, 1) * 0.25}rem` },
  { regex: /^pl-(\d+)$/, category: 'spacing', descFn: (m) => `Padding left ${num(m, 1) * 0.25}rem`, cssFn: (m) => `padding-left: ${num(m, 1) * 0.25}rem` },
  { regex: /^m-(\d+)$/, category: 'spacing', descFn: (m) => `Margin ${num(m, 1) * 0.25}rem`, cssFn: (m) => `margin: ${num(m, 1) * 0.25}rem` },
  { regex: /^mx-(\d+)$/, category: 'spacing', descFn: (m) => `Margin X ${num(m, 1) * 0.25}rem`, cssFn: (m) => `margin-left: ${num(m, 1) * 0.25}rem; margin-right: ${num(m, 1) * 0.25}rem` },
  { regex: /^my-(\d+)$/, category: 'spacing', descFn: (m) => `Margin Y ${num(m, 1) * 0.25}rem`, cssFn: (m) => `margin-top: ${num(m, 1) * 0.25}rem; margin-bottom: ${num(m, 1) * 0.25}rem` },
  { regex: /^mt-(\d+)$/, category: 'spacing', descFn: (m) => `Margin top ${num(m, 1) * 0.25}rem`, cssFn: (m) => `margin-top: ${num(m, 1) * 0.25}rem` },
  { regex: /^mr-(\d+)$/, category: 'spacing', descFn: (m) => `Margin right ${num(m, 1) * 0.25}rem`, cssFn: (m) => `margin-right: ${num(m, 1) * 0.25}rem` },
  { regex: /^mb-(\d+)$/, category: 'spacing', descFn: (m) => `Margin bottom ${num(m, 1) * 0.25}rem`, cssFn: (m) => `margin-bottom: ${num(m, 1) * 0.25}rem` },
  { regex: /^ml-(\d+)$/, category: 'spacing', descFn: (m) => `Margin left ${num(m, 1) * 0.25}rem`, cssFn: (m) => `margin-left: ${num(m, 1) * 0.25}rem` },
  { regex: /^gap-(\d+)$/, category: 'spacing', descFn: (m) => `Gap ${num(m, 1) * 0.25}rem`, cssFn: (m) => `gap: ${num(m, 1) * 0.25}rem` },
  { regex: /^gap-x-(\d+)$/, category: 'spacing', descFn: (m) => `Column gap ${num(m, 1) * 0.25}rem`, cssFn: (m) => `column-gap: ${num(m, 1) * 0.25}rem` },
  { regex: /^gap-y-(\d+)$/, category: 'spacing', descFn: (m) => `Row gap ${num(m, 1) * 0.25}rem`, cssFn: (m) => `row-gap: ${num(m, 1) * 0.25}rem` },
  { regex: /^space-x-(\d+)$/, category: 'spacing', descFn: (m) => `Horizontal space ${num(m, 1) * 0.25}rem`, cssFn: (m) => `> * + * { margin-left: ${num(m, 1) * 0.25}rem }` },
  { regex: /^space-y-(\d+)$/, category: 'spacing', descFn: (m) => `Vertical space ${num(m, 1) * 0.25}rem`, cssFn: (m) => `> * + * { margin-top: ${num(m, 1) * 0.25}rem }` },

  // Sizing: w-*, h-*
  { regex: /^w-(\d+)$/, category: 'sizing', descFn: (m) => `Width ${num(m, 1) * 0.25}rem`, cssFn: (m) => `width: ${num(m, 1) * 0.25}rem` },
  { regex: /^h-(\d+)$/, category: 'sizing', descFn: (m) => `Height ${num(m, 1) * 0.25}rem`, cssFn: (m) => `height: ${num(m, 1) * 0.25}rem` },
  { regex: /^min-w-(\d+)$/, category: 'sizing', descFn: (m) => `Min width ${num(m, 1) * 0.25}rem`, cssFn: (m) => `min-width: ${num(m, 1) * 0.25}rem` },
  { regex: /^min-h-(\d+)$/, category: 'sizing', descFn: (m) => `Min height ${num(m, 1) * 0.25}rem`, cssFn: (m) => `min-height: ${num(m, 1) * 0.25}rem` },
  { regex: /^max-w-(\d+)$/, category: 'sizing', descFn: (m) => `Max width ${num(m, 1) * 0.25}rem`, cssFn: (m) => `max-width: ${num(m, 1) * 0.25}rem` },
  { regex: /^max-h-(\d+)$/, category: 'sizing', descFn: (m) => `Max height ${num(m, 1) * 0.25}rem`, cssFn: (m) => `max-height: ${num(m, 1) * 0.25}rem` },

  // Typography: text-*, leading-*, tracking-*
  { regex: /^text-xs$/, category: 'typography', descFn: () => 'Font size 0.75rem', cssFn: () => 'font-size: 0.75rem; line-height: 1rem' },
  { regex: /^text-sm$/, category: 'typography', descFn: () => 'Font size 0.875rem', cssFn: () => 'font-size: 0.875rem; line-height: 1.25rem' },
  { regex: /^text-base$/, category: 'typography', descFn: () => 'Font size 1rem', cssFn: () => 'font-size: 1rem; line-height: 1.5rem' },
  { regex: /^text-lg$/, category: 'typography', descFn: () => 'Font size 1.125rem', cssFn: () => 'font-size: 1.125rem; line-height: 1.75rem' },
  { regex: /^text-xl$/, category: 'typography', descFn: () => 'Font size 1.25rem', cssFn: () => 'font-size: 1.25rem; line-height: 1.75rem' },
  { regex: /^text-2xl$/, category: 'typography', descFn: () => 'Font size 1.5rem', cssFn: () => 'font-size: 1.5rem; line-height: 2rem' },
  { regex: /^text-3xl$/, category: 'typography', descFn: () => 'Font size 1.875rem', cssFn: () => 'font-size: 1.875rem; line-height: 2.25rem' },
  { regex: /^text-4xl$/, category: 'typography', descFn: () => 'Font size 2.25rem', cssFn: () => 'font-size: 2.25rem; line-height: 2.5rem' },
  { regex: /^text-\[(\d+)px\]$/, category: 'typography', descFn: (m) => `Font size ${m[1]}px`, cssFn: (m) => `font-size: ${m[1]}px` },
  { regex: /^leading-(\d+)$/, category: 'typography', descFn: (m) => `Line height ${num(m, 1) * 0.25}rem`, cssFn: (m) => `line-height: ${num(m, 1) * 0.25}rem` },
  { regex: /^tracking-tight$/, category: 'typography', descFn: () => 'Letter spacing -0.025em', cssFn: () => 'letter-spacing: -0.025em' },
  { regex: /^tracking-normal$/, category: 'typography', descFn: () => 'Letter spacing normal', cssFn: () => 'letter-spacing: 0em' },
  { regex: /^tracking-wide$/, category: 'typography', descFn: () => 'Letter spacing 0.025em', cssFn: () => 'letter-spacing: 0.025em' },

  // Colors: text-*, bg-*, border-*
  { regex: /^text-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d+)$/, category: 'colors', descFn: (m) => `Text color ${m[1]}-${m[2]}`, cssFn: (m) => `color: var(--color-${m[1]}-${m[2]})` },
  { regex: /^bg-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d+)$/, category: 'colors', descFn: (m) => `Background ${m[1]}-${m[2]}`, cssFn: (m) => `background-color: var(--color-${m[1]}-${m[2]})` },
  { regex: /^border-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d+)$/, category: 'colors', descFn: (m) => `Border color ${m[1]}-${m[2]}`, cssFn: (m) => `border-color: var(--color-${m[1]}-${m[2]})` },
  { regex: /^text-white$/, category: 'colors', descFn: () => 'Text white', cssFn: () => 'color: #ffffff' },
  { regex: /^text-black$/, category: 'colors', descFn: () => 'Text black', cssFn: () => 'color: #000000' },
  { regex: /^bg-white$/, category: 'colors', descFn: () => 'Background white', cssFn: () => 'background-color: #ffffff' },
  { regex: /^bg-black$/, category: 'colors', descFn: () => 'Background black', cssFn: () => 'background-color: #000000' },
  { regex: /^bg-transparent$/, category: 'colors', descFn: () => 'Background transparent', cssFn: () => 'background-color: transparent' },

  // Opacity
  { regex: /^opacity-(\d+)$/, category: 'effects', descFn: (m) => `Opacity ${num(m, 1)}%`, cssFn: (m) => `opacity: ${num(m, 1) / 100}` },

  // Inset/Position: top-*, right-*, bottom-*, left-*, inset-*
  { regex: /^top-(\d+)$/, category: 'layout', descFn: (m) => `Top ${num(m, 1) * 0.25}rem`, cssFn: (m) => `top: ${num(m, 1) * 0.25}rem` },
  { regex: /^right-(\d+)$/, category: 'layout', descFn: (m) => `Right ${num(m, 1) * 0.25}rem`, cssFn: (m) => `right: ${num(m, 1) * 0.25}rem` },
  { regex: /^bottom-(\d+)$/, category: 'layout', descFn: (m) => `Bottom ${num(m, 1) * 0.25}rem`, cssFn: (m) => `bottom: ${num(m, 1) * 0.25}rem` },
  { regex: /^left-(\d+)$/, category: 'layout', descFn: (m) => `Left ${num(m, 1) * 0.25}rem`, cssFn: (m) => `left: ${num(m, 1) * 0.25}rem` },
  { regex: /^inset-(\d+)$/, category: 'layout', descFn: (m) => `Inset ${num(m, 1) * 0.25}rem`, cssFn: (m) => `inset: ${num(m, 1) * 0.25}rem` },
  { regex: /^inset-x-(\d+)$/, category: 'layout', descFn: (m) => `Inset X ${num(m, 1) * 0.25}rem`, cssFn: (m) => `left: ${num(m, 1) * 0.25}rem; right: ${num(m, 1) * 0.25}rem` },
  { regex: /^inset-y-(\d+)$/, category: 'layout', descFn: (m) => `Inset Y ${num(m, 1) * 0.25}rem`, cssFn: (m) => `top: ${num(m, 1) * 0.25}rem; bottom: ${num(m, 1) * 0.25}rem` },

  // Grid
  { regex: /^grid-cols-(\d+)$/, category: 'grid', descFn: (m) => `Grid ${m[1]} columns`, cssFn: (m) => `grid-template-columns: repeat(${m[1]}, minmax(0, 1fr))` },
  { regex: /^grid-rows-(\d+)$/, category: 'grid', descFn: (m) => `Grid ${m[1]} rows`, cssFn: (m) => `grid-template-rows: repeat(${m[1]}, minmax(0, 1fr))` },
  { regex: /^col-span-(\d+)$/, category: 'grid', descFn: (m) => `Column span ${m[1]}`, cssFn: (m) => `grid-column: span ${m[1]} / span ${m[1]}` },
  { regex: /^row-span-(\d+)$/, category: 'grid', descFn: (m) => `Row span ${m[1]}`, cssFn: (m) => `grid-row: span ${m[1]} / span ${m[1]}` },

  // Arbitrary values
  { regex: /^\[(.+)\]$/, category: 'other', descFn: (m) => `Custom: ${str(m, 1)}`, cssFn: (m) => str(m, 1) },
];

/**
 * Parse a single Tailwind class
 */
export function parseTailwindClass(className: string): TailwindClassInfo | null {
  // Remove any variant prefixes (hover:, md:, etc.) for parsing
  const cleanClass = className.replace(/^[a-z]+:/g, '');

  // Check static patterns first
  if (TAILWIND_PATTERNS[cleanClass]) {
    const pattern = TAILWIND_PATTERNS[cleanClass];
    return {
      className,
      category: pattern.category,
      description: pattern.descFn(cleanClass),
      cssEquivalent: pattern.cssFn(cleanClass),
    };
  }

  // Check dynamic patterns
  for (const { regex, category, descFn, cssFn } of DYNAMIC_PATTERNS) {
    const match = cleanClass.match(regex);
    if (match) {
      return {
        className,
        category,
        description: descFn(match),
        cssEquivalent: cssFn(match),
      };
    }
  }

  // Unknown class
  return {
    className,
    category: 'other',
    description: 'Custom or unknown class',
    cssEquivalent: '/* unknown */',
  };
}

/**
 * Parse multiple Tailwind classes
 */
export function parseTailwindClasses(classString: string): TailwindClassInfo[] {
  if (!classString) return [];

  const classes = classString.split(/\s+/).filter(Boolean);
  return classes.map(parseTailwindClass).filter((info): info is TailwindClassInfo => info !== null);
}

/**
 * Group parsed classes by category
 */
export function groupClassesByCategory(
  classes: TailwindClassInfo[]
): Record<TailwindCategory, TailwindClassInfo[]> {
  const groups: Record<TailwindCategory, TailwindClassInfo[]> = {
    layout: [],
    flexbox: [],
    grid: [],
    spacing: [],
    sizing: [],
    typography: [],
    colors: [],
    borders: [],
    effects: [],
    transforms: [],
    interactivity: [],
    other: [],
  };

  for (const classInfo of classes) {
    groups[classInfo.category].push(classInfo);
  }

  return groups;
}

/**
 * Get category display name
 */
export function getCategoryDisplayName(category: TailwindCategory): string {
  const names: Record<TailwindCategory, string> = {
    layout: 'Layout',
    flexbox: 'Flexbox',
    grid: 'Grid',
    spacing: 'Spacing',
    sizing: 'Sizing',
    typography: 'Typography',
    colors: 'Colors',
    borders: 'Borders',
    effects: 'Effects',
    transforms: 'Transforms',
    interactivity: 'Interactivity',
    other: 'Other',
  };
  return names[category];
}

/**
 * Get category color for UI as CSS custom property value
 */
export function getCategoryColor(category: TailwindCategory): string {
  const colors: Record<TailwindCategory, string> = {
    layout: 'var(--color-info)',
    flexbox: 'var(--color-feature)',
    grid: 'var(--color-feature)',
    spacing: 'var(--color-success)',
    sizing: 'var(--color-info)',
    typography: 'var(--color-warning)',
    colors: 'var(--color-feature)',
    borders: 'var(--color-warning)',
    effects: 'var(--color-info)',
    transforms: 'var(--color-feature)',
    interactivity: 'var(--color-success)',
    other: 'var(--theme-text-muted)',
  };
  return colors[category];
}
