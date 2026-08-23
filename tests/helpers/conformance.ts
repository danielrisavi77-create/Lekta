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
import { buildDocxFile, type DocSpec, type ParaSpec, TOC_FIELD_PARA } from './docx-builder';
import { resolveProfile } from '../../src/analysis/golden-entry';
import { analyzeDocx } from '../../src/analysis/analyze-docx';
import { normalize, sectionName } from '../../src/utils/helpers';
import { VERIFIED_PROFILE_REGISTRY, BASE_PROFILES, FPZG_PARTIAL } from '../../src/profiles/profile-registry';
import { normalizeCheckFlags } from '../../src/profiles/profile-baseline';
import { citationMeta } from '../../src/citations/citation-meta';
import catalog from '../../data/catalog/zagreb-catalog.json';

export type ConformanceDim =
  | 'font' | 'size' | 'spacing' | 'margins' | 'paper' | 'justify'
  | 'toc' | 'sections' | 'words' | 'pagenums' | 'struktura' | 'fusnote';

export interface ConformanceAssertion {
  dim: ConformanceDim;
  checkTitle: string;
  /** false kad neuskladjeni dokument ne moze pouzdano srusiti provjeru (npr. words bez wordMin). */
  assertViolating: boolean;
}

export interface ConformancePlan {
  profileId: string;
  /** Vrsta rada koja se ovim planom vrti (profil ih moze imati vise). */
  workType: string;
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

/**
 * Izvedi plan provjera za jedan profil i JEDNU vrstu rada. Baca za nepoznat profileId.
 *
 * Vrsta rada je eksplicitna jer resolveProfile uzima workTypes[0], pa je do 2026-08-22 svaki
 * profil s vise vrsta rada (danas 9 profila sa seminar+project+article) bio testiran samo u prvoj:
 * 18 parova (profil, vrsta rada) nije imalo nikakvu pokrivenost. Vrsta rada ulazi u analizu kroz
 * settings.workType (npr. zahtjev za mentorom na naslovnici), pa nije kozmeticka.
 */
export function deriveConformancePlan(profileId: string, workType?: string): ConformancePlan {
  // Bez test-layer guarda: normalizeCheckFlags (profile-baseline.ts) sam gasi checkX bez
  // vrijednosti, pa ovaj sloj testira PRODUKCIJSKO ponasanje, a ne vlastiti zaobilazak.
  const profile = resolveProfile(profileId);
  if (workType) profile.selection = { ...(profile.selection || {}), workType };
  return derivePlanFor(profileId, profile);
}

/** Jezgra derivacije nad VEC razrijesenim profilom (dijele je registarski i fallback put). */
function derivePlanFor(profileId: string, profile: any): ConformancePlan {

  const font: string = profile.font?.[0] ?? 'Times New Roman';
  const sizePt: number = profile.size?.[0] ?? 12;
  const spacing: number = typeof profile.spacing === 'number' ? profile.spacing : 1.5;
  const f: Fmt = { font, sizePt, spacingLine: Math.round(spacing * 240) };
  const headed = (text: string): ParaSpec => ({ text, font, sizePt, styleId: 'Heading1', spacingLine: f.spacingLine });

  // Opseg: cilj tik iznad wordMin (raspored Uvod 15% / Razrada 70% / Zakljucak 15%);
  // bez wordMin 1500 je dovoljno za smislen dokument, a nijedan profil nema samo wordMax.
  let targetWords = profile.wordMin ? Math.round(profile.wordMin * 1.05) : 1500;
  if (profile.wordMax && targetWords > profile.wordMax) targetWords = Math.floor(profile.wordMax * 0.9);

  // Profil moze propisati jezik rada (npr. Algebrin diplomski se pise iskljucivo na engleskom).
  // Engine tada trazi engleske nazive dijelova (detectStructure), pa i uskladjen dokument mora biti
  // na engleskom, inace bi test "dokazivao" pad koji je artefakt krivo postavljenog jezika.
  const lang: string = profile.documentLanguage || 'hr';
  const L = lang === 'en'
    ? { abstract: 'Abstract', toc: 'Contents', intro: '1. Introduction', body: '2. Discussion', concl: '3. Conclusion', refs: 'References',
        abstractText: 'This abstract summarises the key findings of the study in a single paragraph.',
        keywords: 'Keywords: analysis, method, research, result' }
    : { abstract: 'Sažetak', toc: 'Sadržaj', intro: '1. Uvod', body: '2. Razrada', concl: '3. Zaključak', refs: 'Literatura',
        abstractText: 'Sažetak rada u jednom odlomku s ključnim spoznajama istraživanja.',
        keywords: 'Ključne riječi: analiza, metoda, istraživanje, rezultat' };

  const skeleton: ParaSpec[] = [
    headed(L.abstract),
    { text: L.abstractText, font, sizePt, jc: 'both', spacingLine: f.spacingLine },
    { text: L.keywords, font, sizePt, spacingLine: f.spacingLine },
    headed(L.toc),
    TOC_FIELD_PARA,
    PAGE_FIELD_PARA,
    headed(L.intro),
    ...bodyParas(Math.round(targetWords * 0.15), f),
    headed(L.body),
    ...bodyParas(Math.round(targetWords * 0.7), f),
    headed(L.concl),
    ...bodyParas(Math.round(targetWords * 0.15), f),
  ];

  // requiredSections pokrivenost: ista logika kao engine detectRequiredSections
  // (sectionName paragrafa === normalize(term) ili startsWith). Za nepokriveni zahtjev
  // dodajemo heading s prvim terminom prije Literature.
  const requirements: any[] = Array.isArray(profile.requiredSections) ? profile.requiredSections : [];
  const skeletonNames = [...skeleton.map((p) => sectionName(p.text)), sectionName(L.refs)];
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
      headed(L.refs),
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
  // Uz `marginsMinimum` profil trazi "najmanje X cm" (izvor: "rubovi moraju biti siroki najmanje
  // 2,5 cm"), pa engine mjeri `got >= want - tolerancija`. SIRA margina je tada USKLADJENA, ne
  // prekrsaj, i slucaj bi lazno prolazio kao pass. Prekrsaj je onda UZA margina.
  const marginsAreMinimum = profile.marginsMinimum === true;
  const vMarginSide = (want: number): number =>
    marginsAreMinimum ? Math.max(0.2, want - 1.5) : want + 1.5;
  const vMargins = {
    top: vMarginSide(pm.top), right: vMarginSide(pm.right),
    bottom: vMarginSide(pm.bottom), left: vMarginSide(pm.left),
  };
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
  const add = (dim: ConformanceDim, checkTitle: string, assertViolating = true) =>
    a.push({ dim, checkTitle, assertViolating });

  if (profile.checkFont !== false) add('font', 'Dominantni font');
  if (profile.checkSize !== false) add('size', 'Veličina osnovnog teksta');
  if (profile.checkSpacing !== false) add('spacing', 'Prored osnovnog teksta');
  if (profile.checkMargins !== false) add('margins', 'Margine dokumenta');
  if (profile.paperSizes?.length) add('paper', `Format stranice (${profile.paperSizes.join('/')})`);
  else if (profile.requireA4) add('paper', 'Format stranice A4');
  if (profile.justify && profile.checkJustify !== false) add('justify', 'Poravnanje osnovnog teksta');
  if (profile.requireToc) add('toc', 'Sadržaj dokumenta');
  if (profile.requirePageNumbers) add('pagenums', 'Brojevi stranica');
  if (requirements.length && sectionsSatisfiable) add('sections', 'Dijelovi verificiranog profila');
  if (profile.wordMin || profile.wordMax) add('words', 'Profilni opseg riječi', !!profile.wordMin);
  if (profile.scoreStructure !== false) add('struktura', 'Osnovni dijelovi rada');
  if (profile.legalFootnoteProfile) add('fusnote', 'Automatske fusnote');

  const skipped = new Set(SKIP[profileId] ?? []);
  const assertions = a.filter((x) => !skipped.has(x.dim));

  return { profileId, workType: profile.selection?.workType || 'final', profile, compliantSpec, violatingSpec, assertions };
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
    // Jezik iz profila (kao zivi app: syncProfileContext postavi #docLanguage iz profila).
    language: profile.documentLanguage || 'hr',
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
export async function expectProfileConformance(profileId: string, workType?: string): Promise<void> {
  await runPlan(caseId(profileId, workType), deriveConformancePlan(profileId, workType));
}

/** Runner za jedan slucaj matrice (profil + vrsta rada). Koriste ga shardovi i tripwire. */
export async function expectConformanceCase(c: ConformanceCase): Promise<void> {
  await runPlan(c.id, deriveConformancePlan(c.profileId, c.workType));
}

/** Analiziraj uskladjen + neuskladjen docx plana i assertaj sve izvedene dimenzije. */
async function runPlan(label0: string, plan: ConformancePlan): Promise<void> {
  const profileId = plan.profileId;
  const ok = await analyzeWith(plan.profile, buildDocxFile(plan.compliantSpec, `${label0}-ok.docx`));
  const bad = await analyzeWith(plan.profile, buildDocxFile(plan.violatingSpec, `${label0}-los.docx`));

  // Smoke: analiza je zavrsila i emitirala provjere za oba dokumenta.
  expect(ok.checks?.length, `${profileId}: compliant checks prazni`).toBeGreaterThan(0);
  expect(bad.checks?.length, `${profileId}: violating checks prazni`).toBeGreaterThan(0);
  expect(typeof ok.score, `${profileId}: score nije broj`).toBe('number');

  // Istinitost statusa nad SVIM provjerama oba dokumenta, ne samo nad planiranim dimenzijama.
  // Do 2026-08-20 su `Sadrzaj dokumenta` i `Brojevi stranica` slali 'pass' uz 0 bodova, pa je ovaj
  // harness za njih imao iznimku (`kind: 'earned'`) koja je kvar posvetila umjesto da ga srusi.
  for (const [doc, name] of [[ok, 'compliant'], [bad, 'violating']] as const) {
    const lying = (doc.checks ?? []).filter((c: any) => c.max > 0 && c.earned < c.max && c.status === 'pass');
    expect(
      lying.map((c: any) => `${c.title} ${c.earned}/${c.max}`),
      `${profileId} ${name}: bodovana provjera s izgubljenim bodovima ne smije javiti pass`,
    ).toEqual([]);
  }

  for (const as of plan.assertions) {
    const label = `${profileId} [${as.dim}]`;
    const c = findOne(ok, as.checkTitle, `${label} compliant`);
    expect(c.max, `${label} compliant: max mora biti bodovan (>0)`).toBeGreaterThan(0);
    // Nebodovana provjera (max===0) nosi 'informational'; oboje znaci "ne kaznjava".
    expect(['pass', 'informational'], `${label} compliant: status (${c.status})`).toContain(c.status);

    if (!as.assertViolating) continue;
    const v = findOne(bad, as.checkTitle, `${label} violating`);
    if (!(v.max > 0)) continue; // guard: nebodovano u ovom dokumentu ne moze pasti
    expect(['pass', 'informational'], `${label} violating: status ne smije biti pass ni informativan (${v.status})`).not.toContain(v.status);
  }
}

/** Svi profili registra, sortirano (stabilan poredak za shardove i izvjestaje). */
export function allConformanceProfileIds(): string[] {
  return (VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string }>).map((p) => p.id).sort();
}

/** Jedan slucaj matrice: profil vrti se jednom po vrsti rada koju stvarno nosi. */
export interface ConformanceCase {
  profileId: string;
  workType: string;
  /** Ime testa: gol profileId dok profil ima jednu vrstu rada (citljivost postojecih izvjestaja). */
  id: string;
}

/** Ime slucaja: sufiks samo kad profil nosi vise vrsta rada. */
function caseId(profileId: string, workType?: string): string {
  return workType ? `${profileId} · ${workType}` : profileId;
}

/** Svi (profil, vrsta rada) parovi registra, stabilno sortirano. */
export function allConformanceCases(): ConformanceCase[] {
  const registry = VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string; workTypes?: string[] }>;
  const out: ConformanceCase[] = [];
  for (const p of [...registry].sort((a, b) => a.id.localeCompare(b.id))) {
    const workTypes = p.workTypes?.length ? p.workTypes : [];
    if (workTypes.length <= 1) {
      out.push({ profileId: p.id, workType: workTypes[0] || 'final', id: p.id });
      continue;
    }
    for (const workType of workTypes) {
      out.push({ profileId: p.id, workType, id: caseId(p.id, workType) });
    }
  }
  return out;
}

