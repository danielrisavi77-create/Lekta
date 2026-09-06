/**
 * OBLICI DOKUMENTA: sto paket STVARNO nosi, mjereno iz njegovih bajtova.
 *
 * Zasto postoji. Generator ulaza je i sam neprovjeren dok mu se ne dokaze da proizvodi oblik koji
 * tvrdi da pokriva (CLAUDE.md, "mjera koja se popravi ne dokazuje da tvoj zahvat radi", pravilo 2).
 * Sintetickom korpusu je to jedina obrana od vlastite slijepe pjege: dokument koji sami napisemo
 * sadrzi oblike na koje smo pomislili, a stvarni radovi su ih dali dvadeset i jedan, redom takvih
 * na koje nitko nije pomislio. Zato svaki generirani dokument u sidecaru TVRDI koje oblike nosi, a
 * ovaj modul tu tvrdnju provjerava nad proizvedenim paketom, ne nad specifikacijom iz koje je nastao.
 *
 * Mjeri se PAKET, ne namjera: ulaz su zip zapisi, ne `DocSpec`. Zbog toga se vidi i ono sto alat
 * doda sam od sebe (rsid, tab stopovi, imena stilova), a upravo je to bio izvor vecine nalaza.
 *
 * Brojka je broj POJAVA dokaza, ne zastavica. Za oblike koji su po definiciji pragovi
 * (`opseg/*-preko-*`) brojka je stvarna vrijednost KAD prag padne, inace nula; time tvrdnja
 * "detektirano >= brojac mutacije" ostaje usporediva s brojacem koji generator upise.
 */
import { deriveDocxFeatures, type DocxParts } from './docx-features';
import {
  headingNumberPrefix,
  looksLikeBibliographyEntry,
  looksLikeTitlePageLabel,
  TOC_ENTRY_TAIL,
} from '../analysis/heading-structure';

/**
 * Imenovani oblici. Popis je zatvoren i namjerno nabraja nalaze iz STVARNOG korpusa (2026-08 i
 * 2026-09), jer je pitanje na koje odgovara "nosi li nas generirani dokument ono na cemu je motor
 * stvarno padao", a ne "je li dokument valjan".
 */
