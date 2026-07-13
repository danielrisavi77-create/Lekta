// src/repair/xml-patch.ts
//
// NAMJERNA ODLUKA (odstupanje od REPAIR_ENGINE.md sekcije 4, u konzervativnijem
// smjeru): umjesto DOMParser + XMLSerializer round-trip, ovo koristi CILJANE
// regexe koji mijenjaju SAMO vrijednosti konkretnih atributa unutar konkretno
// imenovanog taga (sve pojave), ostavljajuci apsolutno svaki drugi bajt netaknut.
//
// Razlog: DOMParser/XMLSerializer round-trip moze suptilno promijeniti
// formatiranje (poredak atributa, whitespace, self-closing notaciju) na
// DIJELOVIMA dokumenta koje NISMO namjeravali dirati, sto je tocno onaj tihi
// rizik zbog kojeg GOLDEN.md postoji. Regex na tocno imenovanom atributu
// unutar tocno imenovanog taga je uze i sigurnije: ili se atribut nade i
// promijeni, ili se ne dira NISTA. Dodatna prednost: nema DOMParser
// ovisnosti, pa je testabilno u cistom Node bez happy-dom/jsdom polyfilla.

export interface PatchResult {
  xml: string;
  applied: boolean;
  before: Record<string, string>;
  after: Record<string, string>;
  /**
   * Po trazenom atributu: je li atribut uopce PRONADJEN u ciljanom tagu.
   * applied:false + found:true znaci "vec je na ciljanoj vrijednosti" (backstop
   * postoji); applied:false + found:false znaci "nema ga i nije umetnut"
   * (patch-only politika). Deep ciscenje (fixers.ts) smije brisati direct
   * override-e SAMO kad backstop postoji, inace bi dokument regresirao na
   * theme/naslijedjene vrijednosti umjesto na cilj.
   */
  found: Record<string, boolean>;
}

const NO_OP: PatchResult = { xml: '', applied: false, before: {}, after: {}, found: {} };

