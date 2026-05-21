/**
 * Component Tree Script
 *
 * Generates the component tree extraction script for the sandbox.
 * Uses React Fiber traversal to build a tree of components and DOM elements.
 */

/**
 * Component tree node structure
 */
export interface ComponentTreeNode {
  id: string;
  type: 'component' | 'element';
  name: string;
  tagName?: string;
  props?: Record<string, unknown>;
  children: ComponentTreeNode[];
  depth: number;
  hasState?: boolean;
  elementRef?: string; // For linking to DOM element
}

/**
 * Generate the component tree extraction script
 */
export function getComponentTreeScript(): string {
  return `
    // Component Tree Extraction
    window.__SANDBOX_COMPONENT_TREE__ = {
      maxDepth: 15,
      nodeIdCounter: 0,

      // Generate unique node ID
      generateNodeId: function() {
        return 'node_' + (++this.nodeIdCounter);
      },

      // Find React Fiber from DOM element
      getFiberFromElement: function(element) {
        if (!element) return null;
        var keys = Object.keys(element);
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
            return element[key];
          }
        }
        return null;
      },

      // Get component name from fiber
      getComponentName: function(fiber) {
        if (!fiber || !fiber.type) return null;

        // Function component
        if (typeof fiber.type === 'function') {
          return fiber.type.displayName || fiber.type.name || 'Anonymous';
        }

        // Class component
        if (fiber.type && fiber.type.prototype && fiber.type.prototype.isReactComponent) {
          return fiber.type.displayName || fiber.type.name || 'Component';
        }

        // Forward ref
        if (fiber.type && fiber.type.$$typeof) {
          var typeOf = String(fiber.type.$$typeof);
          if (typeOf.includes('forward_ref')) {
            return fiber.type.displayName || fiber.type.render?.displayName || fiber.type.render?.name || 'ForwardRef';
          }
          if (typeOf.includes('memo')) {
            return (fiber.type.type?.displayName || fiber.type.type?.name || 'Memo');
          }
        }

        // HTML element
        if (typeof fiber.type === 'string') {
          return null; // Will be handled as element
        }

        return null;
      },

      // Serialize props (with depth limit and circular reference handling)
      serializeProps: function(props, depth) {
        if (depth === undefined) depth = 0;
        if (!props || depth > 3) return null;

        var result = {};
        var seen = new WeakSet();

        var serializeValue = function(value, d) {
          if (d > 3) return '[Max Depth]';
          if (value === null) return null;
          if (value === undefined) return undefined;

          var type = typeof value;

          if (type === 'string' || type === 'number' || type === 'boolean') {
            return value;
          }

          if (type === 'function') {
            return '[Function: ' + (value.name || 'anonymous') + ']';
          }

          if (type === 'object') {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);

            // React element
            if (value.$$typeof) {
              return '[React Element]';
            }

            // Array
            if (Array.isArray(value)) {
              if (value.length > 10) {
                return '[Array(' + value.length + ')]';
              }
              return value.slice(0, 10).map(function(v) { return serializeValue(v, d + 1); });
            }

            // Object
            var obj = {};
            var keys = Object.keys(value).slice(0, 20);
            for (var i = 0; i < keys.length; i++) {
              var k = keys[i];
              if (k !== 'children') {
                obj[k] = serializeValue(value[k], d + 1);
              }
            }
            return obj;
          }

          return String(value);
        };

        var propKeys = Object.keys(props).filter(function(k) {
          return k !== 'children' && !k.startsWith('__');
        }).slice(0, 30);

        for (var i = 0; i < propKeys.length; i++) {
          var key = propKeys[i];
          result[key] = serializeValue(props[key], depth);
        }

        return Object.keys(result).length > 0 ? result : null;
      },

      // Check if fiber has state (hooks)
      hasState: function(fiber) {
        return !!(fiber && fiber.memoizedState);
      },

      // Build tree from fiber
      buildTreeFromFiber: function(fiber, depth) {
        if (!fiber || depth > this.maxDepth) return null;

        var componentName = this.getComponentName(fiber);
        var isComponent = !!componentName;
        var tagName = typeof fiber.type === 'string' ? fiber.type : null;

        // Skip text nodes and fragments
        if (!fiber.type || fiber.type === Symbol.for('react.fragment')) {
          // Process children directly
          var children = [];
          var child = fiber.child;
          while (child) {
            var childNode = this.buildTreeFromFiber(child, depth);
            if (childNode) {
              children.push(childNode);
            }
            child = child.sibling;
          }
          return children.length === 1 ? children[0] : (children.length > 0 ? { id: this.generateNodeId(), type: 'element', name: 'Fragment', children: children, depth: depth } : null);
        }

        var node = {
          id: this.generateNodeId(),
          type: isComponent ? 'component' : 'element',
          name: componentName || tagName || 'Unknown',
          depth: depth
        };

        if (tagName) {
          node.tagName = tagName;
        }

        // Add props for components
        if (isComponent && fiber.memoizedProps) {
          node.props = this.serializeProps(fiber.memoizedProps, 0);
        }

        // Check for state
        if (isComponent && this.hasState(fiber)) {
          node.hasState = true;
        }

        // Link to DOM element
        if (fiber.stateNode && fiber.stateNode.nodeType === 1) {
          var elemId = 'elem_' + this.nodeIdCounter;
          fiber.stateNode.setAttribute('data-tree-id', elemId);
          node.elementRef = elemId;
        }

        // Process children
        node.children = [];
        var childFiber = fiber.child;
        while (childFiber) {
          var childNode = this.buildTreeFromFiber(childFiber, depth + 1);
          if (childNode) {
            if (Array.isArray(childNode)) {
              node.children = node.children.concat(childNode);
            } else {
              node.children.push(childNode);
            }
          }
          childFiber = childFiber.sibling;
        }

        return node;
      },

      // Get full component tree starting from root
      getTree: function() {
        this.nodeIdCounter = 0;

        var root = document.getElementById('root');
        if (!root) return null;

        // Find React root fiber
        var fiber = this.getFiberFromElement(root);
        if (!fiber) {
          // Try to find from first child
          var firstChild = root.firstElementChild;
          if (firstChild) {
            fiber = this.getFiberFromElement(firstChild);
          }
        }

        if (!fiber) {
          console.log('[ComponentTree] No React fiber found');
          return null;
        }

        // Navigate to root fiber
        while (fiber.return) {
          fiber = fiber.return;
        }

        // Build tree
        return this.buildTreeFromFiber(fiber.child || fiber, 0);
      },

      // Find node by element ref
      findNodeByElementRef: function(tree, elementRef) {
        if (!tree) return null;
        if (tree.elementRef === elementRef) return tree;

        if (tree.children) {
          for (var i = 0; i < tree.children.length; i++) {
            var found = this.findNodeByElementRef(tree.children[i], elementRef);
            if (found) return found;
          }
        }

        return null;
      },

      // Get props and state for a specific node
      getNodeDetails: function(nodeId) {
        var element = document.querySelector('[data-ff-id="' + nodeId + '"]') ||
                      document.querySelector('[data-tree-id="' + nodeId + '"]');
        if (!element) return null;

        var fiber = this.getFiberFromElement(element);
        if (!fiber) return null;

        // Navigate to component fiber
        var componentFiber = fiber;
        while (componentFiber && typeof componentFiber.type !== 'function') {
          componentFiber = componentFiber.return;
        }

        if (!componentFiber) return null;

        var result = {
          name: this.getComponentName(componentFiber),
          props: this.serializeProps(componentFiber.memoizedProps, 0),
          state: null
        };

        // Extract state from hooks
        if (componentFiber.memoizedState) {
          result.state = this.extractHooksState(componentFiber.memoizedState);
        }

        return result;
      },

      // Extract state from hooks chain
      extractHooksState: function(memoizedState) {
        var states = [];
        var hook = memoizedState;
        var index = 0;

        while (hook && index < 20) {
          if (hook.memoizedState !== undefined && hook.memoizedState !== null) {
            var value = hook.memoizedState;

            // Skip non-serializable state
            if (typeof value !== 'function') {
              states.push({
                index: index,
                value: this.serializeProps({ v: value }, 0)?.v
              });
            }
          }
          hook = hook.next;
          index++;
        }

        return states.length > 0 ? states : null;
      }
    };

    // Handle component tree requests from parent
    window.addEventListener('message', function(event) {
      if (!event.data) return;

      if (event.data.type === 'REQUEST_COMPONENT_TREE') {
        var tree = window.__SANDBOX_COMPONENT_TREE__.getTree();
        window.__postToParent({
          type: 'COMPONENT_TREE_RESPONSE',
          requestId: event.data.requestId,
          tree: tree
        }, '*');
      }

      if (event.data.type === 'REQUEST_NODE_DETAILS') {
        var details = window.__SANDBOX_COMPONENT_TREE__.getNodeDetails(event.data.nodeId);
        window.__postToParent({
          type: 'NODE_DETAILS_RESPONSE',
          requestId: event.data.requestId,
          details: details
        }, '*');
      }

      if (event.data.type === 'HIGHLIGHT_TREE_NODE') {
        var element = document.querySelector('[data-ff-id="' + event.data.nodeId + '"]') ||
                      document.querySelector('[data-tree-id="' + event.data.nodeId + '"]');
        if (element) {
          // Remove previous highlights
          document.querySelectorAll('.tree-highlight').forEach(function(el) {
            el.classList.remove('tree-highlight');
          });
          element.classList.add('tree-highlight');
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  `;
}