export const DOCX_SHAPE_IDS = [
  // --- pakiranje -----------------------------------------------------------------------------
  /** Zastavica bit 3 bez zapisanog data descriptora; LibreOffice je pise, Word takav paket odbija. */
  'zip/bit3',
  /** DEFLATE zapisi; nas graditelj fixtura pise iskljucivo nekomprimirano (metoda 0). */
  'zip/deflate',
  /** Direktorijski zapisi u zipu; dio izmjerenog Google Docs otiska (89 od 100 datoteka). */
  'zip/direktoriji',
  /** Nedostaje `word/settings.xml`; bez njega je `field-integrity-fixer` vracao `no-target`. */
  'paket/bez-settings',
  /** `.png` u paketu bez `Default` unosa za png; naslo se na 1 od 246 stvarnih radova. */
  'paket/bez-png-default',
  /** Zivi komentari (`w:comment`). */
  'paket/komentari',
  /** Dio `comments.xml` POSTOJI a prazan je; potpis ne-Word alata, 15 od 95 padova harnessa. */
  'paket/comments-prazan',
  // --- stilovi i oblikovanje -----------------------------------------------------------------
  /** Tijelo rada u stilu koji NIJE `Normal` (BodyText, NormalWeb, Standardno): izvor lazne tvrdnje popravka. */
  'stil/tijelo-nije-normal',
  /** `<w:tab/>` unutar naslova: 32 od 38 stvarnih radova, 0 commitanih fixtura. */
  'naslov/tab-u-naslovu',
  /** Naslovi postoje ali nijedan nije razine 1: hijerarhija prolazi vakuumski. */
  'naslov/samo-razina-3',
  /** Tab stop s tockastom vodilicom; popravljeni paket s njim Word odbija otvoriti. */
  'tab/tocke-vodic',
  /** Runovi s `w:cs`/`w:eastAsia` fontom bez `w:ascii`; na jednom radu 57 posto teksta. */
  'font/samo-cs-eastAsia',
  /** `w:rsid*` na odlomcima; Word ih pise gotovo svugdje, nas graditelj nikad. */
  'rsid/svaki-odlomak',
  /** Dio runova nosi `w:sz`, dio ga nasljeduje: ulaz za kaskadu `dominantDirectRunSize`. */
  'velicina/sz-mjesovito',
  /** `xml:space="preserve"`; bez njega razmak izmedu natpisa i broja nestaje (RE-57). */
  'xml/space-preserve',
  // --- tekst -----------------------------------------------------------------------------------
  /** Kosi padez u unakrsnoj uputi ("u Tablici 1"); nominativ je bio jedini prepoznat izraz (RE-58). */
  'tekst/kosi-padez',
  /** Numerirana bibliografska stavka; jedna takva je promovirana u naslov i usla u sadrzaj. */
  'tekst/biblio-kandidat',
  /** Natpis vrste rada velikim slovima na naslovnici; "ZAVRSNI RAD" je bio prepoznat kao naslov. */
  'tekst/naslovnica-natpis',
  // --- sadrzaj (TOC) ---------------------------------------------------------------------------
  /** Zivo TOC polje. */
  'toc/polje',
  /** Naslov "Sadrzaj" bez polja: uvjet pod kojim `toc-field-fixer` uopce ima sto raditi. */
  'toc/rucno-tipkan',
  /** Polja oznacena `w:dirty`: spremljeni rezultat je ustajao, sto je davalo laznu regresiju. */
  'toc/ustajao-dirty',
  // --- provenijencija --------------------------------------------------------------------------
  'proizvodjac/word',
  'proizvodjac/libreoffice',
  'proizvodjac/google-docs',
  'proizvodjac/nepoznat',
  /** Izmjeren Google Docs potpis: `docProps/app.xml` postoji bez `<Application>`. */
  'gdocs/potpis',
  // --- opseg (pragovi) -------------------------------------------------------------------------
  /** Vise od 400 odlomaka: 24 od 38 stvarnih radova, 0 od 12 commitanih. */
  'opseg/odlomci-preko-400',
  /** Vise od 20 praznih odlomaka: 34 od 38 stvarnih, 0 od 12 commitanih. */
  'opseg/prazni-preko-20',
  /** Vise od 3 sekcije: 7 od 38 stvarnih, 0 od 12 commitanih. */
  'opseg/sekcije-preko-3',
] as const;

export type DocxShapeId = (typeof DOCX_SHAPE_IDS)[number];
export type DocxShapeCounts = Record<DocxShapeId, number>;

/** Zip zapis onoliko koliko ovom modulu treba; strukturni tip da se ne vuce cijeli zip codec. */
export interface ShapeZipEntry {
  name: string;
  data: Uint8Array;
  raw?: { generalPurposeFlag: number; compressionMethod: number };
}

const TEXT_PARTS = /\.(xml|rels)$/i;

function countMatches(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length;
}

/** Odlomci `word/document.xml` kao sirovi XML, jedan po elementu `w:p`. */
function paragraphBlocks(doc: string): string[] {
  return doc.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? [];
}

/**
 * Spojeni tekst odlomka.
 *
 * Cita se SPOJENI tekst, ne sirovi XML, jer se dio kvarova u XML-u uopce ne vidi: Word tekst dijeli
 * na runove po sitnim razlikama oblikovanja, pa "Tablici 1" zna biti razlomljeno na tri `w:t`.
 *
 * `<w:tab/>` daje TABULATOR, a `<w:br/>` prijelom retka, tocno kako ih emitira parser motora. To
 * nije kozmetika: bez toga naslov `1.<tab>UVOD` ima spojeni tekst "1.UVOD", bez ijednog razmaka, pa
 * ga `headingNumberPrefix` (koji trazi razmak iza broja) ne prepozna i oblik se tiho izgubi. Upravo
 * je ta razlika izmedju teksta parsera i teksta izvlacenja i bila izvorni kvar sidra.
 */
function paragraphText(block: string): string {
  const parts = block.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g) ?? [];
  return parts
    .map((t) => {
      if (/^<w:tab/.test(t)) return '\t';
      if (/^<w:br/.test(t)) return '\n';
      return t.replace(/^<w:t\b[^>]*>/, '').replace(/<\/w:t>$/, '');
    })
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, String.fromCharCode(39))
    .replace(/&amp;/g, '&');
}