/** Interleaved podjela (i % totalShards) prirodno balansira velike wordMin profile. */
export function conformanceShardCases(shard: number, totalShards: number): ConformanceCase[] {
  if (shard < 1 || shard > totalShards) throw new Error(`shard ${shard} izvan raspona 1..${totalShards}`);
  return allConformanceCases().filter((_, i) => i % totalShards === shard - 1);
}

/**
 * Tripwire uzorak za redovni `npm run check`: po JEDAN (leksikografski prvi) profil za
 * svaku instituciju iz kataloga koja ima profile. Baca ako neki registry unitId ne
 * postoji u katalogu: novi fakultet bez katalog unosa mora pasti glasno, ne tiho ispasti.
 */
export function tripwireCases(): ConformanceCase[] {
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
  const picked = new Set([...byInst.keys()].sort().map((inst) => byInst.get(inst)!.sort()[0]));
  return allConformanceCases().filter((c) => picked.has(c.profileId));
}

// --- Fallback baseline (BASE_PROFILES) -------------------------------------------------------
// Jedinice bez profila (npr. tvz/vern/rit) i vrste rada koje profil ne pokriva NE prolaze kroz
// resolveProfile nego padaju na genericki obiteljski baseline u currentProfile() (src/ui/app.ts).
// Taj put nema pokrivenosti u golden/conformance korpusu (resolveProfile baca za ne-registrirani
// id), a upravo je on ono sto student iz neportanog fakulteta stvarno dobije. Ovdje ga gradimo
// DOM-free, vjerno grani u currentProfile(), i vrtimo kroz istu derivaciju plana.

