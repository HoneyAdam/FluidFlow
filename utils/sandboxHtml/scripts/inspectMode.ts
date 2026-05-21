/**
 * Inspect Mode Script
 *
 * Generates the inspect mode script for element selection in the sandbox preview.
 * Enables hover highlighting and click-to-select functionality with React component detection.
 */

/**
 * Generate the inspect mode script for element selection
 */
export function getInspectModeScript(): string {
  return `
    (function() {
      let highlightedEl = null;
      let selectedEl = null;

      // Try to get React component name from fiber
      function getComponentName(element) {
        // Try to find React fiber
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = element[fiberKey];
          while (fiber) {
            if (fiber.type && typeof fiber.type === 'function') {
              return fiber.type.displayName || fiber.type.name || null;
            }
            if (fiber.type && typeof fiber.type === 'string') {
              // This is a DOM element, go up to parent
            }
            fiber = fiber.return;
          }
        }
        return null;
      }

      // Get parent component chain
      function getParentComponents(element) {
        const parents = [];
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = element[fiberKey];
          while (fiber) {
            if (fiber.type && typeof fiber.type === 'function') {
              const name = fiber.type.displayName || fiber.type.name;
              if (name && !parents.includes(name)) {
                parents.push(name);
              }
            }
            fiber = fiber.return;
          }
        }
        return parents.slice(0, 5); // Limit to 5 parents
      }

      document.addEventListener('mouseover', function(e) {
        if (e.target === document.body || e.target === document.documentElement || e.target.id === 'root') return;

        if (highlightedEl && highlightedEl !== e.target) {
          highlightedEl.classList.remove('inspect-highlight');
        }

        e.target.classList.add('inspect-highlight');
        highlightedEl = e.target;

        const rect = e.target.getBoundingClientRect();
        window.__postToParent({
          type: 'INSPECT_HOVER',
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        }, '*');
      }, true);

      document.addEventListener('mouseout', function(e) {
        if (highlightedEl) {
          highlightedEl.classList.remove('inspect-highlight');
        }
        window.__postToParent({ type: 'INSPECT_LEAVE' }, '*');
      }, true);

      document.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const target = e.target;
        const rect = target.getBoundingClientRect();
        const componentName = getComponentName(target);
        const parentComponents = getParentComponents(target);

        // Remove highlight from hovered element
        if (highlightedEl) {
          highlightedEl.classList.remove('inspect-highlight');
        }

        // Remove selected class from previously selected element
        if (selectedEl && selectedEl !== target) {
          selectedEl.classList.remove('inspect-selected');
        }

        target.classList.add('inspect-selected');
        selectedEl = target;

        window.__postToParent({
          type: 'INSPECT_SELECT',
          element: {
            tagName: target.tagName,
            className: target.className.replace('inspect-highlight', '').replace('inspect-selected', '').trim(),
            id: target.id || null,
            textContent: target.textContent?.slice(0, 200) || null,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            componentName: componentName,
            parentComponents: parentComponents.length > 0 ? parentComponents : null,
            ffGroup: target.getAttribute('data-ff-group') || null,
            ffId: target.getAttribute('data-ff-id') || null
          }
        }, '*');
      }, true);

      // Update selection rect on scroll
      document.addEventListener('scroll', function() {
        if (selectedEl) {
          const rect = selectedEl.getBoundingClientRect();
          window.__postToParent({
            type: 'INSPECT_SCROLL',
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          }, '*');
        }
      }, true);

      // Also listen to window scroll for cases where body doesn't scroll
      window.addEventListener('scroll', function() {
        if (selectedEl) {
          const rect = selectedEl.getBoundingClientRect();
          window.__postToParent({
            type: 'INSPECT_SCROLL',
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          }, '*');
        }
      }, true);
    })();
    `;
}
