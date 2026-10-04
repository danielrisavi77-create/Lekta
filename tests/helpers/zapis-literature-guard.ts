/**
 * Z36 (odluka vlasnika 2026-10-03, "svo troje"): gardovi za dodavanje zapisa literature.
 *
 * Svaki gard prima IMPLEMENTACIJU kao argument i vraca popis problema (prazan = cisto), pa isti gard
 * koristi i obican test (stvarna implementacija mora dati []) i tests/gate-mutations.test.ts
 * (mutirani izvor mora dati barem jedan problem s ocekivanom oznakom).
 *
 * Generatori ulaza su namjerno doslovni: svaki popis literature je vec abecedan po hr kolaciji, a
 * mjesto umetanja se racuna iz susjeda u spojenom tekstu odlomaka, nikad iz sirovog XML-a.
 */
import { analyzeBibliographyStructure, bibliographyAnchorFingerprint } from '../../src/analysis/bibliography-structure';
import { citationAnchorFingerprint } from '../../src/analysis/citation-bibliography-sync';
import { extractCitationOccurrences } from '../../src/citations/author-year';
import { parseXml, paragraphText as parserParagraphText } from '../../src/docx/parser';
import type { citationBibliographySyncFixer } from '../../src/repair/citation-bibliography-sync-fixer';
import type { validateAssistedParams } from '../../src/repair/contract/assisted-request-policy';
import type { citationBibliographySyncRepairableItem, citationEntryInsertionAllowed } from '../../src/ui/repair-items';
import type { ParamAuthorityMap, resolveParams } from '../../src/repair/param-authority';
import type { PassRegression, RegressionCheckLike } from '../../src/analysis/repair-regression';
import type { VerifiedOutcomeSource, VerifiedRepairOutcome } from '../../src/repair/repair-outcome-verified';

type SyncFixer = typeof citationBibliographySyncFixer;

const paragraph = (text: string) => `<w:p><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** Spojeni tekst svakog odlomka tijela (w:t unutar w:p), s dekodiranim entitetima. */
export function paragraphTexts(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map((match) => [...match[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((t) => t[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join(''));
}

export const entryText = (surname: string, year: string) => `${surname}, A. (${year}). Naslov djela ${surname}.`;

interface CaseOptions {
  /** Naslov popisa; "References" analiza prepoznaje samo kao en popis. */
  heading?: string;
  /** Doslovni zapisi umjesto `entryText` (zakon bez autora, zapis s DOI-jem). */
  rawEntries?: string[];
  /** Odlomci iza popisa: tekst ili gotov `<w:p>` (npr. naslov sa stilom). */
  after?: string[];
  /** Gotov `<w:p>` s citatom (npr. s Wordovom oznakom); tekst mu mora biti `citationText`. */
  citationXml?: string;
  /** Zadnji zapis zavrsava sekciju (`w:sectPr` u svojstvima odlomka), npr. kad Prilozi idu u novu sekciju. */
  sectionBreakOnLast?: boolean;
  /** Gotov `<w:p>` za zapis (npr. s poljem); tekst mu mora biti `text`. */
  entryXml?: (text: string, index: number) => string;
  /** Omot oko zapisa popisa (npr. `w:sdt` s `w:sdtContent`). */
  listWrap?: [string, string];
}

/** Prijelom sekcije u svojstvima odlomka, kakav Word pise na zadnji odlomak sekcije. */
const SECTION_BREAK = '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
const sectionEndParagraph = (text: string) => `<w:p><w:pPr><w:ind w:left="720" w:hanging="720"/>${SECTION_BREAK}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** Tekstovi odlomaka koji nose prijelom sekcije u svojstvima (tijelo dokumenta, ne zavrsni `w:sectPr`). */
export function sectionEndTexts(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].filter((match) => /<w:sectPr\b/.test(match[1])).map((match) => paragraphTexts(match[0])[0]);
}

/** Dokument: odlomak s citatom, naslov popisa i zadani (abecedni) zapisi, po izboru i odlomci iza. */
export function syncCase(citationText: string, citationRaw: string, surnames: Array<[string, string]>, options: CaseOptions = {}) {
  const entries = options.rawEntries ?? surnames.map(([surname, year]) => entryText(surname, year));
  const after = (options.after ?? []).map((item) => (item.startsWith('<w:p') ? item : paragraph(item))).join('');
  const entryXml = entries.map((text, index) => (options.entryXml ? options.entryXml(text, index) : options.sectionBreakOnLast && index === entries.length - 1 ? sectionEndParagraph(text) : paragraph(text))).join('');
  const [open, close] = options.listWrap ?? ['', ''];
  const documentXml = `<w:document><w:body>${options.citationXml ?? paragraph(citationText)}${paragraph(options.heading ?? 'Literatura')}${open}${entryXml}${close}${after}<w:sectPr/></w:body></w:document>`;
  const start = citationText.indexOf(citationRaw);
  const lastIndex = 2 + entries.length;
  const params: Parameters<SyncFixer>[1] = {
    version: 1,
    citations: [{ id: 'c1', paragraphIndex: 1, start, end: start + citationRaw.length, anchorFingerprint: citationAnchorFingerprint(1, citationText), replacementText: citationRaw, reason: 'citat uz dodani zapis literature' }],
    entries: [{ id: 'sync-entry-c1', paragraphIndices: [], anchorFingerprint: '', action: 'add', citationId: 'c1', insertionAnchor: { paragraphIndex: lastIndex, anchorFingerprint: bibliographyAnchorFingerprint([lastIndex], entries.at(-1)!) } }],
    mappings: [{ citationId: 'c1', bibliographyEntryId: 'sync-entry-c1', confirmed: true }],
  };
  return { parts: { documentXml, stylesXml: '' }, params, before: paragraphTexts(documentXml) };
}

const BASE: Array<[string, string]> = [['Cvitan', '2015'], ['Čuljak', '2016'], ['Dukić', '2017'], ['Horvat', '2020'], ['Sušić', '2018'], ['Zubak', '2019']];

/**
 * Ocekivani susjedi za svaki slucaj. Dijakriticki slucajevi su odabrani tako da hr kolacija daje
 * DRUGO mjesto od korijenske (en) kolacije i od usporedbe po kodnim tockama: "Čavić" je po hr iza
 * "Cvitan" (č iza c), a po korijenskoj ispred (a ispred v).
 */
const PLACEMENT_CASES: Array<{ tag: string; surname: string; year: string; after: string | null; beforeSurname: string | null }> = [
  { tag: 'abeceda:pocetak', surname: 'Babić', year: '2021', after: null, beforeSurname: 'Cvitan' },
  { tag: 'abeceda:sredina', surname: 'Novak', year: '2022', after: 'Horvat', beforeSurname: 'Sušić' },
  { tag: 'abeceda:kraj', surname: 'Zupan', year: '2014', after: 'Zubak', beforeSurname: null },
  { tag: 'dijakritika:č', surname: 'Čavić', year: '2013', after: 'Cvitan', beforeSurname: 'Čuljak' },
  { tag: 'dijakritika:ć', surname: 'Ćaćić', year: '2012', after: 'Čuljak', beforeSurname: 'Dukić' },
  { tag: 'dijakritika:đ', surname: 'Đakić', year: '2011', after: 'Dukić', beforeSurname: 'Horvat' },
  { tag: 'dijakritika:š', surname: 'Šarić', year: '2010', after: 'Sušić', beforeSurname: 'Zubak' },
  { tag: 'dijakritika:ž', surname: 'Žabić', year: '2009', after: 'Zubak', beforeSurname: null },
];

export const template = (surname: string, year: string) => `${surname}, [ime]. (${year}). [Naslov djela]. [Mjesto: Izdavač].`;

type Paragraphs = Array<{ index: number; text: string; headingLevel?: number | null }>;
const numbered = (texts: string[], headings: number[] = []): Paragraphs => texts.map((text, i) => ({ index: i + 1, text, headingLevel: headings.includes(i + 1) ? 1 : null }));

/**
 * Bodovana provjera "Abecedni poredak literature" (analyze-docx): zapisi s autorom, `sortKey`, uvijek
 * hr kolacija, bez obzira na jezik popisa. Popis cita ista analiza kao i ona (s razinama naslova).
 */
function scoredAlphabetical(paragraphs: Paragraphs, language: 'hr' | 'en'): boolean {
  const authored = analyzeBibliographyStructure(paragraphs, language).entries.filter((entry) => entry.sortKey).map((entry) => entry.sortKey);
  const sorted = [...authored].sort((a, b) => a.localeCompare(b, 'hr'));
  return authored.length > 0 && authored.every((key, index) => key === sorted[index]);
}

/** Uvodi u citat koji nisu prezime, s tockom ili bez nje, malim ili velikim slovom. */
const INTRO_CASES: Array<[string, string]> = [
  ['uvod:e.g.', 'e.g., Novak, 2022'],
  ['uvod:see', 'see Novak, 2022'],
  ['uvod:npr.', 'npr. Novak, 2022'],
  ['uvod:See', 'See Novak, 2022'],
  ['uvod:Usporedi', 'Usporedi Novak, 2022'],
];

/**
 * Gard granica popisa: zapis bez autora, en popis s dijakritikom, naslov iza popisa, uvodi u citat
 * i citat u odlomku s oznakom. Svaki generator najprije dokazuje da proizvodi ciljanu klasu ulaza.
 */
