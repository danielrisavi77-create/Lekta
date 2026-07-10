#!/usr/bin/env node
// scripts/citation-spec-dossier.mjs
//
// Za svaki draft citatni spec generira ljudski dosje za verifikaciju:
//   data/verification/citation-dossiers/<fac>.md (+ INDEX.md)
// Kljucni sadrzaj: po vrsti izvora RENDER (stvarni motor formatFromSpec) vs IZVOR
// (worked-example expected iz PDF-a) s verdiktom MATCH/DIFF (dijakriticka normalizacija,
// jer pdftotext gubi dj/c/dz), quoteRaw grep-check protiv ekstrakcije, PDF#page=N link.
// Verifikacija = "renderer reproducira primjer iz uputa". Uzor: verification-worklist.mjs.
//
// Upotreba: node scripts/citation-spec-dossier.mjs [facultyId ...]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRAFTS_DIR = path.join(ROOT, 'data/tools/citation-specs/drafts');
const VERIFIED_DIR = path.join(ROOT, 'data/tools/citation-specs/verified');
const EXTRACT_DIR = path.join(ROOT, 'data/tools/citation-specs/extractions');
const OUT_DIR = path.join(ROOT, 'data/verification/citation-dossiers');
const REGISTRY_PATH = path.join(ROOT, 'data/sources/source-registry.json');
const ENGINE_ENTRY = path.join(ROOT, 'src/citations/citation-web.ts');

// Isti esbuild-IIFE trik kao generate-citation-tools: stvarni motor, ne kopija logike.
async function loadEngine() {
  const out = await esbuild.build({
    entryPoints: [ENGINE_ENTRY],
    bundle: true, format: 'iife', globalName: 'LektaCitation',
    platform: 'browser', target: 'es2019', write: false, legalComments: 'none',
  });
  // eslint-disable-next-line no-new-func
  return new Function(`${out.outputFiles[0].text}\n;return LektaCitation;`)();
}

// Dijakriticka normalizacija za usporedbu (pdftotext gubi dj/c/dz; NFD strip + specijalni znakovi).
function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^\x20-\x7E]/g, '') // sve ne-ASCII van (pdftotext ostatke ukljucivo)
    .replace(/\s+/g, ' ')
    .trim();
}

function grepCheck(fac, quoteRaw) {
  const extractPath = path.join(EXTRACT_DIR, `${fac}.txt`);
  if (!fs.existsSync(extractPath)) return 'NEMA EKSTRAKCIJE';
  const hay = norm(fs.readFileSync(extractPath, 'utf-8'));
  return hay.includes(norm(quoteRaw)) ? 'OK' : 'NIJE NADJEN u ekstrakciji!';
}

function sourceMeta(sourceId) {
  try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    return reg.find((s) => s.id === sourceId) ?? null;
  } catch { return null; }
}

function pdfLink(meta, sourcePage) {
  if (!meta || !meta.snapshotPath) return '(izvor nije snapshotiran!)';
  const page = String(sourcePage ?? '').match(/\d+/)?.[0];
  return `${meta.snapshotPath.replace(/\\/g, '/')}${page ? `#page=${page}` : ''}`;
}

