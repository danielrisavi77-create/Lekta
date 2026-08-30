import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Visual System v2 foundation', () => {
  it('exposes shared tactile tokens and local editorial font roles', () => {
    const css = read('src/shared/design-system.css');
    expect(css).toContain('--v2-paper-shadow:');
    expect(css).toContain('--v2-display: var(--display-serif)');
    expect(css).toContain('--v2-ui: var(--ui)');
    expect(css).toContain('--v2-focus-ring: var(--focus)');
  });

  it('routes page chrome through shared tokens and keeps reduced motion explicit', () => {
    const css = read('src/routes/shared/route-shell.css');
    expect(css).toContain('--route-bg: var(--desk)');
    expect(css).toContain('font-family: var(--ui)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.route-shell :is(a, button):focus-visible');
  });
});
