# Tool Calling Implementation Plan for FluidFlow

## Executive Summary

This plan addresses inconsistent tool calling implementations across OpenAI-compatible providers, with ZAI being the most problematic. The solution creates a unified `ToolCallHandler` utility that standardizes tool call accumulation, execution, filesWritten tracking, and debug logging.

---

## 1. Problem Analysis

### 1.1 Key Issues Identified

| Issue | ZAI Provider | OpenAICompatibleProvider |
|-------|---------------|---------------------------|
| Tool call accumulation | Uses raw `toolCalls` array with manual accumulation | Uses `accumulatedToolCalls` array with proper structure |
| assistantMessage building | Can be null when finish_reason is 'tool_calls' | Properly builds assistant message with tool_calls |
| filesWritten tracking | Manually accumulated but inconsistent | Properly tracked via `executeToolCallsWithResults` |
| Debug logging | Scattered console.log statements | Better logging but no dedicated tool call events |
| Follow-up request | Non-streaming follow-up | Non-streaming follow-up (same pattern) |

### 1.2 Specific Problems in ZAI Provider (zai.ts)

```typescript
// PROBLEM: assistantMessage can be null even when tool_calls exist
if (chunk.choices[0]?.finish_reason === 'tool_calls' && !assistantMessage) {
    assistantMessage = {
        role: 'assistant',
        content: null,
        tool_calls: toolCalls,  // Uses raw accumulated toolCalls
    };
}
// ...later...
if (toolCalls.length > 0 && request.toolExecutor && assistantMessage) {
    // This condition can pass even when assistantMessage was artificially constructed
```

### 1.3 Data Flow Diagram

```
Request with tools
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Streaming Response                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Chunk 1: delta.content = "I'll use a tool"            ││
│  │  Chunk 2: delta.tool_calls = [{id: "1", function: {...}}]││
│  │  ...                                                    ││
│  │  Final chunk: finish_reason = "tool_calls"             ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  ToolCallHandler.accumulate(chunk)                          │
│  - Parses delta.tool_calls                                  │
│  - Accumulates arguments (streaming partial JSON)          │
│  - Tracks completion state                                  │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  ToolCallHandler.execute(toolExecutor)                      │
│  - Parses arguments via parseToolArguments                  │
│  - Executes each tool                                       │
│  - Collects filesWritten                                    │
│  - Returns ToolExecutionResult                              │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  ToolCallHandler.buildFollowUpMessages(assistantMsg, results)│
│  - Builds properly structured messages array                │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
Follow-up Request
    │
    ▼
Final Response
```

---

## 2. New Unified ToolCallHandler Implementation

### 2.1 File Location

Create: `services/ai/utils/ToolCallHandler.ts`

### 2.2 Core Interface Design

