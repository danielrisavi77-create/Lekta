/**
 * ORAKL za T84 R-01: doslovna kopija regex izvedbe `extractFingerprintInputFromDocx` prije prelaska
 * na linearni skener (origin/master c4d442e0). Sluzi samo testovima: nova izvedba mora dati ISTI
 * rezultat na fixturama i generiranom XML-u, a ova se u mutacijskom testu koristi kao kvadratni
 * mutant. Ne uvoziti iz produkcijskog koda.
 */
import type { FingerprintInput, HeadingInput } from '../../src/fingerprint/fingerprint';

const HEADING_STYLE_RE = /^(?:heading|naslov)\s*([1-9])$/i;

function headingLevelsByStyleId(stylesXml: string): Map<string, number> {
  const byId = new Map<string, number>();
  const styleRe = /<w:style\b[^>]*w:styleId="([^"]*)"[^>]*\/>|<w:style\b[^>]*w:styleId="([^"]*)"[^>]*>[\s\S]*?<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(stylesXml)) !== null) {
    const styleId = m[1] ?? m[2] ?? '';
    if (!styleId) continue;
    const block = m[0];
    const idLevel = HEADING_STYLE_RE.exec(styleId);
    if (idLevel) { byId.set(styleId, Number(idLevel[1])); continue; }
    const nameMatch = block.match(/<w:name\b[^>]*w:val="([^"]*)"/);
    const nameLevel = nameMatch ? HEADING_STYLE_RE.exec(nameMatch[1]) : null;
    if (nameLevel) byId.set(styleId, Number(nameLevel[1]));
  }
  return byId;
}

function paragraphText(block: string): string {
  return [...block.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('').trim();
}

export function legacyExtractFingerprintInputFromDocx(documentXml: string, stylesXml: string): FingerprintInput {
  const levels = headingLevelsByStyleId(stylesXml);
  const headings: HeadingInput[] = [];
  let titleGuess = '';
  let sawFirstHeading = false;
  const paraRe = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(documentXml)) !== null) {
    const block = m[0];
    const styleMatch = block.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/);
    const level = styleMatch ? levels.get(styleMatch[1]) : undefined;
    if (level && level <= 2) {
      sawFirstHeading = true;
      const text = paragraphText(block);
      if (text) headings.push({ level, text });
      continue;
    }
    if (sawFirstHeading) continue;
    const text = paragraphText(block);
    if (text.length > titleGuess.length) titleGuess = text;
  }
  return { title: titleGuess || null, author: null, headings };
}

/**
 * Napadacki ulazi iz T84 R-01: svaki cilja jedan od pet regexa (styles, odlomak, pStyle, w:name,
 * w:t) oblikom koji je za regex kvadratan (pocetak taga bez `>` ili bez zatvaranja), `n` ponavljanja.
 */
export function adversarialInputs(n: number): Array<{ name: string; documentXml: string; stylesXml: string }> {
  const okDoc = '<w:document><w:body><w:p><w:r><w:t>Naslov</w:t></w:r></w:p></w:body></w:document>';
  const okStyles = '<w:styles><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>';
  return [
    { name: 'styles: <w:style bez >', documentXml: okDoc, stylesXml: '<w:style '.repeat(n) },
    { name: 'styles: <w:style styleId bez zatvaranja', documentXml: okDoc, stylesXml: '<w:style w:styleId="a">'.repeat(n) },
    { name: 'styles: <w:name bez > u stilu', documentXml: okDoc, stylesXml: `<w:style w:styleId="X">${'<w:name '.repeat(n)}</w:style>` },
    { name: 'document: <w:p bez >', documentXml: '<w:p '.repeat(n), stylesXml: okStyles },
    { name: 'document: <w:p> bez zatvaranja', documentXml: '<w:p>'.repeat(n), stylesXml: okStyles },
    { name: 'document: <w:pStyle bez > u odlomku', documentXml: `<w:p>${'<w:pStyle '.repeat(n)}</w:p>`, stylesXml: okStyles },
    { name: 'document: <w:t bez > u odlomku', documentXml: `<w:p>${'<w:t '.repeat(n)}</w:p>`, stylesXml: okStyles },
  ];
}
