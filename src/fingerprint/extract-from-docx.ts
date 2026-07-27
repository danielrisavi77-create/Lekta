// src/fingerprint/extract-from-docx.ts
//
// RE-18: otisak za naplatni gate MORA doci iz STVARNO uploadanih bajtova, ne iz klijentske meta
// (inace jedan potroseni slot popravlja BILO KOJI drugi dokument iste vrste rada, replayem stare
// meta uz zamijenjen file). Regex-based ekstrakcija (kao xml-patch.ts), namjerno BEZ punog
// DOMParsera: dovoljna je gruba ali deterministicna ekstrakcija naslova H1/H2 iz document.xml,
// ne puna analiza kao analyze-docx.ts. `title`/`author` se namjerno NE pokusavaju izvuci s
// naslovnice (title-page varijante su prebrojne za pouzdan regex, vidi title-page-templates);
// computeFingerprint vec ima fallback na prvi H1 kad je title prazan.

import type { FingerprintInput, HeadingInput } from './fingerprint.ts';

const HEADING_STYLE_RE = /^(?:heading|naslov)\s*([1-9])$/i;

/**
 * styleId -> razina naslova (1-9), iz styles.xml. Stil moze biti prepoznat po doslovnom styleId-u
 * ("Heading1"/"Naslov1") ili po lokaliziranom w:name (isti par kriterija kao RE-08 u xml-patch.ts).
 * Samozatvarajuca alternativa MORA doci PRIJE uparene (RE-24 obrazac): bez toga prazan
 * samozatvarajuci stil "guta" sljedeci stil kroz lazy [\s\S]*?</w:style>.
 */
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

/** Tekst odlomka: konkatenacija svih <w:t> unutar bloka (bez formatiranja/runova). */
function paragraphText(block: string): string {
  return [...block.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('').trim();
}

/**
 * Izvuci naslove H1/H2 I "naslovni" pogodak iz stvarnih bajtova (document.xml + styles.xml).
 * Namjerno gruba ekstrakcija: dovoljno je da je deterministicki vezana za pravi sadrzaj (isti
 * dokument uvijek daje isti rezultat), ne savrsena detekcija svake lokalizacije/predloska.
 * Samozatvarajuca alternativa (`<w:p/>`) MORA doci prije uparene iz istog razloga kao gore
 * (P-B obrazac).
 *
 * VAZNO (otkriveno empirijski na pravim fixturama): computeFingerprint/fingerprintMatch
 * kombiniraju title (jaki match) i heading-sekvencu+author (slabiji match, ali author=null OVDJE
 * cini tu granu strukturno mrtvom). Hrvatski diplomski/zavrsni radovi gotovo UVIJEK dijele
 * IDENTICNO prvo poglavlje ("Sažetak"/"Uvod"), pa naivan "prvi H1 kao naslov" fallback
 * (computeFingerprint-ov default) kolabira DVA POSVE RAZLICITA rada u isti otisak. Zato se ovdje
 * naslov NE prepusta tom fallbacku: bira se najduzi odlomak PRIJE prvog naslova (naslovnica-zona,
 * gdje realan naslov rada obicno zivi kao najduza fraza), sto je puno rjede generickо nego
 * naziv prvog poglavlja.
 */
export function extractFingerprintInputFromDocx(documentXml: string, stylesXml: string): FingerprintInput {
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
    if (sawFirstHeading) continue; // naslovnica-zona je zavrsila prvim naslovom
    const text = paragraphText(block);
    if (text.length > titleGuess.length) titleGuess = text;
  }
  return { title: titleGuess || null, author: null, headings };
}
