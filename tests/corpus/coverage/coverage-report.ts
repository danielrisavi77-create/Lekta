/**
 * COVERAGE izvjestaj (faza 6 Lekta Error Corpus): krizanje inventara provjera (faza 1) s
 * korpusnim slucajevima (atomic/valid/boundary). Pokazuje koja provjera ima atomski fail,
 * valid control i boundary test, racuna postotke i generira gap-backlog (P0-P3).
 *
 * Transparentnost (prompt 12/16): NE lazira "100%". Pokrivenost se racuna nad STVARNIM
 * inventarom; sve nepokriveno ide u gap-backlog s prioritetom, ne precuti se.
 *
 * Cist modul (bez fs-zapisa): CLI (tests/corpus/cli/coverage.ts) serijalizira artefakte.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CHECK_ID_BY_TITLE } from '../ids/check-id-registry';
import { ATOMIC_CASES } from '../catalog/atomic';
import { VALID_CONTROL_CASES } from '../catalog/valid-controls';
import { BOUNDARY_CASES } from '../catalog/boundary';
import { LEGAL_ATOMIC_CASES, LEGAL_VALID_CASES } from '../catalog/legal';
import { PROFILE_ATOMIC_CASES } from '../catalog/profile-enabled';

// Jedinstveni skupovi (fpzg baseline + legal + profilno-uvjetovani) za racun pokrivenosti i export.
const ALL_ATOMIC = [...ATOMIC_CASES, ...LEGAL_ATOMIC_CASES, ...PROFILE_ATOMIC_CASES];
const ALL_VALID = [...VALID_CONTROL_CASES, ...LEGAL_VALID_CASES];

const HERE = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = resolve(HERE, '../generated/current-check-inventory.json');

export interface CoverageRow {
  title: string;
  checkId: string | null;
  category: string;
  scored: boolean | 'dynamic';
  hasAtomic: boolean;
  hasValidControl: boolean;
  hasBoundary: boolean;
}
export interface GapEntry {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  checkId: string | null;
  title: string;
  reason: string;
  desiredTest: string;
}
export interface CoverageReport {
  summary: {
    totalChecks: number;
    scoredChecks: number;
    scoredWithAtomic: number;
    scoredAtomicPct: number;
    scoredWithFailCase: number;
    scoredFailCasePct: number;
    checksWithValidControl: number;
    checksWithBoundary: number;
    atomicCases: number;
    validControlCases: number;
    boundaryCases: number;
    intakeCodes: number;
  };
  rows: CoverageRow[];
  gaps: GapEntry[];
}

/** Skup ciljanih checkId-eva po vrsti korpusnog slucaja. */
function targetIds(cases: Array<{ expect: { checkId: string } }>): Set<string> {
  return new Set(cases.map((c) => c.expect.checkId));
}

/** Kategorije koje smatramo "jezgrom predaje" (nepokrivenost = visi prioritet). */
const CORE = new Set(['formatting', 'structure', 'citations', 'elements']);

/**
 * Poznati razlozi zasto neka provjera JOS nema fail-slucaj (enabler koji nedostaje). Cini
 * gap-backlog akcijskim: umjesto generickog "nema atomica", tocno kaze sto treba omoguciti.
 */