function granicePopisaProblemi(fixer: SyncFixer, problems: string[]): void {
  // Zakon bez autora: strukturna provjera ga razvrstava po kanonskom tekstu ("zakon..."), bodovana ga
  // preskace. Zapis "Novak" mora stati ispred njega, inace popravak sam obori strukturnu provjeru.
  const law = syncCase('Tekst rada (Novak, 2022).', 'Novak, 2022', [], { rawEntries: ['Horvat, A. (2020). Naslov.', 'Kovač, B. (2018). Naslov.', 'Zakon o znanstvenoj djelatnosti, NN 123/03'] });
  const lawBefore = analyzeBibliographyStructure(numbered(law.before), 'hr');
  if (!lawBefore.alphabetical.expected || lawBefore.entries.at(-1)?.sortKey !== '') problems.push('bez-autora: ulaz nema abecedan popis sa zapisom bez autora na kraju');
  const lawAfter = paragraphTexts(fixer(law.parts, law.params).parts.documentXml);
  if (lawAfter.indexOf(template('Novak', '2022')) !== lawAfter.indexOf(law.before.at(-1)!) - 1) problems.push(`bez-autora: predlozak nije ispred zakona (${JSON.stringify(lawAfter)})`);
  if (!analyzeBibliographyStructure(numbered(lawAfter), 'hr').alphabetical.expected) problems.push('bez-autora: strukturna provjera abecede pada nakon umetanja');

  // en popis: analiza ga prepoznaje samo po naslovu "References", a bodovana provjera i dalje sudi hr
  // kolacijom, u kojoj je č iza svih c. Korijenska (en) kolacija bi "Čapek" stavila na vrh.
  const english = syncCase('Text (Čapek, 2021).', 'Čapek, 2021', [], { heading: 'References', rawEntries: ['Cook, A. (2019). Title.', 'Cvitan, B. (2020). Title.', 'Dorn, C. (2018). Title.'] });
  if (analyzeBibliographyStructure(numbered(english.before), 'hr').entries.length || !scoredAlphabetical(numbered(english.before), 'en')) problems.push('kolacija:en-popis: ulaz nije abecedan en popis');
  const englishAfter = paragraphTexts(fixer(english.parts, english.params).parts.documentXml);
  if (!englishAfter.includes(template('Čapek', '2021'))) problems.push('kolacija:en-popis: predlozak nije umetnut');
  else if (!scoredAlphabetical(numbered(englishAfter), 'en')) problems.push(`kolacija:en-popis: bodovana provjera abecede pada (${JSON.stringify(englishAfter)})`);

  // Naslov iza popisa: zadnji zapis zavrsava DOI-jem (bez tocke), pa bi ga analiza bez razina naslova
  // spojila s naslovom i tekstom iza. Predlozak "Zupan" (iza "Zubak") mora ostati u popisu.
  const headingXml = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Popis priloga</w:t></w:r></w:p>';
  const tail = syncCase('Tekst rada (Zupan, 2022).', 'Zupan, 2022', [], {
    rawEntries: ['Horvat, A. (2019). Naslov. https://doi.org/10.1/a', 'Zubak, B. (2020). Naslov. https://doi.org/10.1/b'],
    after: [headingXml, 'Anketni upitnik korišten u istraživanju', 'Prilog 1. Upitnik'],
  });
  const headingIndex = tail.before.indexOf('Popis priloga') + 1;
  if (analyzeBibliographyStructure(numbered(tail.before), 'hr').entries.at(-1)?.paragraphIndices.length === 1) problems.push('naslov-iza-popisa: ulaz ne lijepi sekciju na zadnji zapis bez razina naslova');
  if (analyzeBibliographyStructure(numbered(tail.before, [headingIndex]), 'hr').entries.at(-1)?.paragraphIndices.join() !== String(headingIndex - 1)) problems.push('naslov-iza-popisa: analiza s razinama ne zavrsava popis na zadnjem zapisu');
  const tailAfter = paragraphTexts(fixer(tail.parts, tail.params).parts.documentXml);
  if (tailAfter.indexOf(template('Zupan', '2022')) !== tailAfter.indexOf(tail.before[headingIndex - 2]) + 1) problems.push(`naslov-iza-popisa: predlozak nije odmah iza zadnjeg zapisa (${JSON.stringify(tailAfter)})`);

  // Uvodi u citat nisu prezime: nista se ne umece.
  for (const [tag, raw] of INTRO_CASES) {
    const intro = syncCase(`Tekst rada (${raw}).`, raw, BASE);
    const result = fixer(intro.parts, intro.params);
    if (result.applied || paragraphTexts(result.parts.documentXml).some((text) => text.includes('[ime]'))) problems.push(`${tag}: uvod u citat usao je u zapis kao prezime`);
  }

  // Citat u odlomku s Wordovom oznakom (_GoBack): odlomak se samo cita, pa i predlozak i korisnikov
  // zapis moraju proci, a odlomak citata ostaje bajt-isti.
  const marked = 'Tekst rada (Novak, 2022).';
  const markedXml = `<w:p><w:bookmarkStart w:id="0" w:name="_GoBack"/><w:r><w:t xml:space="preserve">${marked}</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>`;
  const bookmark = syncCase(marked, 'Novak, 2022', BASE, { citationXml: markedXml });
  if (!bookmark.parts.documentXml.includes('w:bookmarkStart')) problems.push('oznaka: ulaz nema oznaku u odlomku citata');
  const viaTemplate = fixer(bookmark.parts, bookmark.params);
  if (!viaTemplate.applied || !paragraphTexts(viaTemplate.parts.documentXml).includes(template('Novak', '2022'))) problems.push(`oznaka: predlozak nije umetnut (${viaTemplate.reason})`);
  const literalText = 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.';
  const viaLiteral = fixer(bookmark.parts, { ...bookmark.params, entries: [{ ...bookmark.params.entries[0], citationId: undefined, replacementText: literalText }] });
  if (!viaLiteral.applied || !paragraphTexts(viaLiteral.parts.documentXml).includes(literalText)) problems.push(`oznaka: korisnikov zapis nije umetnut (${viaLiteral.reason})`);
  if (!viaTemplate.parts.documentXml.includes(markedXml)) problems.push('oznaka: odlomak citata je prepisan');

  uvodiIRazmaciProblemi(fixer, problems);
  sekcijeIVisodlomacniProblemi(fixer, problems);
  odmaciProblemi(fixer, problems);
  poljaIKontroleProblemi(fixer, problems);
  okviriProblemi(fixer, problems);
}

const FIELD_BEGIN = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>';
const FIELD_SEPARATE = '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
const FIELD_END = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
const instruction = (code: string) => `<w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r>`;
const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const LIST_PPR = '<w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr>';

/**
 * Z36 krug 4: popis literature kao Wordovo polje (BIBLIOGRAPHY, fldChar begin u prvom zapisu) ili u
 * kontroli sadrzaja (w:sdtContent). Zapis koji bi zavrsio izmedju begin i end polja ili unutar
 * kontrole se ne umece (razlog u skippedActions, dokument bajt-isti, drugi prolaz isti); bez polja se
 * umece kao i prije. Generator za svaki ulaz dokazuje gdje su granice polja i kontrole.
 */
function poljaIKontroleProblemi(fixer: SyncFixer, problems: string[]): void {
  const surnames: Array<[string, string]> = [['Cvitan', '2015'], ['Horvat', '2020'], ['Zubak', '2019']];
  const texts = surnames.map(([surname, year]) => entryText(surname, year));
  const literalText = 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.';
  const literal = (params: ReturnType<typeof syncCase>['params']) => ({ ...params, entries: [{ ...params.entries[0], citationId: undefined, replacementText: literalText }] });
  // Polje preko tri zapisa: begin i separate u prvom, end u zadnjem (endInTrailing: u praznom odlomku iza).
  const fieldEntry = (endInTrailing: boolean, nested = false, comment = '') => (text: string, index: number) => `<w:p>${LIST_PPR}${index === 0 ? `${FIELD_BEGIN}${instruction('BIBLIOGRAPHY')}${FIELD_SEPARATE}` : ''}${nested && index === 1 ? `${FIELD_BEGIN}${instruction('HYPERLINK "https://doi.org/10.1/x"')}${FIELD_SEPARATE}${run(text)}${FIELD_END}` : run(text)}${index === 1 ? comment : ''}${!endInTrailing && index === surnames.length - 1 ? FIELD_END : ''}</w:p>`;
  // Pregled drugog providera: komentar s oznakom kraja polja ili kontrole nije oznaka i ne zatvara ih.
  const commentedEnd = '<!-- <w:fldChar w:fldCharType="end"/> -->';
  const commentedControlEnd = '<!-- </w:sdtContent> -->';
  const trailingEnd = `<w:p>${FIELD_END}</w:p>`;
  const cases: Array<{ tag: string; options: CaseOptions; literal: boolean; inserted: boolean; inside: 'polje' | 'kontrola' | null }> = [
    { tag: 'polje:predlozak', options: { rawEntries: texts, entryXml: fieldEntry(false) }, literal: false, inserted: false, inside: 'polje' },
    { tag: 'polje:korisnikov-zapis', options: { rawEntries: texts, entryXml: fieldEntry(true), after: [trailingEnd] }, literal: true, inserted: false, inside: 'polje' },
    { tag: 'polje:ugnijezdeno', options: { rawEntries: texts, entryXml: fieldEntry(false, true) }, literal: false, inserted: false, inside: 'polje' },
    { tag: 'polje:korisnikov-zapis-iza-polja', options: { rawEntries: texts, entryXml: fieldEntry(false) }, literal: true, inserted: true, inside: null },
    { tag: 'kontrola:predlozak', options: { rawEntries: texts, listWrap: ['<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Bibliographies"/></w:docPartObj></w:sdtPr><w:sdtContent>', '</w:sdtContent></w:sdt>'] }, literal: false, inserted: false, inside: 'kontrola' },
    { tag: 'kontrola:korisnikov-zapis', options: { rawEntries: texts, listWrap: ['<w:sdt><w:sdtContent>', '</w:sdtContent></w:sdt>'] }, literal: true, inserted: false, inside: 'kontrola' },
    { tag: 'polje:komentar-zatvara', options: { rawEntries: texts, entryXml: fieldEntry(false, false, commentedEnd) }, literal: false, inserted: false, inside: 'polje' },
    { tag: 'kontrola:komentar-zatvara', options: { rawEntries: texts, listWrap: [`<w:sdt><w:sdtContent>${commentedControlEnd}`, '</w:sdtContent></w:sdt>'] }, literal: true, inserted: false, inside: 'kontrola' },
    { tag: 'bez-polja:predlozak', options: { rawEntries: texts }, literal: false, inserted: true, inside: null },
    { tag: 'bez-polja:korisnikov-zapis', options: { rawEntries: texts }, literal: true, inserted: true, inside: null },
  ];
  for (const item of cases) {
    const built = syncCase('Tekst rada (Novak, 2022).', 'Novak, 2022', [], item.options);
    const xml = built.parts.documentXml;
    // Generator: tekst zapisa je isti kao bez polja, a granice polja i kontrole su tamo gdje slucaj tvrdi.
    if (JSON.stringify(built.before.slice(2, 5)) !== JSON.stringify(texts)) problems.push(`${item.tag}: ulaz nema ista tri zapisa`);
    const zubak = xml.indexOf(texts[2]);
    const fieldSpansTarget = xml.indexOf('fldCharType="begin"') >= 0 && xml.indexOf('fldCharType="begin"') < zubak && xml.lastIndexOf('fldCharType="end"') > zubak;
    const controlSpans = xml.indexOf('<w:sdtContent>') >= 0 && xml.indexOf('<w:sdtContent>') < zubak && xml.lastIndexOf('</w:sdtContent>') > zubak;
    // Korisnikov zapis ide iza sidra: kad end polja stoji u odlomku sidra, mjesto je iza polja.
    const endInAnchor = xml.lastIndexOf('fldCharType="end"') > zubak && xml.lastIndexOf('fldCharType="end"') < xml.indexOf('</w:p>', zubak);
    if (item.tag === 'polje:korisnikov-zapis-iza-polja' ? !(fieldSpansTarget && endInAnchor) : (item.inside === 'polje') !== fieldSpansTarget) problems.push(`${item.tag}: ulaz nema polje preko zapisa kako slucaj tvrdi`);
    if ((item.inside === 'kontrola') !== controlSpans) problems.push(`${item.tag}: ulaz nema kontrolu oko zapisa kako slucaj tvrdi`);
    if (item.tag === 'polje:ugnijezdeno' && (xml.match(/fldCharType="end"/g) ?? []).length !== 2) problems.push(`${item.tag}: ulaz nema ugnijezdeno polje`);
    // Generator: komentirani kraj stoji IZMEDJU stvarnog pocetka i mjesta umetanja (ispred Zupka).
    const comment = item.tag === 'polje:komentar-zatvara' ? commentedEnd : item.tag === 'kontrola:komentar-zatvara' ? commentedControlEnd : null;
    if (comment && !(xml.indexOf(comment) > xml.indexOf(item.inside === 'polje' ? 'fldCharType="begin"' : '<w:sdtContent>') && xml.indexOf(comment) < zubak)) problems.push(`${item.tag}: ulaz nema komentirani kraj unutar ${item.inside}`);
    const params = item.literal ? literal(built.params) : built.params;
    const first = fixer(built.parts, params);
    const expected = item.literal ? literalText : template('Novak', '2022');
    const after = paragraphTexts(first.parts.documentXml);
    if (item.inserted) {
      if (!first.applied || !after.includes(expected)) problems.push(`${item.tag}: zapis nije umetnut (${first.reason})`);
    } else {
      if (first.applied || first.parts.documentXml !== xml || after.includes(expected)) problems.push(`${item.tag}: zapis je umetnut unutar ${item.inside}`);
      if (!first.skippedActions?.some((note) => note.includes('unutar Wordova polja'))) problems.push(`${item.tag}: preskok nema razlog (${JSON.stringify(first.skippedActions)})`);
    }
    const second = fixer(first.parts, params);
    if (second.applied || second.parts.documentXml !== first.parts.documentXml) problems.push(`${item.tag}: drugi prolaz nije no-op (${second.reason})`);
  }
}