```typescript
// ============================================================================
// Tool Call Handler - Unified Tool Calling Utility
// ============================================================================

import type { ToolExecutor, ToolResult } from '../types';
import { parseToolArguments, formatToolError } from './toolUtils';
import { debugLog } from '../../hooks/useDebugStore';

/**
 * Represents a single accumulated tool call ready for execution.
 */
export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;  // Raw JSON string, needs parsing
  argumentsParsed?: Record<string, unknown>;  // Lazily parsed
}

/**
 * Result of executing all tool calls in a streaming session.
 */
export interface ToolExecutionResult {
  messages: ChatMessage[];  // Tool result messages to append
  filesWritten: string[];
  toolCallsExecuted: number;
  errors: Array<{ toolName: string; error: string }>;
}

/**
 * State of tool call accumulation during streaming.
 */
export interface ToolCallAccumulator {
  toolCalls: AccumulatedToolCall[];
  finishReason: string | undefined;
  hasAllContent: boolean;  // True when finish_reason = 'tool_calls'
}

/**
 * Chat message structure for tool results.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: unknown[];
}

// ============================================================================
// ToolCallHandler Class
// ============================================================================

export class ToolCallHandler {
  private accumulatedToolCalls: Map<string, AccumulatedToolCall> = new Map();
  private finishReason: string | undefined;
  private debugEnabled: boolean;

  constructor(debugEnabled = true) {
    this.debugEnabled = debugEnabled;
  }

  // ============================================================================
  // Accumulation Methods (for streaming)
  // ============================================================================

  /**
   * Process a streaming chunk and accumulate tool calls.
   * Handles partial JSON arguments by merging chunks.
   */
  accumulate(chunk: {
    choices?: Array<{
      delta?: {
        content?: string;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
          name?: string;
          arguments?: string;
        }>;
      };
      finish_reason?: string;
    }>;
  }): ToolCallAccumulator {
    const delta = chunk.choices?.[0]?.delta;
    const finishReason = chunk.choices?.[0]?.finish_reason;

    if (finishReason) {
      this.finishReason = finishReason;
    }

    // Process tool calls from delta
    if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const id = tc.id || '';
        const name = tc.function?.name || tc.name || '';

        if (!id) continue;

        const existing = this.accumulatedToolCalls.get(id);
        const argumentsDelta = tc.function?.arguments || tc.arguments || '';

        if (existing) {
          // Merge partial arguments (streaming JSON)
          existing.arguments += argumentsDelta;
        } else {
          // New tool call
          this.accumulatedToolCalls.set(id, {
            id,
            name,
            arguments: argumentsDelta,
          });
        }
      }
    }

    const toolCalls = Array.from(this.accumulatedToolCalls.values());
    const hasAllContent = this.finishReason === 'tool_calls' && toolCalls.length > 0;

    if (this.debugEnabled && toolCalls.length > 0) {
      console.log(`[ToolCallHandler] Accumulated: ${toolCalls.length} tool calls, finishReason: ${this.finishReason}, hasAllContent: ${hasAllContent}`);
    }

    return { toolCalls, finishReason: this.finishReason, hasAllContent };
  }

  /**
   * Get currently accumulated tool calls.
   */
  getAccumulatedToolCalls(): AccumulatedToolCall[] {
    return Array.from(this.accumulatedToolCalls.values());
  }

  /**
   * Check if we have complete tool calls ready for execution.
   */
  isReadyForExecution(): boolean {
    return this.finishReason === 'tool_calls' && this.accumulatedToolCalls.size > 0;
  }

  /**
   * Reset the handler for a new streaming session.
   */
  reset(): void {
    this.accumulatedToolCalls.clear();
    this.finishReason = undefined;
  }

  // ============================================================================
  // Execution Methods
  // ============================================================================

  /**
   * Execute accumulated tool calls using the provided executor.
   */
  async execute(
    toolExecutor: ToolExecutor,
    requestId?: string
  ): Promise<ToolExecutionResult> {
    const toolCalls = this.getAccumulatedToolCalls();
    const filesWritten: string[] = [];
    const messages: ChatMessage[] = [];
    const errors: Array<{ toolName: string; error: string }> = [];

    if (toolCalls.length === 0) {
      return { messages, filesWritten, toolCallsExecuted: 0, errors };
    }

    console.log(`[ToolCallHandler] Executing ${toolCalls.length} tool calls`);

    for (const tc of toolCalls) {
      const startTime = Date.now();

      // Log tool call start
      if (this.debugEnabled && requestId) {
        debugLog.info('tool-call', `Executing tool: ${tc.name}`, {
          id: requestId,
          metadata: {
            toolCallId: tc.id,
            toolName: tc.name,
            argumentsPreview: tc.arguments.slice(0, 100),
          },
        });
      }

      try {
        // Parse arguments lazily
        const args = tc.argumentsParsed ?? parseToolArguments(tc.arguments);
        tc.argumentsParsed = args;

        // Execute tool
        const result = await toolExecutor(tc.name, args);
        const duration = Date.now() - startTime;

        // Log tool result
        if (this.debugEnabled && requestId) {
          debugLog.info('tool-call', `Tool executed: ${tc.name} (${duration}ms)`, {
            id: `${requestId}-${tc.id}`,
            metadata: {
              toolCallId: tc.id,
              toolName: tc.name,
              success: result.success,
              duration,
              filesWritten: result.filesWritten?.length ?? 0,
            },
          });
        }

        // Collect files written
        if (result.filesWritten && result.filesWritten.length > 0) {
          filesWritten.push(...result.filesWritten);
        }

        // Build tool result message
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: result.success
            ? typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result || { success: true })
            : `Error: ${result.error || 'Unknown error'}`,
        });

        if (!result.success) {
          errors.push({ toolName: tc.name, error: result.error || 'Unknown error' });
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error(`[ToolCallHandler] Tool execution error: ${tc.name}`, errorMessage);

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: `Error: ${formatToolError(tc.name, error)}`,
        });

        errors.push({ toolName: tc.name, error: errorMessage });

        if (this.debugEnabled && requestId) {
          debugLog.error('tool-call', `Tool failed: ${tc.name}`, {
            id: `${requestId}-${tc.id}`,
            metadata: { toolCallId: tc.id, toolName: tc.name, duration, error: errorMessage },
          });
        }
      }
    }

    console.log(`[ToolCallHandler] Execution complete: ${messages.length} results, ${filesWritten.length} files written`);

    return { messages, filesWritten, toolCallsExecuted: toolCalls.length, errors };
  }

  // ============================================================================
  // Message Building Helpers
  // ============================================================================

  /**
   * Build the assistant message from accumulated tool calls.
   */
  buildAssistantMessage(): ChatMessage | null {
    const toolCalls = this.getAccumulatedToolCalls();

    if (toolCalls.length === 0) {
      return null;
    }

    return {
      role: 'assistant',
      content: null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      })),
    };
  }

  /**
   * Build the complete messages array for follow-up request.
   */
  buildFollowUpMessages(
    existingMessages: ChatMessage[],
    assistantMessage: ChatMessage,
    toolResults: ChatMessage[]
  ): ChatMessage[] {
    const messages = [...existingMessages];
    messages.push(assistantMessage);
    messages.push(...toolResults);
    return messages;
  }
}

// ============================================================================
// Helper Functions (for non-class usage)
// ============================================================================

/**
 * Create a pre-configured ToolCallHandler instance.
 */
export function createToolCallHandler(): ToolCallHandler {
  return new ToolCallHandler(true);
}

/**
 * Check if a streaming chunk indicates tool calls are present.
 */
export function hasToolCallsInChunk(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== 'object') return false;

  const c = chunk as {
    choices?: Array<{
      delta?: { tool_calls?: unknown };
      finish_reason?: string;
    }>;
  };

  const delta = c.choices?.[0]?.delta;
  const hasToolCalls = Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0;
  const finishReason = c.choices?.[0]?.finish_reason;

  return hasToolCalls || finishReason === 'tool_calls';
}

/**
 * Extract tool calls from a non-streaming response.
 */
export function extractToolCallsFromResponse(
  response: { choices?: Array<{ message?: { tool_calls?: unknown } }> }
): Array<{ id: string; name: string; arguments: string }> {
  const toolCalls = response.choices?.[0]?.message?.tool_calls;

  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls.map((tc: unknown) => {
    const toolCall = tc as {
      id?: string;
      function?: { name?: string; arguments?: string };
      name?: string;
      arguments?: string;
    };

    return {
      id: toolCall.id || `call_${Date.now()}`,
      name: toolCall.function?.name || toolCall.name || '',
      arguments: toolCall.function?.arguments || toolCall.arguments || '{}',
    };
  });
}
```

