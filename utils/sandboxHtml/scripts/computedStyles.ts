/**
 * Computed Styles Script
 *
 * Generates the computed styles extraction script for the sandbox.
 * Extracts CSS computed styles and Tailwind class information.
 */

/**
 * Computed styles result structure
 */
export interface ComputedStylesResult {
  computedStyles: Record<string, string>;
  stylesByCategory: Record<string, Record<string, string>>;
  appliedClasses: string[];
  boxModel: {
    margin: { top: number; right: number; bottom: number; left: number };
    padding: { top: number; right: number; bottom: number; left: number };
    border: { top: number; right: number; bottom: number; left: number };
    width: number;
    height: number;
  };
  position: {
    display: string;
    position: string;
    top?: string;
    left?: string;
    right?: string;
    bottom?: string;
    zIndex?: string;
  };
  tagName: string;
  id: string | null;
}

/**
 * CSS property categories for organized display
 */
export const CSS_CATEGORIES = {
  layout: ['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear'],
  flexbox: ['flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-content', 'align-self', 'justify-content', 'gap', 'row-gap', 'column-gap', 'order'],
  grid: ['grid', 'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-gap'],
  spacing: ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  sizing: ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'box-sizing', 'overflow', 'overflow-x', 'overflow-y'],
  typography: ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform', 'white-space', 'word-break'],
  colors: ['color', 'background', 'background-color', 'background-image', 'opacity'],
  borders: ['border', 'border-width', 'border-style', 'border-color', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left'],
  effects: ['box-shadow', 'text-shadow', 'filter', 'backdrop-filter', 'transform', 'transition', 'animation', 'cursor', 'pointer-events']
} as const;

/**
 * Generate the computed styles extraction script
 */
