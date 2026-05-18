/**
 * Tool Executor Utility
 *
 * Handles tool execution for AI providers.
 * Supports project file operations and code generation tools.
 */

import type { ToolExecutor, ToolResult, AIToolDefinition } from '../types';
import { formatToolError } from './toolUtils';

// ============================================================================
// Default Tool Definitions
// ============================================================================

export const PROJECT_TOOLS: AIToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the project',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the project',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the project',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_files',
    description: 'List all files in the project',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional path to filter files' }
      }
    }
  },
  {
    name: 'create_directory',
    description: 'Create a directory in the project',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the directory' }
      },
      required: ['path']
    }
  },
  {
    name: 'search_files',
    description: 'Search for files containing a pattern',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex or text)' },
        path: { type: 'string', description: 'Optional path to search in' }
      },
      required: ['pattern']
    }
  }
];

// ============================================================================
// Tool Executor Implementation
// ============================================================================

export interface ToolContext {
  projectId?: string;
  allowWrites?: boolean;
}

/**
 * Create a tool executor with project context
 */
export function createToolExecutor(
  executeProjectTool: (toolName: string, args: Record<string, unknown>, context?: ToolContext) => Promise<ToolResult>
): ToolExecutor {
  return async (toolName: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      // Validate tool name
      if (!toolName || typeof toolName !== 'string') {
        return {
          id: toolId,
          name: toolName,
          success: false,
          error: 'Invalid tool name'
        };
      }

      // Execute the tool via the project handler
      const result = await executeProjectTool(toolName, args, {});
      return {
        id: toolId,
        name: toolName,
        success: result.success,
        result: result.result,
        error: result.error
      };
    } catch (error) {
      return {
        id: toolId,
        name: toolName,
        success: false,
        error: formatToolError(toolName, error)
      };
    }
  };
}

/**
 * Validate tool arguments against a tool definition
 */
export function validateToolArguments(
  args: Record<string, unknown>,
  parameters?: Record<string, unknown>
): { valid: boolean; error?: string } {
  if (!parameters || !parameters.properties) {
    return { valid: true };
  }

  const props = parameters.properties as Record<string, { type?: string; description?: string }>;
  const required = (parameters.required as string[]) || [];

  for (const req of required) {
    if (args[req] === undefined || args[req] === null) {
      return { valid: false, error: `Missing required parameter: ${req}` };
    }
  }

  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;

    const schema = props[key];
    if (!schema) continue;

    // Type validation (basic)
    const expectedType = schema.type;
    if (expectedType) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (expectedType !== actualType && actualType !== 'undefined') {
        return { valid: false, error: `Invalid type for ${key}: expected ${expectedType}, got ${actualType}` };
      }
    }
  }

  return { valid: true };
}

/**
 * Extract tool calls from a response
 */
export function extractToolCalls(response: unknown): Array<{ id: string; name: string; arguments: string }> {
  if (!response || typeof response !== 'object') {
    return [];
  }

  const msg = response as { tool_calls?: unknown };
  if (!Array.isArray(msg.tool_calls)) {
    return [];
  }

  return msg.tool_calls.map((tc: unknown) => {
    const toolCall = tc as { id?: string; function?: { name?: string; arguments?: string }; name?: string; arguments?: string };
    return {
      id: toolCall.id || `call_${Date.now()}`,
      name: toolCall.function?.name || toolCall.name || '',
      arguments: toolCall.function?.arguments || toolCall.arguments || '{}'
    };
  });
}

/**
 * Format tool result for message inclusion
 */
export function formatToolResultMessage(result: ToolResult): string {
  if (result.success) {
    const content = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
    return `Tool "${result.name}" succeeded:\n${content}`;
  }
  return `Tool "${result.name}" failed: ${result.error}`;
}