const FRAME = '<w:framePr w:w="9000" w:hSpace="180" w:wrap="around" w:vAnchor="text" w:hAnchor="page" w:x="1500" w:y="1"/>';
const IND = '<w:ind w:left="720" w:hanging="720"/>';
const FRAME_PPR = `<w:pPr>${FRAME}${IND}</w:pPr>`;
/** Komentar s laznim krajem svojstava ispred okvira (pregled drugog providera, runda 2). */
const COMMENTED_FRAME_PPR = `<w:pPr><!-- </w:pPr> -->${FRAME}${IND}</w:pPr>`;
/** Okvir samo u prethodnim svojstvima (Track Changes): aktualni odlomak nije u okviru. */
const HISTORIC_FRAME_PPR = `<w:pPr>${IND}<w:pPrChange w:id="1" w:author="A" w:date="2026-01-01T00:00:00Z"><w:pPr>${FRAME}</w:pPr></w:pPrChange></w:pPr>`;
/** Komentar s laznim krajem svojstava bez okvira: kopija svojstava bila bi presjecena unutar komentara. */
const COMMENTED_PPR = `<w:pPr><!-- </w:pPr> -->${IND}</w:pPr>`;
/** Lazna svojstva s okvirom u komentaru ISPRED stvarnih (pregled drugog providera, runda 3). */
const COMMENTED_FAKE_PPR = `<!-- <w:pPr>${FRAME}</w:pPr> --><w:pPr>${IND}</w:pPr>`;
/** Odlomak bez vlastitih svojstava s tekstnim okvirom ciji unutarnji odlomak nosi framePr. */
const NESTED_FRAMED_PARAGRAPH = `<w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p>${FRAME_PPR}<w:r><w:t>Okvir</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`;

/** Prijelom sekcije s komentiranim `</w:sectPr>` u svojstvima zadnjeg zapisa (pregled, runda 4). */
const COMMENTED_SECTION_PPR = `<w:pPr>${IND}<w:sectPr><!-- </w:sectPr> --><w:type w:val="nextPage"/></w:sectPr></w:pPr>`;
/** Tekstni okvir s praznim unutarnjim odlomkom koji ima obicna svojstva (iza samozatvorenog `<w:pPr/>`). */
const NESTED_EMPTY_PARAGRAPH_RUN = '<w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>';

/** Dokument je ispravan XML (parser analize baca na svaku dijagnostiku). */
function wellFormed(documentXml: string): boolean {
  try {
    parseXml(documentXml.replace('<w:document>', `<w:document ${WORD_NS} xmlns:v="urn:schemas-microsoft-com:vml">`), 'test');
    return true;
  } catch {
    return false;
  }
}

const encodeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Aktualna svojstva odlomka u generatoru: bez komentara i bez povijesti (w:pPrChange). */
const activeFramed = (paragraphXml: string) => /<w:framePr\b/.test((paragraphXml.replace(/<!--[\s\S]*?-->/g, '').replace(/<w:pPrChange\b[\s\S]*?<\/w:pPrChange>/g, '').match(/<w:pPr\b[\s\S]*?<\/w:pPr>/) ?? [''])[0]);

/**
 * Z36 (pregled drugog providera, dvije runde): popis u okviru (w:framePr, stari Wordov plutajuci blok).
 * Zapis se ne umece kad okvir nosi izvor oblikovanja (zapis sidra) ili susjedni odlomak mjesta umetanja,
 * i kad ih od mjesta dijeli razmak ili komentar: novi odlomak bi kopirao okvir ili razdvojio okvir
 * susjeda. Komentar u svojstvima ne skriva okvir, a okvir samo u povijesti (w:pPrChange) ili u
 * ugnijezdenom odlomku susjeda ne odbija umetanje. Svojstva se kopiraju bez komentara: ni presjecena
 * ni lazna (pPr iz komentara) ne ulaze u novi zapis. Razlog preskoka ide u
 * skippedActions, dokument ostaje bajt-isti, drugi prolaz isti. Generator dokazuje gdje je okvir.
 */
