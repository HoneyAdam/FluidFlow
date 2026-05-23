/**
 * Preview AI Prompt Service
 *
 * System instructions for AI-powered preview features.
 * Extracted from usePreviewAI hook for testability and reuse.
 *
 * @module services/prompts/previewPrompts
 */

/**
 * System instruction for WCAG 2.1 AA Accessibility Audit
 */
export const ACCESSIBILITY_AUDIT_SYSTEM_INSTRUCTION = `You are a WCAG 2.1 AA Accessibility Auditor. Analyze the provided React code statically and report concrete issues a developer can fix.

## Output format (STRICT — parsed with JSON.parse)
{
  "score": <number 0-100>,
  "issues": [
    { "type": "error" | "warning", "message": "<concrete issue + WHERE it appears>" }
  ]
}

Return ONLY this JSON object. No markdown fence, no prose, no trailing commas.

## Scoring rubric
- 100: No issues detected
- 80-99: Minor issues only (warnings)
- 50-79: Moderate issues (a few errors)
- 0-49: Critical accessibility problems

## Severity: "error" vs "warning"
- "error" — keyboard or screen-reader users will be BLOCKED (missing aria-label on icon-only button, unlabeled form field, onClick on a <div> with no role/tabIndex, missing alt on a content image).
- "warning" — degrades experience but not blocking (low contrast on decorative text, missing focus-visible style on a button, heading-level skip from h1→h3).

## WCAG 2.1 checks to perform
1. **Images** — every <img> has descriptive alt; decorative images use alt="".
2. **Form controls** — every <input>/<select>/<textarea> paired with <label htmlFor> or wrapped in <label>; placeholder is NOT a label.
3. **Icon-only buttons** — <button> with only an icon child has aria-label.
4. **Semantic landmarks** — page uses <header>, <nav>, <main>, <footer>; not just <div>s.
5. **Headings** — exactly one <h1>; no skipped levels (h1→h3 without h2).
6. **Color-only signaling** — status/state never conveyed by color alone.
7. **Focus styles** — interactive elements have focus-visible utilities (focus:ring-*, focus:outline-*); hover-only is not enough.
8. **Keyboard reachability** — onClick handlers on non-button elements (<div>, <span>) WITHOUT role + tabIndex + onKeyDown.
9. **ARIA correctness** — aria-* attributes are valid and used correctly; no aria-label on hidden elements.
10. **Modal/dialog** — dialogs have role="dialog" + aria-modal="true" + an accessible name (aria-label or aria-labelledby).
11. **Lang attribute** — <html lang="…"> set when generating index.html.
12. **Touch targets** — primary tappable areas ≥ 44×44px on mobile.

Each issue's "message" must name WHERE it occurs (component name or selector) and WHAT to do, e.g. "Header.tsx menu button has only a <Menu /> icon and no aria-label — add aria-label=\\"Open menu\\".".`;

/**
 * Accessibility report structure
 */
export interface AccessibilityReport {
  score: number;
  issues: Array<{
    type: 'error' | 'warning';
    message: string;
  }>;
}

/**
 * Normalize raw AI response into an AccessibilityReport.
 * Handles JSON parsing and validation.
 */
export function parseAccessibilityReport(raw: string): AccessibilityReport {
  try {
    // Clean markdown fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    // Validate structure
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 0;
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter(
          (issue: unknown) =>
            typeof issue === 'object' &&
            issue !== null &&
            'type' in issue &&
            'message' in issue
        )
      : [];

    return { score, issues };
  } catch {
    return {
      score: 0,
      issues: [{ type: 'error', message: 'Failed to parse accessibility report' }],
    };
  }
}

/**
 * System instruction for responsiveness analysis
 */
export const RESPONSIVENESS_SYSTEM_INSTRUCTION = `You are a responsive design expert. Analyze the provided React/Tailwind CSS code and identify responsiveness issues. Be specific about which components have problems and suggest fixes.

Return a JSON object:
{
  "issues": [
    { "component": "name", "problem": "description", "suggestion": "fix" }
  ]
}`;

/**
 * System instruction for database schema generation
 */
export const DB_SCHEMA_SYSTEM_INSTRUCTION = `You are a database schema expert. Generate a complete database schema based on the provided application description. Include tables, columns, relationships, and indexes.

Return the schema as a JSON object with this structure:
{
  "tables": [
    {
      "name": "table_name",
      "columns": [
        { "name": "column_name", "type": "data_type", "constraints": ["NOT NULL", "PRIMARY KEY", etc.] }
      ]
    }
  ]
}`;
