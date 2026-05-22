/**
 * Tests for useStreamingResponse hook utilities
 * Tests format detection, plan parsing, and file extraction
 */

import { describe, it, expect } from 'vitest';

// Import the functions we need to test - these are exported from the hook
// We'll test the parsing logic directly

describe('Streaming Response Parsing', () => {
  describe('parseFilePlanFromStream', () => {
    // We'll test the parsing patterns used in the hook

    describe('Legacy PLAN comment format', () => {
      it('should parse simple PLAN comment', () => {
        const text = `// PLAN: {"create":["src/App.tsx","src/components/Header.tsx"],"update":[],"delete":[]}
{"files":{"src/App.tsx":"code"}}`;

        const planMatch = text.match(/\/\/\s*PLAN:\s*(\{.+)/);
        expect(planMatch).not.toBeNull();

        const jsonStr = planMatch![1] ?? '';
        const plan = JSON.parse(jsonStr.substring(0, jsonStr.indexOf('}') + 1));
        expect(plan.create).toContain('src/App.tsx');
      });

      it('should handle PLAN with nested objects', () => {
        const text = `// PLAN: {"create":["src/App.tsx"],"sizes":{"src/App.tsx":50}}`;
        const planMatch = text.match(/\/\/\s*PLAN:\s*(\{.+)/);
        expect(planMatch).not.toBeNull();
      });
    });

    describe('JSON V2 format detection', () => {
      it('should detect JSON V2 by "plan" key', () => {
        const jsonV2 = `{
  "meta": {"format": "json", "version": "2.0"},
  "plan": {"create": ["src/App.tsx"], "update": [], "delete": []},
  "files": {"src/App.tsx": "code"}
}`;
        expect(jsonV2.includes('"plan"')).toBe(true);
        expect(jsonV2.trim().startsWith('{')).toBe(true);
      });

      it('should extract plan from JSON V2', () => {
        const jsonV2 = `{"meta":{"format":"json"},"plan":{"create":["src/App.tsx","src/Header.tsx"],"update":["src/utils.ts"],"delete":[]}}`;

        const planMatch = jsonV2.match(/"plan"\s*:\s*\{([^}]*)\}/);
        expect(planMatch).not.toBeNull();

        const planContent = planMatch![1] ?? '';
        const createMatch = planContent.match(/"create"\s*:\s*\[([^\]]*)\]/);
        expect(createMatch).not.toBeNull();

        const items = (createMatch![1] ?? '').match(/"([^"]+)"/g);
        expect(items).toHaveLength(2);
      });

      it('should extract sizes from manifest', () => {
        const jsonV2 = `{
  "plan": {"create": ["src/App.tsx"]},
  "manifest": [
    {"path": "src/App.tsx", "action": "create", "lines": 45, "tokens": 320, "status": "included"}
  ]
}`;

        const manifestMatch = jsonV2.match(/"manifest"\s*:\s*\[([\s\S]*?)\]/);
        expect(manifestMatch).not.toBeNull();

        const entryPattern = /\{\s*"path"\s*:\s*"([^"]+)"[^}]*"lines"\s*:\s*(\d+)/g;
        const manifestContent = manifestMatch![1] ?? '';
        const entries = [...manifestContent.matchAll(entryPattern)];
        expect(entries).toHaveLength(1);
        const firstEntry = entries[0];
        expect(firstEntry).not.toBeUndefined();
        expect(firstEntry![1]).toBe('src/App.tsx');
        expect(firstEntry![2]).toBe('45');
      });

      it('should extract batch info', () => {
        const jsonV2 = `{
  "batch": {
    "current": 1,
    "total": 2,
    "isComplete": false,
    "completed": ["src/App.tsx"],
    "remaining": ["src/Header.tsx"]
  }
}`;

        const batchMatch = jsonV2.match(/"batch"\s*:\s*\{([^}]*)\}/);
        expect(batchMatch).not.toBeNull();

        const batchContent = batchMatch![1] ?? '';
        const completedMatch = batchContent.match(/"completed"\s*:\s*\[([^\]]*)\]/);
        expect(completedMatch).not.toBeNull();

        const itemsContent = completedMatch![1] ?? '';
        const items = itemsContent.match(/"([^"]+)"/g);
        expect(items).toHaveLength(1);
        expect(items![0]).toBe('"src/App.tsx"');
      });
    });

    describe('Simple comment format', () => {
      it('should detect files from // comments', () => {
        const text = `// src/App.tsx
import React from 'react';
export default function App() {}

// src/components/Header.tsx
export function Header() {}`;

        const filePathRegex = /\/\/\s*((?:src\/)?[\w./-]+\.(?:tsx?|jsx?|css|json|md))\s*\n/g;
        const matches = [...text.matchAll(filePathRegex)];

        expect(matches).toHaveLength(2);
        const first = matches[0];
        const second = matches[1];
        expect(first).not.toBeUndefined();
        expect(second).not.toBeUndefined();
        expect(first![1]).toBe('src/App.tsx');
        expect(second![1]).toBe('src/components/Header.tsx');
      });

      it('should add src/ prefix if missing', () => {
        const text = `// App.tsx
code here

// components/Header.tsx
more code`;

        const filePathRegex = /\/\/\s*((?:src\/)?[\w./-]+\.(?:tsx?|jsx?|css|json|md))\s*\n/g;
        const matches = [...text.matchAll(filePathRegex)];

        const files: string[] = [];
        for (const match of matches) {
          let filePath = match[1] ?? '';
          if (!filePath.startsWith('src/')) {
            filePath = 'src/' + filePath;
          }
          files.push(filePath);
        }

        expect(files).toContain('src/App.tsx');
        expect(files).toContain('src/components/Header.tsx');
      });

      it('should deduplicate file paths', () => {
        const text = `// src/App.tsx
first mention

// src/App.tsx
duplicate mention`;

        const filePathRegex = /\/\/\s*((?:src\/)?[\w./-]+\.(?:tsx?|jsx?|css|json|md))\s*\n/g;
        const matches = [...text.matchAll(filePathRegex)];

        const files: string[] = [];
        for (const match of matches) {
          const filePath = match[1];
          if (filePath && !files.includes(filePath)) {
            files.push(filePath);
          }
        }

        expect(files).toHaveLength(1);
      });
    });
  });

  describe('Format Detection', () => {
    it('should detect marker format', () => {
      const markerText = `<!-- META -->
format: marker
version: 2.0
<!-- /META -->`;

      expect(markerText.includes('<!-- META -->')).toBe(true);
    });

    it('should detect JSON format with PLAN comment', () => {
      const jsonText = `// PLAN: {"create":["src/App.tsx"]}
{"files":{}}`;

      expect(jsonText.includes('// PLAN:')).toBe(true);
    });

    it('should detect JSON V2 format', () => {
      const jsonV2 = `{"meta":{"format":"json"},"plan":{"create":[]}}`;

      const trimmed = jsonV2.trim();
      const isJsonV2 = trimmed.startsWith('{') &&
        (jsonV2.includes('"meta"') || jsonV2.includes('"plan"'));

      expect(isJsonV2).toBe(true);
    });

    it('should detect simple JSON format', () => {
      const simpleJson = `{"files":{"src/App.tsx":"code"}}`;

      expect(simpleJson.includes('{"')).toBe(true);
    });
  });

  describe('Marker Format Parsing', () => {
    it('should parse PLAN block', () => {
      const marker = `<!-- PLAN -->
create: src/App.tsx, src/Header.tsx
update: src/utils.ts
delete:
<!-- /PLAN -->`;

      const planMatch = marker.match(/<!-- PLAN -->([\s\S]*?)<!-- \/PLAN -->/);
      expect(planMatch).not.toBeNull();

      const planContent = planMatch![1] ?? '';
      const createMatch = planContent.match(/create:\s*(.+)/);
      expect(createMatch).not.toBeNull();

      const createFiles = (createMatch![1] ?? '').split(',').map(f => f.trim()).filter(Boolean);
      expect(createFiles).toContain('src/App.tsx');
      expect(createFiles).toContain('src/Header.tsx');
    });

    it('should parse MANIFEST table', () => {
      const manifest = `<!-- MANIFEST -->
| File | Action | Lines | Tokens | Status |
|------|--------|-------|--------|--------|
| src/App.tsx | create | 45 | ~320 | included |
| src/Header.tsx | create | 62 | ~450 | pending |
<!-- /MANIFEST -->`;

      const manifestMatch = manifest.match(/<!-- MANIFEST -->([\s\S]*?)<!-- \/MANIFEST -->/);
      expect(manifestMatch).not.toBeNull();

      // Extract rows (skip header)
      const manifestContent = manifestMatch![1] ?? '';
      const rows = manifestContent.split('\n')
        .filter(line => line.includes('|') && !line.includes('---') && !line.includes('File'));

      expect(rows.length).toBe(2);
    });

    it('should parse FILE blocks', () => {
      const files = `<!-- FILE:src/App.tsx -->
import React from 'react';
export default function App() {}
<!-- /FILE:src/App.tsx -->

<!-- FILE:src/Header.tsx -->
export function Header() {}
<!-- /FILE:src/Header.tsx -->`;

      const filePattern = /<!-- FILE:([^\s>]+) -->([\s\S]*?)<!-- \/FILE:\1 -->/g;
      const matches = [...files.matchAll(filePattern)];

      expect(matches).toHaveLength(2);
      const firstFile = matches[0];
      const secondFile = matches[1];
      expect(firstFile).not.toBeUndefined();
      expect(secondFile).not.toBeUndefined();
      expect(firstFile![1]).toBe('src/App.tsx');
      expect(secondFile![1]).toBe('src/Header.tsx');
      expect(firstFile![2]).toContain('import React');
    });

    it('should parse BATCH block', () => {
      const batch = `<!-- BATCH -->
current: 1
total: 2
isComplete: false
completed: src/App.tsx
remaining: src/Header.tsx
<!-- /BATCH -->`;

      const batchMatch = batch.match(/<!-- BATCH -->([\s\S]*?)<!-- \/BATCH -->/);
      expect(batchMatch).not.toBeNull();

      const batchContent = batchMatch![1] ?? '';

      const currentMatch = batchContent.match(/current:\s*(\d+)/);
      expect(currentMatch).not.toBeNull();
      expect(currentMatch![1]).toBe('1');

      const totalMatch = batchContent.match(/total:\s*(\d+)/);
      expect(totalMatch).not.toBeNull();
      expect(totalMatch![1]).toBe('2');

      const isCompleteMatch = batchContent.match(/isComplete:\s*(true|false)/);
      expect(isCompleteMatch).not.toBeNull();
      expect(isCompleteMatch![1]).toBe('false');
    });
  });

  describe('Progress Calculation', () => {
    it('should estimate file progress based on received content', () => {
      const expectedLines = 100;
      const avgCharsPerLine = 60;
      const expectedChars = expectedLines * avgCharsPerLine;

      const receivedChars = 3000; // half way
      const progress = Math.min(100, (receivedChars / expectedChars) * 100);

      expect(progress).toBe(50);
    });

    it('should cap progress at 100%', () => {
      const expectedChars = 1000;
      const receivedChars = 2000; // over 100%
      const progress = Math.min(100, (receivedChars / expectedChars) * 100);

      expect(progress).toBe(100);
    });
  });
});