---

## 3. ZAI Provider Fix Implementation

### 3.1 Required Changes to zai.ts

```typescript
// At the top of zai.ts, add import:
import { ToolCallHandler, createToolCallHandler } from '../utils/ToolCallHandler';

// Replace the generateStream method's tool call handling section with:

async generateStream(
  request: GenerationRequest,
  model: string,
  onChunk: (chunk: StreamChunk) => void
): Promise<GenerationResponse> {
  // ... existing setup code ...

  try {
    const stream = await this.client.chat.completions.create(requestParams);

    // Use unified tool call handler
    const toolCallHandler = createToolCallHandler();
    let fullText = '';
    let finishReason: string | undefined;
    let usage: GenerationResponse['usage'];
    let streamedText = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const content = delta?.content || '';

      // Accumulate tool calls using unified handler
      const accumulator = toolCallHandler.accumulate(chunk);
      finishReason = accumulator.finishReason;

      if (content) {
        fullText += content;
        streamedText += content;
        onChunk({ text: content, done: false });
      }

      // Capture usage if available
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }
    }

    // Final chunk
    onChunk({ text: '', done: true });

    // Handle tool calls if ready
    if (toolCallHandler.isReadyForExecution() && request.toolExecutor) {
      console.log('[ZAI] Tool calls detected, executing...');

      const assistantMessage = toolCallHandler.buildAssistantMessage();

      if (!assistantMessage) {
        console.error('[ZAI] Failed to build assistant message for tool calls');
        throw new Error('Tool call handling failed: no assistant message');
      }

      // Execute tool calls
      const execResult = await toolCallHandler.execute(request.toolExecutor, 'zai-tool-call');

      // Add files written to debug log
      if (execResult.filesWritten.length > 0) {
        debugLog.info('tool-call', `Files written via tool calling: ${execResult.filesWritten.length}`, {
          metadata: { files: execResult.filesWritten },
        });
      }

      // Build messages for follow-up
      const followUpMessages = toolCallHandler.buildFollowUpMessages(messages, assistantMessage, execResult.messages);

      // Make follow-up request
      const followUp = await this.client.chat.completions.create({
        model: model || this.config.defaultModel || DEFAULT_MODEL,
        messages: followUpMessages,
        max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
        temperature: request.temperature ?? 0.7,
      });

      const followUpText = followUp.choices[0]?.message?.content || '';

      return {
        text: followUpText,
        finishReason: followUp.choices[0]?.finish_reason || undefined,
        usage: {
          inputTokens: followUp.usage?.prompt_tokens || usage?.inputTokens,
          outputTokens: followUp.usage?.completion_tokens || usage?.outputTokens,
        },
        filesWritten: execResult.filesWritten.length > 0 ? execResult.filesWritten : undefined,
      };
    }

    // No tool calls - return normal response
    return { text: fullText, finishReason, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ZAI] Stream failed:', message);
    throw new Error(`ZAI API error: ${message}`);
  }
}
```

