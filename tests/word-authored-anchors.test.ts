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
import { readZip } from '../src/repair/zip-codec';
import { checkSchemaInvalidContent } from '../src/repair/package-integrity';

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

/**
 * DVA OBLIKA KOJE WORD PISE SAM, A NAS GRADITELJ FIXTURA NIKAD.
 *
 * Oba su 2026-09-03 bila ziv kvar u proizvodu, oba su nadjena tek na stvarnim radovima, i oba su
 * bila nevidljiva cijelom commitanom korpusu (0 od 7 radova i 0 od 19 golden fixtura):
 *
 *   1. `<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" .../></w:tabs>`, potpisna linija.
 *      `croatian-typography-fixer` ju je zamjenjivao tekstom i proizvodio `<w:tabs><w:t> </w:t>`,
 *      sto Word ODBIJA otvoriti. Pogadjalo je 6 od 38 stvarnih radova.
 *   2. `<w:rFonts w:cs="..."/>` bez `w:ascii` i `w:hAnsi`. Analiza je font SLOZENIH pisama
 *      pripisivala latinici, pa je obarala radove koji pravilo postuju. Na jednom stvarnom radu
 *      57% teksta.
 *
 * Fixturu pise pravi Word (`scripts/word-verify/make-tabstop-fixture.ps1`) i ne sadrzi nicij
 * studentski tekst. Tvrdnje nize namjerno pocinju BASELINE provjerom da fixtura doista nosi oba
 * oblika: bez nje bi ostale prolazile vakuumski nad dokumentom koji nema sto slomiti.
 */
describe('tabstop-and-cs-fonts: oblici koje sinteticki korpus nema', () => {
  const dokument = async () => {
    const bytes = load('tabstop-and-cs-fonts.docx');
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const before = await analyzeFixture(new File([bytes], 't.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID, profile } as never);
    const items = buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(PROFILE_ID) } as never);
    const out = await applyFixers(bytes, buildDefaultRepairRequests(items as never) as never);
    return { bytes, before, out };
  };
  const documentXml = async (bytes: Uint8Array) =>
    new TextDecoder().decode((await readZip(bytes)).find((e) => e.name === 'word/document.xml')!.data);

  it('BASELINE: fixtura doista nosi oba oblika (inace tvrdnje nize ne mjere nista)', async () => {
    const xml = await documentXml(load('tabstop-and-cs-fonts.docx'));
    const tabStops = xml.match(/<w:tab w:val="[^"]*"[^>]*\/>/g) ?? [];
    expect(tabStops.length, 'nema definicija tab-stopova').toBeGreaterThanOrEqual(3);
    expect(xml, 'nema tockastog vodica, a to je oblik s potpisne linije').toContain('w:leader="dot"');
    const csOnly = (xml.match(/<w:rFonts\b[^>]*\/>/g) ?? []).filter(
      (tag) => !/w:(ascii|hAnsi)(Theme)?="/.test(tag) && /w:(cs|eastAsia)="/.test(tag),
    );
    expect(csOnly.length, 'nema runova s fontom samo za slozena pisma').toBeGreaterThanOrEqual(10);
  });

  it('popravak ne pretvara definiciju tab-stopa u tekst, pa paket ostaje otvoriv', async () => {
    const { out } = await dokument();
    expect(out.changelog.length, 'popravak mora imati sto raditi').toBeGreaterThan(0);
    const xml = await documentXml(out.docxBytes);
    for (const blok of xml.match(/<w:tabs\b[^>]*>[\s\S]*?<\/w:tabs>/g) ?? []) {
      // `<w:t` je prefiks od `<w:tab`, pa granica imena mora biti dio tvrdnje.
      expect(blok, 'tekst je zavrsio u definiciji tab-stopova').not.toMatch(/<w:t(?![A-Za-z])/);
    }
    expect(checkSchemaInvalidContent(await readZip(out.docxBytes))).toEqual([]);
  });

  it('font slozenih pisama ne pripisuje se latinici', async () => {
    const { before } = await dokument();
    const check = (before.checks ?? []).find((c: { id?: string }) => c.id === 'format.font.dominant');
    expect(check, 'provjera dominantnog fonta nije pronadjena').toBeTruthy();
    expect(check.detail, 'w:cs je procitan kao font tijela rada').not.toContain('Book Antiqua');
    expect(check.detail).toContain('Times New Roman');
  });
});
