/**
 * Profile conformance sloj: data-driven derivacija sintetskih .docx provjera IZ SAMIH
 * PRAVILA profila, za svaki profil u registru (fakultet x smjer x vrsta rada).
 *
 * Za dani profileId izvodi:
 *  - compliantSpec: sintetski rad koji POSTUJE sva izvediva pravila profila (provjere moraju proci),
 *  - violatingSpec: rad sa suprotnim vrijednostima (bodovane provjere moraju pasti),
 *  - assertions[]: popis dimenzija koje profil stvarno definira I koje builder kontrolira.
 *
 * Identitet nalaza je check.title (hrvatski string; engine nema checkId na check objektu).
 * Citation-provjere se NAMJERNO ne assertaju (konzistentno s postojecim *-synthetic testovima;
 * citate pokrivaju tests/citation-*.test.ts). Koristi SIROVI engine (resolveProfile iz
 * golden-entry, bez scored/advisory demotije) kao i cijeli golden/sinteticki korpus.
 *
 * NIJE izvor pravila i nista ne mijenja u engineu ni profilima (CLAUDE.md: parser se ne dira).
 */
import { expect } from 'vitest';
import { buildDocxFile, type DocSpec, type ParaSpec } from './docx-builder';
import { resolveProfile } from '../../src/analysis/golden-entry';
import { analyzeDocx } from '../../src/analysis/analyze-docx';
import { normalize, sectionName } from '../../src/utils/helpers';
import { VERIFIED_PROFILE_REGISTRY } from '../../src/profiles/profile-registry';
import catalog from '../../data/catalog/zagreb-catalog.json';

export type ConformanceDim =
  | 'font' | 'size' | 'spacing' | 'margins' | 'paper' | 'justify'
  | 'toc' | 'sections' | 'words' | 'pagenums' | 'struktura' | 'fusnote';

export interface ConformanceAssertion {
  dim: ConformanceDim;
  checkTitle: string;
  /** 'earned': Sadrzaj dokumenta i Brojevi stranica imaju status UVIJEK 'pass', boduju se kroz earned. */
  kind: 'status' | 'earned';
  /** false kad neuskladjeni dokument ne moze pouzdano srusiti provjeru (npr. words bez wordMin). */
  assertViolating: boolean;
}

export interface ConformancePlan {
  profileId: string;
  profile: any;
  compliantSpec: DocSpec;
  violatingSpec: DocSpec;
  assertions: ConformanceAssertion[];
}

/**
 * Escape hatch iz triagea: profileId -> dimenzije koje se preskacu. SVAKI unos MORA imati
 * komentar ZASTO (data-quirk koji builder ne moze izraziti). Rjesenje nikad nije izmjena
 * parsera ni profila; sumnja na engine bug se eskalira korisniku, ne maskira ovdje.
 */
const SKIP: Record<string, ConformanceDim[]> = {};

/** Zrcalo PS mape iz engine-a (analyze-docx paperSizes grana). */
const PAPER_CM: Record<string, [number, number]> = {
  A4: [21, 29.7], A3: [29.7, 42], A2: [42, 59.4], A1: [59.4, 84.1], A0: [84.1, 118.8],
};

/**
 * Test-layer crash guard, NIJE demotija: sirovi engine se rusi kad je checkX ukljucen a profil
 * NEMA vrijednost (profile.font.some / profile.margins[side] na undefined; empirijski ~50
 * profila, npr. vsite-zavrsni). Zivi app to izbjegava pecenom advisory-map demotijom koju
 * golden put namjerno ne primjenjuje. Ovdje gasimo checkX SAMO kad vrijednost ne postoji;
 * dimenzije s vrijednoscu ostaju bodovane (vjerno sirovom engineu).
 */
export function guardMissingValueFlags(profile: any): any {
  if (!(Array.isArray(profile.font) && profile.font.length)) profile.checkFont = false;
  if (!(Array.isArray(profile.size) && profile.size.length)) profile.checkSize = false;
  if (typeof profile.spacing !== 'number') profile.checkSpacing = false;
  const m = profile.margins;
  if (!(m && ['top', 'right', 'bottom', 'left'].every((s) => typeof m[s] === 'number'))) {
    profile.checkMargins = false;
  }
  return profile;
}

