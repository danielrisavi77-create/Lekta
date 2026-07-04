/**
 * Brzi peek statistike dokumenta (broj rijeci i stranica) iz `docProps/app.xml`,
 * koji Word sam upisuje pri spremanju. NE dira glavni parser/analyzeDocx: cita samo
 * gotova svojstva pa je jeftin i ne mijenja ponasanje engine-a (golden ostaje isti).
 *
 * `parseAppStats` je cista funkcija (testabilna nad XML stringom); `docxQuickStats`
 * je tanki omotac koji otvori zip i dohvati app.xml.
 */
import { parseXml, ZipReader } from './parser';
import { first, textOf } from '../utils/helpers';

export interface DocxQuickStats {
  /** Broj rijeci koje je Word izracunao, ili null ako nije dostupan. */
  words: number | null;
  /** Broj stranica koje je Word izracunao, ili null ako nije dostupan. */
  pages: number | null;
}

/** Izvuci Words/Pages iz app.xml XML-a. Nedostajuce ili nepozitivne vrijednosti -> null. */
export function parseAppStats(xml: string): DocxQuickStats {
  const doc = parseXml(xml, 'DOCX svojstva');
  const num = (tag: string): number | null => {
    const node = first(doc, tag);
    const value = node ? Number(textOf(node)) : NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  return { words: num('Words'), pages: num('Pages') };
}

/** Otvori .docx i vrati brzu statistiku iz app.xml, ili null ako je nema. */
export async function docxQuickStats(
  file: { arrayBuffer(): Promise<ArrayBuffer> },
): Promise<DocxQuickStats | null> {
  try {
    const zip = new ZipReader(await file.arrayBuffer());
    const xml = await zip.text('docProps/app.xml');
    return xml ? parseAppStats(xml) : null;
  } catch {
    return null;
  }
}
