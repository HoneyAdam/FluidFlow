/**
 * Tests for services/inspector/elementSelector
 */

import { describe, it, expect } from 'vitest';
import { buildElementSelector } from '../../../services/inspector/elementSelector';
import type { InspectedElement, EditScope } from '../../../components/PreviewPanel/ComponentInspector';

function makeElement(overrides: Partial<InspectedElement> = {}): InspectedElement {
  return {
    tagName: 'DIV',
    className: '',
    rect: { top: 0, left: 0, width: 100, height: 100 },
    ...overrides,
  };
}

describe('services/inspector/elementSelector', () => {
  describe('buildElementSelector', () => {
    it('should use data-ff-id for element scope with ffId', () => {
      const el = makeElement({ ffId: 'abc-123' });
      expect(buildElementSelector(el, 'element')).toBe('data-ff-id="abc-123"');
    });

    it('should use data-ff-group for group scope with ffGroup', () => {
      const el = makeElement({ ffGroup: 'nav-items' });
      expect(buildElementSelector(el, 'group')).toBe('data-ff-group="nav-items"');
    });

    it('should prefer ffId over id for element scope', () => {
      const el = makeElement({ ffId: 'ff-1', id: 'myId' });
      expect(buildElementSelector(el, 'element')).toBe('data-ff-id="ff-1"');
    });

    it('should use HTML id when no ffId', () => {
      const el = makeElement({ id: 'submit-btn' });
      expect(buildElementSelector(el, 'element')).toBe('#submit-btn');
    });

    it('should use CSS classes when no id', () => {
      const el = makeElement({ tagName: 'BUTTON', className: 'primary btn-large active' });
      const result = buildElementSelector(el, 'element');
      expect(result).toContain('<button>');
      expect(result).toContain('primary');
    });

    it('should filter out generated CSS classes', () => {
      const el = makeElement({ tagName: 'DIV', className: 'css-abc123 btn-123' });
      // css-abc123 is filtered by startsWith('css-'), btn-123 by regex
      // Both filtered → falls through to tag+component
      const result = buildElementSelector(el, 'element');
      expect(result).toContain('<div>');
    });

    it('should use text content when no classes', () => {
      const el = makeElement({ tagName: 'SPAN', textContent: 'Hello World' });
      const result = buildElementSelector(el, 'element');
      expect(result).toBe('<span> with text "Hello World"');
    });

    it('should truncate long text content to 40 chars', () => {
      const longText = 'a'.repeat(100);
      const el = makeElement({ tagName: 'P', textContent: longText });
      const result = buildElementSelector(el, 'element');
      expect(result).toContain('a'.repeat(40));
      expect(result.length).toBeLessThan(100);
    });

    it('should fall back to tag + componentName', () => {
      const el = makeElement({ tagName: 'DIV', componentName: 'Header' });
      const result = buildElementSelector(el, 'element');
      expect(result).toBe('<div> in Header');
    });

    it('should fall back to tag + component when no componentName', () => {
      const el = makeElement({ tagName: 'SECTION' });
      expect(buildElementSelector(el, 'element')).toBe('<section> in component');
    });

    it('should not use ffId for group scope', () => {
      const el = makeElement({ ffId: 'ff-1', ffGroup: 'cards' });
      expect(buildElementSelector(el, 'group')).toBe('data-ff-group="cards"');
    });

    it('should not use ffGroup for element scope', () => {
      const el = makeElement({ ffGroup: 'cards' });
      // No ffId, no id → falls through to tag+component
      const result = buildElementSelector(el, 'element');
      expect(result).toContain('<div>');
    });
  });
});