function okviriProblemi(fixer: SyncFixer, problems: string[]): void {
  const base: Array<[string, string]> = [['Cvitan', '2015'], ['Horvat', '2020'], ['Zubak', '2019']];
  const literalText = 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.';
  const cases: Array<{
    tag: string; pPr: Record<number, string>; active: number[]; expect: 'preskok' | 'umetnut';
    literal?: boolean; cite?: [string, string]; surnames?: Array<[string, string]>; separator?: string; after?: string[];
    /** Dodatni sadrzaj odlomka zapisa iza teksta; ocekivana svojstva umetnutog zapisa (zadano: svojstva popisa). */
    extra?: Record<number, string>; props?: string;
  }> = [
    { tag: 'okvir:predlozak', pPr: { 0: FRAME_PPR, 1: FRAME_PPR, 2: FRAME_PPR }, active: [0, 1, 2], expect: 'preskok' },
    // Samo izvor oblikovanja (zapis sidra, Zubak) je u okviru; predlozak ide na pocetak, uz susjede bez okvira.
    { tag: 'okvir:izvor', pPr: { 2: FRAME_PPR }, active: [2], expect: 'preskok', cite: ['Babić', '2021'] },
    { tag: 'okvir:korisnikov-zapis', pPr: { 0: FRAME_PPR, 1: FRAME_PPR, 2: FRAME_PPR }, active: [0, 1, 2], expect: 'preskok', literal: true },
    // Samo susjed ispred mjesta predloska (Horvat) je u okviru; izvor oblikovanja (Zubak) nije.
    { tag: 'okvir:susjed', pPr: { 1: FRAME_PPR }, active: [1], expect: 'preskok' },
    // Isto, ali Horvata od mjesta umetanja dijele prijelom retka i komentar u XML-u.
    { tag: 'okvir:susjed-razmak', pPr: { 1: FRAME_PPR }, active: [1], expect: 'preskok', separator: '\n<!-- razmak -->\n' },
    // Horvat i Zubak dijele okvir, a komentar s laznim </w:pPr> stoji ispred framePr; sidro (Zupan) je obicno.
    { tag: 'okvir:komentar-u-svojstvima', pPr: { 1: COMMENTED_FRAME_PPR, 2: COMMENTED_FRAME_PPR }, active: [1, 2], expect: 'preskok', surnames: [...base, ['Zupan', '2014']] },
    // Okvir samo u povijesti susjeda: umetanje je valjano.
    { tag: 'okvir:povijesni', pPr: { 1: HISTORIC_FRAME_PPR }, active: [], expect: 'umetnut' },
    // Svojstva sidra s komentarom: novi zapis nosi cista svojstva (bez komentara, bez laznog okvira).
    { tag: 'svojstva:komentar', pPr: { 2: COMMENTED_PPR }, active: [], expect: 'umetnut', literal: true },
    { tag: 'svojstva:komentar-ispred', pPr: { 2: COMMENTED_FAKE_PPR }, active: [], expect: 'umetnut', literal: true },
    // Odlomak iza popisa (susjed korisnikova zapisa) nema vlastiti okvir; okvir je samo u njegovom tekstnom okviru.
    { tag: 'okvir:ugnijezdeni-susjed', pPr: {}, active: [], expect: 'umetnut', literal: true, after: [NESTED_FRAMED_PARAGRAPH] },
    // Samozatvoreni <w:pPr/> sidra uz tekstni okvir s praznim odlomkom: novi zapis je bez svojstava, ispravan XML.
    { tag: 'svojstva:prazna', pPr: { 2: '<w:pPr/>' }, active: [], expect: 'umetnut', literal: true, extra: { 2: NESTED_EMPTY_PARAGRAPH_RUN }, props: '' },
    // Prijelom sekcije sidra s komentiranim </w:sectPr> prelazi na korisnikov zapis cijel (ispravan XML).
    { tag: 'sekcija:komentar', pPr: { 2: COMMENTED_SECTION_PPR }, active: [], expect: 'umetnut', literal: true },
  ];
  for (const item of cases) {
    const surnames = item.surnames ?? base;
    const texts = surnames.map(([surname, year]) => entryText(surname, year));
    const [surname, year] = item.cite ?? ['Novak', '2022'];
    const entryXml = (text: string, index: number) => `${index === 2 && item.separator ? item.separator : ''}<w:p>${item.pPr[index] ?? LIST_PPR}${run(text)}${item.extra?.[index] ?? ''}</w:p>`;
    const built = syncCase(`Tekst rada (${surname}, ${year}).`, `${surname}, ${year}`, [], { rawEntries: texts, entryXml, after: item.after });
    const xml = built.parts.documentXml;
    // Generator: aktivni okvir je bas na zapisima koje slucaj tvrdi, a tekst zapisa je isti kao bez okvira
    // (odlomci izvan popisa, npr. tekstni okvir iza njega, provjeravaju se zasebno ispod).
    const activeTexts = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].filter((match) => activeFramed(match[0])).map((match) => paragraphTexts(match[0].replace(/<!--[\s\S]*?-->/g, ''))[0]).filter((text) => texts.includes(text));
    if (JSON.stringify(activeTexts) !== JSON.stringify(item.active.map((index) => texts[index]))) problems.push(`${item.tag}: ulaz nema okvir na zapisima kako slucaj tvrdi (${JSON.stringify(activeTexts)})`);
    if (JSON.stringify(built.before.slice(2, 2 + texts.length).map((text) => text.trim())) !== JSON.stringify(texts)) problems.push(`${item.tag}: ulaz nema iste zapise`);
    if (item.separator && !xml.includes(`</w:p>${item.separator}<w:p>`)) problems.push(`${item.tag}: ulaz nema razmak izmedju susjeda`);
    if (item.tag === 'okvir:povijesni' && !/<w:pPrChange\b[\s\S]*?<w:framePr\b[\s\S]*?<\/w:pPrChange>/.test(xml)) problems.push(`${item.tag}: ulaz nema okvir u povijesti`);
    if ((item.tag === 'okvir:komentar-u-svojstvima' || item.tag === 'svojstva:komentar') && !xml.includes('<!-- </w:pPr> -->')) problems.push(`${item.tag}: ulaz nema komentar u svojstvima`);
    if (item.tag === 'svojstva:komentar-ispred' && !xml.includes(`<!-- <w:pPr>${FRAME}</w:pPr> -->`)) problems.push(`${item.tag}: ulaz nema lazna svojstva u komentaru`);
    if (item.tag === 'svojstva:prazna' && !xml.includes(`<w:p><w:pPr/>${run(texts[2])}${NESTED_EMPTY_PARAGRAPH_RUN}</w:p>`)) problems.push(`${item.tag}: ulaz nema sidro s <w:pPr/> i ugnijezdenim odlomkom`);
    if (item.tag === 'sekcija:komentar' && !(xml.includes('<w:sectPr><!-- </w:sectPr> -->') && JSON.stringify(sectionEndTexts(xml)) === JSON.stringify([texts[2]]))) problems.push(`${item.tag}: ulaz nema prijelom s komentarom na zadnjem zapisu`);
    if (item.tag === 'okvir:ugnijezdeni-susjed' && !(xml.includes(NESTED_FRAMED_PARAGRAPH) && xml.indexOf(NESTED_FRAMED_PARAGRAPH) > xml.indexOf(texts[texts.length - 1]))) problems.push(`${item.tag}: ulaz nema odlomak s ugnijezdenim okvirom iza popisa`);
    const params = item.literal ? { ...built.params, entries: [{ ...built.params.entries[0], citationId: undefined, replacementText: literalText }] } : built.params;
    const first = fixer(built.parts, params);
    const expected = item.literal ? literalText : template(surname, year);
    if (item.expect === 'umetnut') {
      if (!first.applied || !paragraphTexts(first.parts.documentXml).includes(expected)) problems.push(`${item.tag}: zapis nije umetnut (${first.reason}, ${JSON.stringify(first.skippedActions)})`);
      // Umetnuti odlomak nosi samo cista svojstva popisa: bez komentara i bez okvira.
      else if (item.tag.startsWith('svojstva:') && !first.parts.documentXml.includes(`<w:p>${item.props ?? LIST_PPR}<w:r><w:t xml:space="preserve">${encodeText(expected)}</w:t></w:r></w:p>`)) problems.push(`${item.tag}: umetnuti zapis nema cista svojstva popisa`);
      if (!wellFormed(first.parts.documentXml)) problems.push(`${item.tag}: rezultat nije ispravan XML`);
      if (item.tag === 'sekcija:komentar' && JSON.stringify(sectionEndTexts(first.parts.documentXml)) !== JSON.stringify([expected])) problems.push(`${item.tag}: prijelom sekcije nije presao na umetnuti zapis`);
    } else {
      if (first.applied || first.parts.documentXml !== xml) problems.push(`${item.tag}: zapis je umetnut (${first.reason})`);
      if (!first.skippedActions?.some((note) => note.includes('u okviru'))) problems.push(`${item.tag}: preskok nema razlog (${JSON.stringify(first.skippedActions)})`);
    }
    const second = fixer(first.parts, params);
    if (second.applied || second.parts.documentXml !== first.parts.documentXml) problems.push(`${item.tag}: drugi prolaz nije no-op (${second.reason})`);
  }
}

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';

/** Tekst odlomka kakav ga vidi ANALIZA: stvarni parser (src/docx/parser.ts) nad parsiranim XML-om, odrezan. */
function analysisParagraphText(paragraphXml: string): string {
  const doc = parseXml(`<w:document ${WORD_NS}><w:body>${paragraphXml}</w:body></w:document>`, 'test');
  return parserParagraphText(doc.getElementsByTagName('w:p')[0]).trim();
}

/** Citatni odlomci u kojima znak ispred citata analiza cita, a w:t ga nema (krug 4). */
const SHIFT_CASES: Array<[string, string]> = [
  ['ptab', '<w:ptab w:relativeTo="margin" w:alignment="right" w:leader="none"/>'],
  ['tab', '<w:tab/>'],
  ['br', '<w:br/>'],
];

/**
 * Z36 krug 4: w:ptab, w:tab ili w:br ispred citata pomice odmake. Analiza ih cita kao znak, a w:t ih
 * nema. Nepromijenjen citat se tada cita u tekstu analize i nikad ne pise; izmijenjen citat se ne pise
 * uopce. Generator dokazuje da se tekst analize i tekst w:t ispred citata razilaze.
 */
function odmaciProblemi(fixer: SyncFixer, problems: string[]): void {
  const literalText = 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.';
  for (const [tag, shifter] of SHIFT_CASES) {
    const citationXml = `<w:p><w:r><w:t>Tekst</w:t>${shifter}<w:t>više (Novak, 2022) i (Horvat, 2020).</w:t></w:r></w:p>`;
    const seen = analysisParagraphText(citationXml);
    const shifted = syncCase(seen, 'Novak, 2022', BASE, { citationXml });
    const parsed = extractCitationOccurrences([{ index: 1, text: seen }]).find((citation) => citation.author === 'Novak');
    const { start, end } = shifted.params.citations[0];
    if (!parsed || parsed.start !== start || parsed.end !== end || shifted.before[0].slice(start, end) === 'Novak, 2022') problems.push(`${tag}: ulaz ne pomice odmake citata izmedju analize i w:t`);
    for (const [variant, params] of [
      ['predlozak', shifted.params],
      ['korisnikov-zapis', { ...shifted.params, entries: [{ ...shifted.params.entries[0], citationId: undefined, replacementText: literalText }] }],
    ] as const) {
      const first = fixer(shifted.parts, params);
      const expected = variant === 'predlozak' ? template('Novak', '2022') : literalText;
      if (!first.parts.documentXml.includes(citationXml)) problems.push(`${tag}:${variant}: odlomak citata je prepisan (${JSON.stringify(paragraphTexts(first.parts.documentXml)[0])})`);
      if (!first.applied || !paragraphTexts(first.parts.documentXml).includes(expected)) problems.push(`${tag}:${variant}: zapis nije umetnut (${first.reason})`);
      const second = fixer(first.parts, params);
      if (second.applied || second.parts.documentXml !== first.parts.documentXml) problems.push(`${tag}:${variant}: drugi prolaz nije no-op (${second.reason})`);
    }
    // Izmijenjen citat (dodan lokator) u istom odlomku: odmaci se ne poklapaju, pa se nista ne pise.
    // Razlog je struktura odlomka (znak koji w:t nema), ne kriv plan.
    const changed = fixer(shifted.parts, { ...shifted.params, citations: [{ ...shifted.params.citations[0], replacementText: 'Novak, 2022, str. 5' }], entries: [], mappings: [] });
    if (changed.applied || changed.parts.documentXml !== shifted.parts.documentXml) problems.push(`${tag}-izmjena: citat je upisan na pomaknute odmake (${JSON.stringify(paragraphTexts(changed.parts.documentXml)[0])})`);
    else if (changed.reason !== 'unsupported-structure') problems.push(`${tag}-izmjena: razlog nije struktura odlomka (${changed.reason})`);
  }
  formulaProblemi(fixer, problems);
  pomaknutPlanProblemi(fixer, problems);
}

/**
 * Formula (OMML) ispred citata: parser cita `m:t` (localName t) kao tekst, w:t ga nema. Znak bez
 * slova i znamenke ne mijenja otisak odlomka, pa samo citanje u tekstu analize stiti citat. Ulazi iz
 * pregleda kruga 4: predlozak, korisnikov zapis i sama potvrdjena veza (bez 'add', bez dozvole).
 */
const FORMULA_CASES: Array<{ tag: string; symbol: string; before: string; after: string }> = [
  { tag: 'formula:≈', symbol: '≈', before: 'Tekst ', after: ' više (Novak, 2022) i (Horvat, 2020).' },
  { tag: 'formula:→', symbol: '→', before: 'Rast ', after: ' pad (Novak, 2022) i (Horvat, 2020).' },
  { tag: 'formula:+', symbol: '+', before: 'Tekst ', after: ' više (Novak, 2022) i (Horvat, 2020).' },
];

