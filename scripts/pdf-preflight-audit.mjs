/**
 * Headless port PDF preflighta iz src/ui/app.ts (analyzePdfFile) za validaciju stvarnih
 * radova iz repozitorija. ISTA byte-level heuristika koju app pokazuje korisniku:
 * %PDF zaglavlje, %%EOF, /Encrypt, PDF/A oznaka, broj /Type /Page, A4 iz /MediaBox,
 * ugradjeni fontovi, JavaScript/AcroForm, tekst operatori, /Title i /Author.
 *
 * Namjena: dokazati da su STVARNI javni radovi tehnicki ispravni (A4, viselistni,
 * nesifrirani) i tako legitimno potkrijepiti fieldValidation.publicPdfAudits. PLITKO:
 * validira format stranice i PDF integritet, NE prored/font sadrzaja (to je DOCX audit).
 *
 * Pokretanje: node scripts/pdf-preflight-audit.mjs <file.pdf> [<file2.pdf> ...]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

function countMatches(text, re) { return (text.match(re) || []).length; }
function pdfLiteral(text, key) {
  const m = text.match(new RegExp('\\/' + key + '\\s*\\(([^)]{0,300})\\)'));
  return m ? m[1].replace(/\\([()\\])/g, '$1') : null;
}

/** Vjeran port analyzePdfFile: prima Uint8Array, vraca isti oblik rezultata + klasifikaciju tipa. */
export function analyzePdfBytes(bytes, name) {
  const head = new TextDecoder('ascii').decode(bytes.slice(0, 16));
  const tail = new TextDecoder('latin1').decode(bytes.slice(Math.max(0, bytes.length - 4096)));
  const text = new TextDecoder('latin1').decode(bytes);
  const header = /^%PDF-(\d\.\d)/.exec(head), validHeader = !!header;
  const hasEof = /%%EOF/.test(tail);
  const encrypted = /\/Encrypt\b/.test(text);
  const pdfaPart = (text.match(/pdfaid:part[^>]*>\s*(\d+)/i) || [])[1] || null;
  const isPdfA = !!pdfaPart || /GTS_PDFA/i.test(text);
  const pageCount = countMatches(text, /\/Type\s*\/Page\b/g);
  const media = [...text.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
    .slice(0, 50).map(m => ({ w: Math.abs(+m[3] - +m[1]), h: Math.abs(+m[4] - +m[2]) }));
  const a4 = media.length
    ? media.filter(x => (Math.abs(x.w - 595) < 12 && Math.abs(x.h - 842) < 12) ||
                        (Math.abs(x.h - 595) < 12 && Math.abs(x.w - 842) < 12)).length / media.length
    : null;
  const fontObjects = countMatches(text, /\/Type\s*\/Font\b/g);
  const embedded = countMatches(text, /\/FontFile(?:2|3)?\b/g);
  const hasJs = /\/JavaScript\b|\/JS\s*[<(]/.test(text);
  const hasForms = /\/AcroForm\b/.test(text);
  const textOperators = countMatches(text, /\b(?:Tj|TJ)\b/g);
  const title = pdfLiteral(text, 'Title');
  const author = pdfLiteral(text, 'Author');

  // Klasifikacija razine iz teksta naslovnice / metapodataka (hrvatski ocjenski radovi).
  const low = text.toLowerCase();
  let level = null;
  if (/disertacij|doktorski rad|doctoral (thesis|dissertation)/.test(low)) level = 'doktorski';
  else if (/diplomski rad|master'?s thesis|graduate thesis/.test(low)) level = 'diplomski';
  else if (/zavr[sš]ni rad|preddiplomski|prijediplomski|bachelor'?s thesis|undergraduate thesis/.test(low)) level = 'zavrsni';

  return {
    name, size: bytes.length, version: header?.[1] || null,
    valid: validHeader && hasEof && !encrypted,
    header: validHeader, eof: hasEof, encrypted,
    pdfa: { detected: isPdfA, part: pdfaPart },
    pageCount: pageCount || null, mediaBoxes: media.length, a4Share: a4,
    fontObjects, embeddedFontFiles: embedded, hasJavascript: hasJs, hasForms,
    textOperators, title, author, level,
  };
}

const files = process.argv.slice(2);
if (!files.length) { console.error('daj barem jedan .pdf'); process.exit(1); }
const rows = files.map(f => analyzePdfBytes(new Uint8Array(readFileSync(f)), basename(f)));
for (const r of rows) {
  console.log(`\n# ${r.name}  (${r.size} B, PDF ${r.version})`);
  console.log(`  valid=${r.valid} header=${r.header} eof=${r.eof} encrypted=${r.encrypted} pdfa=${r.pdfa.detected}`);
  console.log(`  pages=${r.pageCount} mediaBoxes=${r.mediaBoxes} a4Share=${r.a4Share == null ? 'n/a' : Math.round(r.a4Share * 100) + '%'}`);
  console.log(`  fonts=${r.fontObjects} embedded=${r.embeddedFontFiles} textOps=${r.textOperators} js=${r.hasJavascript} forms=${r.hasForms}`);
  console.log(`  level=${r.level} title=${JSON.stringify(r.title)} author=${JSON.stringify(r.author)}`);
}
console.log('\n' + JSON.stringify(rows, null, 2));
