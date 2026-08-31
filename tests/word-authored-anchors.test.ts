/**
 * SIDRA NAD DOKUMENTOM KOJI JE NAPISAO PRAVI WORD.
 *
 * Zasto zasebna fixtura: `tests/fixtures/docx/**` su SINTETSKI dokumenti sa cetiri dijela paketa.
 * Treci krug adversarijalnog pregleda pokazao je da takav korpus po konstrukciji NE MOZE
 * sadrzavati kvarove koji su nas pogodili.
 *
 * IZMJERENO 2026-08-31:
 *   commitane fixture (19 dok.)   0 dokumenata s <w:tab/>,      0 rizicnih odlomaka
 *   stvarni studentski radovi (38) 32 dokumenta (84%),       1.298 rizicnih odlomaka
 *
 * Kvar koji je time promakao: sidro nastaje iz teksta ANALIZE (`src/docx/parser.ts` za `<w:tab/>`
 * emitira `\t`), a provjerava se protiv izvlakaca koji cita SAMO `<w:t>`. Na `1.<w:tab/>UVOD`,
 * Wordovom standardnom zapisu rucno numeriranog naslova, sidro se nije podudaralo i CIJELI zahtjev
 * za oblikovanjem naslova se odbacivao. Popravak je prije rada na sidrima radio.
 *
 * Fixtura je napravljena Wordom (`scripts/word-verify/make-anchor-fixture.ps1`) i ima 12 dijelova
 * paketa. Ne sadrzi nicij studentski tekst.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';
import { buildDefaultRepairRequests } from '../src/repair/default-selection';
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PROFILE_ID = 'fpzg-politologija-diplomski';
const FIXTURE = resolve(__dirname, 'fixtures/docx-word/anchor-cases.docx');

const load = () => new Uint8Array(readFileSync(FIXTURE));

describe('sidra nad dokumentom koji je napisao pravi Word', () => {
  it('BASELINE: fixtura doista sadrzi konstrukcije koje su lomile sidra', async () => {
    const bytes = load();
    const result = await analyzeFixture(new File([bytes], 'anchor.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID } as never);
    const texts = ((result.details as { preview?: { paragraphs?: Array<{ text?: string }> } })?.preview?.paragraphs
      ?? (result as unknown as { preview?: { paragraphs?: Array<{ text?: string }> } }).preview?.paragraphs ?? [])
      .map((p) => String(p.text ?? ''));
    const all = texts.join('\n');
    // Bez ovih tvrdnji bi test nize mogao prolaziti nad dokumentom koji uopce nema sto lomiti.
    expect(all, 'tabulator u rucno numeriranom naslovu').toContain('\t');
    expect(all, 'tipografska crtica u naslovu').toContain('\u2013');
    expect(all, 'goli DOI').toContain('doi:10.1234');
  });

  it('popravak se primjenjuje: sidra prezivljavaju pravi Wordov zapis', async () => {
    const bytes = load();
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const before = await analyzeFixture(new File([bytes], 'anchor.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID, profile } as never);
    const items = buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(PROFILE_ID) } as never);
    const requests = buildDefaultRepairRequests(items as never);
    expect(requests.length, 'popravak mora imati sto raditi na ovom dokumentu').toBeGreaterThan(0);

    const out = await applyFixers(bytes, requests as never);
    expect(out.integrityFailure).toBeUndefined();
    expect(out.changelog.length, 'barem jedan fixer mora promijeniti dokument').toBeGreaterThan(0);

    /**
     * SRZ TVRDNJE: nijedan fixer ne smije odustati uz `stale-anchor`.
     *
     * To je tocno ono sto se dogadjalo prije popravka normalizacije: `heading-style-fixer` je
     * odbacivao cijeli zahtjev zbog tabulatora, a `croatian-typography-fixer` je prije njega
     * mijenjao crticu i dizao isti kvar.
     */
    const stale = Object.entries(out.skippedReasons ?? {}).filter(([, reason]) => reason === 'stale-anchor');
    expect(stale, `sidra su otkazala: ${JSON.stringify(stale)}`).toEqual([]);
  });

  it('ponovljen natpis ne odvodi zahvat na krivi odlomak', async () => {
    const bytes = load();
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const before = await analyzeFixture(new File([bytes], 'anchor.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID, profile } as never);
    const out = await applyFixers(bytes, buildDefaultRepairRequests(buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(PROFILE_ID) } as never) as never) as never);
    const after = await analyzeFixture(new File([out.docxBytes], 'anchor.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID, profile } as never);
    const text = JSON.stringify(after.details ?? {});
    // Oba ponovljena natpisa moraju prezivjeti: nijedan se ne smije izgubiti ni udvostruciti.
    expect((text.match(/Izvor: Izrada autora/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
