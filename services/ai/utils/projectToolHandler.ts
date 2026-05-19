/**
 * Project Tool Handler
 *
 * Implements tool execution for project file operations.
 * Used by AI providers with tool calling enabled.
 */

import type { ToolResult } from '../types';
import { projectApi } from '../../api/projects';
import { debugLog } from '../../../hooks/useDebugStore';

// UUID v4 validation (same as server-side validation)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidProjectId(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Execute a project file tool
 */
export async function executeProjectTool(
  toolName: string,
  args: Record<string, unknown>,
  context: { projectId?: string; allowWrites?: boolean }
): Promise<ToolResult> {
  const { projectId, allowWrites = false } = context;

  if (!projectId) {
    const error = 'No project ID provided';
    debugLog.toolCall('generation', {
      toolCallInfo: { toolName, arguments: args, result: null, success: false, error },
    });
    return { id: '', name: toolName, success: false, error };
  }

  if (!isValidProjectId(projectId)) {
    const error = `Invalid project ID format: ${projectId}`;
    debugLog.toolCall('generation', {
      toolCallInfo: { toolName, arguments: args, result: null, success: false, error },
    });
    return { id: '', name: toolName, success: false, error };
  }

  try {
    switch (toolName) {
      case 'read_file': {
        const path = args.path as string;
        if (!path) {
          return { id: '', name: toolName, success: false, error: 'Missing required parameter: path' };
        }
        const content = await projectApi.readFile(projectId, path);
        debugLog.toolCall('generation', {
          toolCallInfo: {
            toolName,
            arguments: { path },
            result: { path, contentLength: content.length },
            success: true,
          },
        });
        return { id: '', name: toolName, success: true, result: { path, content } };
      }

      case 'write_file': {
        if (!allowWrites) {
          return { id: '', name: toolName, success: false, error: 'Tool writes are not allowed' };
        }
        const path = args.path as string;
        const content = args.content as string;
        if (!path || content === undefined) {
          return { id: '', name: toolName, success: false, error: 'Missing required parameters: path, content' };
        }
        await projectApi.saveFile(projectId, path, content);
        debugLog.toolCall('generation', {
          toolCallInfo: {
            toolName,
            arguments: { path, contentLength: content.length },
            result: { path, written: true },
            success: true,
            filesWritten: [path],
          },
        });
        return { id: '', name: toolName, success: true, result: { path, written: true }, filesWritten: [path] };
      }

      case 'delete_file': {
        if (!allowWrites) {
          return { id: '', name: toolName, success: false, error: 'Tool writes are not allowed' };
        }
        const path = args.path as string;
        if (!path) {
          return { id: '', name: toolName, success: false, error: 'Missing required parameter: path' };
        }
        await projectApi.deleteFile(projectId, path);
        debugLog.toolCall('generation', {
          toolCallInfo: {
            toolName,
            arguments: { path },
            result: { path, deleted: true },
            success: true,
            filesWritten: [path],
          },
        });
        return { id: '', name: toolName, success: true, result: { path, deleted: true }, filesWritten: [path] };
      }

      case 'list_files': {
        // Get project to list all files
        const project = await projectApi.get(projectId);
        const files = Object.keys(project.files || {});
        debugLog.toolCall('generation', {
          toolCallInfo: {
            toolName,
            arguments: {},
            result: { fileCount: files.length },
            success: true,
          },
        });
        return { id: '', name: toolName, success: true, result: { files } };
      }

      case 'search_files': {
        const pattern = args.pattern as string;
        if (!pattern) {
          return { id: '', name: toolName, success: false, error: 'Missing required parameter: pattern' };
        }
        const project = await projectApi.get(projectId);
        const regex = new RegExp(pattern);
        const matchingFiles = Object.entries(project.files || {})
          .filter(([filePath]) => regex.test(filePath))
          .map(([filePath, content]) => ({ path: filePath, matches: (content as string).match(regex) || [] }));
        debugLog.toolCall('generation', {
          toolCallInfo: {
            toolName,
            arguments: { pattern },
            result: { matchCount: matchingFiles.length },
            success: true,
          },
        });
        return { id: '', name: toolName, success: true, result: { files: matchingFiles } };
      }

      case 'create_directory': {
        if (!allowWrites) {
          return { id: '', name: toolName, success: false, error: 'Tool writes are not allowed' };
        }
        const path = args.path as string;
        if (!path) {
          return { id: '', name: toolName, success: false, error: 'Missing required parameter: path' };
        }
        // Directories are created implicitly when files are written
        // We just return success if the path looks valid
        debugLog.toolCall('generation', {
          toolCallInfo: {
            toolName,
            arguments: { path },
            result: { path, created: true },
            success: true,
          },
        });
        return { id: '', name: toolName, success: true, result: { path, created: true } };
      }

      default:
        debugLog.toolCall('generation', {
          toolCallInfo: {
            toolName,
            arguments: args,
            result: null,
            success: false,
            error: `Unknown tool: ${toolName}`,
          },
        });
        return { id: '', name: toolName, success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debugLog.toolCall('generation', {
      toolCallInfo: {
        toolName,
        arguments: args,
        result: null,
        success: false,
        error: errorMessage,
      },
    });
    return {
      id: '',
      name: toolName,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Create a tool executor for project operations
 */
export function createProjectToolExecutor(projectId: string, allowWrites = false) {
  // Validate projectId format before creating executor
  if (!isValidProjectId(projectId)) {
    console.warn(`[ToolExecutor] Invalid project ID format: ${projectId}`);
    // Return a dummy executor that always fails
    return async (toolName: string, _args: Record<string, unknown>): Promise<ToolResult> => {
      return {
        id: '',
        name: toolName,
        success: false,
        error: `Invalid project ID format: ${projectId}`,
      };
    };
  }

  return async (toolName: string, args: Record<string, unknown>): Promise<ToolResult> => {
    return executeProjectTool(toolName, args, { projectId, allowWrites });
  };
}