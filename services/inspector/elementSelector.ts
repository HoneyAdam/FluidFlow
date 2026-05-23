/**
 * Element Selector Service
 *
 * Builds CSS-like selectors for inspected DOM elements.
 * Extracted from useInspectEdit for testability.
 *
 * @module services/inspector/elementSelector
 */

import type { InspectedElement, EditScope } from '../../components/PreviewPanel/ComponentInspector';

/**
 * Build a specific selector string for the target element.
 * Priority: FluidFlow ID > FluidFlow Group > HTML id > CSS classes > text content > tag+component
 */
export function buildElementSelector(element: InspectedElement, scope: EditScope): string {
  // 1. FluidFlow ID (most specific for single element)
  if (scope === 'element' && element.ffId) {
    return `data-ff-id="${element.ffId}"`;
  }
  // 2. FluidFlow Group (for group editing)
  if (scope === 'group' && element.ffGroup) {
    return `data-ff-group="${element.ffGroup}"`;
  }
  // 3. HTML id attribute
  if (element.id) {
    return `#${element.id}`;
  }
  // 4. CSS classes (filter out generated/utility prefixes, take meaningful ones)
  if (element.className) {
    const classes = element.className
      .split(' ')
      .filter(
        (c) => c && c.length > 2 && !c.startsWith('css-') && !c.match(/^[a-z]+-\d+$/)
      )
      .slice(0, 3);
    if (classes.length > 0) {
      return `<${element.tagName.toLowerCase()}>.${classes.join('.')}`;
    }
  }
  // 5. Text content as identifier
  if (element.textContent && element.textContent.trim().length > 0) {
    const text = element.textContent.trim().slice(0, 40);
    return `<${element.tagName.toLowerCase()}> with text "${text}"`;
  }
  // 6. Tag + component (last resort)
  return `<${element.tagName.toLowerCase()}> in ${element.componentName || 'component'}`;
}