function formulaProblemi(fixer: SyncFixer, problems: string[]): void {
  const literalText = 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.';
  const horvatEntry = `bibliography-${3 + BASE.findIndex(([surname]) => surname === 'Horvat')}`;
  for (const { tag, symbol, before, after } of FORMULA_CASES) {
    const citationXml = `<w:p><w:r><w:t xml:space="preserve">${before}</w:t></w:r><m:oMath><m:r><m:t>${symbol}</m:t></m:r></m:oMath><w:r><w:t xml:space="preserve">${after}</w:t></w:r></w:p>`;
    const seen = analysisParagraphText(citationXml);
    const shifted = syncCase(seen, 'Novak, 2022', BASE, { citationXml });
    const { start, end } = shifted.params.citations[0];
    // Generator: parser cita znak formule, w:t ga nema, a otisak (samo slova i znamenke) je isti.
    if (!seen.includes(symbol) || shifted.before[0].includes(symbol) || shifted.before[0].slice(start, end) === 'Novak, 2022' || citationAnchorFingerprint(1, shifted.before[0]) !== shifted.params.citations[0].anchorFingerprint) problems.push(`${tag}: ulaz ne pomice odmake citata izmedju analize i w:t`);
    for (const [variant, params] of [
      ['predlozak', shifted.params],
      ['korisnikov-zapis', { ...shifted.params, entries: [{ ...shifted.params.entries[0], citationId: undefined, replacementText: literalText }] }],
    ] as const) {
      const first = fixer(shifted.parts, params);
      const expected = variant === 'predlozak' ? template('Novak', '2022') : literalText;
      if (!first.parts.documentXml.includes(citationXml)) problems.push(`${tag}:${variant}: odlomak citata je prepisan (${JSON.stringify(paragraphTexts(first.parts.documentXml)[0])})`);
      if (!first.applied || !paragraphTexts(first.parts.documentXml).includes(expected)) problems.push(`${tag}:${variant}: zapis nije umetnut (${first.reason})`);
      const second = fixer(first.parts, params);
      if (second.applied || second.parts.documentXml !== first.parts.documentXml) problems.push(`${tag}:${variant}: drugi prolaz nije no-op (${second.reason})`);
    }
    // Samo potvrdjena veza na postojeci zapis (Horvat), bez 'add': citat se cita, nista se ne pise.
    const horvat = seen.indexOf('Horvat, 2020');
    const mapped = fixer(shifted.parts, { version: 1, citations: [{ ...shifted.params.citations[0], id: 'c2', start: horvat, end: horvat + 'Horvat, 2020'.length, replacementText: 'Horvat, 2020', reason: 'potvrdjena veza' }], entries: [], mappings: [{ citationId: 'c2', bibliographyEntryId: horvatEntry, confirmed: true }] });
    if (mapped.applied || mapped.parts.documentXml !== shifted.parts.documentXml || mapped.reason !== 'already-ok') problems.push(`${tag}:veza: potvrdjena veza mijenja dokument ili ne prolazi (${mapped.reason}, ${JSON.stringify(paragraphTexts(mapped.parts.documentXml)[0])})`);
  }
}

/**
 * Plan s pomaknutim odmacima nad cistim odlomkom (samo w:t): otisak odlomka vrijedi, ali raspon ne
 * pokazuje citat (zastario ili kriv zahtjev klijenta). Nepromijenjen citat se tada ne smije prepisati
 * svojim rawText, ni uz dodani zapis; izmijenjen se ne pise uopce. Razlog je kriv plan.
 */
function pomaknutPlanProblemi(fixer: SyncFixer, problems: string[]): void {
  const text = 'Tekst više (Novak, 2022) i (Horvat, 2020).';
  const base = syncCase(text, 'Novak, 2022', BASE);
  for (const delta of [-1, 1]) {
    const start = base.params.citations[0].start + delta;
    const end = base.params.citations[0].end + delta;
    // Generator: odlomak je cist (samo w:t), a pomaknut raspon nije citat koji parser nalazi.
    if (analysisParagraphText(paragraph(text)) !== text || extractCitationOccurrences([{ index: 1, text }]).some((found) => found.start === start && found.end === end)) problems.push(`pomak${delta}: ulaz nije cist odlomak s pomaknutim rasponom`);
    for (const [variant, replacementText] of [['nepromijenjen', 'Novak, 2022'], ['izmjena', 'Novak, 2022, str. 5']] as const) {
      const result = fixer(base.parts, { ...base.params, citations: [{ ...base.params.citations[0], start, end, replacementText }], entries: [], mappings: [] });
      if (result.applied || result.parts.documentXml !== base.parts.documentXml) problems.push(`pomak${delta}:${variant}: citat je upisan na pomaknut raspon (${JSON.stringify(paragraphTexts(result.parts.documentXml)[0])})`);
      else if (result.reason !== 'invalid-params') problems.push(`pomak${delta}:${variant}: razlog nije kriv plan (${result.reason})`);
    }
    const withEntry = fixer(base.parts, { ...base.params, citations: [{ ...base.params.citations[0], start, end }] });
    if (paragraphTexts(withEntry.parts.documentXml)[0] !== text) problems.push(`pomak${delta}:zapis: odlomak citata je prepisan (${JSON.stringify(paragraphTexts(withEntry.parts.documentXml)[0])})`);
  }
}

/**
 * Uvodi koje parser SKIDA ("prema", "usp.", "vidi", "navedeno u") ostavljaju sklonjeno prezime kao
 * autora zagradnog citata. Generator najprije dokazuje da parser bas to vraca.
 */
const STRIPPED_INTRO_CASES: Array<[string, string, string]> = [
  ['padez-uvod:prema', 'prema Novaku, 2022', 'Novaku'],
  ['padez-uvod:usp.', 'usp. Horvata, 2020', 'Horvata'],
  ['padez-uvod:vidi', 'vidi Babića, 2021', 'Babića'],
  ['padez-uvod:navedeno u', 'navedeno u Kovaču, 2019', 'Kovaču'],
];

function uvodiIRazmaciProblemi(fixer: SyncFixer, problems: string[]): void {
  for (const [tag, raw, declined] of STRIPPED_INTRO_CASES) {
    const text = `Tekst rada (${raw}).`;
    const parsed = extractCitationOccurrences([{ index: 1, text }]);
    if (parsed.length !== 1 || parsed[0].author !== declined || parsed[0].form !== 'parenthetical') problems.push(`${tag}: ulaz nije zagradni citat sa skinutim uvodom (${JSON.stringify(parsed.map((c) => c.author))})`);
    const stripped = syncCase(text, raw, BASE);
    const result = fixer(stripped.parts, stripped.params);
    if (result.applied || paragraphTexts(result.parts.documentXml).some((value) => value.includes('[ime]'))) problems.push(`${tag}: sklonjeno prezime iz citata s uvodom uslo je u zapis`);
  }

  // Tvrdi razmak (U+00A0) u citatu: analiza ga cita kao obican razmak, pa zahtjev plana nosi rawText s
  // obicnim razmakom. Citat se samo cita: odlomak mora ostati bajt-isti, a predlozak umetnut.
  const nbspText = 'Tekst rada (Novak, 2022, str.\u00a05).';
  const nbsp = syncCase(nbspText, 'Novak, 2022, str.\u00a05', BASE);
  const analysisRaw = 'Novak, 2022, str. 5';
  const planShaped = { ...nbsp.params, citations: [{ ...nbsp.params.citations[0], replacementText: analysisRaw, anchorFingerprint: citationAnchorFingerprint(1, nbspText.replace(/\u00a0/g, ' ')) }] };
  if (!nbsp.parts.documentXml.includes('\u00a0') || planShaped.citations[0].replacementText === nbsp.params.citations[0].replacementText) problems.push('nbsp: ulaz nema tvrdi razmak koji analiza cita kao obican');
  const nbspResult = fixer(nbsp.parts, planShaped);
  const nbspTexts = paragraphTexts(nbspResult.parts.documentXml);
  if (!nbspResult.applied || !nbspTexts.includes(template('Novak', '2022'))) problems.push(`nbsp: predlozak nije umetnut (${nbspResult.reason})`);
  if (nbspTexts[0] !== nbspText) problems.push(`nbsp: odlomak citata je prepisan (${JSON.stringify(nbspTexts[0])})`);
}

/**
 * Prijelom sekcije na zadnjem zapisu (Prilozi u novoj sekciji) i zadnji zapis u dva odlomka (URL ili
 * DOI u vlastitom retku, koje analiza spaja u jedan zapis).
 */
function sekcijeIVisodlomacniProblemi(fixer: SyncFixer, problems: string[]): void {
  const literalText = 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.';
  const lastBase = entryText(BASE.at(-1)![0], BASE.at(-1)![1]);
  const sectionCases: Array<{ tag: string; surname: string; year: string; literal?: boolean; carrier: string }> = [
    { tag: 'sekcija:pocetak', surname: 'Babić', year: '2021', carrier: lastBase },
    { tag: 'sekcija:sredina', surname: 'Novak', year: '2022', carrier: lastBase },
    { tag: 'sekcija:kraj', surname: 'Zupan', year: '2014', carrier: template('Zupan', '2014') },
    { tag: 'sekcija:korisnikov-zapis', surname: 'Novak', year: '2022', literal: true, carrier: literalText },
  ];
  for (const item of sectionCases) {
    const raw = `${item.surname}, ${item.year}`;
    const sectioned = syncCase(`Tekst rada (${raw}).`, raw, BASE, { sectionBreakOnLast: true });
    if (JSON.stringify(sectionEndTexts(sectioned.parts.documentXml)) !== JSON.stringify([lastBase])) problems.push(`${item.tag}: ulaz nema prijelom sekcije na zadnjem zapisu`);
    const params = item.literal ? { ...sectioned.params, entries: [{ ...sectioned.params.entries[0], citationId: undefined, replacementText: literalText }] } : sectioned.params;
    const result = fixer(sectioned.parts, params);
    const ends = sectionEndTexts(result.parts.documentXml);
    if (!result.applied) problems.push(`${item.tag}: zapis nije umetnut (${result.reason})`);
    // Jedan prijelom, na zadnjem odlomku popisa: popis ostaje u istoj sekciji, novi zapis ne bjezi iza nje.
    else if (JSON.stringify(ends) !== JSON.stringify([item.carrier])) problems.push(`${item.tag}: prijelom sekcije je na ${JSON.stringify(ends)}, ocekivan samo na ${JSON.stringify(item.carrier)}`);
    if (result.applied && paragraphTexts(result.parts.documentXml).at(-1) !== item.carrier) problems.push(`${item.tag}: popis vise ne zavrsava odlomkom s prijelomom`);
  }

  // Zadnji zapis u dva odlomka: sidro je ZADNJI odlomak zapisa, otisak je otisak cijelog zapisa.
  const multiEntries = ['Horvat, A. (2019). Naslov.', 'Zubak, B. (2020). Naslov djela Zubak. Dostupno na:', 'https://doi.org/10.1000/xyz'];
  for (const { tag, raw, literal, expected } of [
    { tag: 'vise-odlomaka:predlozak-sredina', raw: 'Novak, 2022', literal: undefined, expected: ['Literatura', multiEntries[0], template('Novak', '2022'), multiEntries[1], multiEntries[2]] },
    { tag: 'vise-odlomaka:predlozak-kraj', raw: 'Zupan, 2022', literal: undefined, expected: ['Literatura', ...multiEntries, template('Zupan', '2022')] },
    { tag: 'vise-odlomaka:korisnikov-zapis', raw: 'Novak, 2022', literal: literalText, expected: ['Literatura', ...multiEntries, literalText] },
  ]) {
    const multi = syncCase(`Tekst rada (${raw}).`, raw, [], { rawEntries: multiEntries });
    const last = analyzeBibliographyStructure(numbered(multi.before), 'hr').entries.at(-1);
    if (last?.paragraphIndices.join() !== '4,5') { problems.push(`${tag}: ulaz nema zadnji zapis u dva odlomka (${last?.paragraphIndices.join()})`); continue; }
    const anchor = { paragraphIndex: last.paragraphIndices.at(-1)!, anchorFingerprint: last.anchorFingerprint };
    const entry = { ...multi.params.entries[0], insertionAnchor: anchor, ...(literal ? { citationId: undefined, replacementText: literal } : {}) };
    const result = fixer(multi.parts, { ...multi.params, entries: [entry] });
    const texts = paragraphTexts(result.parts.documentXml).slice(1);
    if (!result.applied || JSON.stringify(texts) !== JSON.stringify(expected)) problems.push(`${tag}: ${result.reason ?? 'primijenjeno'} ${JSON.stringify(texts)}`);
  }
}