const KNOWN_HARD: Record<string, { reason: string; desiredTest: string }> = {
  'footnote.format': { reason: 'Builder ne kontrolira oblik fusnota (rPr/pPr na fusnotnim odlomcima).', desiredTest: 'Prosiri docx-builder footnotes na {text,font,sizePt,spacing}; cleanBuild prolazan pa mutacija fonta/velicine ruši.' },
  'footnote.marker': { reason: 'Builder ne emitira <w:footnoteReference> markere u tijelu.', desiredTest: 'Dodaj footnoteReference markere; mutiraj u ukošene / iza interpunkcije.' },
  'footnote.spacing': { reason: 'Builder ne podrzava before/after razmak na fusnotnim odlomcima.', desiredTest: 'Dodaj pPr spacing na fusnote; eksplicitni razmak != 0 ruši provjeru.' },
  'format.spacing.paragraph': { reason: 'Builder podrzava samo prored (line), ne before/after razmak odlomka.', desiredTest: 'Dodaj before/after u ParaSpec; eksplicitni razmak > 0.6 pt ruši provjeru.' },
  'structure.heading.hierarchy': { reason: 'Skok razine (H1->H3) treba Heading3; builder ima samo Heading1/2.', desiredTest: 'Dodaj Heading3/4 stil (ili outlineLvl); H1 pa H3 bez H2 = jump.' },
  'structure.heading.format': { reason: 'auditHeadingRules se ne okida za ovaj profil (nema rules.levels).', desiredTest: 'Koristi profil s heading pravilima ili dodaj rules.levels; mutiraj velicinu/bold naslova.' },
  'structure.heading.numbering': { reason: 'auditHeadingRules se ne okida za ovaj profil (nema rules.levels).', desiredTest: 'Profil s numberRequired; ukloni oznaku razine naslova.' },
  'structure.heading.align': { reason: 'auditHeadingRules se ne okida za ovaj profil (nema rules.levels).', desiredTest: 'Profil s heading pravilima; centriraj naslov umjesto lijevo.' },
  'toc.coverage': { reason: 'Treba stvarno TOC polje i spremljene stavke; builder emitira samo PAGE.', desiredTest: 'Dodaj fldSimple/instrText TOC s stavkama; izostavi jedan naslov iz TOC-a.' },
  'toc.format': { reason: 'Treba TOC1/TOC2 stilovi u sadrzaju; builder ih ne emitira.', desiredTest: 'Dodaj TOC stilove; mutiraj font/velicinu stavki sadrzaja.' },
  'toc.page-numbers': { reason: 'Treba TOC stavke s brojevima stranica; builder emitira samo PAGE.', desiredTest: 'Dodaj TOC stavke; ukloni brojeve stranica dijelu stavki.' },
  'structure.abstract': { reason: 'Bodovanje sazetka gated (maxPoints); profil ga ne boduje.', desiredTest: 'Koristi profil koji boduje sazetak; ukloni Sažetak.' },
  'structure.keywords': { reason: 'Bodovanje kljucnih rijeci gated; profil ih ne boduje kao scored.', desiredTest: 'Profil koji boduje kljucne rijeci; ukloni redak Ključne riječi.' },
  'reference.min-count': { reason: 'Provjera se okida samo za profil s minReferences.', desiredTest: 'Koristi profil s minReferences; smanji broj izvora ispod minimuma.' },
  'page.size.project': { reason: 'Provjera se okida samo za profil s paperSizes (A3/A0).', desiredTest: 'Koristi arhitektonski/projektni profil; postavi krivi format stranice.' },
  'page.numbers.scheme': { reason: 'Treba eksplicitni format numeriranja (pgNumType); builder ga ne emitira.', desiredTest: 'Dodaj pgNumType; postavi krivi format (rimski u tijelu).' },
  'citation.style-automation': { reason: 'Savjetodavna, uvijek-warn provjera (nema pass stanja).', desiredTest: 'Nije atomski testabilna kao fail; eventualno valid-control da ostaje info.' },
  'manual.checks': { reason: 'Savjetodavni podsjetnik, uvijek-warn (nema pass stanja).', desiredTest: 'Nije atomski testabilna kao fail.' },
  'citation.punctuation': { reason: 'Detektor oddCitationPunctuation je uzak; treba precizan neispravan uzorak.', desiredTest: 'Kalibriraj citatnicu s neispravnom interpunkcijom koja pouzdano okida detektor.' },
  'reference.uncited': { reason: 'Dijeljena baza vec warna (2 necitirana izvora).', desiredTest: 'Ugodi bazu da svi izvori budu citirani (pass), pa mutacija doda necitirani.' },
  'title.elements': { reason: 'Dijeljena baza vec warna (fali prepoznata vrsta rada).', desiredTest: 'Ugodi naslovnicu baze da prolazi, pa ukloni jedan element.' },
  'structure.heading.word-styles': { reason: 'Dijeljena baza vec warna (TOC stavke izgledaju kao rucni naslovi).', desiredTest: 'Ugodi bazu da word-styles prolazi, pa dodaj rucno oblikovan naslov.' },
  'scope.intro-conclusion-ratio': { reason: 'Dijeljena baza vec warna (omjer Uvoda/Zakljucka).', desiredTest: 'Ugodi opseg Uvoda/Zakljucka baze da prolazi, pa poremeti omjer.' },
};