### 3.2 Remove Old Manual Tool Call Handling

Delete these sections from the current zai.ts:
- The `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments and `any` type declarations for toolCalls and assistantMessage
- The manual accumulation pattern: `toolCalls.push(...delta.tool_calls);`
- The manual assistantMessage construction with null content check
- The manual result building with filesWritten.push()

---

## 4. OpenAICompatibleProvider Enhancement

### 4.1 Changes to base provider

Update `OpenAICompatibleProvider.ts` to use `ToolCallHandler` internally:

```typescript
// Add import at top
import { ToolCallHandler, createToolCallHandler } from '../../utils/ToolCallHandler';

// In processStreamingWithTools method, replace manual accumulation with:

private async processStreamingWithTools(
  response: Response,
  messages: ChatMessage[],
  model: string,
  baseBody: ChatCompletionRequest,
  request: GenerationRequest,
  onChunk: (chunk: StreamChunk) => void
): Promise<GenerationResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finishReason: string | undefined;
  let usage: GenerationResponse['usage'];
  const toolCallHandler = createToolCallHandler();
  const filesWritten: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5).trim();
          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.delta?.content || '';
            if (text) {
              fullText += text;
              onChunk({ text, done: false });
            }

            // Use unified handler for tool call accumulation
            const accumulator = toolCallHandler.accumulate(parsed);
            finishReason = accumulator.finishReason;

            // Capture usage if available
            if (parsed.usage) {
              usage = {
                inputTokens: parsed.usage.prompt_tokens,
                outputTokens: parsed.usage.completion_tokens,
              };
            }
          } catch {
            // Skip parse errors for partial data
          }
        }
      }
    }

    // Final chunk
    onChunk({ text: '', done: true });

    // Handle tool calls if ready
    if (toolCallHandler.isReadyForExecution() && request.toolExecutor) {
      console.log('[OpenAICompatibleProvider] Tool calls detected');

      const assistantMessage = toolCallHandler.buildAssistantMessage();

      if (assistantMessage) {
        const execResult = await toolCallHandler.execute(request.toolExecutor, 'openai-compatible-tool-call');

        filesWritten.push(...execResult.filesWritten);

        // Add tool results to messages
        messages.push(assistantMessage);
        messages.push(...execResult.messages);

        // Make follow-up request
        const followUpBody: ChatCompletionRequest = {
          ...baseBody,
          model,
          messages,
          stream: false,
        };
        delete followUpBody.stream_options;

        const followUpResponse = await fetchWithTimeout(this.getApiEndpoint(), {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(followUpBody),
          timeout: TIMEOUT_GENERATE,
        });

        await throwIfNotOk(followUpResponse, this.config.type);
        const followUpData = await followUpResponse.json();

        const followUpText = followUpData.choices?.[0]?.message?.content || '';
        return {
          text: followUpText,
          finishReason: followUpData.choices?.[0]?.finish_reason,
          usage: {
            inputTokens: followUpData.usage?.prompt_tokens,
            outputTokens: followUpData.usage?.completion_tokens,
          },
          filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
        };
      }
    }

    return {
      text: fullText,
      finishReason,
      usage,
      filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
    };
  } finally {
    reader.releaseLock();
  }
}
```

---

## 5. Debug Logging Integration

### 5.1 New Debug Log Category

Add `'tool-call'` to the valid categories in `useDebugStore.ts`:

```typescript
const VALID_CATEGORIES = [
  'generation',
  'accessibility',
  'quick-edit',
  'auto-fix',
  'git-commit',
  'auto-commit',
  'prompt-improver',
  'tool-call',  // NEW
  'other'
] as const;
```

### 5.2 DebugLogEntry Extension (Optional Enhancement)

Consider adding optional tool call specific fields to `DebugLogEntry`:

```typescript
// In types/index.ts - Optional extension
export interface DebugLogEntry {
  // ... existing fields ...

