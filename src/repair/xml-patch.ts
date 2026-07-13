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

function findStyleBlock(stylesXml: string, styleId: string) {
  const escapedId = escapeRegex(styleId);
  return findBlock(
    stylesXml,
    new RegExp(`<w:style\\b[^>]*w:styleId="${escapedId}"[^>]*>[\\s\\S]*?<\\/w:style>`),
  );
}

const findNormalStyleBlock = (stylesXml: string) => findStyleBlock(stylesXml, 'Normal');

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

// Word ugradjeni stil za tekst fusnota ima stabilan (locale-neovisan) styleId
// "FootnoteText" (za razliku od w:name koji je lokaliziran, npr. "Fusnota").
// Isti patch-only obrazac kao patchDefaultParagraphSpacing: ako dokument ne
// deklarira taj stil u styles.xml, findStyleBlock vraca null i funkcija je
// posten no-op (ne izmislja stil koji ne postoji).
export function patchFootnoteTextSpacing(
  stylesXml: string,
  beforeTwentieths: number,
  afterTwentieths: number,
): PatchResult {
  const found = findStyleBlock(stylesXml, 'FootnoteText');
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

// === Podnozje s brojem stranice (footer part + rels + content-types + footerReference) ===
//
// K5 (BL-07b): PRVO prosirenje engine politike izvan document.xml/styles.xml. Umetanje
// podnozja s PAGE poljem trazi uskladjenu izmjenu na 4 mjesta: novi word/footerN.xml,
// <Override> u [Content_Types].xml, <Relationship> u document.xml.rels i <w:footerReference>
// u ciljni sectPr. Svaki primitiv je no-op kad je cilj vec prisutan (bit-identicna sigurnost).

export const FOOTER_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
export const FOOTER_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Novi footer s PAGE poljem (fldChar sekvenca; instrText " PAGE " s xml:space preserve; jc
// po zelji). Word prikaze automatski broj stranice prema sekcijskoj pgNumType shemi (K4).
export function buildFooterPageXml(align: 'left' | 'center' | 'right' = 'right'): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:p><w:pPr><w:jc w:val="${align}"/></w:pPr>` +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    '<w:r><w:t>1</w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
    '</w:p></w:ftr>'
  );
}

// Sljedeci slobodan rIdN (max postojeci + 1; rId1 ako nema nijednog).
export function nextRelationshipId(relsXml: string): string {
  let max = 0;
  for (const m of relsXml.matchAll(/\bId="rId(\d+)"/g)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return `rId${max + 1}`;
}

// Sljedeci slobodan word/footerN.xml (N od 1) koji nije u content-typesu ni u dodanim partovima.
export function nextFooterPartName(contentTypesXml: string, addedNames: string[]): string {
  const taken = new Set<string>();
  for (const m of contentTypesXml.matchAll(/PartName="\/word\/footer(\d+)\.xml"/g)) taken.add(m[1]);
  for (const name of addedNames) {
    const m = name.match(/^word\/footer(\d+)\.xml$/);
    if (m) taken.add(m[1]);
  }
  let n = 1;
  while (taken.has(String(n))) n += 1;
  return `word/footer${n}.xml`;
}

// Dodaj <Override> u [Content_Types].xml prije </Types> (no-op ako partName vec postoji).
export function addContentTypeOverride(
  contentTypesXml: string,
  partName: string,
  contentType: string,
): PatchResult {
  if (contentTypesXml.includes(`PartName="${partName}"`)) return { ...NO_OP, xml: contentTypesXml };
  if (!contentTypesXml.includes('</Types>')) return { ...NO_OP, xml: contentTypesXml };
  const tag = `<Override PartName="${escapeXmlAttr(partName)}" ContentType="${escapeXmlAttr(contentType)}"/>`;
  return { xml: contentTypesXml.replace('</Types>', tag + '</Types>'), applied: true, before: {}, after: {}, found: {} };
}

// Dodaj <Relationship> u rels prije </Relationships> (no-op ako Id vec postoji).
export function addRelationship(relsXml: string, id: string, type: string, target: string): PatchResult {
  if (new RegExp(`\\bId="${escapeRegex(id)}"`).test(relsXml)) return { ...NO_OP, xml: relsXml };
  if (!relsXml.includes('</Relationships>')) return { ...NO_OP, xml: relsXml };
  const tag = `<Relationship Id="${escapeXmlAttr(id)}" Type="${escapeXmlAttr(type)}" Target="${escapeXmlAttr(target)}"/>`;
  return { xml: relsXml.replace('</Relationships>', tag + '</Relationships>'), applied: true, before: {}, after: {}, found: {} };
}

// r:id trazi deklariran xmlns:r na <w:document>; realni docx ga ima, minimalni (sinteticki)
// ne mora. Dodaj ga ako fali, inace bi footerReference s r:id bio nevaljan XML.
function ensureRelationshipsNamespace(documentXml: string): string {
  if (/<w:document\b[^>]*\sxmlns:r=/.test(documentXml)) return documentXml;
  return documentXml.replace(/<w:document\b/, `<w:document xmlns:r="${RELATIONSHIPS_NS}"`);
}

// === Umetanje sekcije prije Uvoda (K6, BL-07c) ===
//
// Prednji dio rada (naslovnica, sazetak, sadrzaj) i glavni tekst se u Wordu razlikuju u
// numeriranju (rimski vs arapski od 1) TEK ako su zasebne sekcije. Student najcesce ima
// jednu sekciju, pa "numeriranje od Uvoda" trazi UMETANJE prijeloma sekcije neposredno
// prije odlomka Uvoda. To se sprema kao NOVI prazan odlomak <w:p><w:pPr><w:sectPr/></w:pPr></w:p>
// koji postaje zavrsni odlomak prednje sekcije; zavrsni body-level sectPr definira glavnu.

// Geometrija stranice (pgSz, pgMar) iz ZADNJEG sectPr-a = body-level zavrsni sectPr (definira
// glavnu sekciju). Marker prednje sekcije preuzima istu geometriju da se format ne promijeni.
export function extractFinalSectionGeometry(documentXml: string): { pgSz: string | null; pgMar: string | null } {
  const sects = documentXml.match(/<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g);
  const last = sects && sects.length ? sects[sects.length - 1] : '';
  return {
    pgSz: last.match(/<w:pgSz\b[^>]*\/?>/)?.[0] ?? null,
    pgMar: last.match(/<w:pgMar\b[^>]*\/?>/)?.[0] ?? null,
  };
}

// Ima li odlomak (koji POCINJE na start) vlastiti w:sectPr u svom (prvom) w:pPr bloku. pPr je
// prvi dijete w:p, sectPr (kad ga ima) je zadnji u pPr; sidrimo na pocetku odlomka i uzimamo
// PRVI </w:pPr> (vlastiti pPr), pa ugnjezdeni okvir/tablica u tijelu odlomka ne moze zavarati.
function paragraphOwnsSectPr(documentXml: string, start: number): boolean {
  const slice = documentXml.slice(start);
  // Samozatvarajuci odlomak (<w:p/> ili <w:p attrs/>) nema djece pa ne moze nositi sectPr;
  // bez ovog izlaza greedy [^>]* progutao bi "/" i match bi zahvatio pPr SLJEDECEG odlomka.
  if (/^<w:p\b[^>]*\/>/.test(slice)) return false;
  const ppr = slice.match(/^<w:p\b[^>]*>\s*<w:pPr\b[\s\S]*?<\/w:pPr>/);
  if (!ppr) return false;
  // ZIVI sectPr je zadnji element pPr-a i po CT_PPr redoslijedu dolazi neposredno PRIJE
  // w:pPrChange (povijest pracenih izmjena, koja i sama moze sadrzavati stari <w:sectPr>).
  // Testiraj samo dio prije pPrChange, inace bi povijesni sectPr lazno oznacio inace popravljiv
  // dokument kao "vec ima prijelom" i tiho odbio popravak. (Lazy match iznad staje na PRVOM
  // </w:pPr>, koji kod pPrChange zatvara njegov ugnjezdeni pPr, pa split hvata tocno zivi dio.)
  const live = ppr[0].split(/<w:pPrChange\b/)[0];
  return /<w:sectPr\b/.test(live);
}

// Je li pozicija na razini <w:body> (ne unutar tablice, tekstualnog okvira ni blok-kontrole
// sadrzaja). Umetanje sekcijskog markera je valjano SAMO na razini tijela; Uvod je u praksi
// uvijek ondje, ali branimo se od patoloskih dokumenata (uravnotezeni broj otvaranja/zatvaranja
// prije pozicije). Poziva se nad MASKIRANIM XML-om (bez komentara) pa zakomentiran zatvarac ne
// kvari balans.
function isBodyLevelPosition(documentXml: string, pos: number): boolean {
  const before = documentXml.slice(0, pos);
  const openMinusClose = (open: RegExp, close: RegExp) =>
    (before.match(open)?.length ?? 0) - (before.match(close)?.length ?? 0);
  const tbl = openMinusClose(/<w:tbl\b/g, /<\/w:tbl>/g);
  const txbx = openMinusClose(/<w:txbxContent\b/g, /<\/w:txbxContent>/g);
  const sdt = openMinusClose(/<w:sdtContent\b/g, /<\/w:sdtContent>/g);
  return tbl <= 0 && txbx <= 0 && sdt <= 0;
}

// Umetni prijelom sekcije PRIJE zadanog odlomka (1-based redni broj u dokument-poretku, isti
// koordinatni sustav kao analyzeDocx paragraph.index / introParagraphIndex: n-ti <w:p> start-tag
// u document.xml == n-ti element els(doc,'w:p')). Ubacuje <w:p><w:pPr>{markerSectPr}</w:pPr></w:p>
// tik prije ciljnog <w:p>, cime prednji dio postaje zasebna sekcija (zavrsava markerom), a ciljni
// odlomak (Uvod) zapocinje glavnu sekciju definiranu zavrsnim body-level sectPr-om.
//
// applied:false (bez izmjene bajtova) kad:
//  - ordinal < 2 (nema prednjeg dijela za rimske listove) ili ciljni <w:p> ne postoji,
//  - dokument ima <w:sectPrChange> (praceni sectPr; enumeracija bi bila kriva) -- kao K4/K5,
//  - ciljni odlomak VEC ima sectPr u pPr (idempotencija: to je vec marker),
//  - odlomak neposredno PRIJE cilja vec ima sectPr u pPr (prijelom vec postoji tocno na Uvodu),
//  - ciljni <w:p> nije na razini tijela (unutar w:tbl / w:txbxContent / w:sdtContent).
export function insertSectionBreakBeforeParagraph(
  documentXml: string,
  paragraphOrdinal: number,
  markerSectPr: string,
): { xml: string; applied: boolean } {
  if (paragraphOrdinal < 2) return { xml: documentXml, applied: false };
  if (/<w:sectPrChange\b/.test(documentXml)) return { xml: documentXml, applied: false };

  // getElementsByTagName('w:p') (analyzeDocx) ne vidi komentare, CDATA ni PI, pa <w:p unutar
  // njih ne smije pomaknuti indeks (inace bi se marker umetnuo u komentar ili ciljao krivi
  // odlomak, npr. round-trip alati znaju ostaviti <w:p u <!-- ... -->). Maskiraj te regije
  // istoduljinskim razmacima: SVE pozicije i svi PRAVI strukturni tagovi ostaju netaknuti pa
  // offset vrijedi i u izvornom documentXml-u. Guardovi rade nad maskiranim XML-om da
  // zakomentiran </w:tbl> i sl. ne pokvare balans razine tijela.
  const masked = documentXml.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g,
    (m) => ' '.repeat(m.length),
  );

  // Pocetne pozicije svih odlomackih tagova (<w:p>, <w:p ...>, <w:p/>), u dokument-poretku.
  // Lookahead [\s/>] iskljucuje <w:pPr>/<w:pStyle>/<w:pgSz>/<w:pgNumType> (nema granice na "P"/"g").
  const starts: number[] = [];
  const pOpen = /<w:p(?=[\s/>])/g;
  for (let m = pOpen.exec(masked); m; m = pOpen.exec(masked)) starts.push(m.index);
  if (paragraphOrdinal > starts.length) return { xml: documentXml, applied: false };

  const targetStart = starts[paragraphOrdinal - 1];
  const prevStart = starts[paragraphOrdinal - 2]; // ordinal >= 2 zajamcen gore
  if (paragraphOwnsSectPr(masked, targetStart)) return { xml: documentXml, applied: false };
  if (paragraphOwnsSectPr(masked, prevStart)) return { xml: documentXml, applied: false };
  if (!isBodyLevelPosition(masked, targetStart)) return { xml: documentXml, applied: false };

  const marker = `<w:p><w:pPr>${markerSectPr}</w:pPr></w:p>`;
  return { xml: documentXml.slice(0, targetStart) + marker + documentXml.slice(targetStart), applied: true };
}

// Umetni <w:footerReference> na POCETAK ciljne sekcije (footerReference/headerReference su
// prvi u CT_SectPr). No-op ako sekcija vec ima BILO KAKAV footerReference (ne diramo tudji
// footer), ako trazeni indeks ne postoji ili ima sectPrChange. Enumeracija = ista kao pgNumType.
export function addFooterReferenceToSection(
  documentXml: string,
  sectionIndex: number,
  rId: string,
  type: 'default' | 'first' | 'even' = 'default',
): PatchResult {
  if (/<w:sectPrChange\b/.test(documentXml)) return { ...NO_OP, xml: documentXml };
  const ref = `<w:footerReference w:type="${type}" r:id="${escapeXmlAttr(rId)}"/>`;
  let idx = -1;
  let applied = false;
  const sectPrPattern = /<w:sectPr\b[^>]*?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g;
  const patched = documentXml.replace(sectPrPattern, (block) => {
    idx += 1;
    if (idx !== sectionIndex) return block;
    if (/<w:footerReference\b/.test(block)) return block; // vec ima footer -> ne diramo
    if (/^<w:sectPr\b[^>]*\/>$/.test(block)) {
      applied = true;
      return block.replace(/\/>$/, `>${ref}</w:sectPr>`);
    }
    const open = block.match(/^<w:sectPr\b[^>]*>/);
    if (!open) return block;
    applied = true;
    return block.replace(open[0], open[0] + ref);
  });
  if (!applied) return { ...NO_OP, xml: documentXml };
  return { xml: ensureRelationshipsNamespace(patched), applied: true, before: {}, after: {}, found: {} };
}

// === Poravnanje broja stranice u postojecem footeru/headeru (word/footerN.xml,
// word/headerN.xml) ===
//
// Za razliku od gornjih footer primitiva (K5, koji DODAJU novi footer part), ovo
// UREDUJE vec postojeci part. Odlomak s PAGE poljem se trazi istim kriterijem kao
// analyzeDocx (PRVI <w:p> ciji tekst sadrzi "PAGE", case-insensitive), pa fixer i
// audit nikad ne mogu gledati razlicit odlomak. Ista SELF_CLOSING_SRC/PAIRED_SRC
// alternacija kao paragraph-cleanup.ts/run-level.ts (ne naivni /<w:p>[\s\S]*?<\/w:p>/g,
// koji moze "progutati" sljedeci pravi odlomak kad mu prethodi samozatvarajuci <w:p/>).

const FOOTER_SELF_CLOSING_SRC = String.raw`<w:p(?:\s[^>]*)?/>`;
const FOOTER_PAIRED_SRC = String.raw`<w:p(?:\s[^>]*[^/>])?>[\s\S]*?</w:p>`;
const FOOTER_PARAGRAPH_RE = new RegExp(`${FOOTER_SELF_CLOSING_SRC}|${FOOTER_PAIRED_SRC}`, 'g');

export function patchFooterPageAlignment(
  partXml: string,
  align: 'left' | 'center' | 'right' = 'right',
): PatchResult {
  FOOTER_PARAGRAPH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FOOTER_PARAGRAPH_RE.exec(partXml))) {
    const block = match[0];
    if (!/\bPAGE\b/i.test(block)) continue;
    const result = patchTagAttributes(block, /<w:jc\b[^>]*\/?>/, { 'w:val': align });
    if (!result.applied) return { ...NO_OP, xml: partXml, found: result.found };
    return {
      xml: partXml.slice(0, match.index) + result.xml + partXml.slice(match.index + block.length),
      applied: true,
      before: result.before,
      after: result.after,
      found: result.found,
    };
  }
  return { ...NO_OP, xml: partXml };
}
