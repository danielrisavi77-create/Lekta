import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('analyzer workspace, pet vizualnih varijanti', () => {
  it('ima galeriju s pet query-based demo smjerova', () => {
    const gallery = read('prototype/analyzer-workspace-variants.html');
    const demo = read('prototype/analyzer-workspace-demo.html');
    const script = read('prototype/analyzer-workspace-demo.ts');
    const variants = ['editorial', 'blueprint', 'magazine', 'cockpit', 'tactile'];

    expect(gallery).toContain('data-demo-gallery="analyzer-workspace-variants"');
    variants.forEach((variant) => {
      expect(gallery).toContain(`variant=${variant}`);
      expect(gallery).toContain(`data-variant-card="${variant}"`);
    });
    expect(demo).toContain('data-demo-variant="editorial"');
    expect(script).toContain("URLSearchParams(location.search).get('variant')");
    expect(script).toContain('data-demo-variant');
  });
});
