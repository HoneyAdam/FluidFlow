/**
 * Project Tool Handler
 *
 * Implements tool execution for project file operations.
 * Used by AI providers with tool calling enabled.
 */

import type { ToolResult } from '../types';
import { projectApi } from '../../api/projects';

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
    return {
      id: '',
      name: toolName,
      success: false,
      error: 'No project ID provided',
    };
  }

  try {
    switch (toolName) {
      case 'read_file': {
        const path = args.path as string;
        if (!path) {
          return { id: '', name: toolName, success: false, error: 'Missing required parameter: path' };
        }
        const content = await projectApi.readFile(projectId, path);
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
        return { id: '', name: toolName, success: true, result: { path, written: true } };
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
        return { id: '', name: toolName, success: true, result: { path, deleted: true } };
      }

      case 'list_files': {
        // Get project to list all files
        const project = await projectApi.get(projectId);
        const files = Object.keys(project.files || {});
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
        return { id: '', name: toolName, success: true, result: { path, created: true } };
      }

      default:
        return { id: '', name: toolName, success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return {
      id: '',
      name: toolName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create a tool executor for project operations
 */
export function createProjectToolExecutor(projectId: string, allowWrites = false) {
  return async (toolName: string, args: Record<string, unknown>): Promise<ToolResult> => {
    return executeProjectTool(toolName, args, { projectId, allowWrites });
  };
}