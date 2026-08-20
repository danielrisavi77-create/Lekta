/**
 * DOCX-04: biljeske na KRAJU dokumenta (Word Endnotes) postoje u modelu analize.
 *
 * Zatecen kvar: `word/endnotes.xml` se nije pojavljivao NIGDJE u `src/` (nula pogodaka). Jedino
 * citanje u repozitoriju bilo je `workers/field-renderer/app.py`, i to samo za snapshot polja.
 * Markeri su se brojali iskljucivo iz `w:footnoteReference`; `w:endnoteReference` nigdje.
 *
 * Posljedica za rad koji koristi endnote umjesto fusnota (Chicago, dio pravnih radova):
 * `footnotes` je prazan, pa je provjera `Automatske fusnote` padala uz poruku
 * "Nije pronadjena nijedna Word fusnota". Poruka je NETOCNA: biljeske postoje, samo su drugog
 * tipa. Razlika je vazna jer "nema biljezaka" i "ima 3 endnote, a profil trazi fusnote" traze
 * razlicit potez od studenta.
 *
 * Odluka (2026-08-20): prepoznaj i imenuj, ocjena se NE mijenja. Bodovi ostaju 0/4 i status
 * `fail` kad profil trazi fusnote; mijenja se samo tekst i novi `stats.endnotes`.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const LEGAL_PROFILE = 'pravo-integrirani-diplomski'; // legalFootnoteProfile: trazi Word fusnote

const BODY: ParaSpec[] = [
  { text: 'Uvod', font: 'Times New Roman', sizePt: 12, spacing15: true, jc: 'both' },
  { text: 'Tijelo rada koje sluzi kao nosivi tekst za analizu biljezaka.', font: 'Times New Roman', sizePt: 12, spacing15: true, jc: 'both' },
  { text: 'Zakljucak', font: 'Times New Roman', sizePt: 12, spacing15: true, jc: 'both' },
];

const NOTES = [
  'Zakon o socijalnoj skrbi, Narodne novine 18/2022, cl. 12.',
  'Kovac, M., Socijalna politika, Zagreb, 2020, str. 45.',
  'Vidi biljesku 1.',
];

async function analyze(spec: Parameters<typeof buildDocxFile>[0], profileId = LEGAL_PROFILE) {
  return (await analyzeFixture(buildDocxFile(spec), { profileId })) as any;
}

describe('DOCX-04: endnote su prepoznate i imenovane', () => {
  it('dokument s endnotama izvjestava stats.endnotes', async () => {
    const r = await analyze({ paragraphs: BODY, endnotes: NOTES });
    expect(r.stats?.endnotes).toBe(3);
  });

  it('dokument bez endnota izvjestava nulu, ne undefined', async () => {
    const r = await analyze({ paragraphs: BODY, footnotes: NOTES });
    expect(r.stats?.endnotes).toBe(0);
  });

  it('endnote se NE broje kao fusnote', async () => {
    const r = await analyze({ paragraphs: BODY, endnotes: NOTES });
    expect(r.stats?.footnotes).toBe(0);
  });

  it('poruka imenuje endnote umjesto da tvrdi da biljezaka nema', async () => {
    const r = await analyze({ paragraphs: BODY, endnotes: NOTES });
    const c = (r.checks || []).find((x: any) => x.title === 'Automatske fusnote');
    expect(c, 'provjera "Automatske fusnote" nije pronadjena').toBeTruthy();

    // Ocjena se NE mijenja: profil trazi fusnote, dokument ih nema.
    expect(c.status).toBe('fail');
    expect(c.earned).toBe(0);
    expect(c.max).toBe(4);

    // Ali poruka vise ne smije tvrditi da biljezaka nema.
    expect(c.detail).toContain('3');
    expect(c.detail.toLowerCase()).toContain('endnot');
    expect(c.detail).not.toBe('Nije pronađena nijedna Word fusnota');
    expect(c.issue?.detail.toLowerCase()).toContain('endnot');
  });

  it('dokument bez ijedne biljeske zadrzava staru, tocnu poruku', async () => {
    const r = await analyze({ paragraphs: BODY });
    const c = (r.checks || []).find((x: any) => x.title === 'Automatske fusnote');
    expect(c.status).toBe('fail');
    expect(c.detail).toBe('Nije pronađena nijedna Word fusnota');
  });

  it('dokument s pravim fusnotama i dalje prolazi', async () => {
    const r = await analyze({ paragraphs: BODY, footnotes: NOTES });
    const c = (r.checks || []).find((x: any) => x.title === 'Automatske fusnote');
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(4);
  });
});