async function main() {
  const only = process.argv.slice(2);
  const engine = await loadEngine();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const readDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []);
  // Pokriva i drafts/ (u pregledu) i verified/ (vec approvano) - dossier ostaje tocan i nakon approvea.
  const targets = [
    ...readDir(DRAFTS_DIR).map((f) => ({ fac: f.replace(/\.json$/, ''), dir: DRAFTS_DIR })),
    ...readDir(VERIFIED_DIR).map((f) => ({ fac: f.replace(/\.json$/, ''), dir: VERIFIED_DIR })),
  ].filter((t) => !only.length || only.includes(t.fac));

  const indexRows = [];
  for (const { fac, dir } of targets) {
    const spec = JSON.parse(fs.readFileSync(path.join(dir, `${fac}.json`), 'utf-8'));
    const errs = engine.validateCitationSpec(spec);
    const meta = sourceMeta(spec.sourceId);
    // Multi-stil fakulteti imaju datoteke <facultyId>-<token>.json; grep ide po facultyId ekstrakciji.
    const grepFac = spec.facultyId || fac;
    const lines = [];
    let matches = 0, diffs = 0, declaredDiffs = 0, noExample = 0, grepFails = 0;

    lines.push(`# Citatni spec: ${fac} (outcome: ${spec.outcome}, status: ${spec.status})`);
    lines.push('');
    lines.push(`Stil: **${spec.label}** (token \`${spec.styleToken}\`)`);
    lines.push(`Izvor: ${spec.sourceLabel} (\`${spec.sourceId}\`)`);
    lines.push(`Snapshot: \`${meta?.snapshotPath ?? 'NEDOSTAJE U REGISTRYJU'}\` (hash \`${(meta?.snapshotHash ?? '').slice(0, 12)}...\`)`);
    lines.push('');
    if (errs.length) {
      lines.push(`## SHEMA-GRESKE (${errs.length}) - rijesi prije verifikacije`);
      for (const e of errs) lines.push(`- ${e}`);
      lines.push('');
    }

    if (spec.outcome === 'style-pin') {
      const ev = spec.evidence ?? {};
      lines.push(`## STYLE-PIN dokaz  [${ev.sourcePage ?? 'str. ?'}] (${ev.kind ?? '?'})`);
      lines.push(`Otvori PDF: \`${pdfLink(meta, ev.sourcePage)}\``);
      lines.push('```');
      lines.push(`PIN     : izvor propisuje stil "${spec.styleToken}" -> format ostaje obiteljski motor`);
      lines.push(`QUOTE   : ${ev.quoteRaw ?? '(prazno)'}   [grep: ${ev.quoteRaw ? grepCheck(grepFac, ev.quoteRaw) : 'n/a'}]`);
      if (ev.note) lines.push(`NAPOMENA: ${ev.note}`);
      lines.push('```');
      lines.push('');
    }

    for (const st of spec.sourceTypes ?? []) {
      const p = st.provenance ?? {};
      lines.push(`## ${st.type}  [${p.sourcePage ?? 'str. ?'}] (${p.kind ?? '?'})`);
      lines.push(`Otvori PDF: \`${pdfLink(meta, p.sourcePage)}\``);
      lines.push('```');
      lines.push(`TEMPLATE: ${st.template}`);
      const gres = p.quoteRaw ? grepCheck(grepFac, p.quoteRaw) : 'n/a';
      if (gres.startsWith('NIJE')) grepFails++;
      lines.push(`QUOTE   : ${p.quoteRaw ?? "(prazno)"}   [grep: ${gres}]`);
      if (st.example && st.example.input) {
        const res = engine.formatFromSpec(spec, st.example.input);
        const same = norm(res.citation) === norm(st.example.expected);
        const declared = String(st.example.knownDiff ?? '').trim();
        const verdict = same ? 'MATCH' : (declared ? 'DIFF (deklariran)' : 'DIFF');
        if (same) matches++; else if (declared) declaredDiffs++; else diffs++;
        lines.push(`IZVOR   : ${st.example.expected}`);
        lines.push(`RENDER  : ${res.citation}`);
        lines.push(`VERDIKT : ${verdict}${same ? ' (uz dijakriticku normalizaciju)' : '  <-- USPOREDI ZNAK PO ZNAK'}`);
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
      const demo = engine.formatFromSpec(spec, { type: 'knjiga', authors: 'Lovric, Ivo', year: '1988' });
      const demoP = engine.formatFromSpec(spec, { type: 'knjiga', authors: 'Lovric, Ivo', year: '1988', pages: '45' });
      lines.push('## Citatnica (u tekstu)');
      lines.push('```');
      lines.push(`TEMPLATE : ${spec.inText.template}   /  s pages: ${spec.inText.withPagesTemplate ?? '(nema)'}`);
      lines.push(`RENDER   : ${demo.inText}   /  ${demoP.inText}`);
      if (spec.inText.provenance) {
        lines.push(`QUOTE    : ${spec.inText.provenance.quoteRaw}   [grep: ${grepCheck(grepFac, spec.inText.provenance.quoteRaw)}]`);
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
      lines.push(`VERIFICIRANO: ${spec.verifiedBy ?? '?'} (${spec.verifiedAt ?? '?'}); verifiedHash \`${(spec.verifiedHash ?? '').slice(0, 12)}...\` sidri na snapshot izvora.`);
      lines.push(`Reverifikacija nakon drifta (izvor promijenjen): \`node scripts/approve-citation-spec.mjs ${fac} "Daniel Risavi"\`.`);
      lines.push('');
    } else {
      lines.push('## Odluka');
      lines.push('- [ ] approve sve');
      lines.push('- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)');
      lines.push('- [ ] odbaci / prekvalificiraj outcome');
      lines.push('');
      lines.push(`Naredba: \`node scripts/approve-citation-spec.mjs ${fac} "Daniel Risavi" [--flag clanak,mrezni] [--dry]\``);
      lines.push('');
    }

    fs.writeFileSync(path.join(OUT_DIR, `${fac}.md`), lines.join('\n'), 'utf-8');
    indexRows.push({ fac, status: spec.status, outcome: spec.outcome, matches, diffs, declaredDiffs, noExample, schemaErrs: errs.length, grepFails });
    const warn = (diffs || errs.length || grepFails) ? '  <-- PROVJERI' : '';
    console.log(`[dossier] ${fac}: ${matches} MATCH, ${diffs} DIFF(nedeklariran), ${declaredDiffs} DIFF(dekl), ${noExample} bez examplea, ${errs.length} shema, ${grepFails} grep-fail${warn}`);
  }

  // Nedeklariran DIFF, shema-greska ili promasen grep = blokira approve; deklariran DIFF je ocekivan.
  const blockers = indexRows.filter((r) => r.diffs || r.schemaErrs || r.grepFails);
  const idx = [
    '# Citatni specovi: verifikacijski dosjei', '',
    'Legenda: **DIFF!** = nedeklariran mismatch (blokira approve, popravi ili dodaj knownDiff); ',
    'DIFF(dekl) = deklariran razlog (ocekivan, npr. tipfeler/artefakt izvora); grep! = quoteRaw nije nadjen u ekstrakciji (blokira).',
    '',
    '| fakultet | status | outcome | MATCH | DIFF! | DIFF(dekl) | bez ex. | shema! | grep! |',
    '|---|---|---|---|---|---|---|---|---|',
    ...indexRows.map((r) => `| [${r.fac}](${r.fac}.md) | ${r.status} | ${r.outcome} | ${r.matches} | ${r.diffs || ''} | ${r.declaredDiffs || ''} | ${r.noExample} | ${r.schemaErrs || ''} | ${r.grepFails || ''} |`),
    '',
    blockers.length
      ? `PROBLEM (${blockers.length}): ${blockers.map((r) => r.fac).join(', ')} - nedeklariran DIFF/shema/grep, rijesi (kod verified znaci drift/regresiju).`
      : 'Nijedan spec nema nedeklariran DIFF, shema-gresku ni promasen grep.',
    '',
    `Verificirano: ${indexRows.filter((r) => r.status === 'verified').length} / u pregledu (draft): ${indexRows.filter((r) => r.status !== 'verified').length}.`,
    '',
  ];
  fs.writeFileSync(path.join(OUT_DIR, 'INDEX.md'), idx.join('\n'), 'utf-8');

  // Cleanup: makni orphan dossiere (.md bez odgovarajuceg speca u drafts/ ILI verified/).
  if (!only.length) {
    const live = new Set(targets.map((t) => `${t.fac}.md`));
    live.add('INDEX.md');
    let removed = 0;
    for (const f of fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.md'))) {
      if (!live.has(f)) { fs.unlinkSync(path.join(OUT_DIR, f)); removed++; }
    }
    if (removed) console.log(`[dossier] cleanup: uklonjeno ${removed} orphan dossiera (spec vise ne postoji).`);
  }
  console.log(`[dossier] INDEX.md: ${indexRows.length} dosjea, ${blockers.length} problem.`);
}

main().catch((e) => { console.error('[dossier] GRESKA:', e); process.exit(1); });