/** Obitelji koje katalog stvarno koristi (+ fpzg kao poseban unit s vlastitim baselineom). */
export const BASELINE_FAMILIES = ['social', 'stem', 'biomed', 'arts', 'mixed'] as const;
/**
 * SVE vrste rada koje carobnjak nudi, ne uzorak. Do 2026-08-22 su ovdje bile samo tri
 * (final/graduate/seminar), pa doktorski, specijalisticki, projektni i clanak na fallback putu nisu
 * imali nijednu analizu, iako ih carobnjak nudi za svaku jedinicu (i za tri jedinice bez ijednog
 * profila je fallback JEDINO sto student dobije). 'seminar', 'project' i 'article' idu kroz
 * lightBaseline granu (gasi requireToc), ostale kroz tesku.
 */
export const BASELINE_WORK_TYPES = ['seminar', 'final', 'graduate', 'specialist', 'doctoral', 'article', 'project'] as const;

/**
 * Izgradi analizabilni baseline profil za (obitelj, vrsta rada), vjerno fallback grani
 * currentProfile(): clone(FPZG_PARTIAL ili BASE_PROFILES[family]) -> lightBaseline gasi requireToc
 * za seminar/project/article -> normalizeCheckFlags. Postavlja samo polja koja analyzeDocx cita.
 */
