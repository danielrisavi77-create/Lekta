#!/usr/bin/env node
// scripts/extract-citation-sections.mjs
//
// Faza 0 citatnog pipelinea: iz snapshotiranih izvora (data/sources/**) izvuce citatne
// isjecke (keyword-windowing) po fakultetu + klasifikaciju u INDEX.json.
// Read-only nad izvorima; pise u data/tools/citation-specs/extractions/.
//
// Upotreba: node scripts/extract-citation-sections.mjs [facultyId ...]
//   (bez argumenata: svi fakulteti iz source-registry)
//
// Tekst: PDF preko `pdftotext -layout` (split na \f za stranice); ako je tekst rijedak,
// trazi postojeci *-ocr.txt (===== PAGE n/m ===== markeri iz ocr_pdf.py); DOCX unzip
// word/document.xml + strip tagova; HTML strip tagova. Skenirani PDF bez OCR-a ide u
// needsOcr red cekanja (nista se ne instalira ni ne OCR-a automatski).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'data/sources/source-registry.json');
const OUT_DIR = path.join(ROOT, 'data/tools/citation-specs/extractions');

const KEYWORD_RE = /citir|citat|navo[djđ]enj|bibliograf|referenc|literatur|fusnot|bilje[sš]k|APA|Harvard|IEEE|Vancouver|Chicago|MLA/i;
const WINDOW = 12;          // linija konteksta oko pogotka
const MAX_CHARS = 20000;    // cap po fakultetu (citation-style izvor ide cijeli)
const SPARSE_PER_PAGE = 200; // manje znakova/stranici -> vjerojatno sken

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
}

// --- citaci teksta po formatu ------------------------------------------------

function pdfText(absPath) {
  try {
    const out = execFileSync('pdftotext', ['-layout', absPath, '-'], { maxBuffer: 64 * 1024 * 1024 });
    return out.toString('utf-8');
  } catch {
    return null;
  }
}

// Minimalni unzip za docx (STORE i DEFLATE lokalne zapise; dovoljno za word/document.xml).
function docxDocumentXml(absPath) {
  const buf = fs.readFileSync(absPath);
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.toString('utf-8', off + 30, off + 30 + nameLen);
    const dataStart = off + 30 + nameLen + extraLen;
    if (name === 'word/document.xml') {
      const raw = buf.subarray(dataStart, dataStart + compSize);
      return method === 8 ? zlib.inflateRawSync(raw).toString('utf-8') : raw.toString('utf-8');
    }
    off = dataStart + compSize;
  }
  return null;
}

function stripXmlToLines(xml) {
  return xml
    .replace(/<w:p\b[^>]*>/g, '\n')
    .replace(/<br[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Vrati niz stranica [{page, text}] ili null ako se tekst ne moze izvuci. */
function extractPages(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.pdf') {
    const txt = pdfText(absPath);
    if (txt == null) return null;
    const pages = txt.split('\f').map((t, i) => ({ page: i + 1, text: t }));
    const avg = txt.replace(/\s/g, '').length / Math.max(1, pages.length);
    if (avg < SPARSE_PER_PAGE) {
      // vjerojatno skenirano: probaj postojeci -ocr.txt pored PDF-a
      const ocrPath = absPath.replace(/\.pdf$/i, '-ocr.txt');
      if (fs.existsSync(ocrPath)) return parseOcrTxt(fs.readFileSync(ocrPath, 'utf-8'));
      return 'sparse';
    }
    return pages;
  }
  if (ext === '.txt') {
    const raw = fs.readFileSync(absPath, 'utf-8');
    return /=====\s*PAGE\s+\d+/.test(raw) ? parseOcrTxt(raw) : [{ page: 1, text: raw }];
  }
  if (ext === '.docx') {
    const xml = docxDocumentXml(absPath);
    return xml ? [{ page: 1, text: stripXmlToLines(xml) }] : null;
  }
  if (ext === '.html' || ext === '.htm') {
    const raw = fs.readFileSync(absPath, 'utf-8');
    return [{ page: 1, text: stripXmlToLines(raw) }];
  }
  if (ext === '.doc') return 'legacy-doc'; // binarni Word: preskoci uz zapis
  return null;
}

function parseOcrTxt(raw) {
  const parts = raw.split(/=====\s*PAGE\s+(\d+)\s*\/\s*\d+\s*=====/);
  const pages = [];
  for (let i = 1; i < parts.length; i += 2) {
    pages.push({ page: Number(parts[i]), text: parts[i + 1] ?? '' });
  }
  return pages.length ? pages : [{ page: 1, text: raw }];
}

// --- keyword windowing -------------------------------------------------------

function windowedSnippets(pages, takeAll) {
  const out = [];
  for (const { page, text } of pages) {
    const lines = text.split('\n');
    if (takeAll) {
      out.push({ page, text: lines.join('\n') });
      continue;
    }
    const hits = [];
    lines.forEach((l, i) => { if (KEYWORD_RE.test(l)) hits.push(i); });
    if (!hits.length) continue;
    // spoji preklapajuce prozore
    const ranges = [];
    for (const h of hits) {
      const s = Math.max(0, h - WINDOW), e = Math.min(lines.length - 1, h + WINDOW);
      const last = ranges[ranges.length - 1];
      if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
      else ranges.push([s, e]);
    }
    for (const [s, e] of ranges) out.push({ page, text: lines.slice(s, e + 1).join('\n') });
  }
  return out;
}

// --- klasifikacija -----------------------------------------------------------

function classify(snippetText) {
  const authorYear = (snippetText.match(/\(\d{4}\)/g) || []).length
    + (snippetText.match(/\(\s*[A-ZŠĐČĆŽ][a-zšđčćž]+[^)]{0,30}\d{4}[^)]{0,10}\)/g) || []).length;
  const numeric = (snippetText.match(/^\s*\[\d+\]/gm) || []).length;
  const footnote = (snippetText.match(/^\s*\d+\s+[A-ZŠĐČĆŽ][a-zšđčćž]+,/gm) || []).length;
  const styleNames = (snippetText.match(/APA|Harvard|IEEE|Vancouver|Chicago|MLA/gi) || []).length;
  const workedExamples = authorYear + numeric + footnote;
  let classHint = 'c';
  if (workedExamples >= 5) classHint = 'a';
  else if (styleNames >= 2 || workedExamples >= 1) classHint = 'b';
  return { workedExamples, authorYear, numeric, footnote, styleNames, classHint };
}