// Krpa imenovane atribute u SVIM pojavama ciljanog taga (analyzeDocx provjerava
// margine/format preko SVIH w:sectPr sekcija, pa i popravak mora pogoditi svaku;
// naslovnica s vlastitim sectPr je standard u tezama). Tag se prepoznaje po
// otvarajucem obliku, i self-closing (<w:pgMar .../>) i obicnom (<w:pgMar ...>),
// jer atributi u OOXML-u zive iskljucivo u otvarajucem tagu. before/after biljeze
// prvu promijenjenu vrijednost po atributu (za citljiv changelog).
function patchTagAttributes(
  xml: string,
  tagPattern: RegExp,
  attrUpdates: Record<string, string>,
): PatchResult {
  const globalPattern = new RegExp(tagPattern.source, 'g');
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const found: Record<string, boolean> = {};
  let changed = false;

  const newXml = xml.replace(globalPattern, (tag) => {
    let out = tag;
    for (const [attr, newValue] of Object.entries(attrUpdates)) {
      const attrRegex = new RegExp(`(${escapeRegex(attr)}=")([^"]*)(")`);
      const attrMatch = out.match(attrRegex);
      if (!attrMatch) continue; // atribut ne postoji na ovom tagu, ne izmisljaj ga
      found[attr] = true;
      const oldValue = attrMatch[2];
      const escapedValue = escapeXmlAttr(newValue);
      if (oldValue === escapedValue) continue;
      if (!(attr in before)) {
        before[attr] = oldValue;
        after[attr] = escapedValue;
      }
      // Replacer funkcija umjesto replacement stringa: vrijednost s '$' ($&, $1)
      // se ne smije interpretirati kao referenca na grupu.
      out = out.replace(attrRegex, (_m, p1: string, _old: string, p3: string) => p1 + escapedValue + p3);
      changed = true;
    }
    return out;
  });

  if (!changed) return { ...NO_OP, xml, found };
  return { xml: newXml, applied: true, before, after, found };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Vrijednost ide unutar dvostrukih navodnika XML atributa: escapaj &, < i ".
function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// === Margine i format stranice (documentXml, sectPr je uvijek u document.xml) ===

export function patchMargins(
  documentXml: string,
  marginsTwips: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>,
): PatchResult {
  const attrUpdates: Record<string, string> = {};
  if (marginsTwips.top !== undefined) attrUpdates['w:top'] = String(marginsTwips.top);
  if (marginsTwips.right !== undefined) attrUpdates['w:right'] = String(marginsTwips.right);
  if (marginsTwips.bottom !== undefined) attrUpdates['w:bottom'] = String(marginsTwips.bottom);
  if (marginsTwips.left !== undefined) attrUpdates['w:left'] = String(marginsTwips.left);
  return patchTagAttributes(documentXml, /<w:pgMar\b[^>]*\/?>/, attrUpdates);
}

export function patchPaperSize(documentXml: string, sizeTwips: { w: number; h: number }): PatchResult {
  return patchTagAttributes(documentXml, /<w:pgSz\b[^>]*\/?>/, {
    'w:w': String(sizeTwips.w),
    'w:h': String(sizeTwips.h),
  });
}

// === Zadani font, velicina, prored, poravnanje (stylesXml, v1 opseg: samo
// docDefaults / Normal stil, NE svaki pojedinacni run/odlomak koji odstupa,
// vidi REPAIR_ENGINE.md sekciju 2, "granica presjeka" ===

function findBlock(xml: string, pattern: RegExp): { block: string; start: number; end: number } | null {
  const match = xml.match(pattern);
  if (!match || match.index === undefined) return null;
  return { block: match[0], start: match.index, end: match.index + match[0].length };
}

export function patchDefaultFont(
  stylesXml: string,
  update: { fontName?: string; sizeHalfPoints?: number },
): PatchResult {
  const found = findBlock(stylesXml, /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
  if (!found) return { ...NO_OP, xml: stylesXml };

  let block = found.block;
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const foundAttrs: Record<string, boolean> = {};
  let changed = false;

  if (update.fontName !== undefined) {
    const fontResult = patchTagAttributes(block, /<w:rFonts\b[^>]*\/?>/, {
      'w:ascii': update.fontName,
      'w:hAnsi': update.fontName,
    });
    // Backstop postoji tek kad docDefaults ima LITERALNI w:ascii I w:hAnsi
    // (theme-only rFonts se patch-only politikom ne dira). Deep strippa OBA
    // slota s runova, pa i backstop mora jamciti oba: inace bi High-ANSI slot
    // (hrvatski dijakritici c/z-kvacica, dj) pao na theme font.
    if (fontResult.found['w:ascii'] && fontResult.found['w:hAnsi']) foundAttrs.fontName = true;
    if (fontResult.applied) {
      block = fontResult.xml;
      before.fontName = fontResult.before['w:ascii'] ?? '';
      after.fontName = update.fontName;
      changed = true;
    }
  }

  if (update.sizeHalfPoints !== undefined) {
    const szResult = patchTagAttributes(block, /<w:sz\b[^>]*\/?>/, {
      'w:val': String(update.sizeHalfPoints),
    });
    if (szResult.found['w:val']) foundAttrs.sizeHalfPoints = true;
    if (szResult.applied) {
      block = szResult.xml;
      before.sizeHalfPoints = szResult.before['w:val'] ?? '';
      after.sizeHalfPoints = String(update.sizeHalfPoints);
      changed = true;
    }
  }

  if (!changed) return { ...NO_OP, xml: stylesXml, found: foundAttrs };

  const newXml = stylesXml.slice(0, found.start) + block + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before, after, found: foundAttrs };
}

function findNormalStyleBlock(stylesXml: string) {
  return findBlock(stylesXml, /<w:style\b[^>]*w:styleId="Normal"[^>]*>[\s\S]*?<\/w:style>/);
}

export function patchDefaultSpacing(
  stylesXml: string,
  lineTwips: number,
  lineRule = 'auto',
): PatchResult {
  const found = findNormalStyleBlock(stylesXml);
  if (!found) return { ...NO_OP, xml: stylesXml };

  const result = patchTagAttributes(found.block, /<w:spacing\b[^>]*\/?>/, {
    'w:line': String(lineTwips),
    'w:lineRule': lineRule,
  });
  if (!result.applied) return { ...NO_OP, xml: stylesXml, found: result.found };

  const newXml = stylesXml.slice(0, found.start) + result.xml + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before: result.before, after: result.after, found: result.found };
}