/** Gard fixera: predlozak, abecedno mjesto, dijakritika, idempotencija, vidljivi tekst, padez. */
export function zapisLiteratureProblemi(fixer: SyncFixer): string[] {
  const problems: string[] = [];
  for (const placement of PLACEMENT_CASES) {
    const raw = `${placement.surname}, ${placement.year}`;
    const { parts, params, before } = syncCase(`Tekst rada (${raw}).`, raw, BASE);
    // Generator mora proizvesti ciljanu klasu: popis je vec abecedan po istoj provjeri.
    if (!analyzeBibliographyStructure(before.map((text, i) => ({ index: i + 1, text })), 'hr').alphabetical.expected) problems.push(`${placement.tag}: ulazni popis nije abecedan`);
    const result = fixer(parts, params);
    const after = paragraphTexts(result.parts.documentXml);
    const expected = template(placement.surname, placement.year);
    const at = after.indexOf(expected);
    if (!result.applied || at < 0) { problems.push(`${placement.tag}: predlozak nije umetnut`); continue; }
    const previous = after[at - 1];
    const next = after[at + 1] ?? null;
    if (placement.after === null ? previous !== 'Literatura' : previous !== entryText(placement.after, BASE.find(([s]) => s === placement.after)![1])) problems.push(`${placement.tag}: krivi prethodnik (${previous})`);
    if ((placement.beforeSurname === null) !== (next === null) || (next !== null && !next.startsWith(`${placement.beforeSurname},`))) problems.push(`${placement.tag}: krivi sljedbenik (${next})`);
    // Vidljivi tekst: osim umetnutog zapisa nijedan odlomak se ne mijenja.
    if (JSON.stringify(after.filter((_text, index) => index !== at)) !== JSON.stringify(before)) problems.push(`${placement.tag}: promijenjen postojeci tekst`);
    if (!analyzeBibliographyStructure(after.map((text, i) => ({ index: i + 1, text })), 'hr').alphabetical.expected) problems.push(`${placement.tag}: provjera abecede pada nakon umetanja`);
  }

  const idem = syncCase('Tekst rada (Novak, 2022a).', 'Novak, 2022a', BASE);
  const first = fixer(idem.parts, idem.params);
  const second = fixer(first.parts, idem.params);
  const count = paragraphTexts(second.parts.documentXml).filter((text) => text === template('Novak', '2022a')).length;
  if (!first.applied) problems.push('sufiks: predlozak s godinom 2022a nije umetnut');
  if (second.applied || second.reason !== 'already-ok' || count !== 1) problems.push(`idempotencija: drugi prolaz nije no-op (${second.reason}, ${count} zapisa)`);

  for (const [raw, surname] of [['Horvat i Novak, 2020', 'Horvat'], ['Kovač et al., 2019', 'Kovač']] as const) {
    const multi = syncCase(`Tekst rada (${raw}).`, raw, BASE);
    const texts = paragraphTexts(fixer(multi.parts, multi.params).parts.documentXml);
    if (!texts.some((text) => text.startsWith(`${surname}, [ime]. (`))) problems.push(`vise-autora: zapis ne nosi prvo prezime ${surname}`);
  }

  // Narativni citat moze nositi sklonjeno prezime ("Prema Novaku (2022)"): nista se ne umece.
  const narrative = syncCase('Prema Novaku (2022) tekst rada.', 'Novaku (2022)', BASE);
  const narrativeResult = fixer(narrative.parts, narrative.params);
  if (narrativeResult.applied || paragraphTexts(narrativeResult.parts.documentXml).some((text) => text.includes('[ime]'))) problems.push('padez: narativni citat dao je zapis');

  granicePopisaProblemi(fixer, problems);
  return problems;
}

type PlanBuilder = typeof citationBibliographySyncRepairableItem;

const PLAN_CITATIONS = [
  { id: 'c1', paragraphIndex: 1, start: 11, end: 22, rawText: 'Novak, 2022', author: 'Novak', year: '2022', form: 'parenthetical', anchorFingerprint: 'citation-1', confidence: 'high' },
  // Narativni citat ("Prema Novaku (2022)"): prezime moze biti sklonjeno, pa predlozak nije moguc.
  { id: 'c2', paragraphIndex: 2, start: 6, end: 19, rawText: 'Novaku (2022)', author: 'Novaku', year: '2022', form: 'narrative', anchorFingerprint: 'citation-2', confidence: 'high' },
];
const planResult = () => ({
  details: {
    citationBibliographySync: {
      citations: PLAN_CITATIONS,
      links: PLAN_CITATIONS.map((citation) => ({ citationId: citation.id, status: 'missing', candidates: [], reason: 'nedostaje' })),
      missingEntries: PLAN_CITATIONS,
      duplicateCandidates: [],
      summary: { citations: 2, matched: 0, missing: 2, ambiguous: 0, pageIssues: 0 },
    },
    bibliographyStructure: { entries: [{ id: 'bibliography-3', paragraphIndices: [3], anchorFingerprint: 'biblio-3', rawText: entryText('Horvat', '2020') }] },
  },
});
const planProfile = (value: Record<string, unknown>) => ({ ruleEntries: [{ checkId: 'citation-sync-rules', status: 'verified', sourceId: 's', sourcePage: '1', quote: 'pravilo', value }] });

/** Gard plana: dodavanje zapisa samo uz dozvolu profila; prazan tekst salje id citata, ne predlozak. */
export function planZapisaProblemi(build: PlanBuilder): string[] {
  const problems: string[] = [];
  const offered = (value: Record<string, unknown>) => {
    const item = build(planResult(), planProfile(value))[0];
    const form = item?.citationBibliographySyncForm;
    if (!form) return { rows: 0, adds: 0 };
    for (const missing of form.missingEntries) missing.selected = true;
    const params = form.buildParams(form) as { entries: Array<{ action: string }> };
    return { rows: form.missingEntries.length, adds: params.entries.filter((entry) => entry.action === 'add').length };
  };
  const denied = offered({ mode: 'author-year' });
  if (denied.rows || denied.adds) problems.push('dozvola: plan nudi zapis bez allowMissingEntryInsertion');
  if (build(planResult(), planProfile({ mode: 'numeric', allowMissingEntryInsertion: true })).length) problems.push('nacin: plan nudi sinkronizaciju izvan author-year');
  if (build(planResult(), { ruleEntries: [] }).length) problems.push('pravilo: plan nudi sinkronizaciju bez verificiranog pravila');

  const item = build(planResult(), planProfile({ mode: 'author-year', allowMissingEntryInsertion: true }))[0];
  const form = item?.citationBibliographySyncForm;
  if (form?.missingEntries.length !== 2) return [...problems, 'dozvola: uz dozvolu plan ne nudi oba zapisa'];
  const [parenthetical, narrative] = form.missingEntries;
  parenthetical.selected = true;
  narrative.selected = true;
  type Built = { citations: Array<{ id: string; replacementText: string }>; entries: Array<Record<string, unknown>> };
  const params = form.buildParams(form) as Built;
  const adds = params.entries.filter((entry) => entry.action === 'add');
  const add = adds.find((entry) => entry.id === parenthetical.id);
  if (!add || add.citationId !== 'c1' || 'replacementText' in add) problems.push('predlozak: prazan tekst ne salje samo id citata');
  if (!params.citations.some((citation) => citation.id === 'c1' && citation.replacementText === 'Novak, 2022')) problems.push('predlozak: izvorni citat nije u zahtjevu nepromijenjen');
  // Narativni redak: predlozak nije moguc, pa ga plan bez upisanog teksta ne salje (fixer bi ga preskocio).
  if (!parenthetical.templateAvailable || narrative.templateAvailable) problems.push('narativ: oznaka predloska ne odgovara obliku citata');
  if (adds.some((entry) => entry.id === narrative.id)) problems.push('narativ: plan bez teksta salje zapis koji fixer ne moze sloziti');
  narrative.text = 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.';
  const typed = (form.buildParams(form) as Built).entries.find((entry) => entry.id === narrative.id);
  if (typed?.replacementText !== narrative.text) problems.push('narativ: upisani zapis uz narativni citat se ne salje');

  // Preporuka (advisory) nije obvezujuce pravilo: sinkronizaciju smije nuditi, umetanje teksta ne.
  const advisory = build(planResult(), { ruleEntries: [{ ...planProfile({ mode: 'author-year', allowMissingEntryInsertion: true }).ruleEntries[0], status: 'advisory' }] })[0];
  if (!advisory) problems.push('preporuka: ulaz ne daje stavku sinkronizacije');
  else if (advisory.citationBibliographySyncForm?.missingEntries.length) problems.push('dozvola: preporuka (advisory) otvara dodavanje zapisa');

  // Zagradni citat s uvodom koji parser skida ("prema Novaku, 2022"): autor je sklonjen, pa nema predloska.
  const withIntro = planResult();
  const intro = { ...PLAN_CITATIONS[0], id: 'c3', rawText: 'prema Novaku, 2022', author: 'Novaku' };
  Object.assign(withIntro.details.citationBibliographySync, { citations: [intro], missingEntries: [intro], links: [{ citationId: 'c3', status: 'missing', candidates: [], reason: 'nedostaje' }] });
  const introRow = build(withIntro, planProfile({ mode: 'author-year', allowMissingEntryInsertion: true }))[0]?.citationBibliographySyncForm?.missingEntries[0];
  if (!introRow || introRow.templateAvailable) problems.push('padez-uvod: plan nudi predlozak za citat s uvodom');

  // Zadnji zapis u dva odlomka (URL ili DOI u svom retku): sidro je zadnji odlomak, otisak cijelog zapisa.
  const multi = planResult();
  multi.details.bibliographyStructure.entries = [{ id: 'bibliography-3', paragraphIndices: [3, 4], anchorFingerprint: 'biblio-3-4', rawText: `${entryText('Horvat', '2020')} https://doi.org/10.1/a` }];
  const multiForm = build(multi, planProfile({ mode: 'author-year', allowMissingEntryInsertion: true }))[0]?.citationBibliographySyncForm;
  if (multiForm) multiForm.missingEntries[0].selected = true;
  const multiAdd = multiForm && (multiForm.buildParams(multiForm) as Built).entries.find((entry) => entry.action === 'add');
  const multiAnchor = multiAdd?.insertionAnchor as { paragraphIndex: number; anchorFingerprint: string } | undefined;
  if (multiAnchor?.paragraphIndex !== 4 || multiAnchor.anchorFingerprint !== 'biblio-3-4') problems.push(`vise-odlomaka: sidro plana nije zadnji odlomak zapisa (${JSON.stringify(multiAnchor)})`);
  return problems;
}

