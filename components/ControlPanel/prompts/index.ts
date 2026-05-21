/**
 * Prompts Index
 *
 * Barrel export for AI prompt templates and system instructions that are
 * still consumed at runtime. The primary code-generation prompts live in
 * `prompts/*.md` and are loaded via `services/promptTemplates.ts` — not
 * from this file.
 */

export {
  buildInspectEditInstruction,
  CONSULTANT_SYSTEM_INSTRUCTION,
  SEARCH_REPLACE_MODE_INSTRUCTION,
  STANDARD_UPDATE_INSTRUCTION,
  CONTINUATION_SYSTEM_INSTRUCTION,
  CONTINUATION_SYSTEM_INSTRUCTION_MARKER,
  PROMPT_ENGINEER_SYSTEM,
  PROMPT_ENGINEER_STEP1,
  PROMPT_ENGINEER_STEP2,
  PROMPT_ENGINEER_STEP3,
  PROMPT_ENGINEER_FINAL,
} from './systemInstructions';