export function buildBaselineProfile(family: string, workType: string): any {
  const src = family === 'fpzg' ? FPZG_PARTIAL : (BASE_PROFILES as any)[family] || (BASE_PROFILES as any).mixed;
  const base: any = structuredClone(src);
  const lightBaseline = ['seminar', 'project', 'article'].includes(workType);
  if (lightBaseline) base.requireToc = false;
  normalizeCheckFlags(base);
  // Metapodaci koje analyzeDocx cita; definitionId je null jer baseline NIJE registriran profil.
  base.name = `Baseline ${family} · ${workType}`;
  base.statusKey = 'generic';
  base.status = 'Generička provjera';
  base.definitionId = null;
  base.selection = { workType };
  base.citationMode = citationMeta('fpzg').mode;
  return base;
}

/** Plan provjera za fallback baseline (dijeli jezgru s registarskim putem). */
export function deriveBaselinePlan(family: string, workType: string): ConformancePlan {
  return derivePlanFor(`baseline:${family}:${workType}`, buildBaselineProfile(family, workType));
}

/** Sve kombinacije (obitelj x vrsta rada) za matricu fallback baselinea. */
export function baselineConformanceCases(): Array<{ family: string; workType: string; id: string }> {
  const out: Array<{ family: string; workType: string; id: string }> = [];
  for (const family of [...BASELINE_FAMILIES, 'fpzg']) {
    for (const workType of BASELINE_WORK_TYPES) out.push({ family, workType, id: `baseline:${family}:${workType}` });
  }
  return out;
}