// --- glavni tok ----------------------------------------------------------------

function priorTokens(facultyId) {
  try {
    const profiles = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/profiles/verified-profiles.json'), 'utf-8'));
    const toks = new Set();
    for (const p of profiles) {
      if (p.unitId === facultyId && p.rules && p.rules.recommendedCitation) toks.add(p.rules.recommendedCitation);
    }
    return [...toks];
  } catch {
    return [];
  }
}

function main() {
  const only = process.argv.slice(2);
  const registry = loadRegistry();

  // grupiraj izvore po fakultetu (poddirektorij u snapshotPath: data/sources/<fac>/...)
  const byFac = {};
  for (const src of registry) {
    if (!src.snapshotPath) continue;
    const m = String(src.snapshotPath).replace(/\\/g, '/').match(/^data\/sources\/([^/]+)\//);
    if (!m) continue;
    (byFac[m[1]] ??= []).push(src);
  }

  const targets = only.length ? only : Object.keys(byFac).sort();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = [];
  for (const fac of targets) {
    const sources = byFac[fac] || [];
    if (!sources.length) {
      console.warn(`[extract] ${fac}: nema izvora u registryju, preskacem`);
      continue;
    }
    const snippets = [];
    const srcMeta = [];
    const needsOcr = [];
    for (const src of sources) {
      const abs = path.join(ROOT, src.snapshotPath);
      if (!fs.existsSync(abs)) { needsOcr.push(`${src.id} (snapshot ne postoji!)`); continue; }
      const pages = extractPages(abs);
      if (pages === 'sparse') { needsOcr.push(`${src.id} (skeniran PDF bez -ocr.txt)`); continue; }
      if (pages === 'legacy-doc') { needsOcr.push(`${src.id} (.doc binarni format)`); continue; }
      if (!pages) { needsOcr.push(`${src.id} (tekst se ne moze izvuci)`); continue; }
      const takeAll = src.kind === 'citation-style';
      const snips = windowedSnippets(pages, takeAll);
      for (const s of snips) snippets.push({ sourceId: src.id, page: s.page, text: s.text });
      srcMeta.push({ sourceId: src.id, kind: src.kind, pages: pages.length, snippets: snips.length });
    }

    // slozeni tekst, cap MAX_CHARS (citation-style blokovi imaju prioritet jer su prvi u nizu)
    snippets.sort((a, b) => {
      const ak = sources.find((s) => s.id === a.sourceId)?.kind === 'citation-style' ? 0 : 1;
      const bk = sources.find((s) => s.id === b.sourceId)?.kind === 'citation-style' ? 0 : 1;
      return ak - bk;
    });
    let text = '';
    for (const s of snippets) {
      const block = `\n\n===== [${s.sourceId} | str. ${s.page}] =====\n${s.text.trim()}`;
      if (text.length + block.length > MAX_CHARS && text.length > 0) break;
      text += block;
    }
    text = text.trim();

    const cls = classify(text);
    const prior = priorTokens(fac);
    const contradictions = [];
    if (prior.some((t) => ['ieee', 'vancouver'].includes(t)) && cls.authorYear > 5 && cls.numeric === 0) {
      contradictions.push('prior je numericki stil, a izvor pokazuje autor-godina primjere');
    }
    if (prior.some((t) => ['harvard', 'apa7', 'fpzg', 'chicago-author', 'pravo-social-author'].includes(t)) && cls.numeric > 5 && cls.authorYear === 0) {
      contradictions.push('prior je autor-godina, a izvor pokazuje numericke primjere');
    }

    if (text) fs.writeFileSync(path.join(OUT_DIR, `${fac}.txt`), text, 'utf-8');
    index.push({
      facultyId: fac,
      sources: srcMeta,
      needsOcr,
      chars: text.length,
      ...cls,
      priorTokens: prior,
      contradictions,
    });
    console.log(
      `[extract] ${fac}: ${srcMeta.length} izvora, ${text.length} znakova, hint=${cls.classHint} ` +
        `(ay=${cls.authorYear} num=${cls.numeric} fn=${cls.footnote} style=${cls.styleNames})` +
        (needsOcr.length ? ` needsOcr=${needsOcr.length}` : ''),
    );
  }

  // INDEX.json: merge s postojecim (za djelomicne runove), po facultyId
  const indexPath = path.join(OUT_DIR, 'INDEX.json');
  let existing = [];
  if (fs.existsSync(indexPath)) {
    try { existing = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); } catch { existing = []; }
  }
  const merged = [...existing.filter((e) => !index.some((n) => n.facultyId === e.facultyId)), ...index]
    .sort((a, b) => a.facultyId.localeCompare(b.facultyId));
  fs.writeFileSync(indexPath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`[extract] INDEX.json: ${merged.length} fakulteta ukupno (${index.length} u ovom runu).`);
}

main();