export function getComputedStylesScript(): string {
  return `
    // Computed Styles Extraction
    window.__SANDBOX_COMPUTED_STYLES__ = {
      // CSS property categories for organized display
      categories: {
        layout: ['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear'],
        flexbox: ['flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-content', 'align-self', 'justify-content', 'gap', 'row-gap', 'column-gap', 'order'],
        grid: ['grid', 'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-gap'],
        spacing: ['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
        sizing: ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'box-sizing', 'overflow', 'overflow-x', 'overflow-y'],
        typography: ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform', 'white-space', 'word-break'],
        colors: ['color', 'background', 'background-color', 'background-image', 'opacity'],
        borders: ['border', 'border-width', 'border-style', 'border-color', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left'],
        effects: ['box-shadow', 'text-shadow', 'filter', 'backdrop-filter', 'transform', 'transition', 'animation', 'cursor', 'pointer-events']
      },

      // Get all unique CSS properties
      getAllProperties: function() {
        var all = [];
        var cats = Object.values(this.categories);
        for (var i = 0; i < cats.length; i++) {
          all = all.concat(cats[i]);
        }
        return all;
      },

      // Parse CSS value to number (removes 'px', 'em', etc.)
      parseValue: function(value) {
        if (!value || value === 'auto' || value === 'none') return 0;
        return parseFloat(value) || 0;
      },

      // Get box model values
      getBoxModel: function(element) {
        var style = window.getComputedStyle(element);
        var rect = element.getBoundingClientRect();

        return {
          margin: {
            top: this.parseValue(style.marginTop),
            right: this.parseValue(style.marginRight),
            bottom: this.parseValue(style.marginBottom),
            left: this.parseValue(style.marginLeft)
          },
          padding: {
            top: this.parseValue(style.paddingTop),
            right: this.parseValue(style.paddingRight),
            bottom: this.parseValue(style.paddingBottom),
            left: this.parseValue(style.paddingLeft)
          },
          border: {
            top: this.parseValue(style.borderTopWidth),
            right: this.parseValue(style.borderRightWidth),
            bottom: this.parseValue(style.borderBottomWidth),
            left: this.parseValue(style.borderLeftWidth)
          },
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      },

      // Get position info
      getPosition: function(element) {
        var style = window.getComputedStyle(element);

        var result = {
          display: style.display,
          position: style.position
        };

        if (style.position !== 'static') {
          result.top = style.top;
          result.left = style.left;
          result.right = style.right;
          result.bottom = style.bottom;
        }

        if (style.zIndex !== 'auto') {
          result.zIndex = style.zIndex;
        }

        return result;
      },

      // Get computed styles by category
      getStylesByCategory: function(element) {
        var style = window.getComputedStyle(element);
        var result = {};

        var categories = Object.keys(this.categories);
        for (var i = 0; i < categories.length; i++) {
          var category = categories[i];
          var props = this.categories[category];
          var categoryStyles = {};

          for (var j = 0; j < props.length; j++) {
            var prop = props[j];
            var value = style.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
              categoryStyles[prop] = value;
            }
          }

          if (Object.keys(categoryStyles).length > 0) {
            result[category] = categoryStyles;
          }
        }

        return result;
      },

      // Get full styles info for an element
      getStyles: function(element) {
        if (!element || element.nodeType !== 1) return null;

        var style = window.getComputedStyle(element);
        var allProps = this.getAllProperties();

        var computedStyles = {};
        for (var i = 0; i < allProps.length; i++) {
          var prop = allProps[i];
          var value = style.getPropertyValue(prop);
          if (value) {
            computedStyles[prop] = value;
          }
        }

        return {
          computedStyles: computedStyles,
          stylesByCategory: this.getStylesByCategory(element),
          appliedClasses: element.className ? element.className.split(/\\s+/).filter(Boolean) : [],
          boxModel: this.getBoxModel(element),
          position: this.getPosition(element),
          tagName: element.tagName.toLowerCase(),
          id: element.id || null
        };
      },

      // Get styles for element at coordinates
      getStylesAtPoint: function(x, y) {
        var element = document.elementFromPoint(x, y);
        if (!element) return null;
        return this.getStyles(element);
      },

      // Apply temporary styles (for live preview)
      tempStyles: new Map(),

      applyTempStyles: function(elementRef, styles) {
        var element = document.querySelector('[data-ff-id="' + elementRef + '"]') ||
                      document.querySelector('[data-inspect-ref="' + elementRef + '"]') ||
                      document.querySelector('[data-tree-id="' + elementRef + '"]');
        if (!element) return false;

        // Store original styles
        if (!this.tempStyles.has(elementRef)) {
          var original = {};
          var keys = Object.keys(styles);
          for (var i = 0; i < keys.length; i++) {
            original[keys[i]] = element.style[keys[i]] || '';
          }
          this.tempStyles.set(elementRef, original);
        }

        // Apply new styles
        var styleKeys = Object.keys(styles);
        for (var j = 0; j < styleKeys.length; j++) {
          var key = styleKeys[j];
          element.style[key] = styles[key];
        }

        return true;
      },

      clearTempStyles: function(elementRef) {
        if (elementRef) {
          var original = this.tempStyles.get(elementRef);
          if (original) {
            var element = document.querySelector('[data-ff-id="' + elementRef + '"]') ||
                          document.querySelector('[data-inspect-ref="' + elementRef + '"]') ||
                          document.querySelector('[data-tree-id="' + elementRef + '"]');
            if (element) {
              var keys = Object.keys(original);
              for (var i = 0; i < keys.length; i++) {
                element.style[keys[i]] = original[keys[i]];
              }
            }
            this.tempStyles.delete(elementRef);
          }
        } else {
          // Clear all temp styles
          var refs = Array.from(this.tempStyles.keys());
          for (var j = 0; j < refs.length; j++) {
            this.clearTempStyles(refs[j]);
          }
        }
      }
    };

    // Handle computed styles requests from parent
    window.addEventListener('message', function(event) {
      if (!event.data) return;

      if (event.data.type === 'REQUEST_COMPUTED_STYLES') {
        var element = null;

        if (event.data.elementRef) {
          // Look up element by various possible ID attributes
          element = document.querySelector('[data-ff-id="' + event.data.elementRef + '"]') ||
                    document.querySelector('[data-inspect-ref="' + event.data.elementRef + '"]') ||
                    document.querySelector('[data-tree-id="' + event.data.elementRef + '"]');
        } else if (event.data.selector) {
          element = document.querySelector(event.data.selector);
        }

        var styles = element ? window.__SANDBOX_COMPUTED_STYLES__.getStyles(element) : null;

        window.__postToParent({
          type: 'COMPUTED_STYLES_RESPONSE',
          requestId: event.data.requestId,
          styles: styles
        }, '*');
      }

      if (event.data.type === 'APPLY_TEMP_STYLES') {
        var success = window.__SANDBOX_COMPUTED_STYLES__.applyTempStyles(
          event.data.elementRef,
          event.data.styles
        );

        window.__postToParent({
          type: 'TEMP_STYLES_APPLIED',
          requestId: event.data.requestId,
          success: success
        }, '*');
      }

      if (event.data.type === 'CLEAR_TEMP_STYLES') {
        window.__SANDBOX_COMPUTED_STYLES__.clearTempStyles(event.data.elementRef);

        window.__postToParent({
          type: 'TEMP_STYLES_CLEARED',
          requestId: event.data.requestId
        }, '*');
      }
    });
  `;
}