/** Runner za jednu baseline kombinaciju: analiza zavrsava i sve izvedene dimenzije se drze. */
export async function expectBaselineConformance(family: string, workType: string): Promise<void> {
  await runPlan(`baseline-${family}-${workType}`, deriveBaselinePlan(family, workType));
}

// --- Slozeni (zivi) profil -------------------------------------------------------------------
// Sve iznad vrti SIROVI profil iz registra (resolveProfile): svaka dimenzija bodovana, jer je to
// najstroza mreza za detekciju parsera (CLAUDE.md: golden namjerno testira sirovi engine). Student
// medjutim dobiva profil koji je prosao jos cetiri sloja (compose-profile.ts): baseline za jedinicu
// bez profila, olaksani baseline za lagane radove, overlay katedre po vrsti rada, mentorov override
// i scored/advisory demotiju. Demotija sama danas gasi barem jednu bodovanu dimenziju na 383 od 407
// profila, pa sirova matrica NE dokazuje sto ce ocjena stvarno mjeriti.
//
// Ovdje se zato vrti SLOZENI profil, ali na UZORKU: po jedan profil za svaki razlicit obrazac
// demotije + sve kombinacije katedri + mentorov override. Puna slozena matrica bi udvostrucila
// CI trosak bez nove informacije, jer profili s istim obrascem demotije prolaze iste grane.
import { composeAnalysisProfile, type MentorOverrideInput } from '../../src/profiles/compose-profile';
import { LEGAL_DEPARTMENT_REGISTRY, PROFILE_STATUS } from '../../src/profiles/profile-registry';
import advisoryMap from '../../data/profiles/advisory-map.json';

/** Jedan slucaj slozene matrice. */
export interface ComposedCase {
  id: string;
  profileId: string;
  workType: string;
  /** Katedra Pravnog fakulteta (overlay + rulesByWorkType), ako je odabrana. */
  departmentId?: string;
  /** Mentorov override cetiriju tehnickih dimenzija. */
  override?: MentorOverrideInput;
}

/** Obitelj studija iz kataloga (compose je treba samo kad profila nema, ali prosljedjujemo vjerno). */
function familyForUnit(unitId: string): string {
  for (const inst of catalog as Array<{ units?: Array<{ id: string; family?: string }> }>) {
    for (const u of inst.units || []) if (u.id === unitId) return u.family || 'mixed';
  }
  return 'mixed';
}

/** Registarski unos s vec spojenim teskim pravilima (golden-entry ih eager mergea pri uvozu). */
function registryEntry(profileId: string): any {
  const entry = (VERIFIED_PROFILE_REGISTRY as unknown as Array<Record<string, any>>).find((p) => p.id === profileId);
  if (!entry) throw new Error(`Nepoznat profileId: ${profileId}`);
  return entry;
}

/**
 * Slozi profil kakav analiza dobije u zivom app-u za dani slucaj. Koristi PRODUKCIJSKI
 * composeAnalysisProfile (isti modul koji zove currentProfile), pa ne moze odlutati od app-a;
 * dodaje samo metapodatke koje analyzeDocx cita, a UI ih inace postavlja.
 */
export function buildComposedProfile(c: ComposedCase): any {
  const entry = registryEntry(c.profileId);
  const department = c.departmentId
    ? (LEGAL_DEPARTMENT_REGISTRY as unknown as Array<Record<string, any>>).find((d) => d.id === c.departmentId) || null
    : null;
  if (c.departmentId && !department) throw new Error(`Nepoznata katedra: ${c.departmentId}`);

  const base: any = composeAnalysisProfile({
    definition: { id: entry.id, rules: entry.rules },
    department,
    family: familyForUnit(entry.unitId),
    unitId: entry.unitId,
    workType: c.workType,
    // Zivi UI postavi citatni stil iz profila (syncProfileContext), pa isto radimo i ovdje.
    citationStyle: String(entry.rules?.recommendedCitation || 'fpzg'),
    override: c.override ?? null,
  });

  base.name = `Slozeni ${c.id}`;
  base.statusKey = entry.status;
  base.status = ((PROFILE_STATUS as any)[entry.status] || {}).label || entry.status;
  base.verified = entry.status === 'verified';
  base.definitionId = entry.id;
  base.sources = entry.sources || [];
  base.facts = entry.facts || [];
  base.selection = { workType: c.workType };
  return base;
}

