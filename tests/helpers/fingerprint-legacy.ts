/**
 * ORAKL za T84 R-01: doslovna kopija regex izvedbe `extractFingerprintInputFromDocx` prije prelaska
 * na linearni skener (origin/master c4d442e0). Sluzi samo testovima: nova izvedba mora dati ISTI
 * rezultat na fixturama i generiranom XML-u. Linearnost se dokazuje brojacem rada u skeneru
 * (linearnostProblemi), a mutanti su zamjene u stvarnom izvoru skenera (mutiraniSkener). Ne uvoziti
 * iz produkcijskog koda.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';
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
 * Napadacki ulazi iz T84 R-01: svaki cilja jedan regex ili jedan pokazivac skenera (styles, odlomak,
 * pStyle, w:name, w:t, atribut, `>` u navodnicima) oblikom koji je kvadratan za regex ili bi bio
 * kvadratan za skener bez pamcenja pozicija; `n` ponavljanja. Codex R3 na #230 dodao je dug atribut
 * bez navodnika, niz `<` i vise pojava styleId u jednom tagu.
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
    { name: 'styles: dug atribut bez navodnika i bez >', documentXml: okDoc, stylesXml: `<w:style w:x=${'a'.repeat(9 * n)}` },
    { name: 'styles i document: niz <', documentXml: '<'.repeat(9 * n), stylesXml: '<'.repeat(9 * n) },
    { name: 'styles: vise styleId u tagu bez >', documentXml: okDoc, stylesXml: `${'<w:style '.repeat(n)}${'w:styleId="a" '.repeat(n)}>` },
    { name: 'styles: > u navodnicima bez zatvaranja', documentXml: okDoc, stylesXml: '<w:style w:styleId="a>b">'.repeat(n) },
  ];
}

type Ekstraktor = (documentXml: string, stylesXml: string, mjera?: { znakova: number }) => FingerprintInput;

/**
 * Deterministicki gard linearnosti (Codex R2 na #230): broj pregledanih znakova koji skener sam
 * broji, ne vrijeme. Za svaki napad mjeri n i 2n; problem je ako se rad vise nego udvostruci
 * (uz 25 % zraka) ili ako premasi `poZnaku` znakova po znaku ulaza. Vraca imena napada s problemom.
 */
export function linearnostProblemi(fn: Ekstraktor, n: number, poZnaku = 12): string[] {
  const rad = (x: { documentXml: string; stylesXml: string }) => {
    const mjera = { znakova: 0 };
    fn(x.documentXml, x.stylesXml, mjera);
    return mjera.znakova;
  };
  const mali = adversarialInputs(n);
  const veliki = adversarialInputs(2 * n);
  const problemi: string[] = [];
  mali.forEach((a, i) => {
    const b = veliki[i];
    const ra = rad(a);
    const rb = rad(b);
    const duljina = b.documentXml.length + b.stylesXml.length;
    if (rb > 2.5 * Math.max(ra, 1) || rb > poZnaku * duljina) problemi.push(a.name);
  });
  return problemi;
}

/**
 * Mutant skenera iz STVARNOG izvora: zamjena jednog izraza u src/fingerprint/extract-from-docx.ts,
 * prevedena esbuildom i izvrsena bez upisa u repozitorij. Tako mutacija mijenja sam skener, ne
 * filtrira izlaz.
 */
export function mutiraniSkener(staro: string, novo: string): Ekstraktor {
  const src = readFileSync(resolve(process.cwd(), 'src/fingerprint/extract-from-docx.ts'), 'utf8').replace(/\r/g, '');
  if (!src.includes(staro)) throw new Error(`mutacija ne pogadja izvor: ${staro}`);
  const js = transformSync(src.replace(staro, novo), { loader: 'ts', format: 'esm' }).code
    .replace(/^import .*$/gm, '')
    .replace(/^export {[^}]*};?$/gm, '')
    .replace(/^export /gm, '');
  return new Function(`${js}\nreturn extractFingerprintInputFromDocx;`)() as Ekstraktor;
}
