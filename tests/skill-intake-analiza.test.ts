// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SKILL_PATH = join(ROOT, '.claude', 'skills', 'intake-analiza', 'SKILL.md');
const TEMPLATE_PATH = join(ROOT, 'docs', 'agents', 'templates', 'intake-verify-args.json');

function parseFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('SKILL.md nema YAML frontmatter blok');
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (kv) frontmatter[kv[1]] = kv[2].trim();
  }
  return { frontmatter, body: match[2] };
}

describe('skill intake-analiza: postoji i ima ispravan ugovor', () => {
  it('SKILL.md postoji', () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
  });

  const raw = readFileSync(SKILL_PATH, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);

  it('frontmatter ima name i description', () => {
    expect(frontmatter.name).toBe('intake-analiza');
    expect(frontmatter.description).toBeTruthy();
  });

  it('description sadrzi rijeci okidaca (analiz, audit, nalaz)', () => {
    const desc = frontmatter.description.toLowerCase();
    expect(desc).toMatch(/analiz/);
    expect(desc).toMatch(/audit/);
    expect(desc).toMatch(/nalaz/);
  });

  it('tekst sadrzi svih sedam koraka po kljucnim rijecima', () => {
    const lower = body.toLowerCase();
    expect(lower).toMatch(/podatak/); // (a) zalijepljeno je podatak
    expect(lower).toMatch(/koordinator/); // (b) tko je koordinator
    expect(lower).toMatch(/deduplik/); // (c) deduplikacija
    expect(lower).toMatch(/izvidja/); // (d) izvidjac light run
    expect(lower).toMatch(/broj/); // (e) odluka brojem
    expect(lower).toMatch(/gate/); // (f) izvedba po routingu, jedan gate
    expect(lower).toMatch(/tablica/); // (g) tablica u prvom odgovoru
  });

  it('tekst je kraci od 1500 rijeci', () => {
    const wordCount = raw.trim().split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThan(1500);
  });

  it('nema em ni en crtica', () => {
    expect(raw).not.toMatch(/[–—]/);
  });
});

describe('predlozak args JSON-a za light run provjere', () => {
  it('postoji i parsira se kao JSON s ocekivanim poljima', () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true);
    const parsed = JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8'));
    expect(typeof parsed.mode).toBe('string');
    expect(typeof parsed.task).toBe('string');
    expect(Array.isArray(parsed.files)).toBe(true);
    expect(Array.isArray(parsed.acceptance)).toBe(true);
  });
});