export function buildCoverage(): CoverageReport {
  const inv = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
  const atomic = targetIds(ALL_ATOMIC);
  const valid = targetIds(ALL_VALID);
  const boundary = targetIds(BOUNDARY_CASES);

  const rows: CoverageRow[] = (inv.checks as Array<{ title: string; category: string; scored: boolean | 'dynamic' }>).map((c) => {
    const checkId = CHECK_ID_BY_TITLE[c.title] ?? null;
    return {
      title: c.title, checkId, category: c.category, scored: c.scored,
      hasAtomic: !!checkId && atomic.has(checkId),
      hasValidControl: !!checkId && valid.has(checkId),
      hasBoundary: !!checkId && boundary.has(checkId),
    };
  });

  const scored = rows.filter((r) => r.scored === true);
  const scoredWithAtomic = scored.filter((r) => r.hasAtomic).length;
  // Boundary below/above JE dokaz detekcije pada, pa provjera s boundaryjem NIJE nepokrivena.
  const scoredWithFailCase = scored.filter((r) => r.hasAtomic || r.hasBoundary).length;

  // Gap-backlog: bodovane provjere BEZ ijednog fail-slucaja (atomic ili boundary).
  const gaps: GapEntry[] = [];
  for (const r of scored) {
    if (r.hasAtomic || r.hasBoundary) continue;
    const core = CORE.has(r.category);
    const known = r.checkId ? KNOWN_HARD[r.checkId] : undefined;
    gaps.push({
      priority: core ? 'P1' : 'P2',
      checkId: r.checkId, title: r.title,
      reason: known?.reason ?? 'Bodovana provjera bez fail-slucaja (moze pasti, nije regresijski pokrivena).',
      desiredTest: known?.desiredTest ?? `atomic.${r.checkId ?? 'TODO'}: cista varijanta prolazi, jedna mutacija ruši "${r.title}".`,
    });
  }
  // Informativne provjere bez valid-controla (nizi prioritet).
  for (const r of rows.filter((x) => x.scored === false)) {
    if (r.hasValidControl) continue;
    gaps.push({
      priority: 'P3', checkId: r.checkId, title: r.title,
      reason: 'Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).',
      desiredTest: `valid.${r.checkId ?? 'TODO'}: valjana varijanta ostaje informativna/pass.`,
    });
  }
  // Poznati korektnosni dug (nije nepokrivenost nego bug u pragu): lokator uz izravne citate.
  gaps.push({
    priority: 'P2', checkId: 'citation.direct-quote-locator', title: 'Lokator uz izravne citate',
    reason: 'Poznati bug: missingLocator regex `,\\s*\\d` tretira godinu (", 2019") kao broj stranice, pa citat s uobicajenom citatnicom (Prezime, 2019) NE moze pasti. Atomski slucaj to zaobilazi izostavljanjem zareza.',
    desiredTest: 'Popraviti detekciju lokatora (iskljuciti godinu iz kandidata za stranicu) + atomic bez zaobilaznice.',
  });

  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  gaps.sort((a, b) => order[a.priority] - order[b.priority] || (a.checkId ?? '').localeCompare(b.checkId ?? ''));

  return {
    summary: {
      totalChecks: rows.length,
      scoredChecks: scored.length,
      scoredWithAtomic,
      scoredAtomicPct: scored.length ? Math.round((scoredWithAtomic / scored.length) * 100) : 0,
      scoredWithFailCase,
      scoredFailCasePct: scored.length ? Math.round((scoredWithFailCase / scored.length) * 100) : 0,
      checksWithValidControl: rows.filter((r) => r.hasValidControl).length,
      checksWithBoundary: rows.filter((r) => r.hasBoundary).length,
      atomicCases: ALL_ATOMIC.length,
      validControlCases: ALL_VALID.length,
      boundaryCases: BOUNDARY_CASES.length,
      intakeCodes: (inv.intakeCodes ?? []).filter((c: any) => c.code !== 'suspicious').length,
    },
    rows,
    gaps,
  };
}