export function patchDefaultParagraphSpacing(
  stylesXml: string,
  beforeTwentieths: number,
  afterTwentieths: number,
): PatchResult {
  const found = findNormalStyleBlock(stylesXml);
  if (!found) return { ...NO_OP, xml: stylesXml };

  const result = patchTagAttributes(found.block, /<w:spacing\b[^>]*\/?>/, {
    'w:before': String(beforeTwentieths),
    'w:after': String(afterTwentieths),
  });
  if (!result.applied) return { ...NO_OP, xml: stylesXml, found: result.found };

  const newXml = stylesXml.slice(0, found.start) + result.xml + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before: result.before, after: result.after, found: result.found };
}

export function patchDefaultAlignment(stylesXml: string, val: string): PatchResult {
  const found = findNormalStyleBlock(stylesXml);
  if (!found) return { ...NO_OP, xml: stylesXml };

  const result = patchTagAttributes(found.block, /<w:jc\b[^>]*\/?>/, { 'w:val': val });
  if (!result.applied) return { ...NO_OP, xml: stylesXml, found: result.found };

  const newXml = stylesXml.slice(0, found.start) + result.xml + stylesXml.slice(found.end);
  return { xml: newXml, applied: true, before: result.before, after: result.after, found: result.found };
}

// === Numeriranje stranica po sekcijama (documentXml, w:pgNumType u w:sectPr) ===
//
// Za razliku od patchMargins/patchPaperSize koji UNIFORMNO krpaju atribute istog
// taga preko SVIH sekcija, numeriranje je PER-SEKCIJA s RAZLICITIM vrijednostima
// (rimski na prednjim listovima, arapski od Uvoda) i cesto ga treba UMETNUTI
// (student rijetko ima eksplicitan w:pgNumType). Zato ovdje enumeriramo sectPr
// blokove u dokument-poretku i primjenjujemo ciljanu vrijednost samo na trazeni indeks.

export interface SectionNumberingTarget {
  /** Redni broj sekcije u dokument-poretku (isti kao els(doc,'w:sectPr') u analyzeDocx). */
  sectionIndex: number;
  /** w:fmt: 'lowerRoman'/'upperRoman' (prednji dio) ili 'decimal' (glavni tekst od Uvoda). */
  fmt: 'lowerRoman' | 'upperRoman' | 'decimal';
  /** w:start; kad je zadan postavlja se (npr. 1 na prvoj prednjoj i prvoj glavnoj sekciji),
   *  kad je undefined numeriranje se NASTAVLJA (postojeci w:start se ne dira). */
  start?: number;
}

// Postavi (ili umetni ako fali) imenovani atribut u OTVARAJUCEM tagu, cuvajuci
// self-closing oblik. Vraca nepromijenjen tag ako je vrijednost vec ista.
function setTagAttribute(tag: string, attr: string, value: string): string {
  const escaped = escapeXmlAttr(value);
  const attrRegex = new RegExp(`(${escapeRegex(attr)}=")([^"]*)(")`);
  if (attrRegex.test(tag)) {
    return tag.replace(attrRegex, (m, p1: string, old: string, p3: string) => (old === escaped ? m : p1 + escaped + p3));
  }
  const inject = ` ${attr}="${escaped}"`;
  return tag.endsWith('/>') ? tag.slice(0, -2).trimEnd() + inject + '/>' : tag.slice(0, -1).trimEnd() + inject + '>';
}

