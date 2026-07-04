/**
 * PDF preflight: heuristicka provjera konacnog PDF-a prije predaje (zaglavlje, EOF,
 * sifriranje, PDF/A, A4, ugradjeni fontovi, JavaScript, obrasci, pretrazivost teksta).
 *
 * Izvuceno iz monolita (src/ui/app.ts) u tipiziran, testabilan modul. Cista funkcija nad
 * bajtovima, bez DOM-a i mreze. Heuristika je namjerno konzervativna: prijavljuje na provjeru,
 * ne proglasava konacno.
 *
 * Sigurnost (S5): sadrzaj se skenira samo do gornje granice (MAX_PDF_SCAN_BYTES) da golem
 * PDF ne bi zamrznuo glavnu nit ni napuhao memoriju; zaglavlje i zavrsna oznaka citaju se
 * zasebno s pravog pocetka i kraja datoteke pa ostaju tocni i za velike datoteke.
 */

/** Gornja granica skeniranja sadrzaja PDF-a. Realan diplomski PDF je nekoliko MB; 32 MB daje
 *  velik zazor, a bounda sinkroni string-scan na glavnoj niti. */
export const MAX_PDF_SCAN_BYTES = 32 * 1024 * 1024;

export interface PdfNote {
  level: 'error' | 'warning' | 'info';
  text: string;
}

export interface PdfPreflight {
  name: string;
  size: number;
  version: string | null;
  valid: boolean;
  header: boolean;
  eof: boolean;
  encrypted: boolean;
  pdfa: { detected: boolean; part: string | null; conformance: string | null };
  pageCount: number | null;
  mediaBoxes: number;
  a4Share: number | null;
  fontObjects: number;
  embeddedFontFiles: number;
  hasJavascript: boolean;
  hasForms: boolean;
  textOperators: number;
  title: string | null;
  author: string | null;
  /** true kad je sadrzaj skeniran samo djelomicno zbog velicine (S5). */
  scanTruncated: boolean;
  notes: PdfNote[];
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

/** Procitaj PDF literal string (npr. /Title (…)) uz razumnu duljinsku granicu. */
export function pdfLiteral(text: string, key: string): string | null {
  const m = text.match(new RegExp('\\/' + key + '\\s*\\(([^)]{0,300})\\)'));
  return m ? m[1].replace(/\\([()\\])/g, '$1') : null;
}

/** Preflight nad bajtovima PDF-a. Ne baca; ime i velicina dolaze od pozivatelja. */
export function pdfPreflight(bytes: Uint8Array, name: string, size: number): PdfPreflight {
  const head = new TextDecoder('ascii').decode(bytes.slice(0, 16));
  const tail = new TextDecoder('latin1').decode(bytes.slice(Math.max(0, bytes.length - 4096)));
  const scanTruncated = bytes.length > MAX_PDF_SCAN_BYTES;
  const scanBytes = scanTruncated ? bytes.slice(0, MAX_PDF_SCAN_BYTES) : bytes;
  const text = new TextDecoder('latin1').decode(scanBytes);

  const header = /^%PDF-(\d\.\d)/.exec(head);
  const validHeader = !!header;
  const hasEof = /%%EOF/.test(tail);
  const encrypted = /\/Encrypt\b/.test(text);
  const pdfaPart = (text.match(/pdfaid:part[^>]*>\s*(\d+)/i) || [])[1] || null;
  const pdfaConf = (text.match(/pdfaid:conformance[^>]*>\s*([A-Z])/i) || [])[1] || null;
  const isPdfA = !!pdfaPart || /GTS_PDFA/i.test(text);
  const pageCount = countMatches(text, /\/Type\s*\/Page\b/g);
  const media = [...text.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
    .slice(0, 50)
    .map((m) => ({ w: Math.abs(+m[3] - +m[1]), h: Math.abs(+m[4] - +m[2]) }));
  const a4 = media.length
    ? media.filter(
        (x) =>
          (Math.abs(x.w - 595) < 12 && Math.abs(x.h - 842) < 12) ||
          (Math.abs(x.h - 595) < 12 && Math.abs(x.w - 842) < 12),
      ).length / media.length
    : null;
  const fontObjects = countMatches(text, /\/Type\s*\/Font\b/g);
  const embedded = countMatches(text, /\/FontFile(?:2|3)?\b/g);
  const hasJs = /\/JavaScript\b|\/JS\s*[<(]/.test(text);
  const hasForms = /\/AcroForm\b/.test(text);
  const textOperators = countMatches(text, /\b(?:Tj|TJ)\b/g);
  const title = pdfLiteral(text, 'Title');
  const author = pdfLiteral(text, 'Author');

  const notes: PdfNote[] = [];
  if (!validHeader || !hasEof) notes.push({ level: 'error', text: 'Datoteka nema potpun prepoznatljiv PDF zaglavlje ili završnu oznaku.' });
  if (encrypted) notes.push({ level: 'error', text: 'PDF je šifriran ili zaštićen; sustav predaje možda ga neće moći obraditi.' });
  if (hasJs) notes.push({ level: 'warning', text: 'PDF sadrži JavaScript ili aktivne radnje; za predaju je sigurnija statična verzija.' });
  if (hasForms) notes.push({ level: 'warning', text: 'PDF sadrži obrazac. Provjeri jesu li sva polja spljoštena i vidljiva.' });
  if (a4 != null && a4 < 0.95) notes.push({ level: 'warning', text: `Samo ${Math.round(a4 * 100)}% prepoznatih stranica koristi približan A4 format.` });
  if (!isPdfA) notes.push({ level: 'info', text: 'PDF/A oznaka nije pronađena. To ne dokazuje da datoteka nije PDF/A, ali zahtijeva provjeru u validatoru kada je PDF/A obvezan.' });
  if (fontObjects && !embedded) notes.push({ level: 'warning', text: 'Nisu pronađeni pokazatelji ugrađenih fontova. Provjeri Fonts u svojstvima PDF-a.' });
  if (!textOperators) notes.push({ level: 'info', text: 'Pretraživost teksta nije moguće potvrditi iz lokalne heuristike; ručno pokušaj označiti i kopirati tekst.' });

  return {
    name,
    size,
    version: header?.[1] || null,
    valid: validHeader && hasEof && !encrypted,
    header: validHeader,
    eof: hasEof,
    encrypted,
    pdfa: { detected: isPdfA, part: pdfaPart, conformance: pdfaConf },
    pageCount: pageCount || null,
    mediaBoxes: media.length,
    a4Share: a4,
    fontObjects,
    embeddedFontFiles: embedded,
    hasJavascript: hasJs,
    hasForms,
    textOperators,
    title,
    author,
    scanTruncated,
    notes,
  };
}
