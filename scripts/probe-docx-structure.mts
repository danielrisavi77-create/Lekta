/**
 * CLI: izmjeri STRUKTURU .docx dokumenata u zadanom direktoriju, da se real corpus moze birati
 * po Word cudnosti, a ne po imenu datoteke.
 *
 *   npx vite-node scripts/probe-docx-structure.mts -- "C:/put/do/dokumenata"
 *
 * Zasto: real corpus je do 2026-08-16 imao 12 dokumenata koji su pokretali samo 4 od 31 fixera
 * (font, margins, paper-size, alignment), dakle mjerio je tipografsko-geometrijski sloj i nista
 * vise. Da bi se to promijenilo, dokumenti se moraju birati prema tome STO SADRZE (sadrzaj kao
 * polje, vise sekcija, fusnote, tablice, slike, revizije, formule, citatne kontrole), a to se ne
 * vidi iz naziva.
 *
 * Cita se istim ZipReaderom koji koristi analiza, pa sonda ne moze "vidjeti" nesto sto engine ne vidi.
 * Ne mijenja nijednu datoteku.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZipReader } from '../src/docx/parser';

/** Prvi argument koji nije zastavica ni njezina vrijednost; `--out <put>` se preskace. */
function parseArgs(argv: string[]): { dir: string; out: string | null } {
  const rest = argv.slice(2);
  let out: string | null = null;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--out') { out = rest[i + 1] ?? null; i += 1; continue; }
    if (rest[i] === '--') continue;
    positional.push(rest[i]);
  }
  return { dir: positional[0] ?? '', out };
}

const { dir, out: outPathArg } = parseArgs(process.argv);
if (!dir) {
  console.error('Uporaba: npx vite-node scripts/probe-docx-structure.mts -- "<direktorij>" [--out <put.json>]');
  process.exit(1);
}

export interface DocxSignals {
  file: string;
  kb: number;
  ok: boolean;
  error?: string;
  /** Broj ZIVIH body-level sekcija (sectPr izvan sectPrChange). */
  sections: number;
  /** Ima li TOC polje (automatski sadrzaj). */
  toc: boolean;
  footnotes: number;
  tables: number;
  images: number;
  /** Neprihvacene revizije (Track Changes). */
  revisions: number;
  /** OMML formule. */
  formulas: number;
  /** Content Control / citatne kontrole (Zotero, Mendeley). */
  sdt: number;
  /** Zaglavlja i podnozja. */
  headersFooters: number;
  /** PAGE polje (automatsko numeriranje). */
  pageField: boolean;
  /** Ima li pgNumType (rimsko/arapsko prebacivanje). */
  pageNumType: boolean;
  /** Prazni odlomci (higijena). */
  emptyParagraphs: number;
  paragraphs: number;
  /** Dominantan generator, iz app.xml. */
  producer: string;
}

function count(haystack: string, needle: RegExp): number {
  return (haystack.match(needle) || []).length;
}

async function probe(dir: string, file: string): Promise<DocxSignals> {
  const path = join(dir, file);
  const kb = Math.round(statSync(path).size / 1024);
  const base: DocxSignals = {
    file, kb, ok: false, sections: 0, toc: false, footnotes: 0, tables: 0, images: 0,
    revisions: 0, formulas: 0, sdt: 0, headersFooters: 0, pageField: false, pageNumType: false,
    emptyParagraphs: 0, paragraphs: 0, producer: '',
  };
  try {
    const buf = readFileSync(path);
    const zip = new ZipReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const doc = await zip.text('word/document.xml');
    if (!doc) return { ...base, error: 'nema word/document.xml' };

    const names = zip.names();
    const hf = names.filter((n) => /^word\/(header|footer)\d+\.xml$/i.test(n));
    let hfText = '';
    for (const n of hf) hfText += (await zip.text(n)) || '';

    const footnotesXml = (await zip.text('word/footnotes.xml')) || '';
    const appXml = (await zip.text('docProps/app.xml')) || '';
    const producer = /<Application>([^<]*)<\/Application>/.exec(appXml)?.[1] || '';

    // Sekcije: sectPr koji NIJE unutar sectPrChange (isti kriterij kao isLiveSectPr u analizi).
    const liveSectPr = count(doc.replace(/<w:sectPrChange[\s\S]*?<\/w:sectPrChange>/g, ''), /<w:sectPr[\s>]/g);
    const paragraphs = count(doc, /<w:p[\s/>]/g);
    // Prazan odlomak: <w:p> bez ijednog <w:t>.
    const emptyParagraphs = (doc.match(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g) || [])
      .filter((p) => !/<w:t[\s>]/.test(p)).length;

    return {
      ...base,
      ok: true,
      sections: liveSectPr,
      toc: /TOC\s+\\o|<w:instrText[^>]*>\s*TOC/i.test(doc) || /\bTOC\b/.test(doc),
      footnotes: Math.max(0, count(footnotesXml, /<w:footnote\b[^>]*w:id="[1-9]/g)),
      tables: count(doc, /<w:tbl>/g),
      images: count(doc, /<(w:drawing|w:pict)\b/g),
      revisions: count(doc, /<w:(ins|del)\b/g),
      formulas: count(doc, /<m:oMath\b/g),
      sdt: count(doc, /<w:sdt>/g),
      headersFooters: hf.length,
      pageField: /\bPAGE\b/.test(doc + hfText),
      pageNumType: /<w:pgNumType\b/.test(doc),
      emptyParagraphs,
      paragraphs,
      producer,
    };
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

const files = readdirSync(dir).filter((f) => /\.docx$/i.test(f) && !f.startsWith('~$'));
const rows: DocxSignals[] = [];
for (const f of files) rows.push(await probe(dir, f));

const okRows = rows.filter((r) => r.ok);
// Zapisuje se u datoteku, a NE na stdout: vite plugini pri pokretanju vite-noda pisu vlastite
// poruke na stdout, pa bi preusmjeravanje izlaza dalo neispravan JSON.
const outPath = outPathArg ?? join(dir, '_probe.json');
writeFileSync(outPath, JSON.stringify(okRows, null, 0) + '\n');
console.log(`\n=== sonda: ${rows.length} datoteka, ${okRows.length} citljivih, ${rows.length - okRows.length} neispravnih ===`);
console.log(`zapisano: ${outPath}`);