/** Plan provjera nad slozenim profilom (dijeli jezgru derivacije sa sirovim putem). */
export function deriveComposedPlan(c: ComposedCase): ConformancePlan {
  return derivePlanFor(c.id, buildComposedProfile(c));
}

/** Runner jednog slucaja slozene matrice. */
export async function expectComposedConformance(c: ComposedCase): Promise<void> {
  await runPlan(c.id, deriveComposedPlan(c));
}

/** Potpis demotije: sortirani popis demotiranih checkId-jeva ('' kad demotije nema). */
export function demotionSignature(profileId: string): string {
  const demoted = (advisoryMap as Record<string, string[]>)[profileId];
  return demoted === undefined ? '(nema ruleEntries)' : [...demoted].sort().join('+') || '(bez demotije)';
}

/** Po jedan (leksikografski prvi) profil za svaki razlicit obrazac demotije. */
export function demotionSampleCases(): ComposedCase[] {
  const bySignature = new Map<string, string[]>();
  for (const c of allConformanceCases()) {
    const sig = demotionSignature(c.profileId);
    if (!bySignature.has(sig)) bySignature.set(sig, []);
    bySignature.get(sig)!.push(c.profileId);
  }
  return [...bySignature.keys()].sort().map((sig) => {
    const profileId = bySignature.get(sig)!.sort()[0];
    const workType = registryEntry(profileId).workTypes?.[0] || 'final';
    return { id: `composed:${profileId}`, profileId, workType };
  });
}

/**
 * Sve kombinacije katedre i vrste rada, svaka na pravom Pravnom profilu. Katedra je jedini sloj
 * koji u pravila unosi NOVE zahtjeve (dijelovi rada, fusnote, opseg), a ne samo gasi postojece.
 */
export function departmentCases(): ComposedCase[] {
  const out: ComposedCase[] = [];
  const registry = VERIFIED_PROFILE_REGISTRY as unknown as Array<Record<string, any>>;
  for (const dept of (LEGAL_DEPARTMENT_REGISTRY as unknown as Array<Record<string, any>>)) {
    for (const workType of dept.workTypes || []) {
      const match = registry.find(
        (p) => p.unitId === 'pravo' && (p.workTypes || []).includes(workType) &&
          (p.programs || []).some((program: string) => (dept.programs || []).includes(program)),
      );
      // Katedra bez ijednog profila za tu vrstu rada znaci da UI nudi katedru koju nista ne moze
      // primijeniti; padamo glasno umjesto da slucaj tiho izostane iz matrice.
      if (!match) throw new Error(`Katedra ${dept.id}: nema Pravnog profila za vrstu rada ${workType}`);
      out.push({ id: `composed:${match.id}+${dept.id}:${workType}`, profileId: match.id, workType, departmentId: dept.id });
    }
  }
  return out;
}

/** Mentorov override: korisnikove vrijednosti moraju biti mjerene i kad ih profil ne propisuje. */
export const MENTOR_OVERRIDE: MentorOverrideInput = { font: 'Arial', sizePt: 11, spacing: 2, marginCm: 3 };

/**
 * Override slucajevi: jedan bogat profil (override gazi postojeca pravila) i jedan siromasan
 * (vsite-zavrsni nema font ni margine pa mu normalizeCheckFlags gasi zastavice; override ih mora
 * vratiti, inace bi korisnikov izricit zahtjev bio tiho ignoriran).
 */
export function overrideCases(): ComposedCase[] {
  return [
    { id: 'composed:fpzg-politologija-zavrsni+override', profileId: 'fpzg-politologija-zavrsni', workType: 'final', override: MENTOR_OVERRIDE },
    { id: 'composed:vsite-zavrsni+override', profileId: 'vsite-zavrsni', workType: 'final', override: MENTOR_OVERRIDE },
  ];
}

/** Svi slucajevi slozene matrice, stabilno sortirano. */
export function composedConformanceCases(): ComposedCase[] {
  return [...demotionSampleCases(), ...departmentCases(), ...overrideCases()].sort((a, b) => a.id.localeCompare(b.id));
}
