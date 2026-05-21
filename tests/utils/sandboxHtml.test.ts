/**
 * Sandbox HTML generator — placeholder substitution and helper injection.
 */

import { describe, it, expect } from 'vitest';
import { buildIframeHtml } from '../../utils/sandboxHtml';

const minimalFiles = {
  'src/App.tsx': 'export default function App() { return null; }',
};

describe('buildIframeHtml', () => {
  it('returns a non-empty HTML document', () => {
    const html = buildIframeHtml(minimalFiles);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html.length).toBeGreaterThan(1000);
  });

  it('replaces the dynamic-imports placeholder with valid JSON', () => {
    const html = buildIframeHtml(minimalFiles);
    expect(html).not.toContain('__DYNAMIC_IMPORTS_PLACEHOLDER__');
  });

  it('replaces the parent-origin placeholder', () => {
    const html = buildIframeHtml(minimalFiles, false, 'https://example.test:3100');
    expect(html).not.toContain('__PARENT_ORIGIN_PLACEHOLDER__');
    expect(html).toContain('window.__PARENT_ORIGIN__ = "https://example.test:3100"');
  });

  it('defaults parent-origin to empty string when omitted', () => {
    const html = buildIframeHtml(minimalFiles);
    expect(html).toContain('window.__PARENT_ORIGIN__ = ""');
  });

  it('injects the __postToParent helper before user scripts', () => {
    const html = buildIframeHtml(minimalFiles);
    const helperIdx = html.indexOf('window.__postToParent = function');
    const sandboxReadyIdx = html.indexOf('window.__SANDBOX_READY__ = false');
    expect(helperIdx).toBeGreaterThan(-1);
    expect(sandboxReadyIdx).toBeGreaterThan(-1);
    // Helper must come AFTER __SANDBOX_READY__ init but appears in the same
    // top-of-document <script> block, before any user-app bootstrap code.
    expect(helperIdx).toBeGreaterThan(sandboxReadyIdx);
  });

  it('escapes parent origin via JSON.stringify (defends against injection)', () => {
    // A malicious origin string with a quote attempts to break out of the
    // string literal and inject a new statement.
    const evil = 'https://x.test"; window.evil = 1; //';
    const html = buildIframeHtml(minimalFiles, false, evil);
    // JSON.stringify must keep the payload as a single, properly-escaped
    // string literal — escaped quotes mean the injected statement remains
    // inert text rather than executable code.
    expect(html).toContain(JSON.stringify(evil));
    expect(html).toContain('\\"; window.evil = 1; //');
  });

  it('toggles inspect mode CSS when enabled', () => {
    const off = buildIframeHtml(minimalFiles, false);
    const on = buildIframeHtml(minimalFiles, true);
    expect(off).not.toContain('inspect-highlight');
    expect(on).toContain('inspect-highlight');
  });
});