export function renderCoverageMarkdown(rep: CoverageReport): string {
  const s = rep.summary;
  const L: string[] = [];
  L.push('# Lekta Error Corpus - coverage (auto-generirano)', '');
  L.push('> Krizanje inventara provjera (faza 1) s korpusnim slucajevima. Ne lazira 100%: sve nepokriveno je u gap-backlogu.', '');
  L.push('## Sazetak', '');
  L.push(`- Provjere ukupno: **${s.totalChecks}** (bodovane ${s.scoredChecks})`);
  L.push(`- Bodovane s fail-slucajem (atomic ili boundary): **${s.scoredWithFailCase}/${s.scoredChecks} (${s.scoredFailCasePct}%)**`);
  L.push(`- Bodovane s atomskim fail-slucajem: **${s.scoredWithAtomic}/${s.scoredChecks} (${s.scoredAtomicPct}%)**`);
  L.push(`- Provjere s valid-controlom: **${s.checksWithValidControl}**`);
  L.push(`- Provjere s boundary testom: **${s.checksWithBoundary}**`);
  L.push(`- Korpusni slucajevi: atomic **${s.atomicCases}**, valid **${s.validControlCases}**, boundary **${s.boundaryCases}**`);
  L.push(`- Intake kodovi (svi runtime-dokazani u fazi 1): **${s.intakeCodes}**`);
  L.push('');
  L.push('## Pokrivenost po provjeri', '');
  L.push('| checkId | Naslov | Kat. | Bod. | Atomic | Valid | Boundary |');
  L.push('|---|---|---|---|:---:|:---:|:---:|');
  for (const r of rep.rows) {
    const b = (x: boolean) => (x ? '✓' : '·');
    const sc = r.scored === true ? 'da' : r.scored === false ? 'info' : 'din';
    L.push(`| ${r.checkId ?? '—'} | ${r.title.replace(/\|/g, '\\|')} | ${r.category} | ${sc} | ${b(r.hasAtomic)} | ${b(r.hasValidControl)} | ${b(r.hasBoundary)} |`);
  }
  L.push('');
  return L.join('\n');
}

export function renderGapBacklog(rep: CoverageReport): string {
  const L: string[] = [];
  L.push('# Lekta Error Corpus - gap-backlog (auto-generirano)', '');
  L.push('> Sto korpus JOS ne pokriva, po prioritetu. P0 = parser crash/sigurnost; P1 = jezgra predaje bez regresije; P2 = ostalo/korektnost; P3 = informativno.', '');
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 } as Record<string, number>;
  for (const g of rep.gaps) counts[g.priority]++;
  L.push(`Ukupno: P0 ${counts.P0}, P1 ${counts.P1}, P2 ${counts.P2}, P3 ${counts.P3}.`, '');
  for (const p of ['P0', 'P1', 'P2', 'P3'] as const) {
    const items = rep.gaps.filter((g) => g.priority === p);
    if (!items.length) continue;
    L.push(`## ${p} (${items.length})`, '');
    for (const g of items) {
      L.push(`- **${g.checkId ?? g.title}** — ${g.title}`);
      L.push(`  - ${g.reason}`);
      L.push(`  - Potreban test: ${g.desiredTest}`);
    }
    L.push('');
  }
  return L.join('\n');
}
