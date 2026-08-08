import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('side-by-side analyzer comparison artifact', () => {
  it('uspoređuje live analyzer i izolirani workspace demo bez promjene izvora', () => {
    const html = read('prototype/analyzer-workspace-comparison.html');
    const css = read('prototype/analyzer-workspace-comparison.css');

    expect(html).toContain('<main data-demo-surface="analyzer-comparison"');
    expect(html).toContain('title="Live Lekta analyzer"');
    expect(html).toContain('title="Novi workspace demo"');
    expect(html).toContain('src="/index.html#analyzer"');
    expect(html).toContain('src="/prototype/analyzer-workspace-demo.html"');
    expect(css).toContain('@media (max-width: 900px)');
    expect(read('index.html')).not.toContain('analyzer-comparison');
  });
});
