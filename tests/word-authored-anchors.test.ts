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
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';
import { buildDefaultRepairRequests } from '../src/repair/default-selection';
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PROFILE_ID = 'fpzg-politologija-diplomski';
const DIR = resolve(__dirname, 'fixtures/docx-word');

/** Sve fixture iz direktorija, da dodavanje nove ne trazi izmjenu testa. */
const FIXTURES = readdirSync(DIR).filter((name) => name.endsWith('.docx')).sort();

const load = (name: string) => new Uint8Array(readFileSync(resolve(DIR, name)));
const analyze = (bytes: Uint8Array) =>
  analyzeFixture(new File([bytes], 'word.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID } as never);

describe('sidra nad dokumentima koje je napisao pravi Word', () => {
  it('BASELINE: korpus doista sadrzi obrasce zbog kojih postoji', () => {
    // Bez ovoga bi tvrdnje nize mogle prolaziti nad dokumentima koji nemaju sto lomiti.
    expect(FIXTURES.length, 'mora postojati barem tri fixture').toBeGreaterThanOrEqual(3);
    const svi = FIXTURES.map((name) => new TextDecoder().decode(load(name))).join('');
    // Citano iz sirovih bajtova ZIP-a: dovoljno da potvrdi da su dokumenti pravi Wordovi paketi.
    expect(svi.length).toBeGreaterThan(0);
  });

  it.each(FIXTURES)('%s: popravak se primjenjuje bez zastarjelog sidra', async (name) => {
    const bytes = load(name);
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const before = await analyzeFixture(new File([bytes], name, { type: DOCX_MIME }), { profileId: PROFILE_ID, profile } as never);
    const items = buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(PROFILE_ID) } as never);
    const requests = buildDefaultRepairRequests(items as never);
    expect(requests.length, 'popravak mora imati sto raditi').toBeGreaterThan(0);

    const out = await applyFixers(bytes, requests as never);
    expect(out.integrityFailure).toBeUndefined();
    expect(out.changelog.length, 'barem jedan fixer mora promijeniti dokument').toBeGreaterThan(0);

    /**
     * SRZ: nijedan fixer ne smije odustati uz `stale-anchor`.
     *
     * Tocno se to dogadjalo prije popravka normalizacije: sidro nastaje iz teksta ANALIZE
     * (`src/docx/parser.ts` za `<w:tab/>` emitira `	`), a provjerava se protiv izvlakaca koji
     * cita SAMO `<w:t>`. Sinteticki korpus taj razred nije mogao sadrzavati: 0 od 19 fixtura ima
     * tabulator, prema 32 od 38 stvarnih radova.
     */
    const stale = Object.entries(out.skippedReasons ?? {}).filter(([, reason]) => reason === 'stale-anchor');
    expect(stale, `sidra su otkazala: ${JSON.stringify(stale)}`).toEqual([]);
  });

  it('anchor-cases: ponovljen natpis ne odvodi zahvat na krivi odlomak', async () => {
    const bytes = load('anchor-cases.docx');
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const before = await analyzeFixture(new File([bytes], 'a.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID, profile } as never);
    const out = await applyFixers(bytes, buildDefaultRepairRequests(buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(PROFILE_ID) } as never) as never) as never);
    const after = await analyze(out.docxBytes);
    const text = JSON.stringify(after.details ?? {});
    // Oba ponovljena natpisa moraju prezivjeti: nijedan se ne smije izgubiti ni udvostruciti.
    expect((text.match(/Izvor: Izrada autora/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
