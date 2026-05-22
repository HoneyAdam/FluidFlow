/**
 * Shared markdown rendering utilities
 * FIX-17: Consolidated from ChatPanel, TextExpandModal, MarkdownPreview
 */

/**
 * HTML entity escaping to prevent XSS attacks.
 * Escapes &, <, >, ", ' characters to their HTML entity equivalents.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => HTML_ENTITIES[char] ?? char);
}
