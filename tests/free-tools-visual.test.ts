import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(process.cwd());
const TOOL_PAGES = ['citat.html', 'kartice.html', 'naslovnica.html', 'literatura.html', 'izjava.html'];

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('besplatni alati, vizualni workspace ugovor', () => {
  it('direktorij alata ima ujednacene kartice i jasne izlazne poveznice', () => {
    const html = read('alati.html');
    expect(html).toContain('class="tools-grid"');
    expect(html).toContain('class="tool-card"');
    expect(read('src/shared/tool-page.css')).toContain('.tools-grid .tool-card{min-height:184px');
  });

  it.each(TOOL_PAGES)('%s ima zajednički workspace omotač', (page) => {
    expect(read(page)).toContain('tool-workspace');
  });

  it('zajednički CSS definira workspace ritam i mobilni prijelom', () => {
    const css = read('src/shared/tool-page.css');
    expect(css).toContain('.tool-workspace');
    expect(css).toContain('.tool-workspace>.card');
    expect(css).toContain('@media(max-width:820px)');
  });
});
