import { describe, expect, it } from 'vitest';
import {
  REQUIRED_CONTEXT_FILES,
  REQUIRED_SCOPED_GUIDES,
  auditClaudeContext,
} from '../scripts/verify-claude-context-core.mjs';

const VALID_ROOT = [
  '# Lekta',
  '',
  '## Routing',
  ...REQUIRED_SCOPED_GUIDES.map((path) => `- \`${path}\`: domenske upute.`),
].join('\n');

const ALL_FILES = new Set(REQUIRED_CONTEXT_FILES);

describe('CLAUDE.md context guard', () => {
  it('accepts a compact root whose scoped routes exist', () => {
    expect(auditClaudeContext(VALID_ROOT, ALL_FILES)).toMatchObject({
      lineCount: 8,
      problems: [],
      routes: REQUIRED_SCOPED_GUIDES,
    });
  });

  it('rejects a root longer than 200 lines', () => {
    const oversized = Array.from({ length: 201 }, (_, index) => `line ${index + 1}`).join('\n');
    expect(auditClaudeContext(oversized, ALL_FILES).problems).toContainEqual(
      expect.objectContaining({ code: 'root-too-long' }),
    );
  });

  it('rejects a missing required route and a route whose file does not exist', () => {
    const omitted = REQUIRED_SCOPED_GUIDES[0];
    const withoutRoute = VALID_ROOT.replace(`- \`${omitted}\`: domenske upute.\n`, '');
    expect(auditClaudeContext(withoutRoute, ALL_FILES).problems).toContainEqual(
      expect.objectContaining({ code: 'required-route-missing', path: omitted }),
    );

    const missingOnDisk = new Set(REQUIRED_CONTEXT_FILES.filter((path) => path !== omitted));
    expect(auditClaudeContext(VALID_ROOT, missingOnDisk).problems).toContainEqual(
      expect.objectContaining({ code: 'route-target-missing', path: omitted }),
    );
  });

  it('rejects eager imports of scoped CLAUDE.md files', () => {
    const eager = `${VALID_ROOT}\n@src/repair/CLAUDE.md`;
    expect(auditClaudeContext(eager, ALL_FILES).problems).toContainEqual(
      expect.objectContaining({ code: 'eager-scoped-import' }),
    );
  });
});