const syncRequest = () => ({
  version: 1,
  citations: [{ id: 'c1', paragraphIndex: 1, start: 0, end: 11, anchorFingerprint: 'citation-1', replacementText: 'Novak, 2022', reason: 'r' }],
  entries: [
    { id: 'bibliography-4', paragraphIndices: [4], anchorFingerprint: 'biblio-4', action: 'remove' },
    { id: 'e1', paragraphIndices: [], anchorFingerprint: 'biblio-3', action: 'add', citationId: 'c1', insertionAnchor: { paragraphIndex: 3, anchorFingerprint: 'biblio-3' } },
    { id: 'e2', paragraphIndices: [], anchorFingerprint: 'biblio-3', action: 'add', replacementText: 'Novak, N. (2022). Naslov.', insertionAnchor: { paragraphIndex: 3, anchorFingerprint: 'biblio-3' } },
  ],
  mappings: [{ citationId: 'c1', bibliographyEntryId: 'e1', confirmed: true }, { citationId: 'c1', bibliographyEntryId: 'bibliography-3', confirmed: true }],
  // Klijent ne moze sam sebi dati dozvolu: server ovu zastavicu ne cita.
  allowMissingEntryInsertion: true,
});

/**
 * Gard serverske dozvole (param-authority): bez pecene dozvole profila iz zahtjeva sinkronizacije
 * nestaje svaki 'add' (predlozak i korisnikov tekst) i njegova veza; ostatak zahtjeva ostaje. Peceni
 * zapis nastaje samo kad `citationEntryInsertionAllowed` profila vrati true (sva tri uvjeta).
 */
export function serverDozvolaProblemi(resolve: typeof resolveParams, allowed: typeof citationEntryInsertionAllowed): string[] {
  const problems: string[] = [];
  const fixer = 'citation-bibliography-sync-fixer';
  const rule = 'citation-bibliography-sync-assisted';
  const authority: ParamAuthorityMap = {
    'z36-dozvoljen': { [rule]: { f: fixer, p: { allowMissingEntryInsertion: true } } },
    'z36-drugi-fixer': { [rule]: { f: 'font-fixer', p: { allowMissingEntryInsertion: true } } },
    'z36-bez-dozvole': { 'z36-bez-dozvole--font': { f: 'font-fixer', p: { fontName: 'Times New Roman' } } },
  };
  const adds = (params: Record<string, unknown>) => (params.entries as Array<{ action: string }>).filter((entry) => entry.action === 'add').length;
  const kept = resolve('z36-dozvoljen', rule, fixer, syncRequest(), authority);
  if (adds(kept.params) !== 2 || (kept.params.mappings as unknown[]).length !== 2) problems.push('dozvola-server: uz peceni zapis server uklanja dodavanje');
  if (kept.skippedActions) problems.push('dozvola-odgovor: uz dozvolu odgovor javlja uklonjenu akciju');
  for (const profile of ['z36-bez-dozvole', 'z36-drugi-fixer', 'nepostojeci-profil', null]) {
    const out = resolve(profile, rule, fixer, syncRequest(), authority);
    const mappings = out.params.mappings as Array<{ bibliographyEntryId: string }>;
    if (adds(out.params) !== 0) problems.push(`dozvola-server: ${String(profile)} propusta 'add'`);
    if (mappings.some((mapping) => mapping.bibliographyEntryId === 'e1') || mappings.length !== 1 || (out.params.entries as unknown[]).length !== 1) problems.push(`dozvola-server: ${String(profile)} ne cuva ostatak zahtjeva`);
    if (out.source !== 'client') problems.push(`dozvola-server: ${String(profile)} mijenja izvor parametara`);
    // Krug 4: uklanjanje nije tiho, odgovor ga javlja (Edge funkcija ga vraca kao skippedActions).
    if (!out.skippedActions?.some((note) => note.includes('nije umetnut'))) problems.push(`dozvola-odgovor: ${String(profile)} tiho uklanja 'add' (${JSON.stringify(out.skippedActions)})`);
  }
  // Zahtjev bez 'add' nema sto javiti.
  const withoutAdd = resolve('z36-bez-dozvole', rule, fixer, { ...syncRequest(), entries: syncRequest().entries.filter((entry) => entry.action !== 'add') }, authority);
  if (withoutAdd.skippedActions) problems.push('dozvola-odgovor: zahtjev bez dodavanja javlja uklonjenu akciju');
  // Peceni zapis drugog pravila istog profila ne otvara dozvolu.
  if (adds(resolve('z36-dozvoljen', 'drugo-pravilo', fixer, syncRequest(), authority).params) !== 0) problems.push('dozvola-server: dozvola vrijedi i za drugo pravilo');

  const ruleEntry = (value: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ ruleEntries: [{ checkId: 'citation-sync-rules', status: 'verified', sourceId: 's', sourcePage: '1', quote: 'pravilo', value, ...extra }] });
  if (!allowed(ruleEntry({ mode: 'author-year', allowMissingEntryInsertion: true }))) problems.push('dozvola-profil: puni uvjet ne daje dozvolu');
  if (allowed(ruleEntry({ mode: 'author-year' }))) problems.push('dozvola-profil: dozvola bez allowMissingEntryInsertion');
  if (allowed(ruleEntry({ mode: 'numeric', allowMissingEntryInsertion: true }))) problems.push('dozvola-profil: dozvola izvan author-year');
  if (allowed(ruleEntry({ mode: 'author-year', allowMissingEntryInsertion: true }, { status: 'draft' }))) problems.push('dozvola-profil: dozvola bez verificiranog pravila');
  if (allowed(ruleEntry({ mode: 'author-year', allowMissingEntryInsertion: true }, { status: 'advisory' }))) problems.push('dozvola-profil: dozvola iz preporuke (advisory)');
  if (allowed(ruleEntry({ mode: 'author-year', allowMissingEntryInsertion: true }, { sourcePage: null }))) problems.push('dozvola-profil: dozvola bez stranice izvora');
  if (allowed({ ruleEntries: [] })) problems.push('dozvola-profil: dozvola bez pravila');
  return problems;
}

/** Gard servera: 'add' bez teksta trazi id citata iz istog zahtjeva; nepoznat kljuc se odbija. */
export function serverZapisaProblemi(validate: typeof validateAssistedParams): string[] {
  const problems: string[] = [];
  const citation = { id: 'c1', paragraphIndex: 1, start: 0, end: 11, anchorFingerprint: 'citation-1', replacementText: 'Novak, 2022', reason: 'r' };
  const add = (extra: Record<string, unknown>) => ({ version: 1, citations: [citation], entries: [{ id: 'e1', paragraphIndices: [], anchorFingerprint: 'biblio-3', action: 'add', insertionAnchor: { paragraphIndex: 3, anchorFingerprint: 'biblio-3' }, ...extra }], mappings: [] });
  const ok = (params: Record<string, unknown>) => validate('citation-bibliography-sync-fixer', params);
  if (!ok(add({ citationId: 'c1' }))) problems.push('server: odbija predlozak s poznatim citatom');
  if (!ok(add({ replacementText: 'Novak, N. (2022). Naslov.' }))) problems.push('server: odbija korisnikov zapis');
  if (ok(add({}))) problems.push('server: prima zapis bez teksta i bez citata');
  if (ok(add({ replacementText: '   ' }))) problems.push('server: prima prazan tekst bez citata');
  if (ok(add({ citationId: 'c9' }))) problems.push('server: prima nepoznat citat');
  if (ok(add({ citationId: 'c1', template: 'Kovač, I. (2022).' }))) problems.push('server: prima klijentski predlozak');
  return problems;
}

/**
 * Gard analize: zapis koji jos nosi ijedno konstantno polje predloska ("[ime]", "[Naslov djela]",
 * "[Mjesto: Izdavač]") je nepopunjen, ne potpun izvor. Bez toga popravak pretvara nedostajuci zapis u
 * "potpun" zapis s rezerviranim mjestima i provjera potpunosti lazno prolazi.
 */
