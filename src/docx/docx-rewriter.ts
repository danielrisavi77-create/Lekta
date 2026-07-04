/**
 * Write round-trip spike za buduci "popravi oblikovanje" tok: NAJSIGURNIJI podskup,
 * iskljucivo geometrija stranice (w:pgMar margine i w:pgSz A4) u word/document.xml.
 *
 * Nije user-facing funkcija; ovo je dokaz izvedivosti write-puta prije bilo kakve
 * cijene ili obecanja korisniku. Nacela:
 *  - Citanje ide POSTOJECIM ZipReaderom (parser.ts se ne mijenja); svi zapisi osim
 *    word/document.xml prenose se bajt-za-bajt (dekomprimirani sadrzaj netaknut).
 *  - Izmjena je string-razinska i ogranicena na w:sectPr segmente: mijenjaju se samo
 *    atributi postojecih w:pgMar/w:pgSz tagova (header/footer/gutter se cuvaju);
 *    w:pgMar se umece jedino ako ga sekcija nema (Wordove implicitne margine).
 *  - Dokument bez w:sectPr ili bez trazene promjene vraca ORIGINALNE bajtove: nikad
 *    ne izmisljamo strukturu i nikad ne prepakiravamo bez potrebe.
 *  - Izlaz se slaze kao stored ZIP (metoda 0) preko zipStore iz docx-writer.
 */
import { ZipReader } from './parser';
import { zipStore, type ZipFile } from './docx-writer';

const TWIPS_PER_CM = 567; // konzistentno s parserom (readPPr/sectPr dijeli s 567)

/** Wordova A4 velicina stranice u twipima (1440 twipa po incu, 210 x 297 mm). */
const A4_W_TWIPS = 11906;
const A4_H_TWIPS = 16838;

export interface PageGeometryTarget {
  /** Ciljne margine u cm; izostavljeno znaci ne diraj margine. */
  marginsCm?: { top: number; right: number; bottom: number; left: number };
  /** true postavlja w:pgSz na A4; izostavljeno znaci ne diraj velicinu stranice. */
  a4?: boolean;
}

export interface RewriteOutcome {
  /** Novi .docx bajtovi; original ako nije bilo promjene. */
  bytes: Uint8Array;
  /** Opis primijenjenih promjena; prazno znaci no-op. */
  changed: string[];
}

function twipsFromCm(cm: number): number {
  return Math.round(cm * TWIPS_PER_CM);
}

/** Postavi ili dodaj atribut u empty-element tagu (npr. <w:pgMar .../>). */
function setAttr(tag: string, name: string, value: number): string {
  const re = new RegExp(`\\b${name}="[^"]*"`);
  if (re.test(tag)) return tag.replace(re, `${name}="${value}"`);
  return tag.replace(/\s*\/>$/, ` ${name}="${value}"/>`);
}

/** Primijeni ciljnu geometriju na JEDAN w:sectPr segment; vraca segment i opis promjena. */
function transformSectPr(seg: string, target: PageGeometryTarget): { seg: string; changed: string[] } {
  const changed: string[] = [];
  let out = seg;

  if (target.marginsCm) {
    const m = target.marginsCm;
    const apply = (tag: string) => {
      let t = tag;
      t = setAttr(t, 'w:top', twipsFromCm(m.top));
      t = setAttr(t, 'w:right', twipsFromCm(m.right));
      t = setAttr(t, 'w:bottom', twipsFromCm(m.bottom));
      t = setAttr(t, 'w:left', twipsFromCm(m.left));
      return t;
    };
    const pgMarRe = /<w:pgMar\b[^>]*\/>/;
    if (pgMarRe.test(out)) {
      const before = out;
      out = out.replace(pgMarRe, (tag) => apply(tag));
      if (out !== before) changed.push(`margine ${m.top}/${m.right}/${m.bottom}/${m.left} cm`);
    } else {
      // Sekcija bez pgMar: Word koristi implicitne margine, umecemo minimalan tag.
      const minimal = apply('<w:pgMar/>');
      out = out.replace(/(<w:sectPr\b[^>]*>)/, `$1${minimal}`);
      if (out !== seg) changed.push(`margine ${m.top}/${m.right}/${m.bottom}/${m.left} cm (dodan w:pgMar)`);
    }
  }

  if (target.a4) {
    const pgSzRe = /<w:pgSz\b[^>]*\/>/;
    if (pgSzRe.test(out)) {
      const before = out;
      out = out.replace(pgSzRe, (tag) => setAttr(setAttr(tag, 'w:w', A4_W_TWIPS), 'w:h', A4_H_TWIPS));
      if (out !== before) changed.push('velicina stranice A4');
    }
    // Bez postojeceg pgSz ne umecemo nista: velicinu ne izmisljamo bez sekcije koja je nosi.
  }

  return { seg: out, changed };
}

/**
 * Prepisi geometriju stranice u .docx dokumentu. Vraca nove bajtove i popis promjena;
 * kad nema sectPr, nema cilja ili nista nije stvarno promijenjeno, vraca ORIGINAL.
 */
export async function rewritePageGeometry(
  input: ArrayBuffer,
  target: PageGeometryTarget,
): Promise<RewriteOutcome> {
  const original = new Uint8Array(input);
  if (!target.marginsCm && !target.a4) return { bytes: original, changed: [] };

  const zip = new ZipReader(input);
  const names = zip.names();
  if (!names.includes('word/document.xml')) return { bytes: original, changed: [] };

  // Svi zapisi se dekomprimiraju odmah: izlaz je stored ZIP s identicnim sadrzajem
  // svih dijelova osim document.xml.
  const files: ZipFile[] = [];
  for (const name of names) {
    const data = await zip.data(name);
    if (data) files.push({ name, data });
  }

  const doc = files.find((f) => f.name === 'word/document.xml');
  if (!doc) return { bytes: original, changed: [] };
  const xml = new TextDecoder('utf-8').decode(doc.data);
  if (!/<w:sectPr[\s>]/.test(xml)) return { bytes: original, changed: [] };

  const allChanges: string[] = [];
  const nextXml = xml.replace(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g, (seg) => {
    const { seg: out, changed } = transformSectPr(seg, target);
    allChanges.push(...changed);
    return out;
  });

  if (!allChanges.length || nextXml === xml) return { bytes: original, changed: [] };

  doc.data = new TextEncoder().encode(nextXml);
  return { bytes: zipStore(files), changed: [...new Set(allChanges)] };
}
