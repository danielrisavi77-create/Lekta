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

export function buildCoverage(): CoverageReport {
  const inv = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
  const atomic = targetIds(ATOMIC_CASES);
  const valid = targetIds(VALID_CONTROL_CASES);
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

  // Gap-backlog: provjere bez atomskog slucaja (mogu pasti, a nisu regresijski pokrivene).
  const gaps: GapEntry[] = [];
  for (const r of scored) {
    if (r.hasAtomic) continue;
    const core = CORE.has(r.category);
    gaps.push({
      priority: core ? 'P1' : 'P2',
      checkId: r.checkId, title: r.title,
      reason: 'Bodovana provjera bez atomskog fail-slucaja (moze pasti, nije regresijski pokrivena).',
      desiredTest: `atomic.${r.checkId ?? 'TODO'}: baza prolazi, jedna mutacija ruši "${r.title}".`,
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
      checksWithValidControl: rows.filter((r) => r.hasValidControl).length,
      checksWithBoundary: rows.filter((r) => r.hasBoundary).length,
      atomicCases: ATOMIC_CASES.length,
      validControlCases: VALID_CONTROL_CASES.length,
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