export function nepopunjenPredlozakProblemi(analyze: typeof analyzeBibliographyStructure): string[] {
  const problems: string[] = [];
  const partial = [
    ['predlozak', template('Novak', '2022')],
    ['bez-imena', 'Novak, [ime]. (2022). Pravi naslov djela. Zagreb: Izdavač.'],
    ['bez-naslova', 'Novak, N. (2022). [Naslov djela]. Zagreb: Izdavač.'],
    ['bez-izdavaca', 'Novak, N. (2022). Pravi naslov djela. [Mjesto: Izdavač].'],
  ] as const;
  for (const [tag, text] of partial) {
    const structure = analyze(numbered(['Literatura', entryText('Horvat', '2020'), text, entryText('Zubak', '2019')]), 'hr');
    const entry = structure.entries.find((candidate) => candidate.rawText === text);
    if (!entry) { problems.push(`nepopunjen:${tag}: analiza ne vidi zapis`); continue; }
    if (!entry.flags.includes('unfilled-template') || !structure.incompleteEntryIds.includes(entry.id)) problems.push(`nepopunjen:${tag}: zapis nije oznacen kao nepopunjen`);
  }
  const complete = analyze(numbered(['Literatura', entryText('Horvat', '2020'), 'Novak, N. (2022). Pravi naslov djela. Zagreb: Izdavač.', entryText('Zubak', '2019')]), 'hr');
  if (complete.entries.length !== 3 || complete.entries.some((entry) => entry.flags.includes('unfilled-template'))) problems.push('nepopunjen:popunjen: popunjen zapis je oznacen kao predlozak');
  return problems;
}

/**
 * Z36 krug 4, tocka 3: citat bez zapisa u odlomku s w:br ili w:tab ispred citata. Plan ga salje
 * nepromijenjenog uz dodani zapis; fixer ga mora procitati (tekst analize), pa recept ne pada, a
 * OSTALE potvrde iste stavke (izmijenjen citat u drugom odlomku) se primjenjuju. Plan se gradi
 * stvarnim graditeljem iz ulaza kakav daje analiza: odmaci i otisci iz teksta koji vidi parser.
 */
export function brTabPotvrdeProblemi(build: PlanBuilder, fixer: SyncFixer): string[] {
  const problems: string[] = [];
  const paragraphsXml = [
    '<w:p><w:r><w:t>Tekst</w:t><w:br/><w:t xml:space="preserve">navodi izvor (Novak, 2022).</w:t></w:r></w:p>',
    '<w:p><w:r><w:t>Drugi</w:t><w:tab/><w:t xml:space="preserve">odlomak (Babić, 2021).</w:t></w:r></w:p>',
    paragraph('Treći odlomak (Horvat, 2020) i (Zorić, 2021).'),
    paragraph('Literatura'),
    paragraph(entryText('Horvat', '2020')),
    paragraph(entryText('Zorić', '2021')),
  ];
  const documentXml = `<w:document><w:body>${paragraphsXml.join('')}<w:sectPr/></w:body></w:document>`;
  const seen = paragraphsXml.map(analysisParagraphText);
  const occurrences = seen.slice(0, 3).flatMap((text, i) => extractCitationOccurrences([{ index: i + 1, text }]));
  if (!/\n/.test(seen[0]) || !/\t/.test(seen[1]) || occurrences.length !== 4) problems.push(`br-tab: ulaz nema citate iza w:br i w:tab (${JSON.stringify(seen.slice(0, 2))})`);
  const citations = occurrences.map((occurrence) => ({ id: `citation-${occurrence.paragraphIndex}-${occurrence.start}`, paragraphIndex: occurrence.paragraphIndex, start: occurrence.start, end: occurrence.end, rawText: occurrence.rawText, author: occurrence.author, year: occurrence.year, form: occurrence.form, anchorFingerprint: citationAnchorFingerprint(occurrence.paragraphIndex, seen[occurrence.paragraphIndex - 1]), confidence: 'high' }));
  const missing = citations.filter((citation) => citation.paragraphIndex < 3);
  const entries = [5, 6].map((index) => ({ id: `bibliography-${index}`, paragraphIndices: [index], anchorFingerprint: bibliographyAnchorFingerprint([index], seen[index - 1]), rawText: seen[index - 1] }));
  const result = {
    details: {
      citationBibliographySync: {
        citations,
        links: citations.map((citation) => (citation.paragraphIndex < 3
          ? { citationId: citation.id, status: 'missing', candidates: [], reason: 'nedostaje' }
          : { citationId: citation.id, status: 'matched', bibliographyEntryId: citation.author === 'Horvat' ? 'bibliography-5' : 'bibliography-6', candidates: [], reason: 'podudaranje' })),
        missingEntries: missing,
        duplicateCandidates: [],
        summary: { citations: 4, matched: 2, missing: 2, ambiguous: 0, pageIssues: 0 },
      },
      bibliographyStructure: { entries },
    },
  };
  const form = build(result, planProfile({ mode: 'author-year', allowMissingEntryInsertion: true }))[0]?.citationBibliographySyncForm;
  if (!form || form.missingEntries.length !== 2) return [...problems, 'br-tab: plan ne nudi oba zapisa'];
  for (const row of form.missingEntries) row.selected = true;
  const horvat = form.citations.find((row) => row.rawText === 'Horvat, 2020');
  if (!horvat) return [...problems, 'br-tab: plan nema citat Horvat'];
  horvat.selected = true;
  horvat.replacementText = 'Horvat, 2020, str. 5';
  const params = form.buildParams(form) as unknown as Parameters<SyncFixer>[1];
  const parts = { documentXml, stylesXml: '' };
  const first = fixer(parts, params);
  const texts = paragraphTexts(first.parts.documentXml);
  if (!first.applied) problems.push(`br-tab: recept je pao (${first.reason})`);
  if (!texts.includes('Treći odlomak (Horvat, 2020, str. 5) i (Zorić, 2021).')) problems.push('br-tab: ostala potvrda (izmijenjen citat) nije primijenjena');
  for (const [surname, year] of [['Novak', '2022'], ['Babić', '2021']]) if (!texts.includes(template(surname, year))) problems.push(`br-tab: zapis ${surname} nije umetnut (${JSON.stringify(first.skippedActions)})`);
  for (const xml of paragraphsXml.slice(0, 2)) if (!first.parts.documentXml.includes(xml)) problems.push('br-tab: odlomak citata s w:br ili w:tab je prepisan');
  const second = fixer(first.parts, params);
  if (second.applied || second.parts.documentXml !== first.parts.documentXml) problems.push(`br-tab: drugi prolaz nije no-op (${second.reason})`);
  return problems;
}

const COMPLETENESS_ID = 'reference.completeness';

/**
 * Z36 krug 4, tocka 4: predlozak umetnut istim popravkom nije regresija ploce, ali stvaran pad jest.
 * (a) analiza imenuje predloske samo kad su JEDINI razlog nepotpunosti; (b) ploca takvu regresiju
 * izdvaja u stavku "Popuni polja u zagradama: ..."; (c) provjereni ishod ne preporucuje izvornik.
 * Uz predlozak i stvaran pad (druga provjera, ili kratak zapis u istom popisu) regresija ostaje.
 */
export function predlozakNaPlociProblemi(
  labels: (incomplete: Array<{ text: string; author?: string; year?: string }>) => string[],
  split: (regressions: PassRegression[], after: RegressionCheckLike[]) => { regressions: PassRegression[]; fill: string | null },
  verified: (src: VerifiedOutcomeSource) => VerifiedRepairOutcome,
): string[] {
  const problems: string[] = [];
  const novak = { text: template('Novak', '2022'), author: 'novak', year: '2022' };
  if (JSON.stringify(labels([novak])) !== JSON.stringify(['Novak (2022)'])) problems.push(`oznake: predlozak nije imenovan (${JSON.stringify(labels([novak]))})`);
  if (labels([novak, { text: 'Kratko.', author: 'kratko', year: '2020' }]).length) problems.push('jedini-razlog: uz kratak zapis predlozak je imenovan kao jedini razlog');
  if (labels([novak, { text: 'Horvat, A. Naslov bez godine. Zagreb: Izdavač.', author: 'horvat', year: '' }]).length) problems.push('jedini-razlog: uz zapis bez godine predlozak je imenovan kao jedini razlog');
  if (labels([{ ...novak, text: 'Novak, N. (2022). Naslov.' }]).length) problems.push('jedini-razlog: kratak zapis bez polja imenovan je kao predlozak');

  const check = (id: string, title: string, status: string, earned: number, max: number, extra: Record<string, unknown> = {}) => ({ id, title, status, earned, max, ...extra });
  const before = [check(COMPLETENESS_ID, 'Potpunost bibliografskih zapisa', 'pass', 5, 5), check('notes.format', 'Oblikovanje fusnota', 'pass', 4, 4)];
  const filled = check(COMPLETENESS_ID, 'Potpunost bibliografskih zapisa', 'warn', 4, 5, { unfilledTemplates: ['Novak (2022)'] });
  const realFall = check(COMPLETENESS_ID, 'Potpunost bibliografskih zapisa', 'warn', 3, 5);
  const regression = (title: string, id: string) => ({ id, title, after: 'warn', lostPoints: 1 });
  const onlyTemplate = split([regression('Potpunost bibliografskih zapisa', COMPLETENESS_ID)], [filled, before[1]]);
  if (onlyTemplate.regressions.length || onlyTemplate.fill !== 'Popuni polja u zagradama: Novak (2022)') problems.push(`ploca: predlozak je prikazan kao regresija (${JSON.stringify(onlyTemplate)})`);
  const withReal = split([regression('Potpunost bibliografskih zapisa', COMPLETENESS_ID), regression('Oblikovanje fusnota', 'notes.format')], [filled, check('notes.format', 'Oblikovanje fusnota', 'fail', 0, 4)]);
  if (JSON.stringify(withReal.regressions.map((r) => r.id)) !== JSON.stringify(['notes.format'])) problems.push(`ploca-stvarna: stvarna regresija uz predlozak nije prikazana (${JSON.stringify(withReal.regressions)})`);
  const realOnly = split([regression('Potpunost bibliografskih zapisa', COMPLETENESS_ID)], [realFall]);
  if (realOnly.regressions.length !== 1 || realOnly.fill !== null) problems.push('ploca-stvarna: pad potpunosti bez oznake predloska nije regresija');

  const outcome = (after: Array<Record<string, unknown>>) => verified({ before, after, selected: [], skippedRuleIds: [], integrity: 'passed' });
  const templated = outcome([filled, before[1]]);
  if (templated.regressedIds.length || !templated.recommendRepairedCopy) problems.push(`ishod: predlozak obara preporuku popravljene kopije (${JSON.stringify(templated.regressedIds)})`);
  const real = outcome([filled, check('notes.format', 'Oblikovanje fusnota', 'fail', 0, 4)]);
  if (JSON.stringify(real.regressedIds) !== JSON.stringify(['notes.format']) || real.recommendRepairedCopy) problems.push(`ishod-stvarna: stvarna regresija ne obara preporuku (${JSON.stringify(real.regressedIds)})`);
  if (!outcome([realFall, before[1]]).regressedIds.includes(COMPLETENESS_ID)) problems.push('ishod-stvarna: pad potpunosti bez oznake predloska nije regresija');
  return problems;
}
