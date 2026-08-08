import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('izolirani analyzer workspace demo', () => {
  it('ima odvojene faze konteksta, obrade i rezultata', () => {
    const html = read('prototype/analyzer-workspace-demo.html');
    const script = read('prototype/analyzer-workspace-demo.ts');
    const css = read('prototype/analyzer-workspace-demo.css');

    expect(html).toContain('<main data-demo-surface="analyzer-workspace"');
    expect(html).toContain('data-demo-state="upload"');
    expect(html).toContain('id="workspaceContext"');
    expect(html).toContain('id="workspaceDropzone"');
    expect(html).toContain('id="workspaceStart"');
    expect(html).toContain('id="workspaceProgress"');
    expect(html).toContain('id="workspaceResult"');
    expect(html).toContain('data-demo-only="true"');
    expect(script).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(read('index.html')).not.toContain('data-demo-surface="analyzer-workspace"');
  });
});