/** Razina naslova iz `w:pStyle` ili `w:outlineLvl`, ili 0 kad odlomak nije STILIZIRAN naslov. */
function headingLevel(block: string): number {
  const style = /<w:pStyle\b[^>]*w:val="([^"]*)"/.exec(block)?.[1] ?? '';
  const m = /^(?:Heading|Naslov)[\s_-]?(\d)/i.exec(style);
  if (m) return Number(m[1]);
  const outline = /<w:outlineLvl\b[^>]*w:val="(\d+)"/.exec(block)?.[1];
  return outline === undefined ? 0 : Number(outline) + 1;
}

/**
 * Je li odlomak naslov onako kako ga vidi POPRAVAK, dakle ukljucujuci nestilizirane.
 *
 * Zasto sire od `headingLevel`, izmjereno na `tests/fixtures/docx-word/anchor-cases.docx`: taj
 * fixture je Word COM-om izgradjen bas da nosi `1.<tab>UVOD`, a njegov odlomak nema ni `w:pStyle`
 * ni `w:outlineLvl`. Provjera po stilu bi ga propustila i oblik bi izgledao nepokriven na jedinoj
 * datoteci koja ga ima. Isto vrijedi za stvarne radove: naslov bez stila je ondje pravilo, ne
 * iznimka, i upravo je zato `heading-style` popravak i nastao.
 *
 * Predikati dolaze iz motora (`src/analysis/heading-structure.ts`), ne iz vlastite procjene, i oba
 * izuzeca su IZMJERENA, ne pretpostavljena:
 *
 * - numerirana bibliografska stavka takodjer pocinje brojem, a jednoj takvoj je popravak doista
 *   upisao `Heading1` na stvarnom radu;
 * - RUCNO TIPKANA stavka sadrzaja ("1. Uvod<tab>3") pocinje brojem I sadrzi tabulator, dakle ima
 *   oba obiljezja ovog oblika a nije naslov. Izmjereno na `tests/fixtures/docx-word/manual-toc.docx`:
 *   bez ovog izuzeca detektor je ondje javio pet "naslova s tabom", pa bi svaki dokument s rucnim
 *   sadrzajem lazno tvrdio oblik koji ne nosi.
 */
function isHeadingLike(block: string, text: string): boolean {
  if (headingLevel(block) > 0) return true;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 180) return false;
  if (looksLikeBibliographyEntry(trimmed)) return false;
  if (TOC_ENTRY_TAIL.test(text)) return false;
  return headingNumberPrefix(trimmed) !== null;
}

/**
 * Stilovi tijela rada koji NISU `Normal`.
 *
 * Popis je izmjeren, ne pretpostavljen: LibreOffice pise `Text body`/`Textbody`, Word za zalijepljen
 * web sadrzaj `NormalWeb`, hrvatski Word `Standardno`. Naslovi, natpisi i fusnote su izuzeti jer
 * njihov vlastiti stil nije kvar.
 */
const NON_NORMAL_BODY_STYLE = /^(?:BodyText|TextBody|Textbody|NormalWeb|Standard|Standardno|Obican)/i;

/** Kosi padezi u unakrsnim uputama; nominativ ("Tablica 1") NIJE ovdje, njega je motor vec znao. */
const OBLIQUE_REFERENCE =
  /\b(?:u|na|prema|iz|o|pod|uz)\s+(?:Tablic(?:i|u)|Slic(?:i|u)|Grafikon(?:u|a)|Prilog(?:u|a)|Shem(?:i|u))\s+\d+/gi;

/** Prazna ljestvica; svaki oblik postoji kao kljuc i kad ga nema, da potrosac ne razlikuje 0 od "nije mjereno". */
function emptyCounts(): DocxShapeCounts {
  const out = {} as DocxShapeCounts;
  for (const id of DOCX_SHAPE_IDS) out[id] = 0;
  return out;
}

/**
 * Izmjeri oblike u paketu.
 *
 * Ulaz su procitani zip zapisi (`readZip`), jer se dva oblika (`zip/bit3`, `zip/deflate`) vide samo
 * u zaglavlju zapisa, a ne u XML-u.
 */
