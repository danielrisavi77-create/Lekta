/**
 * Napomena uz ocjenu nakon zaostravanja provjera (2026-08-20) mora se prikazivati u razdoblju
 * u kojem korisnici jos pamte staru, previsoku brojku, i sama se ugasiti poslije.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pageStyles } from './helpers/page-styles';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  scoringChangeNote,
  SCORING_CHANGE_NOTE_TEXT,
  SCORING_CHANGE_NOTE_UNTIL,
} from '../src/ui/scoring-change-note.ts';

describe('scoringChangeNote', () => {
  it('prikazuje se na dan promjene', () => {
    expect(scoringChangeNote(Date.parse('2026-08-20T09:00:00Z'))).toBe(SCORING_CHANGE_NOTE_TEXT);
  });

  it('prikazuje se dan prije isteka', () => {
    expect(scoringChangeNote(Date.parse('2026-10-31T23:59:00Z'))).toBe(SCORING_CHANGE_NOTE_TEXT);
  });

  it('gasi se sama na dan isteka', () => {
    expect(scoringChangeNote(Date.parse(SCORING_CHANGE_NOTE_UNTIL))).toBeNull();
  });

  it('gasi se i poslije isteka', () => {
    expect(scoringChangeNote(Date.parse('2027-01-01T00:00:00Z'))).toBeNull();
  });

  it('prima Date jednako kao broj', () => {
    expect(scoringChangeNote(new Date('2026-09-01T00:00:00Z'))).toBe(SCORING_CHANGE_NOTE_TEXT);
    expect(scoringChangeNote(new Date('2027-01-01T00:00:00Z'))).toBeNull();
  });

  it('neispravan ulaz ne prikazuje napomenu', () => {
    expect(scoringChangeNote(Number.NaN)).toBeNull();
    expect(scoringChangeNote(new Date('nije datum'))).toBeNull();
  });

  it('tekst je jedna recenica, bez crtica i bez isprike', () => {
    // CLAUDE.md: bez em i en crtica u tekstu.
    expect(SCORING_CHANGE_NOTE_TEXT).not.toMatch(/[–—]/);
    // Jedna recenica: nema prijeloma ". " praceno velikim slovom (redne brojeve to ne dira).
    expect(SCORING_CHANGE_NOTE_TEXT).not.toMatch(/\.\s+[A-ZČĆŽŠĐ]/);
    expect(SCORING_CHANGE_NOTE_TEXT.endsWith('.')).toBe(true);
    expect(SCORING_CHANGE_NOTE_TEXT.length).toBeLessThan(240);
    expect(SCORING_CHANGE_NOTE_TEXT.toLowerCase()).not.toMatch(/ispričavamo|žao nam je|greška/);
    // Mora reci STO se promijenilo, ne samo da se promijenilo.
    expect(SCORING_CHANGE_NOTE_TEXT).toContain('Word polje');
  });
});

describe('napomena je stvarno ozicena u sucelje', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (f: string) => readFileSync(join(root, f), 'utf8');

  it('index.html ima element i pocinje skriven', () => {
    const html = read('index.html');
    expect(html).toContain('id="scoringChangeNote"');
    // Bez `hidden` bi prazan element bio vidljiv prije prve analize.
    expect(html).toMatch(/class="[^"]*hidden[^"]*"\s+id="scoringChangeNote"/);
  });

  it('app.ts puni i prebacuje taj element (nije mrtav markup)', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("scoringChangeNote");
    expect(app).toContain("from './scoring-change-note'");
    expect(app).toMatch(/_scnEl\.classList\.toggle\('hidden'/);
  });

  it('stil oznake postoji', () => {
    expect(pageStyles()).toContain('.scoring-change-note{');
  });
});
