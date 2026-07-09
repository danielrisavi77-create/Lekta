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
    const lines = [];
    let matches = 0, diffs = 0, noExample = 0;

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

    for (const st of spec.sourceTypes ?? []) {
      const p = st.provenance ?? {};
      lines.push(`## ${st.type}  [${p.sourcePage ?? 'str. ?'}] (${p.kind ?? '?'})`);
      lines.push(`Otvori PDF: \`${pdfLink(meta, p.sourcePage)}\``);
      lines.push('```');
      lines.push(`TEMPLATE: ${st.template}`);
      lines.push(`QUOTE   : ${p.quoteRaw ?? '(prazno)'}   [grep: ${p.quoteRaw ? grepCheck(fac, p.quoteRaw) : 'n/a'}]`);
      if (st.example && st.example.input) {
        const res = engine.formatFromSpec(spec, st.example.input);
        const verdict = norm(res.citation) === norm(st.example.expected) ? 'MATCH' : 'DIFF';
        if (verdict === 'MATCH') matches++; else diffs++;
        lines.push(`IZVOR   : ${st.example.expected}`);
        lines.push(`RENDER  : ${res.citation}`);
        lines.push(`VERDIKT : ${verdict}${verdict === 'MATCH' ? ' (uz dijakriticku normalizaciju)' : '  <-- USPOREDI ZNAK PO ZNAK'}`);
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
        lines.push(`QUOTE    : ${spec.inText.provenance.quoteRaw}   [grep: ${grepCheck(fac, spec.inText.provenance.quoteRaw)}]`);
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
    indexRows.push({ fac, outcome: spec.outcome, matches, diffs, noExample, schemaErrs: errs.length });
    console.log(`[dossier] ${fac}: ${matches} MATCH, ${diffs} DIFF, ${noExample} bez examplea, ${errs.length} shema-gresaka`);
  }

  const idx = [
    '# Citatni specovi: verifikacijski dosjei', '',
    '| fakultet | outcome | MATCH | DIFF | bez examplea | shema-greske |',
    '|---|---|---|---|---|---|',
    ...indexRows.map((r) => `| [${r.fac}](${r.fac}.md) | ${r.outcome} | ${r.matches} | ${r.diffs} | ${r.noExample} | ${r.schemaErrs} |`),
    '',
    `Verificirano do sada: ${fs.existsSync(VERIFIED_DIR) ? fs.readdirSync(VERIFIED_DIR).filter((f) => f.endsWith('.json')).length : 0} spec(ova) u verified/.`,
    '',
  ];
  fs.writeFileSync(path.join(OUT_DIR, 'INDEX.md'), idx.join('\n'), 'utf-8');
  console.log(`[dossier] INDEX.md: ${indexRows.length} dosjea.`);
}

main().catch((e) => { console.error('[dossier] GRESKA:', e); process.exit(1); });
