import type { SourceEntry } from '../profiles/profile-schema';
import {
  validateCitationSpec,
  formatFromSpec,
  type CitationSpec,
} from '../citations/citation-spec';
import type { CitationInput } from '../tools/citation';

/**
 * Verifikacijski dosjei citatnih specova (data/verification/citation-dossiers/**), P0-1 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md.
 *
 * Za svaki spec ispisuje, po vrsti izvora, RENDER (stvarni motor `formatFromSpec`) nasuprot
 * IZVOR (worked-example prepisan iz PDF-a) s verdiktom MATCH/DIFF. Verifikacija je time
 * mjerljiva tvrdnja: "renderer reproducira primjer iz sluzbenih uputa", a ne dojam.
 *
 * Zasto je logika ovdje, a ne u skripti: commitani dosjei su bili USTAJALI (70 od 71 datoteke
 * razlikovalo se od svjeze regeneracije - naslovi stilova bili su bez dijakritike jer su
 * generirani prije nego su specovi dobili tocne oznake). Skripta je motor ucitavala kroz
 * esbuild-IIFE trik jer .mjs ne moze uvesti TypeScript, pa se izlaz nije mogao staviti pod
 * drift gard. Sada je motor obican import, a tests/citation-dossier.test.ts pada na drift.
 *
 * Modul je NAMJERNO bez `node:fs`: sve ulaze (specove, registar izvora, ekstrakcije) daje
 * pozivatelj. Tako ostaje ista cista funkcija i za CLI i za test, i ne uvlaci Node API u src/.
 */

export interface DossierTarget {
  /** Ime datoteke bez ekstenzije, npr. `ffzg-apa7`. Multi-stil fakulteti imaju `<fac>-<token>`. */
  fac: string;
  spec: CitationSpec;
}

export interface DossierInputs {
  targets: DossierTarget[];
  sources: SourceEntry[];
  /** facultyId -> tekst ekstrakcije izvora; nedostatak znaci "nema ekstrakcije", ne "nije nadjeno". */
  extractions: Record<string, string>;
}

export interface DossierRow {
  fac: string;
  status: string;
  outcome: string;
  matches: number;
  diffs: number;
  declaredDiffs: number;
  noExample: number;
  schemaErrs: number;
  grepFails: number;
}

export interface DossierReport {
  rows: DossierRow[];
  /** Fakulteti s nedeklariranim DIFF-om, shema-greskom ili promasenim grepom (blokiraju approve). */
  blockers: string[];
  /** Relativna putanja u repozitoriju -> tocan sadrzaj datoteke koju CLI zapisuje. */
  files: Record<string, string>;
}

const OUT_DIR = 'data/verification/citation-dossiers';

/**
 * Dijakriticka normalizacija za USPOREDBU (ne za ispis): pdftotext gubi dj/c/dz, pa bi doslovna
 * jednakost lazno prijavila DIFF na svakom hrvatskom primjeru.
 */
function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function grepCheck(extractions: Record<string, string>, fac: string, quoteRaw: unknown): string {
  const hay = extractions[fac];
  if (hay == null) return 'NEMA EKSTRAKCIJE';
  return norm(hay).includes(norm(quoteRaw)) ? 'OK' : 'NIJE NADJEN u ekstrakciji!';
}

function pdfLink(meta: SourceEntry | undefined, sourcePage: unknown): string {
  if (!meta || !meta.snapshotPath) return '(izvor nije snapshotiran!)';
  const page = String(sourcePage ?? '').match(/\d+/)?.[0];
  return `${meta.snapshotPath.replace(/\\/g, '/')}${page ? `#page=${page}` : ''}`;
}