// Umetni pgNumType na CT_SectPr poziciju (ISO 29500): pgNumType neposredno prethodi
// <w:cols>, a dolazi iza pgSz/pgMar. Redoslijed pokusaja: tik prije <w:cols> (najsigurnije
// sidro, hvata i pgBorders/lnNumType koji su prije cols), inace iza <w:pgMar>, iza <w:pgSz>,
// inace odmah iza otvarajuceg taga. Self-closing sectPr se pretvara u kontejner.
function insertIntoSectPr(sectPrBlock: string, insertTag: string): string {
  if (/^<w:sectPr\b[^>]*\/>$/.test(sectPrBlock)) {
    return sectPrBlock.replace(/\/>$/, `>${insertTag}</w:sectPr>`);
  }
  // pgNumType neposredno prethodi <w:cols> u CT_SectPr, pa je umetanje TIK prije cols
  // ispravno bez obzira na pgBorders/lnNumType (koji su takodjer prije cols).
  const cols = sectPrBlock.match(/<w:cols\b[^>]*\/?>/);
  if (cols) return sectPrBlock.replace(cols[0], insertTag + cols[0]);
  // Bez cols: umetni IZA posljednjeg prisutnog elementa koji po CT_SectPr redoslijedu dolazi
  // PRIJE pgNumType (najblizi prvi: lnNumType, pgBorders, paperSrc, pgMar, pgSz, type), da
  // pgNumType ne zavrsi ispred pgBorders/lnNumType kad oni postoje (schema-nevaljan poredak).
  for (const name of ['w:lnNumType', 'w:pgBorders', 'w:paperSrc', 'w:pgMar', 'w:pgSz', 'w:type']) {
    const m = sectPrBlock.match(new RegExp(`<${name}\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${name}>)`));
    if (m) return sectPrBlock.replace(m[0], m[0] + insertTag);
  }
  const open = sectPrBlock.match(/^<w:sectPr\b[^>]*>/);
  if (open) return sectPrBlock.replace(open[0], open[0] + insertTag);
  return sectPrBlock; // teoretski nedostizno (regex je vec potvrdio sectPr oblik)
}

function applyPageNumberingToSection(sectPrBlock: string, target: SectionNumberingTarget): string {
  const existing = sectPrBlock.match(/<w:pgNumType\b[^>]*\/?>/);
  if (existing) {
    let tag = setTagAttribute(existing[0], 'w:fmt', target.fmt);
    if (target.start !== undefined) tag = setTagAttribute(tag, 'w:start', String(target.start));
    return tag === existing[0] ? sectPrBlock : sectPrBlock.replace(existing[0], tag);
  }
  const startAttr = target.start !== undefined ? ` w:start="${escapeXmlAttr(String(target.start))}"` : '';
  const tag = `<w:pgNumType w:fmt="${escapeXmlAttr(target.fmt)}"${startAttr}/>`;
  return insertIntoSectPr(sectPrBlock, tag);
}

export function patchSectionPageNumbering(documentXml: string, targets: SectionNumberingTarget[]): PatchResult {
  if (!targets.length) return { ...NO_OP, xml: documentXml };
  // Sigurnosni izlaz: praceni sectPrChange ugnjezduje <w:sectPr> u <w:sectPr>, sto bi
  // razbilo poredak enumeracije (lazy zatvarajuci tag). Radije bit-identican no-op nego
  // pogresno mapiranje sekcija; takvi radovi su rijetki (nezavrsene track-changes verzije).
  if (/<w:sectPrChange\b/.test(documentXml)) return { ...NO_OP, xml: documentXml };

  const byIndex = new Map(targets.map((t) => [t.sectionIndex, t]));
  let sectionIdx = -1;
  let changed = false;

  // Enumerira sve sekcije u dokument-poretku, i container (<w:sectPr>...</w:sectPr>) i
  // self-closing (<w:sectPr .../>) oblik, da se indeksi poklope s els(doc,'w:sectPr').
  const sectPrPattern = /<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g;
  const newXml = documentXml.replace(sectPrPattern, (block) => {
    sectionIdx += 1;
    const target = byIndex.get(sectionIdx);
    if (!target) return block;
    const patched = applyPageNumberingToSection(block, target);
    if (patched !== block) changed = true;
    return patched;
  });

  if (!changed) return { ...NO_OP, xml: documentXml };
  return { xml: newXml, applied: true, before: {}, after: {}, found: {} };
}
