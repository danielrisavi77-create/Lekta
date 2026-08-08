import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('izolirani analyzer hero demo', () => {
  it('postoji izvan live stranice i ima kontroliranu semanticku scenu', () => {
    const html = read('prototype/analyzer-hero-demo.html');
    const script = read('prototype/analyzer-hero-demo.ts');
    const css = read('prototype/analyzer-hero-demo.css');

    expect(html).toContain('<main data-demo-surface="analyzer-hero"');
    expect(html).toContain('id="demoReplay"');
    expect(html).toContain('id="demoUploadCta"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-demo-only="true"');
    expect(script).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(read('index.html')).not.toContain('data-demo-surface="analyzer-hero"');
  });
});
