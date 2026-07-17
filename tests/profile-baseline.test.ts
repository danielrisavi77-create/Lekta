/**
 * Invarijanta profilnog baselinea: checkX zastavica smije biti UKLJUCENA samo ako profil ima
 * vrijednost prema kojoj se provjera uopce moze izvesti.
 *
 * ZASTO: engine bezuvjetno cita `profile.font.some(...)` i `profile.margins[side]` cim je pripadna
 * zastavica ukljucena (analyze-docx.ts, grane "Dominantni font" i "Margine dokumenta").
 * normalizeCheckFlags je zastavicu ukljucivao i profilima kojima kljuc NEDOSTAJE (undefined !== false),
 * pa je 20 od 372 profila rusilo zivu analizu na sasvim normalnom .docx-u ("Cannot read properties
 * of undefined (reading 'top'/'some')"). Prored nije rusio nego je tise lagao: near(x, undefined)
 * je NaN<=t = false, pa bi provjera pala uz "ocekuje se undefined" u tekstu za korisnika.
 *
 * Ti profili nemaju vrijednost jer im je sluzbeni pravilnik ne propisuje (CLAUDE.md: ne izmisljaj
 * pravila), pa je ispravan ishod informativna provjera (max 0), a ne izmisljena vrijednost.
 */
import { describe, it, expect } from 'vitest';
import { normalizeCheckFlags } from '../src/profiles/profile-baseline';
import { resolveProfile } from '../src/analysis/golden-entry';
import { analyzeDocx } from '../src/analysis/analyze-docx';
import { applyBakedAdvisory } from '../src/profiles/profile-runtime-maps';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { buildDocxFile } from './helpers/docx-builder';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const FULL_MARGINS = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

/** Dimenzije koje engine cita bezuvjetno cim je zastavica ukljucena. */
const DIMS: Array<{ flag: string; has: (p: any) => boolean }> = [
  { flag: 'checkFont', has: (p) => Array.isArray(p.font) && p.font.length > 0 },
  { flag: 'checkSize', has: (p) => Array.isArray(p.size) && p.size.length > 0 },
  { flag: 'checkSpacing', has: (p) => typeof p.spacing === 'number' },
  { flag: 'checkMargins', has: (p) => !!p.margins && SIDES.every((s) => typeof p.margins[s] === 'number') },
];

describe('normalizeCheckFlags: zastavica bez vrijednosti', () => {
  it('ukljucuje zastavicu kad vrijednost postoji (nepromijenjeno ponasanje)', () => {
    const b = normalizeCheckFlags({
      font: ['Times New Roman'], size: [12], spacing: 1.5, margins: { ...FULL_MARGINS },
    });
    expect([b.checkFont, b.checkSize, b.checkSpacing, b.checkMargins]).toEqual([true, true, true, true]);
  });

  it('gasi zastavicu kad vrijednost NE postoji', () => {
    const b = normalizeCheckFlags({});
    expect([b.checkFont, b.checkSize, b.checkSpacing, b.checkMargins]).toEqual([false, false, false, false]);
  });

  it('gasi zastavicu i za prazno polje te za nepotpune margine', () => {
    const b = normalizeCheckFlags({ font: [], size: [], spacing: '1.5', margins: { top: 2.5, left: 2.5 } });
    expect([b.checkFont, b.checkSize, b.checkSpacing, b.checkMargins]).toEqual([false, false, false, false]);
  });

  it('eksplicitni false ostaje false i kad vrijednost postoji', () => {
    const b = normalizeCheckFlags({ font: ['Arial'], checkFont: false, margins: { ...FULL_MARGINS }, checkMargins: false });
    expect([b.checkFont, b.checkMargins]).toEqual([false, false]);
  });

  it('ne dira dimenzije koje engine vec sam ogradjuje (justify, requireA4)', () => {
    expect(normalizeCheckFlags({}).checkJustify).toBe(true);
    expect(normalizeCheckFlags({ requireA4: true }).requireA4).toBe(true);
    expect(normalizeCheckFlags({}).requireA4).toBe(false);
  });
});

describe('registar: nijedan profil ne ulazi u engine sa zastavicom bez vrijednosti', () => {
  // Sirovi put (resolveProfile) je stroza granica od zivog: zivi jos i demotira (samo gasi).
  it.each(DIMS)('$flag ukljucen samo uz vrijednost, za svih ' + VERIFIED_PROFILE_REGISTRY.length + ' profila', ({ flag, has }) => {
    const offenders = (VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string }>)
      .map((e) => resolveProfile(e.id))
      .filter((p: any) => p[flag] === true && !has(p))
      .map((p: any) => p.definitionId);
    expect(offenders, `${flag} ukljucen bez vrijednosti kod: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('regresija: profili bez brojcanog pravila zavrsavaju analizu umjesto da je sruse', () => {
  const S = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const doc = (name: string) =>
    buildDocxFile(
      {
        paragraphs: Array.from({ length: 30 }, () => ({
          text: S.repeat(6), font: 'Times New Roman', sizePt: 12, jc: 'both' as const, spacingLine: 360,
        })),
        marginsCm: { ...FULL_MARGINS },
      },
      name,
    );

  /** Zivi put: resolveProfile + pecena advisory demotija, kao currentProfile() u app.ts. */
  async function analyzeLive(id: string) {
    const p: any = resolveProfile(id);
    applyBakedAdvisory(p, id);
    return analyzeDocx(doc(`${id}.docx`), p, {
      profileId: id, workType: p.selection.workType, citationStyle: 'fpzg',
      language: 'hr', strictness: 'standard', methodology: 'auto', selectionIds: {},
    }, () => {}) as Promise<any>;
  }

  // vus-zavrsni je rusio na marginama ('top'), geof na fontu ('some'); oba su iz skupa od 20.
  it.each([
    { id: 'vus-zavrsni', title: 'Margine dokumenta', detail: /brojčane margine nisu potvrđene/i },
    { id: 'geof-opci-akademski-rad', title: 'Dominantni font', detail: /font nije potvrđen/i },
  ])('$id: $title je informativan (max 0), analiza prolazi', async ({ id, title, detail }) => {
    const r = await analyzeLive(id);
    expect(typeof r.score).toBe('number');
    const c = (r.checks || []).find((x: any) => x.title === title);
    expect(c, `${id}: nema provjere "${title}"`).toBeTruthy();
    expect(c.max, `${id}: nebodovana dimenzija mora imati max 0`).toBe(0);
    expect(c.detail).toMatch(detail);
    // Nijedan tekst prema korisniku ne smije nositi "undefined" (prored bi ga procurio).
    const texts = [...(r.checks || []).map((x: any) => x.detail), ...(r.issues || []).map((x: any) => x.detail)];
    expect(texts.filter((t: any) => /undefined/i.test(String(t ?? '')))).toEqual([]);
  });
});