export function detectShapes(entries: ReadonlyArray<ShapeZipEntry>): DocxShapeCounts {
  const counts = emptyCounts();
  const decoder = new TextDecoder();
  const parts: DocxParts = {};
  for (const entry of entries) {
    if (TEXT_PARTS.test(entry.name)) parts[entry.name] = decoder.decode(entry.data);
  }
  const doc = parts['word/document.xml'] ?? '';
  const styles = parts['word/styles.xml'] ?? '';
  const features = deriveDocxFeatures(parts);

  // --- pakiranje -------------------------------------------------------------------------------
  for (const entry of entries) {
    if (entry.raw && (entry.raw.generalPurposeFlag & 0x0008) !== 0) counts['zip/bit3'] += 1;
    if (entry.raw && entry.raw.compressionMethod === 8) counts['zip/deflate'] += 1;
    if (entry.name.endsWith('/')) counts['zip/direktoriji'] += 1;
  }
  if (doc && parts['word/settings.xml'] === undefined) counts['paket/bez-settings'] = 1;

  const contentTypes = parts['[Content_Types].xml'] ?? '';
  const hasPng = entries.some((e) => /^word\/media\/.*\.png$/i.test(e.name));
  if (hasPng && !/Extension="png"/i.test(contentTypes)) counts['paket/bez-png-default'] = 1;

  counts['paket/komentari'] = features.comments;
  if (parts['word/comments.xml'] !== undefined && features.comments === 0) counts['paket/comments-prazan'] = 1;

  // --- stilovi, oblikovanje i tekst po odlomku -------------------------------------------------
  const blocks = paragraphBlocks(doc);
  let emptyParagraphs = 0;
  let headingsAtOne = 0;
  let headingsDeep = 0;
  for (const block of blocks) {
    const level = headingLevel(block);
    const text = paragraphText(block);
    const style = /<w:pStyle\b[^>]*w:val="([^"]*)"/.exec(block)?.[1] ?? '';
    if (NON_NORMAL_BODY_STYLE.test(style)) counts['stil/tijelo-nije-normal'] += 1;
    if (/<w:tab\s*\/>/.test(block) && isHeadingLike(block, text)) counts['naslov/tab-u-naslovu'] += 1;
    if (looksLikeBibliographyEntry(text.trim())) counts['tekst/biblio-kandidat'] += 1;
    if (looksLikeTitlePageLabel(text)) counts['tekst/naslovnica-natpis'] += 1;
    if (level === 1) headingsAtOne += 1;
    if (level >= 3) headingsDeep += 1;
    if (text.trim() === '') emptyParagraphs += 1;
  }
  if (headingsDeep > 0 && headingsAtOne === 0) counts['naslov/samo-razina-3'] = headingsDeep;

  counts['tab/tocke-vodic'] = countMatches(doc, /w:leader="dot"/g) + countMatches(styles, /w:leader="dot"/g);

  const rFonts = doc.match(/<w:rFonts\b[^>]*\/?>/g) ?? [];
  counts['font/samo-cs-eastAsia'] = rFonts.filter(
    (tag) => /w:(?:cs|eastAsia)=/.test(tag) && !/w:ascii=/.test(tag),
  ).length;

  counts['rsid/svaki-odlomak'] = countMatches(doc, /\sw:rsidR="/g);

  // Nazivnik ukljucuje i runove koji velicinu NASLJEDUJU: mjera koja gleda samo nositelje `w:sz`
  // uklanja vlastiti ucinak iz vlastitog ulaza i ne konvergira (CLAUDE.md, pravilo 4).
  const runCount = countMatches(doc, /<w:r[\s>]/g);
  const runsWithSize = countMatches(doc, /<w:sz\s/g);
  if (runsWithSize > 0 && runsWithSize < runCount) counts['velicina/sz-mjesovito'] = runsWithSize;

  counts['xml/space-preserve'] = countMatches(doc, /xml:space="preserve"/g);

  // Kosi padez se broji nad SPOJENIM tekstom odlomka, ne nad XML-om: izraz "u Tablici 1" Word zna
  // razlomiti na tri `w:t` po sitnoj razlici oblikovanja, pa bi mjera nad sirovim XML-om javila nulu.
  counts['tekst/kosi-padez'] = countMatches(blocks.map(paragraphText).join('\n'), OBLIQUE_REFERENCE);

  // --- sadrzaj ---------------------------------------------------------------------------------
  if (features.hasTocField) counts['toc/polje'] = countMatches(doc, /<w:instrText[^>]*>[^<]*TOC/gi) || 1;
  if (features.hasTocHeadingWithoutField) counts['toc/rucno-tipkan'] = 1;
  counts['toc/ustajao-dirty'] = countMatches(doc, /w:dirty="(?:true|1|on)"/g);

  // --- provenijencija --------------------------------------------------------------------------
  const familyKey = {
    word: 'proizvodjac/word',
    libreoffice: 'proizvodjac/libreoffice',
    'google-docs': 'proizvodjac/google-docs',
    unknown: 'proizvodjac/nepoznat',
  } as const;
  counts[familyKey[features.producerFamily]] = 1;

  // Google Docs otisak: `docProps/app.xml` postoji a NEMA `<Application>`. Izmjereno nad 100
  // datoteka; `custom.xml` i direktorijski zapisi su prateci znakovi, ne uvjet, pa se broje odvojeno.
  const app = parts['docProps/app.xml'];
  if (app !== undefined && !/<Application>/.test(app)) counts['gdocs/potpis'] = 1;

  // --- opseg -----------------------------------------------------------------------------------
  if (features.paragraphs > 400) counts['opseg/odlomci-preko-400'] = features.paragraphs;
  if (emptyParagraphs > 20) counts['opseg/prazni-preko-20'] = emptyParagraphs;
  if (features.sections > 3) counts['opseg/sekcije-preko-3'] = features.sections;

  return counts;
}

