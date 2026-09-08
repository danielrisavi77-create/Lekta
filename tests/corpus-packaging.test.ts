/**
 * RUCNO SLOZEN PAKET: oblici PAKIRANJA koje nijedan alat na ovom stroju ne proizvodi.
 *
 * Tri oblika koja stvarni radovi nose dolaze iz Google Docs izvoza, a njega ovdje nema. Izmjereno
 * 2026-09-08 nad 457 radova u `Lekta-korpus`:
 *
 *     zip/direktoriji         130 od 457   (21 od njih NIJE Google Docs, pa oblik nije samo njegov)
 *     paket/comments-prazan   135 od 457
 *     gdocs/potpis            129 od 457   (`docProps/app.xml` s doslovno praznim `<Properties/>`)
 *
 * Fixtura ih nosi, a ovaj gard tvrdi ono zbog cega ima smisla postojati: da motor takav paket cita
 * i da ga popravak ponovno napise BEZ gubitka tih oblika. Bez druge tvrdnje bi fixtura bila samo
 * datoteka koja popunjava popis pokrivenih oblika, dakle tocno vakuum protiv kojeg popis postoji.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../src/repair/zip-codec';
import { applyFixers } from '../src/repair/apply-fixers';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { sidecarAdmitted } from './real-corpus/corpus-track';
import { detectShapes, verifyRepairRoundTrip, verifyShapeClaims } from '../src/corpus/docx-shapes';
import { buildDocx, type DocSpec } from './helpers/docx-builder';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'fixtures', 'docx-packaging');
const DOCX = join(DIR, 'gdocs-otisak.docx');
const SIDECAR = join(DIR, 'gdocs-otisak.json');
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface Sidecar {
  synthetic?: unknown;
  track?: unknown;
  profileId?: unknown;
  shapes?: { claimed?: string[] };
}

function citajSidecar(): Sidecar {
  return JSON.parse(readFileSync(SIDECAR, 'utf8')) as Sidecar;
}

describe('rucno slozen paket: oblici pakiranja', () => {
  it('fixtura i sidecar postoje i nisu prazni', () => {
    // Anti-vakuum: bez ove tvrdnje bi svaka tvrdnja nize prosla nad datotekom koje nema, jer bi
    // `readFileSync` bacio tek u prvom testu koji je cita, a popis pokrivenih oblika bi je brojao.
    expect(existsSync(DOCX), DOCX).toBe(true);
    expect(existsSync(SIDECAR), SIDECAR).toBe(true);
    expect(readFileSync(DOCX).length).toBeGreaterThan(2000);
  });

  it('paket nosi svaki oblik koji sidecar tvrdi', async () => {
    const sidecar = citajSidecar();
    const claimed = sidecar.shapes?.claimed ?? [];
    expect(claimed).toEqual(['zip/direktoriji', 'paket/comments-prazan', 'gdocs/potpis']);

    const counts = detectShapes(await readZip(new Uint8Array(readFileSync(DOCX))));
    const v = verifyShapeClaims(claimed, counts);
    expect(v).toEqual({ missing: [], unknown: [], underDetected: [] });
  });

  it('zid dokaza drzi: paket je sinteticki i traka mu je izvan dopustenih', () => {
    const sidecar = citajSidecar();
    expect(sidecar.synthetic).toBe(true);
    expect(sidecar.track).toBe('handbuilt');
    expect(sidecarAdmitted(sidecar)).toBe(false);
  });

  it('analiza cita paket s direktorijskim zapisima i praznim comments.xml', async () => {
    const bytes = new Uint8Array(readFileSync(DOCX));
    const result = await analyzeFixture(new File([bytes], 'gdocs-otisak.docx', { type: MIME }));
    // Direktorijski zapis nema sadrzaja i lako ga je procitati kao dio dokumenta; da se to dogadja,
    // analiza bi pukla ili vratila prazan skup provjera umjesto uredne ocjene.
    expect((result.checks ?? []).length).toBeGreaterThan(20);
  });

  /**
   * Glavna tvrdnja: popravak paket PONOVNO NAPISE, i oblici pakiranja to prezive.
   *
   * `empty-paragraph-fixer` je odabran jer mu je posao vidljiv u bajtovima (cetiri prazna odlomka
   * svede na jedan), pa promjena nije stvar procjene. Zahtjev se salje izravno, a ne kroz zadani
   * odabir: bez profila taj odabir na ovom dokumentu daje NULA zahtjeva, `applyFixers` tada vrati
   * ulazne bajtove, i cijela bi tvrdnja prosla nad netaknutim originalom.
   */
  it('popravak ponovno napise paket a oblici pakiranja prezive', async () => {
    const bytes = new Uint8Array(readFileSync(DOCX));
    const applied = await applyFixers(bytes, [
      { fixerId: 'empty-paragraph-fixer', ruleId: 'higijena.prazni-odlomci', params: { maxConsecutive: 1 } },
    ] as never);

    expect((applied as { integrityFailure?: unknown }).integrityFailure ?? null).toBeNull();
    const changelog = applied.changelog ?? [];
    expect(changelog.map((c: { fixerId?: string }) => c.fixerId)).toContain('empty-paragraph-fixer');
    const changed = applied.docxBytes.length !== bytes.length;
    expect(changed, 'popravak nije promijenio paket, pa tvrdnja o prezivljavanju ne mjeri nista').toBe(true);

    const after = await readZip(applied.docxBytes);
    const verdict = verifyRepairRoundTrip(citajSidecar().shapes?.claimed ?? [], detectShapes(after), { changed });
    expect(verdict).toEqual({ lost: [], vacuous: false });
    // Direktorijski zapisi su jedini oblik koji zivi ISKLJUCIVO u imenima zip zapisa, pa se broji i
    // izravno: da ih pisac paketa ispusti, gornja tvrdnja bi pala, ali ne bi se vidjelo koliko ih je.
    expect(after.filter((e) => e.name.endsWith('/')).length).toBe(4);
  }, 30_000);

  it('negativna kontrola: isti graditelj bez dodataka ne nosi nijedan od ta tri oblika', async () => {
    const spec: DocSpec = { paragraphs: [{ text: 'Tijelo rada.' }], settings: true };
    const counts = detectShapes(await readZip(buildDocx(spec)));
    expect(counts['zip/direktoriji']).toBe(0);
    expect(counts['paket/comments-prazan']).toBe(0);
    expect(counts['gdocs/potpis']).toBe(0);
  });
});
