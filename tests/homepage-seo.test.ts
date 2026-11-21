// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('homepage SEO basics', () => {
  it('has one branded title and one branded H1', () => {
    expect(html).toMatch(/<title>Lekta: Učitaj rad za lokalnu provjeru<\/title>/);
    const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
    expect(headings).toHaveLength(1);
    expect(headings[0][1]).toContain('Lekta');
  });

  it('describes the local DOCX check and invites the user to upload a file', () => {
    const description = /<meta\s+name="description"\s+content="([^"]+)"/i.exec(html)?.[1] ?? '';
    expect(description).toContain('Lekta');
    expect(description).toContain('.docx');
    expect(description).toContain('Učitaj rad');
    expect(description).toContain('ostaje na tvom uređaju');
  });
});
