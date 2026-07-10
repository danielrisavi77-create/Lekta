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

  const draftFiles = fs.existsSync(DRAFTS_DIR)
    ? fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.json'))
    : [];
  const targets = draftFiles
    .map((f) => f.replace(/\.json$/, ''))
    .filter((fac) => !only.length || only.includes(fac));

  const indexRows = [];
  for (const fac of targets) {
    const spec = JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, `${fac}.json`), 'utf-8'));
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

    lines.push('## Odluka');
    lines.push('- [ ] approve sve');
    lines.push('- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)');
    lines.push('- [ ] odbaci / prekvalificiraj outcome');
    lines.push('');
    lines.push(`Naredba: \`node scripts/approve-citation-spec.mjs ${fac} "Daniel Risavi" [--flag clanak,mrezni] [--dry]\``);
    lines.push('');

    fs.writeFileSync(path.join(OUT_DIR, `${fac}.md`), lines.join('\n'), 'utf-8');
    indexRows.push({ fac, outcome: spec.outcome, matches, diffs, declaredDiffs, noExample, schemaErrs: errs.length, grepFails });
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
    '| fakultet | outcome | MATCH | DIFF! | DIFF(dekl) | bez ex. | shema! | grep! |',
    '|---|---|---|---|---|---|---|---|',
    ...indexRows.map((r) => `| [${r.fac}](${r.fac}.md) | ${r.outcome} | ${r.matches} | ${r.diffs || ''} | ${r.declaredDiffs || ''} | ${r.noExample} | ${r.schemaErrs || ''} | ${r.grepFails || ''} |`),
    '',
    blockers.length
      ? `BLOKIRA APPROVE (${blockers.length}): ${blockers.map((r) => r.fac).join(', ')} - rijesi prije verifikacije.`
      : 'Nijedan draft nema nedeklariran DIFF, shema-gresku ni promasen grep. Svi su spremni za ljudski pregled.',
    '',
    `Verificirano do sada: ${fs.existsSync(VERIFIED_DIR) ? fs.readdirSync(VERIFIED_DIR).filter((f) => f.endsWith('.json')).length : 0} spec(ova) u verified/.`,
    '',
  ];
  fs.writeFileSync(path.join(OUT_DIR, 'INDEX.md'), idx.join('\n'), 'utf-8');
  console.log(`[dossier] INDEX.md: ${indexRows.length} dosjea, ${blockers.length} blokira approve.`);
}

main().catch((e) => { console.error('[dossier] GRESKA:', e); process.exit(1); });
