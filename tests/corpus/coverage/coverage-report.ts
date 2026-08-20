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
import { FOOTNOTE_ATOMIC_CASES } from '../catalog/footnote-format';
import { TOC_ATOMIC_CASES } from '../catalog/toc-hierarchy';
import { SCHEME_PUNCT_ATOMIC_CASES } from '../catalog/scheme-punctuation';
import { INFORMATIVE_VALID_CASES } from '../catalog/informative-controls';

// Jedinstveni skupovi (fpzg baseline + legal + profilno + footnote-format + TOC + shema/interpunkcija) za pokrivenost i export.
const ALL_ATOMIC = [...ATOMIC_CASES, ...LEGAL_ATOMIC_CASES, ...PROFILE_ATOMIC_CASES, ...FOOTNOTE_ATOMIC_CASES, ...TOC_ATOMIC_CASES, ...SCHEME_PUNCT_ATOMIC_CASES];
const ALL_VALID = [...VALID_CONTROL_CASES, ...LEGAL_VALID_CASES, ...INFORMATIVE_VALID_CASES];

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
 *
 * Zapis smije postojati SAMO dok rupa stvarno postoji. Kad se rupa zatvori, zapis se brise, jer
 * bi inace ostao tvrditi da se nesto ne moze testirati dok je vec testirano. Mjereno 2026-08-20:
 * 19 od 23 zapisa bilo je takvo (npr. tri fusnotna i tri TOC zapisa, koje su katalozi
 * footnote-format.ts i toc-hierarchy.ts odavno pokrili). Kod ih nikad ne cita, jer pokrivena
 * provjera ne postane rupa, pa postoci nisu bili krivi; steta je bila u tome sto se preostale
 * PRAVE rupe utope medju laznima i nitko ih ne zatvori.
 *
 * Zapis moze umrijeti na DVA nacina, pa tripwire provjerava jaci uvjet nego "nema fail-slucaj":
 * uz pokrivenost, zapis prestane biti citan i kad provjera postane informativna, jer razlog tada
 * dolazi iz KNOWN_ADVISORY grane. Tako su 2026-08-20 umrla jos dva zapisa (page.numbers.scheme,
 * scope.intro-conclusion-ratio). Zato tripwire trazi da razlog SVAKOG zapisa stvarno zavrsi u
 * gap-backlogu, a ne samo da provjera nije pokrivena. Oba registra su zato izvezena.
 */
export const KNOWN_HARD: Record<string, { reason: string; desiredTest: string }> = {
  'citation.style-automation': { reason: 'Savjetodavna, uvijek-warn provjera (nema pass stanja).', desiredTest: 'Nije atomski testabilna kao fail; eventualno valid-control da ostaje info.' },
  'manual.checks': { reason: 'Savjetodavni podsjetnik, uvijek-warn (nema pass stanja).', desiredTest: 'Nije atomski testabilna kao fail.' },
};

/**
 * Informativne provjere koje STRUKTURNO ne dosizu bodovani 'pass' iz kontroliranog buildera, pa im
 * valid-control ne bi nista cuvao (bio bi vakuozno zelen = fake pokrivenost koju ovaj modul odbija).
 * Transparentno kazu ZASTO ostaju u P3, umjesto genericnog "nema valid-controla".
 */
export const KNOWN_ADVISORY: Record<string, { reason: string; desiredTest: string }> = {
  'scope.pages': { reason: 'Hardkodiran status pass (max 0) neovisno o ulazu; nema dosezljivog warn stanja pa valid-control ne cuva nista.', desiredTest: 'Nije atomski/valid pokrivljiv: savjetodavna, uvijek informativna (kao style-automation/manual.checks).' },
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
  // Informativne provjere bez valid-controla (nizi prioritet). KNOWN_ADVISORY objasnjava strukturno
  // nepokrivljive (hardkodiran max 0 ili nuzni footer dijelovi) da se ne lazira vakuoznim controlom.
  for (const r of rows.filter((x) => x.scored === false)) {
    if (r.hasValidControl) continue;
    const adv = r.checkId ? KNOWN_ADVISORY[r.checkId] : undefined;
    gaps.push({
      priority: 'P3', checkId: r.checkId, title: r.title,
      reason: adv?.reason ?? 'Informativna provjera bez valid-controla (nizak rizik, ali nepokrivena).',
      desiredTest: adv?.desiredTest ?? `valid.${r.checkId ?? 'TODO'}: valjana varijanta dosize bodovani pass (max>0), ne informativni max-0.`,
    });
  }
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