  // NEW: Tool call specific fields
  toolCalls?: Array<{
    id: string;
    name: string;
    argumentsPreview: string;
    result?: string;
    duration?: number;
    filesWritten?: string[];
  }>;
}
```

### 5.3 Tool Call Debug Events

The `ToolCallHandler` logs these events:
1. **Tool call detected** - When tool_calls are accumulated during streaming
2. **Tool execution start** - Before each tool is executed (with arguments preview)
3. **Tool execution complete** - After each tool succeeds or fails
4. **Files written** - Summary of all files modified by tools

Example debug log entries:

```
[timestamp] INFO tool-call: Executing tool: write_file
  metadata: { toolCallId: "call_123", toolName: "write_file", argumentsPreview: "{\"path\":\"src/App.tsx\"" }

[timestamp] INFO tool-call: Tool executed: write_file (245ms)
  metadata: { toolCallId: "call_123", toolName: "write_file", success: true, duration: 245, filesWritten: 1 }

[timestamp] INFO tool-call: Files written via tool calling: 2
  metadata: { files: ["src/App.tsx", "src/index.css"] }
```

---

## 6. DebugPanel Tool Call Visualization

### 6.1 Add Tool Call Filter Option

In `DebugPanel.tsx`, add 'tool-call' to category options:

```typescript
const categoryOptions: DebugLogEntry['category'][] = [
  'generation',
  'accessibility',
  'quick-edit',
  'auto-fix',
  'tool-call',  // ADD THIS
  'other'
];
```

### 6.2 Enhanced LogEntryCard for Tool Calls

Add special rendering for tool call entries in the card:

```typescript
// In LogEntryCard, add tool call icon
const typeConfig = {
  request: { icon: ArrowUpCircle, colorVar: 'var(--color-info)', bgVar: 'var(--color-info-subtle)' },
  response: { icon: ArrowDownCircle, colorVar: 'var(--color-success)', bgVar: 'var(--color-success-subtle)' },
  stream: { icon: Radio, colorVar: 'var(--color-feature)', bgVar: 'var(--color-feature-subtle)' },
  error: { icon: AlertCircle, colorVar: 'var(--color-error)', bgVar: 'var(--color-error-subtle)' },
  info: { icon: Info, colorVar: 'var(--theme-text-muted)', bgVar: 'var(--theme-glass-100)' },
  // ADD tool-call type
  'tool-call': { icon: Wrench, colorVar: 'var(--color-warning)', bgVar: 'var(--color-warning-subtle)' },
};
```

### 6.3 Tool Call Section in Expanded View

When expanding a tool-call log entry, show structured tool call details:

```tsx
{entry.metadata?.toolCallId && (
  <div>
    <div className="text-xs mb-1 font-medium" style={{ color: 'var(--theme-text-muted)' }}>
      Tool Call
    </div>
    <div className="rounded p-2 text-xs font-mono overflow-auto max-h-48" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
      <div>ID: {entry.metadata.toolCallId}</div>
      <div>Name: {entry.metadata.toolName}</div>
      {entry.metadata.duration && <div>Duration: {entry.metadata.duration}ms</div>}
      {entry.metadata.filesWritten && (
        <div>Files: {entry.metadata.filesWritten.join(', ')}</div>
      )}
    </div>
  </div>
)}
```

---

## 7. filesWritten Tracking Guarantee

### 7.1 Contract for filesWritten

Every provider that supports tool calling MUST:
1. Return `filesWritten: string[]` in the `GenerationResponse` when tools modify files
2. Track files at execution time, not at response parsing time
3. Use `ToolCallHandler.execute()` which guarantees proper tracking

### 7.2 Flow for filesWritten

```
ToolExecutor returns ToolResult with filesWritten
       │
       ▼