/** Oblici koje paket NOSI (brojka > 0), sortirano; oblik zapisa `shapes.claimed` u sidecaru. */
export function presentShapes(counts: DocxShapeCounts): DocxShapeId[] {
  return DOCX_SHAPE_IDS.filter((id) => counts[id] > 0);
}

/** Nalaz usporedbe TVRDNJE iz sidecara sa stvarnim paketom. */
export interface ShapeClaimVerdict {
  /** Tvrdjeni oblici kojih u paketu NEMA: generator tvrdi ono sto ne proizvodi. */
  missing: string[];
  /** Imena koja nisu u zatvorenom popisu: tipfeler u sidecaru inace tiho prolazi kao ispunjen. */
  unknown: string[];
  /** Mutacije s brojacem koji paket ne potvrdjuje, kao `ime: brojac>detektirano`. */
  underDetected: string[];
}

/**
 * Provjeri sto sidecar TVRDI o paketu protiv onoga sto paket nosi.
 *
 * Zasto je ovo odvojena i cista funkcija: mutacijski test mora moci podmetnuti tvrdnju bez citanja
 * ijedne datoteke, a gard koji bi tvrdnju provjeravao samo unutar cjelovitog prolaza ne bi imao
 * kako dokazati da grize. Brojac na nuli je NALAZ, ne uspjeh: mehanizam koji nista ne proizvodi je
 * mrtav kod ma sto nizvodna mjera pokazivala (CLAUDE.md, "mehanizam mora imati vlastiti brojac").
 */
export function verifyShapeClaims(
  claimed: readonly string[],
  counts: DocxShapeCounts,
  mutationCounters: Readonly<Record<string, number>> = {},
  shapeForMutation: Readonly<Record<string, DocxShapeId>> = {},
): ShapeClaimVerdict {
  const known = new Set<string>(DOCX_SHAPE_IDS);
  const unknown = claimed.filter((id) => !known.has(id));
  const missing = claimed.filter((id) => known.has(id) && counts[id as DocxShapeId] <= 0);
  const underDetected: string[] = [];
  for (const [name, counter] of Object.entries(mutationCounters)) {
    const shape = shapeForMutation[name];
    if (shape === undefined) continue;
    if (counter <= 0) {
      underDetected.push(`${name}: brojac 0 (mrtav mehanizam)`);
      continue;
    }
    const detected = counts[shape] ?? 0;
    if (detected < counter) underDetected.push(`${name}: brojac ${counter} > detektirano ${detected}`);
  }
  return { missing, unknown, underDetected };
}