/** Renderira jedan dosje i vraca njegov sadrzaj plus brojace za INDEX. */
function renderOne(
  { fac, spec }: DossierTarget,
  sourceById: Map<string, SourceEntry>,
  extractions: Record<string, string>,
): { content: string; row: DossierRow } {
  const errs = validateCitationSpec(spec);
  const meta = spec.sourceId == null ? undefined : sourceById.get(spec.sourceId);
  // Multi-stil fakulteti imaju datoteke <facultyId>-<token>.json; grep ide po facultyId ekstrakciji.
  const grepFac = spec.facultyId || fac;
  const lines: string[] = [];
  let matches = 0;
  let diffs = 0;
  let declaredDiffs = 0;
  let noExample = 0;
  let grepFails = 0;

  lines.push(`# Citatni spec: ${fac} (outcome: ${spec.outcome}, status: ${spec.status})`);
  lines.push('');
  lines.push(`Stil: **${spec.label}** (token \`${spec.styleToken}\`)`);
  lines.push(`Izvor: ${spec.sourceLabel} (\`${spec.sourceId}\`)`);
  lines.push(
    `Snapshot: \`${meta?.snapshotPath ?? 'NEDOSTAJE U REGISTRYJU'}\` (hash \`${(meta?.snapshotHash ?? '').slice(0, 12)}...\`)`,
  );
  lines.push('');
  if (errs.length) {
    lines.push(`## SHEMA-GRESKE (${errs.length}) - rijesi prije verifikacije`);
    for (const e of errs) lines.push(`- ${e}`);
    lines.push('');
  }

  if (spec.outcome === 'style-pin') {
    const ev = (spec.evidence ?? {}) as Record<string, string | undefined>;
    lines.push(`## STYLE-PIN dokaz  [${ev.sourcePage ?? 'str. ?'}] (${ev.kind ?? '?'})`);
    lines.push(`Otvori PDF: \`${pdfLink(meta, ev.sourcePage)}\``);
    lines.push('```');
    lines.push(`PIN     : izvor propisuje stil "${spec.styleToken}" -> format ostaje obiteljski motor`);
    lines.push(
      `QUOTE   : ${ev.quoteRaw ?? '(prazno)'}   [grep: ${ev.quoteRaw ? grepCheck(extractions, grepFac, ev.quoteRaw) : 'n/a'}]`,
    );
    if (ev.note) lines.push(`NAPOMENA: ${ev.note}`);
    lines.push('```');
    lines.push('');
  }

  for (const st of spec.sourceTypes ?? []) {
    const p = st.provenance ?? ({} as (typeof st)['provenance']);
    lines.push(`## ${st.type}  [${p.sourcePage ?? 'str. ?'}] (${p.kind ?? '?'})`);
    lines.push(`Otvori PDF: \`${pdfLink(meta, p.sourcePage)}\``);
    lines.push('```');
    lines.push(`TEMPLATE: ${st.template}`);
    const gres = p.quoteRaw ? grepCheck(extractions, grepFac, p.quoteRaw) : 'n/a';
    if (gres.startsWith('NIJE')) grepFails++;
    lines.push(`QUOTE   : ${p.quoteRaw ?? '(prazno)'}   [grep: ${gres}]`);
    if (st.example && st.example.input) {
      // Shema tipizira `example.input` labavo (Record<string, string>), a `formatFromSpec` trazi
      // `CitationInput` s obaveznim `type`. Provjereno nad podacima: svih 145 worked-examplea u
      // verified specovima nosi `type`, pa je ovo suzenje tipa na stvarno stanje, ne pretpostavka.
      const res = formatFromSpec(spec, st.example.input as unknown as CitationInput);
      const same = norm(res.citation) === norm(st.example.expected);
      const declared = String(st.example.knownDiff ?? '').trim();
      const verdict = same ? 'MATCH' : declared ? 'DIFF (deklariran)' : 'DIFF';
      if (same) matches++;
      else if (declared) declaredDiffs++;
      else diffs++;
      lines.push(`IZVOR   : ${st.example.expected}`);
      lines.push(`RENDER  : ${res.citation}`);
      lines.push(
        `VERDIKT : ${verdict}${same ? ' (uz dijakriticku normalizaciju)' : '  <-- USPOREDI ZNAK PO ZNAK'}`,
      );
      if (!same && declared) lines.push(`DEKLARIRANO: ${declared}`);
    } else {
      noExample++;
      lines.push('IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)');
    }
    if (p.note) lines.push(`NAPOMENA: ${p.note}`);
    lines.push('```');
    lines.push('');
  }

  if (spec.inText && spec.inText.mode !== 'note-number' && spec.inText.template) {
    const demo = formatFromSpec(spec, { type: 'knjiga', authors: 'Lovric, Ivo', year: '1988' });
    const demoP = formatFromSpec(spec, {
      type: 'knjiga',
      authors: 'Lovric, Ivo',
      year: '1988',
      pages: '45',
    });
    lines.push('## Citatnica (u tekstu)');
    lines.push('```');
    lines.push(
      `TEMPLATE : ${spec.inText.template}   /  s pages: ${spec.inText.withPagesTemplate ?? '(nema)'}`,
    );
    lines.push(`RENDER   : ${demo.inText}   /  ${demoP.inText}`);
    if (spec.inText.provenance) {
      lines.push(
        `QUOTE    : ${spec.inText.provenance.quoteRaw}   [grep: ${grepCheck(extractions, grepFac, spec.inText.provenance.quoteRaw)}]`,
      );
      if (spec.inText.provenance.note) lines.push(`NAPOMENA : ${spec.inText.provenance.note}`);
    }
    lines.push('```');
    lines.push('');
  }

  if (spec.contradictions?.length) {
    lines.push('## Kontradikcije / otvorena pitanja');
    for (const c of spec.contradictions) lines.push(`- ${c}`);
    lines.push('');
  }

  if (spec.status === 'verified') {
    lines.push('## Verifikacija');
    lines.push(
      `VERIFICIRANO: ${spec.verifiedBy ?? '?'} (${spec.verifiedAt ?? '?'}); verifiedHash \`${(spec.verifiedHash ?? '').slice(0, 12)}...\` sidri na snapshot izvora.`,
    );
    lines.push(
      `Reverifikacija nakon drifta (izvor promijenjen): \`node scripts/approve-citation-spec.mjs ${fac} "Daniel Risavi"\`.`,
    );
    lines.push('');
  } else {
    lines.push('## Odluka');
    lines.push('- [ ] approve sve');
    lines.push('- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)');
    lines.push('- [ ] odbaci / prekvalificiraj outcome');
    lines.push('');
    lines.push(
      `Naredba: \`node scripts/approve-citation-spec.mjs ${fac} "Daniel Risavi" [--flag clanak,mrezni] [--dry]\``,
    );
    lines.push('');
  }

  return {
    content: lines.join('\n'),
    row: {
      fac,
      status: spec.status,
      outcome: spec.outcome,
      matches,
      diffs,
      declaredDiffs,
      noExample,
      schemaErrs: errs.length,
      grepFails,
    },
  };
}