ToolCallHandler.execute() collects filesWritten from each result
       │
       ▼
ToolCallHandler.execute() returns ToolExecutionResult with all filesWritten
       │
       ▼
Provider returns GenerationResponse with filesWritten = execResult.filesWritten
       │
       ▼
useStreamingResponse() extracts filesWritten from streamResponse
       │
       ▼
useCodeGeneration() handles tool calling mode with filesWritten
```

### 7.3 Verification Checklist

After implementation, verify:
- [ ] ZAI provider returns filesWritten when write_file tool is called
- [ ] OpenAICompatibleProvider returns filesWritten when tools modify files
- [ ] Debug panel shows tool call events with file modifications
- [ ] Tool calling mode in useCodeGeneration correctly loads written files
- [ ] No console warnings about null assistantMessage in ZAI provider

---

## 8. Implementation Order

### Phase 1: Core Utility (Day 1)
1. Create `services/ai/utils/ToolCallHandler.ts`
2. Implement accumulation logic
3. Implement execution with filesWritten tracking
4. Add debug logging integration

### Phase 2: ZAI Provider Fix (Day 1-2)
1. Import ToolCallHandler into zai.ts
2. Replace manual accumulation with `toolCallHandler.accumulate()`
3. Replace manual execution with `toolCallHandler.execute()`
4. Remove old manual handling code
5. Test with actual tool calls

### Phase 3: Base Provider Enhancement (Day 2)
1. Import ToolCallHandler into OpenAICompatibleProvider.ts
2. Replace manual accumulation in `processStreamingWithTools`
3. Verify filesWritten tracking works

### Phase 4: Debug Integration (Day 2-3)
1. Add 'tool-call' category to useDebugStore.ts
2. Add tool call filter to DebugPanel.tsx
3. Add special rendering for tool call entries

### Phase 5: Testing & Polish (Day 3)
1. Integration testing with all providers
2. Verify debug logs show correct tool call flow
3. Verify filesWritten propagates correctly end-to-end

---

## 9. Risk Mitigation

### Risk 1: Backward Compatibility
**Mitigation**: The ToolCallHandler is additive - providers can still use existing code while migrating. The new implementation must produce identical results to the old code.

### Risk 2: Streaming Edge Cases
**Mitigation**: The accumulation logic handles partial JSON by string concatenation. The `parseToolArguments` function already handles incomplete JSON with fallback parsing.

### Risk 3: Debug Log Performance
**Mitigation**: Debug logging is optional and controlled by `debugEnabled` flag. When disabled, no overhead is added. When enabled, logs are debounced to avoid flooding the UI.

---

## 10. File Summary

### Files to CREATE:
- `services/ai/utils/ToolCallHandler.ts` - New unified utility

### Files to MODIFY:
- `services/ai/providers/zai.ts` - Use ToolCallHandler, remove manual handling
- `services/ai/providers/base/OpenAICompatibleProvider.ts` - Use ToolCallHandler
- `hooks/useDebugStore.ts` - Add 'tool-call' category
- `types/index.ts` - (Optional) Add tool call fields to DebugLogEntry
- `components/PreviewPanel/DebugPanel.tsx` - Add tool-call filter and rendering

---

## 11. Success Metrics

1. ZAI provider tool calls work identically to OpenAI compatible providers
2. No null assistantMessage warnings in console during tool calling
3. filesWritten is correctly returned for all providers
4. Debug panel shows structured tool call events
5. Code duplication reduced by extracting common logic to ToolCallHandler