/** Word PAGE polje kao sirovi odlomak: engine detektira /\bPAGE\b/i nad sirovim document.xml. */
const PAGE_FIELD_PARA: ParaSpec = {
  text: '',
  raw:
    '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
};

/** 10 rijeci po recenici; 6 ponavljanja = 60 rijeci po odlomku (isti obrazac kao harvard-apa7 test). */
const SENTENCE = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
const WORDS_PER_PARA = 60;

/** Neutralna recenica neuskladjenog rada: ne pocinje nijednim section-terminom, bez PAGE/TOC. */
const VIOLATING_SENTENCE =
  'Nasumičan odlomak bez ikakve akademske strukture, oznaka ni dijelova rada koji bi se dali prepoznati.';

interface Fmt { font: string; sizePt: number; spacingLine: number }

function bodyParas(words: number, f: Fmt): ParaSpec[] {
  const out: ParaSpec[] = [];
  for (let c = 0; c < words; c += WORDS_PER_PARA) {
    out.push({ text: SENTENCE.repeat(6), font: f.font, sizePt: f.sizePt, jc: 'both', spacingLine: f.spacingLine });
  }
  return out;
}

/** Izvedi plan provjera za jedan profil. Baca za nepoznat profileId. */
export function deriveConformancePlan(profileId: string): ConformancePlan {
  const profile = guardMissingValueFlags(resolveProfile(profileId));

  const font: string = profile.font?.[0] ?? 'Times New Roman';
  const sizePt: number = profile.size?.[0] ?? 12;
  const spacing: number = typeof profile.spacing === 'number' ? profile.spacing : 1.5;
  const f: Fmt = { font, sizePt, spacingLine: Math.round(spacing * 240) };
  const headed = (text: string): ParaSpec => ({ text, font, sizePt, styleId: 'Heading1', spacingLine: f.spacingLine });

  // Opseg: cilj tik iznad wordMin (raspored Uvod 15% / Razrada 70% / Zakljucak 15%);
  // bez wordMin 1500 je dovoljno za smislen dokument, a nijedan profil nema samo wordMax.
  let targetWords = profile.wordMin ? Math.round(profile.wordMin * 1.05) : 1500;
  if (profile.wordMax && targetWords > profile.wordMax) targetWords = Math.floor(profile.wordMax * 0.9);

  const skeleton: ParaSpec[] = [
    headed('Sažetak'),
    { text: 'Sažetak rada u jednom odlomku s ključnim spoznajama istraživanja.', font, sizePt, jc: 'both', spacingLine: f.spacingLine },
    { text: 'Ključne riječi: analiza, metoda, istraživanje, rezultat', font, sizePt, spacingLine: f.spacingLine },
    headed('Sadržaj'),
    PAGE_FIELD_PARA,
    headed('1. Uvod'),
    ...bodyParas(Math.round(targetWords * 0.15), f),
    headed('2. Razrada'),
    ...bodyParas(Math.round(targetWords * 0.7), f),
    headed('3. Zaključak'),
    ...bodyParas(Math.round(targetWords * 0.15), f),
  ];

  // requiredSections pokrivenost: ista logika kao engine detectRequiredSections
  // (sectionName paragrafa === normalize(term) ili startsWith). Za nepokriveni zahtjev
  // dodajemo heading s prvim terminom prije Literature.
  const requirements: any[] = Array.isArray(profile.requiredSections) ? profile.requiredSections : [];
  const skeletonNames = [...skeleton.map((p) => sectionName(p.text)), 'literatura'];
  let sectionsSatisfiable = requirements.length > 0;
  const extraHeadings: ParaSpec[] = [];
  for (const r of requirements) {
    const terms: string[] = (r.terms || []).map((t: string) => normalize(t)).filter((t: string) => t.length > 0);
    if (!terms.length) { sectionsSatisfiable = false; continue; }
    const covered = skeletonNames.some((n) => terms.some((t) => n === t || n.startsWith(t)));
    if (covered) continue;
    const raw = (r.terms || []).find((t: string) => normalize(t).length > 0);
    extraHeadings.push(headed(String(raw)));
    skeletonNames.push(sectionName(String(raw)));
  }

  const compliantSpec: DocSpec = {
    paragraphs: [
      ...skeleton,
      ...extraHeadings,
      headed('Literatura'),
      { text: 'Prezime, I. (2020). Naslov knjige. Zagreb: Naklada.', font, sizePt, spacingLine: f.spacingLine },
    ],
    marginsCm: profile.margins ?? { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    pageCm: profile.paperSizes?.length
      ? { w: PAPER_CM[profile.paperSizes[0]][0], h: PAPER_CM[profile.paperSizes[0]][1] }
      : undefined, // default A4 u builderu
    footnotes: profile.legalFootnoteProfile
      ? ['Usp. čl. 3. Zakona o radu, NN 93/14.', 'Ibid., str. 12.']
      : undefined,
  };

  // Neuskladjene vrijednosti, izvedene da SIGURNO krse profil (tolerancije engine-a:
  // size 0.1, spacing 0.12, margine 0.36 cm po strani).
  const fontSet = new Set((profile.font ?? []).map((x: string) => normalize(x)));
  const vFont = ['Comic Sans MS', 'Courier New', 'Garamond', 'Wingdings'].find((c) => !fontSet.has(normalize(c)))!;
  const vSize = Math.max(...(profile.size?.length ? profile.size : [12])) + 5;
  const vSpacingLine = spacing >= 1.4 ? 240 : 480;
  const pm = profile.margins ?? { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
  const vMargins = { top: pm.top + 1.5, right: pm.right + 1.5, bottom: pm.bottom + 1.5, left: pm.left + 1.5 };
  const vPage = profile.paperSizes?.length
    ? (() => {
        const alt = Object.keys(PAPER_CM).find((k) => !profile.paperSizes.includes(k))!;
        return { w: PAPER_CM[alt][0], h: PAPER_CM[alt][1] };
      })()
    : { w: 14.8, h: 21.0 }; // A5

  const violatingSpec: DocSpec = {
    paragraphs: Array.from({ length: 10 }, () => ({
      text: VIOLATING_SENTENCE, font: vFont, sizePt: vSize, jc: 'left' as const, spacingLine: vSpacingLine,
    })),
    marginsCm: vMargins,
    pageCm: vPage,
  };

  // Dimenzije koje profil stvarno definira -> asserti. Uvjeti zrcale grane emitiranja u engineu.
  const a: ConformanceAssertion[] = [];
  const add = (dim: ConformanceDim, checkTitle: string, kind: 'status' | 'earned', assertViolating = true) =>
    a.push({ dim, checkTitle, kind, assertViolating });

  if (profile.checkFont !== false) add('font', 'Dominantni font', 'status');
  if (profile.checkSize !== false) add('size', 'Veličina osnovnog teksta', 'status');
  if (profile.checkSpacing !== false) add('spacing', 'Prored osnovnog teksta', 'status');
  if (profile.checkMargins !== false) add('margins', 'Margine dokumenta', 'status');
  if (profile.paperSizes?.length) add('paper', `Format stranice (${profile.paperSizes.join('/')})`, 'status');
  else if (profile.requireA4) add('paper', 'Format stranice A4', 'status');
  if (profile.justify && profile.checkJustify !== false) add('justify', 'Poravnanje osnovnog teksta', 'status');
  if (profile.requireToc) add('toc', 'Sadržaj dokumenta', 'earned');
  if (profile.requirePageNumbers) add('pagenums', 'Brojevi stranica', 'earned');
  if (requirements.length && sectionsSatisfiable) add('sections', 'Dijelovi verificiranog profila', 'status');
  if (profile.wordMin || profile.wordMax) add('words', 'Profilni opseg riječi', 'status', !!profile.wordMin);
  if (profile.scoreStructure !== false) add('struktura', 'Osnovni dijelovi rada', 'status');
  if (profile.legalFootnoteProfile) add('fusnote', 'Automatske fusnote', 'status');

  const skipped = new Set(SKIP[profileId] ?? []);
  const assertions = a.filter((x) => !skipped.has(x.dim));

  return { profileId, profile, compliantSpec, violatingSpec, assertions };
}

/** Nadji tocno jedan check po naslovu (dupli naslov = greska u derivaciji/engineu). */
function findOne(r: any, title: string, label: string): any {
  const matches = (r.checks || []).filter((c: any) => c.title === title);
  expect(matches.length, `${label}: ocekivan tocno 1 check "${title}", nadjeno ${matches.length}`).toBe(1);
  return matches[0];
}

/** Isti settings literal kao analyzeFixture (golden-entry), ali s guardanim profilom. */
async function analyzeWith(profile: any, file: File): Promise<any> {
  const settings = {
    profileId: profile.definitionId,
    workType: profile.selection.workType,
    citationStyle: 'fpzg',
    language: 'hr',
    strictness: 'standard',
    methodology: 'auto',
    selectionIds: {},
  };
  return analyzeDocx(file, profile, settings, () => {});
}

/**
 * Glavni runner: izgradi uskladjen + neuskladjen docx za profil, analiziraj oba i
 * assertaj sve izvedene dimenzije. Bez ijedne dimenzije (smoke-only profili) i dalje
 * dokazuje da analiza zavrsava i vraca provjere.
 */
export async function expectProfileConformance(profileId: string): Promise<void> {
  const plan = deriveConformancePlan(profileId);
  const ok = await analyzeWith(plan.profile, buildDocxFile(plan.compliantSpec, `${profileId}-ok.docx`));
  const bad = await analyzeWith(plan.profile, buildDocxFile(plan.violatingSpec, `${profileId}-los.docx`));

  // Smoke: analiza je zavrsila i emitirala provjere za oba dokumenta.
  expect(ok.checks?.length, `${profileId}: compliant checks prazni`).toBeGreaterThan(0);
  expect(bad.checks?.length, `${profileId}: violating checks prazni`).toBeGreaterThan(0);
  expect(typeof ok.score, `${profileId}: score nije broj`).toBe('number');

  for (const as of plan.assertions) {
    const label = `${profileId} [${as.dim}]`;
    const c = findOne(ok, as.checkTitle, `${label} compliant`);
    expect(c.max, `${label} compliant: max mora biti bodovan (>0)`).toBeGreaterThan(0);
    if (as.kind === 'status') {
      expect(c.status, `${label} compliant: status`).toBe('pass');
    } else {
      expect(c.earned, `${label} compliant: earned=${c.earned}/${c.max}`).toBe(c.max);
    }

    if (!as.assertViolating) continue;
    const v = findOne(bad, as.checkTitle, `${label} violating`);
    if (!(v.max > 0)) continue; // guard: nebodovano u ovom dokumentu ne moze pasti
    if (as.kind === 'status') {
      expect(v.status, `${label} violating: status ne smije biti pass`).not.toBe('pass');
    } else {
      expect(v.earned, `${label} violating: earned mora biti < max (${v.earned}/${v.max})`).toBeLessThan(v.max);
    }
  }
}

/** Svi profili registra, sortirano (stabilan poredak za shardove i izvjestaje). */
export function allConformanceProfileIds(): string[] {
  return (VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string }>).map((p) => p.id).sort();
}

/** Interleaved podjela (i % totalShards) prirodno balansira velike wordMin profile. */
export function conformanceShardIds(shard: number, totalShards: number): string[] {
  if (shard < 1 || shard > totalShards) throw new Error(`shard ${shard} izvan raspona 1..${totalShards}`);
  return allConformanceProfileIds().filter((_, i) => i % totalShards === shard - 1);
}

/**
 * Tripwire uzorak za redovni `npm run check`: po JEDAN (leksikografski prvi) profil za
 * svaku instituciju iz kataloga koja ima profile. Baca ako neki registry unitId ne
 * postoji u katalogu: novi fakultet bez katalog unosa mora pasti glasno, ne tiho ispasti.
 */
export function tripwireProfileIds(): string[] {
  const unitToInst = new Map<string, string>();
  for (const inst of catalog as any[]) {
    for (const u of inst.units || []) unitToInst.set(u.id, inst.id);
  }
  const byInst = new Map<string, string[]>();
  for (const p of VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string; unitId: string }>) {
    const inst = unitToInst.get(p.unitId);
    if (!inst) throw new Error(`Registry profil ${p.id} ima unitId "${p.unitId}" kojeg nema u katalogu`);
    if (!byInst.has(inst)) byInst.set(inst, []);
    byInst.get(inst)!.push(p.id);
  }
  return [...byInst.keys()].sort().map((inst) => byInst.get(inst)!.sort()[0]);
}