function renderIndex(rows: DossierRow[], blockers: DossierRow[]): string {
  return (
    [
      '# Citatni specovi: verifikacijski dosjei',
      '',
      'Legenda: **DIFF!** = nedeklariran mismatch (blokira approve, popravi ili dodaj knownDiff); ',
      'DIFF(dekl) = deklariran razlog (ocekivan, npr. tipfeler/artefakt izvora); grep! = quoteRaw nije nadjen u ekstrakciji (blokira).',
      '',
      '| fakultet | status | outcome | MATCH | DIFF! | DIFF(dekl) | bez ex. | shema! | grep! |',
      '|---|---|---|---|---|---|---|---|---|',
      ...rows.map(
        (r) =>
          `| [${r.fac}](${r.fac}.md) | ${r.status} | ${r.outcome} | ${r.matches} | ${r.diffs || ''} | ${r.declaredDiffs || ''} | ${r.noExample} | ${r.schemaErrs || ''} | ${r.grepFails || ''} |`,
      ),
      '',
      blockers.length
        ? `PROBLEM (${blockers.length}): ${blockers.map((r) => r.fac).join(', ')} - nedeklariran DIFF/shema/grep, rijesi (kod verified znaci drift/regresiju).`
        : 'Nijedan spec nema nedeklariran DIFF, shema-gresku ni promasen grep.',
      '',
      `Verificirano: ${rows.filter((r) => r.status === 'verified').length} / u pregledu (draft): ${rows.filter((r) => r.status !== 'verified').length}.`,
      '',
    ].join('\n')
  );
}

/** Renderira sve dosjee i INDEX; `files` je tocno ono sto CLI zapisuje na disk. */
export function renderCitationDossiers(inputs: DossierInputs): DossierReport {
  const sourceById = new Map(inputs.sources.map((s) => [s.id, s]));
  const rows: DossierRow[] = [];
  const files: Record<string, string> = {};

  for (const target of inputs.targets) {
    const { content, row } = renderOne(target, sourceById, inputs.extractions);
    files[`${OUT_DIR}/${target.fac}.md`] = content;
    rows.push(row);
  }

  const blockers = rows.filter((r) => r.diffs || r.schemaErrs || r.grepFails);
  files[`${OUT_DIR}/INDEX.md`] = renderIndex(rows, blockers);

  return { rows, blockers: blockers.map((r) => r.fac), files };
}
