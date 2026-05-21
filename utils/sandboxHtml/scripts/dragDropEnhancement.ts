/**
 * Drag & Drop Enhancement Script
 *
 * Provides enhanced drag and drop functionality including
 * file handling, drop zones, and drag feedback.
 */

/**
 * Generate the drag & drop enhancement script for the sandbox
 */
export function getDragDropEnhancementScript(): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // DRAG & DROP ENHANCEMENT
    // File handling, drop zones, and drag feedback
    // ═══════════════════════════════════════════════════════════

    (function() {
      // Track active drop zones
      var dropZones = new Map();
      var dropZoneId = 0;

      // Track drag state
      var dragState = {
        isDragging: false,
        draggedElement: null,
        dragData: null,
        dropTarget: null,
        files: []
      };

      // File type validation helpers
      var fileTypeValidators = {
        image: function(file) {
          return file.type.startsWith('image/');
        },
        video: function(file) {
          return file.type.startsWith('video/');
        },
        audio: function(file) {
          return file.type.startsWith('audio/');
        },
        pdf: function(file) {
          return file.type === 'application/pdf';
        },
        text: function(file) {
          return file.type.startsWith('text/') || file.type === 'application/json';
        },
        archive: function(file) {
          return ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/gzip'].includes(file.type);
        }
      };

      // Read file as different formats
      function readFile(file, format) {
        return new Promise(function(resolve, reject) {
          var reader = new FileReader();

          reader.onload = function(e) {
            resolve(e.target.result);
          };

          reader.onerror = function(e) {
            reject(new Error('Failed to read file: ' + file.name));
          };

          switch (format) {
            case 'text':
              reader.readAsText(file);
              break;
            case 'dataURL':
              reader.readAsDataURL(file);
              break;
            case 'arrayBuffer':
              reader.readAsArrayBuffer(file);
              break;
            case 'binaryString':
              reader.readAsBinaryString(file);
              break;
            default:
              reader.readAsText(file);
          }
        });
      }

      // Create a drop zone
      function createDropZone(element, options) {
        if (!element) {
          console.error('[DragDrop] Element is required for drop zone');
          return null;
        }

        var id = ++dropZoneId;
        var config = {
          accept: options.accept || '*',
          multiple: options.multiple !== false,
          maxSize: options.maxSize || Infinity,
          maxFiles: options.maxFiles || Infinity,
          onDragEnter: options.onDragEnter || function() {},
          onDragLeave: options.onDragLeave || function() {},
          onDragOver: options.onDragOver || function() {},
          onDrop: options.onDrop || function() {},
          onError: options.onError || function(err) { console.error(err); },
          activeClass: options.activeClass || 'drop-zone-active',
          hoverClass: options.hoverClass || 'drop-zone-hover'
        };

        var dragCounter = 0;

        function validateFile(file) {
          // Check file type
          if (config.accept !== '*') {
            var accepts = config.accept.split(',').map(function(s) { return s.trim(); });
            var isValid = accepts.some(function(accept) {
              if (accept.startsWith('.')) {
                return file.name.toLowerCase().endsWith(accept.toLowerCase());
              }
              if (accept.endsWith('/*')) {
                return file.type.startsWith(accept.replace('/*', '/'));
              }
              return file.type === accept;
            });
            if (!isValid) {
              return { valid: false, error: 'File type not accepted: ' + file.type };
            }
          }

          // Check file size
          if (file.size > config.maxSize) {
            return { valid: false, error: 'File too large: ' + (file.size / 1024 / 1024).toFixed(2) + 'MB' };
          }

          return { valid: true };
        }

        function handleDragEnter(e) {
          e.preventDefault();
          e.stopPropagation();
          dragCounter++;

          if (dragCounter === 1) {
            element.classList.add(config.activeClass);
            config.onDragEnter(e);
          }
        }

        function handleDragLeave(e) {
          e.preventDefault();
          e.stopPropagation();
          dragCounter--;

          if (dragCounter === 0) {
            element.classList.remove(config.activeClass);
            element.classList.remove(config.hoverClass);
            config.onDragLeave(e);
          }
        }

        function handleDragOver(e) {
          e.preventDefault();
          e.stopPropagation();

          // Set drop effect
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
          }

          element.classList.add(config.hoverClass);
          config.onDragOver(e);
        }

        function handleDrop(e) {
          e.preventDefault();
          e.stopPropagation();

          dragCounter = 0;
          element.classList.remove(config.activeClass);
          element.classList.remove(config.hoverClass);

          var files = [];
          var errors = [];

          // Get files from drop
          if (e.dataTransfer && e.dataTransfer.files) {
            var fileList = Array.from(e.dataTransfer.files);

            // Check max files
            if (!config.multiple && fileList.length > 1) {
              fileList = [fileList[0]];
            }
            if (fileList.length > config.maxFiles) {
              errors.push('Too many files. Maximum: ' + config.maxFiles);
              fileList = fileList.slice(0, config.maxFiles);
            }

            // Validate each file
            fileList.forEach(function(file) {
              var validation = validateFile(file);
              if (validation.valid) {
                files.push(file);
              } else {
                errors.push(validation.error);
              }
            });
          }

          // Report errors
          if (errors.length > 0) {
            config.onError(errors);
          }

          // Call drop handler
          if (files.length > 0) {
            config.onDrop(files, e);

            // Notify parent
            window.__postToParent({
              type: 'FILE_DROP',
              fileCount: files.length,
              fileNames: files.map(function(f) { return f.name; }),
              timestamp: Date.now()
            }, '*');
          }
        }

        // Add event listeners
        element.addEventListener('dragenter', handleDragEnter);
        element.addEventListener('dragleave', handleDragLeave);
        element.addEventListener('dragover', handleDragOver);
        element.addEventListener('drop', handleDrop);

        // Store in registry
        var zone = {
          id: id,
          element: element,
          config: config,
          destroy: function() {
            element.removeEventListener('dragenter', handleDragEnter);
            element.removeEventListener('dragleave', handleDragLeave);
            element.removeEventListener('dragover', handleDragOver);
            element.removeEventListener('drop', handleDrop);
            element.classList.remove(config.activeClass);
            element.classList.remove(config.hoverClass);
            dropZones.delete(id);
          }
        };

        dropZones.set(id, zone);
        return zone;
      }

      // Make an element draggable
      function makeDraggable(element, options) {
        if (!element) return null;

        var config = {
          data: options.data || {},
          effectAllowed: options.effectAllowed || 'move',
          dragImage: options.dragImage || null,
          dragClass: options.dragClass || 'dragging',
          onDragStart: options.onDragStart || function() {},
          onDragEnd: options.onDragEnd || function() {}
        };

        element.setAttribute('draggable', 'true');

        function handleDragStart(e) {
          dragState.isDragging = true;
          dragState.draggedElement = element;
          dragState.dragData = config.data;

          element.classList.add(config.dragClass);

          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = config.effectAllowed;
            e.dataTransfer.setData('text/plain', JSON.stringify(config.data));

            if (config.dragImage) {
              e.dataTransfer.setDragImage(config.dragImage.element, config.dragImage.x || 0, config.dragImage.y || 0);
            }
          }

          config.onDragStart(e, config.data);
        }

        function handleDragEnd(e) {
          dragState.isDragging = false;
          dragState.draggedElement = null;
          dragState.dragData = null;

          element.classList.remove(config.dragClass);
          config.onDragEnd(e);
        }

        element.addEventListener('dragstart', handleDragStart);
        element.addEventListener('dragend', handleDragEnd);

        return {
          updateData: function(newData) {
            config.data = newData;
          },
          destroy: function() {
            element.removeEventListener('dragstart', handleDragStart);
            element.removeEventListener('dragend', handleDragEnd);
            element.removeAttribute('draggable');
          }
        };
      }

      // Inject default styles
      function injectStyles() {
        var style = document.createElement('style');
        style.textContent = \`
          .drop-zone-active {
            outline: 2px dashed #3b82f6;
            outline-offset: -2px;
          }
          .drop-zone-hover {
            background-color: rgba(59, 130, 246, 0.1);
          }
          .dragging {
            opacity: 0.5;
          }
          [draggable="true"] {
            cursor: grab;
          }
          [draggable="true"]:active {
            cursor: grabbing;
          }
        \`;
        document.head.appendChild(style);
      }

      injectStyles();

      // Global drag and drop for files (on document)
      var globalDropEnabled = false;

      function enableGlobalDrop(handler) {
        if (globalDropEnabled) return;
        globalDropEnabled = true;

        document.addEventListener('dragover', function(e) {
          e.preventDefault();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
          }
        });

        document.addEventListener('drop', function(e) {
          e.preventDefault();
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            var files = Array.from(e.dataTransfer.files);
            if (handler) {
              handler(files, e);
            }
          }
        });
      }

      // Expose API
      window.__SANDBOX_DRAGDROP__ = {
        // Create a drop zone
        createDropZone: createDropZone,

        // Make element draggable
        makeDraggable: makeDraggable,

        // Enable global file drop
        enableGlobalDrop: enableGlobalDrop,

        // Get drag state
        getDragState: function() {
          return Object.assign({}, dragState);
        },

        // Read file helpers
        readAsText: function(file) {
          return readFile(file, 'text');
        },
        readAsDataURL: function(file) {
          return readFile(file, 'dataURL');
        },
        readAsArrayBuffer: function(file) {
          return readFile(file, 'arrayBuffer');
        },

        // File type validators
        isImage: fileTypeValidators.image,
        isVideo: fileTypeValidators.video,
        isAudio: fileTypeValidators.audio,
        isPdf: fileTypeValidators.pdf,
        isText: fileTypeValidators.text,
        isArchive: fileTypeValidators.archive,

        // Get active drop zones
        getDropZones: function() {
          var result = [];
          dropZones.forEach(function(zone) {
            result.push({
              id: zone.id,
              element: zone.element.tagName + (zone.element.id ? '#' + zone.element.id : ''),
              accept: zone.config.accept
            });
          });
          return result;
        },

        // Destroy all drop zones
        destroyAll: function() {
          dropZones.forEach(function(zone) {
            zone.destroy();
          });
        }
      };

    })();
  `;
}
