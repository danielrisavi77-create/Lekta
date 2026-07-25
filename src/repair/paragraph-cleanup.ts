// src/repair/paragraph-cleanup.ts
//
// Popravak za "Prazne odlomci" nalaz (src/analysis/analyze-docx.ts, informativna
// provjera emptyRatio): student cesto razmak izmedju odlomaka pravi visestrukim
// pritiskanjem Enter umjesto postavki odlomka (razmak prije/poslije), pa document.xml
// zavrsi s nizovima od 3, 5, 10 uzastopnih praznih <w:p> cvorova. Ovaj modul kolabira
// svaki takav niz od 2 ili vise UZASTOPNIH, strukturno praznih odlomaka na tocno 1,
// nikad na 0 (jedan prazan odlomak izmedju dva pasusa je legitiman razmak, ne visak).
//
// Semantika je NAMJERNO konzervativna, isti regex-patch pristup kao xml-patch.ts i
// run-level.ts (bez DOM round-trip): odlomak se smije obrisati SAMO ako je dokazano
// da ne nosi nikakvu strukturu, ni vidljivu ni nevidljivu:
// - Preskacu se odlomci unutar tablica (w:tbl), tekstualnih okvira (w:txbxContent)
//   i strukturiranih kontrola (w:sdt), balansirano prema ugnjezdenju (ista logika
//   kao run-level.ts, ovdje namjerno reimplementirana lokalno da ovaj modul ostane
//   potpuno neovisan o run-level.ts, koji je dio zasticenog parser/audit sloja).
// - Odlomak sa stilom (w:pStyle) razlicitim od "Normal" se ne dira: naslovi, citati,
//   natpisi, popisi cesto imaju namjerno prazan sadrzaj (npr. naslov bez teksta kao
//   privremeni placeholder) i njihov polozaj u strukturi dokumenta nosi znacenje.
// - Odlomak ciji w:pPr sadrzi ugnjezdeni w:sectPr se NIKAD ne dira: Word sprema prijelom
//   odjeljka upravo tako (u pPr POSLJEDNJEG odlomka svakog ne-zavrsnog odjeljka), pa
//   brisanje takvog odlomka tiho spaja dva odjeljka (gubi velicinu stranice, marginale,
//   zaglavlja tog odjeljka). Zavrsni w:sectPr dokumenta zivi izravno pod w:body, izvan
//   bilo kojeg w:p, pa ga regex za odlomke i ne hvata; posebna zastita mu ne treba.
// - Odlomak koji sadrzi ugradjeni sadrzaj (w:drawing/w:pict/w:object), prijelome
//   (w:br/w:lastRenderedPageBreak), mehaniku polja (w:fldSimple/w:fldChar/w:instrText,
//   npr. PAGE/TOC polja cija cache vrijednost moze izgledati prazno u sirovom XML-u
//   prije Wordovog preracunavanja), reference (w:footnoteReference/w:endnoteReference/
//   w:commentReference) ili oznake (w:bookmarkStart/w:bookmarkEnd) se ne dira: sve su
//   to nevidljive strukture koje "prazan" odlomak samo naizgled cine praznim.
// - Prazninu odredjuje ISKLJUCIVO sadrzaj w:t elemenata: formatiranje na runu (w:rPr)
//   ne sprjecava kvalifikaciju, niti razmaci unutar w:t (xml:space="preserve").
// - Samozatvarajuci odlomci (<w:p/> ili <w:p w:rsidR="00AA"/>, cesti za "goli" Enter
//   bez ikakvih svojstava odlomka) se TAKODJER hvataju i kvalificiraju bezuvjetno (osim
//   provjere zasticene zone): XML konstrukcijom samozatvarajuci tag nema djece, pa ne
//   moze nositi w:pStyle, w:sectPr, ugradjeni/nevidljivi sadrzaj ni w:t tekst; svi
//   gornji cuvari provjeravaju bas takav (nemoguci) djeci sadrzaj i za njih su no-op.
//
// Kad niz kvalificira (duljina >= 2), PRVI odlomak u nizu prezivljava netaknut, a
// preostali se brisu; usamljen kvalificirajuci odlomak (duljina niza 1) se NIKAD ne
// dira. Sve izvan obrisanih raspona ostaje bajt-identicno.

export interface ParagraphCleanupResult {
  xml: string;
  applied: boolean;
  /** Broj obrisanih odlomaka (zbroj visaka preko svih kolabiranih nizova). */
  paragraphsRemoved: number;
  /** Broj nizova duljine >= 2 koji su kolabirani (svaki ostavlja tocno 1 prezivjeli). */
  runsCollapsed: number;
}

/**
 * Rasponi indeksa BALANSIRANIH blokova zadanog taga (podnosi ugnjezdenje).
 * Namjerno lokalna kopija iste logike kao run-level.ts (ne uvozi se odande:
 * run-level.ts je dio zasticenog parser/audit sloja i ne dira se bez golden testa).
 */
function balancedRanges(xml: string, tagName: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const token = new RegExp(`<${tagName}\\b[^>]*?(\\/?)>|</${tagName}>`, 'g');
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = token.exec(xml)) !== null) {
    // Samozatvarajuci tag nije ni otvaranje ni zatvaranje: prazan blok bez
    // sadrzaja. Da ga se broji kao otvaranje, depth bi se trajno zaglavio.
    if (m[1] === '/') continue;
    if (m[0][1] === '/') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start !== -1) {
        ranges.push([start, m.index + m[0].length]);
        start = -1;
      }
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  // Nezatvoren blok (malformiran docx): tretiraj rep dokumenta kao raspon
  // (radije preskoci nego riskiraj).
  if (depth > 0 && start !== -1) ranges.push([start, xml.length]);
  return ranges;
}

function insideRanges(offset: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

/** Ima li odlomak w:pStyle razlicit od "Normal" (takve nikad ne kvalificiraju kao visak). */
function hasNonNormalStyle(paragraph: string): boolean {
  const m = paragraph.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/);
  return !!m && m[1] !== 'Normal';
}

/** Elementi cija prisutnost sama po sebi diskvalificira odlomak kao "prazan". */
// `pageBreakBefore` je dodan 2026-07-20 nakon prijave s produkcije: prijelom stranice Word sprema
// i kao SVOJSTVO ODLOMKA (<w:pageBreakBefore/> u w:pPr), ne samo kao <w:br w:type="page"/> u runu.
// Takav odlomak nema vidljiv tekst, pa je prolazio kao "osirotjeli prazan" i bio obrisan, cime je
// nestajao prijelom i DVIJE STRANICE SU SE SPOJILE U JEDNU (spojene naslovnice).
// Dopuna iste klase (2026-07-20): `hasVisibleText` gleda ISKLJUCIVO <w:t>, pa je sve vidljivo sto
// nije tekstualni cvor prolazilo kao "prazno". Konkretno:
//   w:cr    rucni prijelom retka unutar runa (razmak koji je autor namjerno napravio),
//   w:sym   simbolski znak (Wingdings ukras na naslovnici nema w:t),
//   w:ptab  apsolutni tabulator (npr. desno poravnat vodic s tockama),
//   mc:AlternateContent  omotac oblika s rezervnim prikazom (danas ga posredno hvata w:drawing ili
//                        w:pict iznutra, ali jamstvo ne smije ovisiti o obliku rezerve).
const FORBIDDEN_CONTENT =
  /<w:(?:drawing|pict|object|br|cr|sym|ptab|lastRenderedPageBreak|pageBreakBefore|fldSimple|fldChar|instrText|footnoteReference|endnoteReference|commentReference|bookmarkStart|bookmarkEnd)\b|<mc:AlternateContent\b/;

/** Ima li odlomkov (prvi) w:pPr blok ugnjezdeni w:sectPr (prijelom odjeljka). */
function hasNestedSectPr(paragraph: string): boolean {
  const pPr = paragraph.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/);
  return !!pPr && /<w:sectPr\b/.test(pPr[0]);
}

/** Ima li odlomak ikakav vidljiv tekst (neprazan sadrzaj bilo kojeg w:t elementa). */
function hasVisibleText(paragraph: string): boolean {
  const texts = paragraph.matchAll(/<w:t\b[^>]*\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g);
  for (const t of texts) {
    const inner = t[1];
    if (inner !== undefined && inner.trim() !== '') return true;
  }
  return false;
}

/** Spoji sav vidljiv tekst odlomka (svi w:t, i kad je naslov razbijen na vise runova). */
function paragraphVisibleText(paragraph: string): string {
  let text = '';
  for (const t of paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) text += t[1];
  return text;
}

// Naslov kojim pocinju PRILOZI (dodaci): "Prilog", "Prilozi", "Prilog 1", "Dodatak", "Privitak",
// "Appendix"... Anticipira i uppercase ("PRILOZI") jer regex ne pazi na velicinu slova.
const APPENDIX_HEADING_RE = /^\s*(?:prilo(?:g|zi|ga)|dodat(?:ak|ci|aka)|privit(?:ak|ci)|privici|appendix|appendices)\b/i;

/**
 * Pocinje li odlomak sekciju priloga. Koristi se da se prazni odlomci NEPOSREDNO PRIJE naslova
 * priloga ne kolabiraju: autori cesto priloge guraju na novu stranicu nizom Enter-a (a ne pravim
 * prijelomom stranice); kolabiranje bi ih povuklo odmah iza literature. Cuvamo autorov razmak, bez
 * izmisljanja prijeloma. (Pravi prijelom stranice je ionako vec zasticen preko FORBIDDEN_CONTENT.)
 */
function startsAppendixSection(paragraph: string): boolean {
  return APPENDIX_HEADING_RE.test(paragraphVisibleText(paragraph));
}

/**
 * Kvalificira li se odlomak kao "osirotjeli prazan": bez stila, bez prijeloma
 * odjeljka, bez ugradjenog/nevidljivog sadrzaja i bez vidljivog teksta. Poziva
 * se SAMO nad odlomcima koji vec nisu u zasticenoj zoni (tablica/okvir/sdt).
 */
function qualifiesAsOrphanedEmpty(paragraph: string): boolean {
  if (hasNonNormalStyle(paragraph)) return false;
  if (hasNestedSectPr(paragraph)) return false;
  if (FORBIDDEN_CONTENT.test(paragraph)) return false;
  if (hasVisibleText(paragraph)) return false;
  return true;
}

// Dva oblika odlomka, spojena u JEDAN global regex (alternacija) da poredak matcheva
// ostane dokumentni poredak, sto je uvjet za ispravno grupiranje uzastopnih nizova:
// - PAIRED_SRC: otvarajuci tag NE smije biti samozatvarajuci (<w:p/> ili <w:p attrs/>):
//   inace bi match progutao sve do </w:p> SLJEDECEG odlomka i obradio dva kao jedan.
//   Identican regex kao run-level.ts (namjerno, ista sigurnosna invarijanta, ovdje
//   lokalna kopija).
// - SELF_CLOSING_SRC: hvata bas taj samozatvarajuci oblik koji PAIRED_SRC namjerno
//   iskljucuje. Alternacija prvo proba ovu granu; kod pravog uparenog odlomka
//   (npr. <w:p w:rsidR="00AA">tekst</w:p>) ne moze uspjeti jer atributni dio ne sadrzi
//   "/" neposredno prije zavrsnog ">", pa regex motor ispravno pada na PAIRED_SRC granu.
const SELF_CLOSING_SRC = String.raw`<w:p(?:\s[^>]*)?/>`;
const PAIRED_SRC = String.raw`<w:p(?:\s[^>]*[^/>])?>[\s\S]*?</w:p>`;
const PARAGRAPH_RE = new RegExp(`${SELF_CLOSING_SRC}|${PAIRED_SRC}`, 'g');

interface ParagraphMatch {
  start: number;
  end: number;
  qualifies: boolean;
}

/**
 * Raspon "front mattera" (naslovnice i sve prije prvog pravog naslova), koji se tretira kao
 * zasticena zona. Granica je PRVI odlomak sa stilom naslova (`w:pStyle` ciji val sadrzi Heading
 * ili Naslov): tijelo rada pocinje naslovom ("Sadrzaj", "Uvod"), a naslovnica ga po definiciji
 * nema. Nema naslova -> nema zone (zatecено ponasanje).
 *
 * REZERVA za dokumente BEZ ijednog stila naslova (rad formatiran rucno, sto analiza inace i
 * prijavljuje): ondje granica pada na PRVI prijelom stranice, ali samo ako to podrucje uistinu
 * izgleda kao naslovnica. Uvjeti su namjerno uski, jer prijelom stranice sam po sebi nista ne znaci
 * (u sredini rada ih je puno) i jer je dokumentirano ponasanje da prijelom DIJELI nizove praznih
 * odlomaka:
 *   - podrucje mora sadrzavati bar dva odlomka s vidljivim tekstom (naslovnica ima ustanovu, naslov,
 *     autora; niz samih praznih odlomaka prije prijeloma NIJE naslovnica),
 *   - i ne smije biti dulje od jedne stranice teksta (cap odlomaka), da se ne zastiti pola rada.
 *
 * Konzervativno u smjeru "radije ne diraj": pogresno zasticen odlomak znaci samo visak praznog
 * reda, dok pogresno obrisan trajno mijenja izgled naslovnice.
 */
const FRONT_MATTER_MAX_PARAGRAPHS = 60;
const FRONT_MATTER_MIN_TEXT_PARAGRAPHS = 2;

function frontMatterRange(documentXml: string): Array<[number, number]> {
  const heading = documentXml.match(/<w:pStyle\b[^>]*w:val="[^"]*(?:Heading|Naslov)[^"]*"/i);
  if (heading && heading.index !== undefined) return [[0, heading.index]];

  const brk = documentXml.match(/<w:pageBreakBefore\b|<w:br\b[^>]*w:type="page"/i);
  if (!brk || brk.index === undefined) return [];
  const head = documentXml.slice(0, brk.index);
  const paragraphs = head.match(new RegExp(`${SELF_CLOSING_SRC}|${PAIRED_SRC}`, 'g')) || [];
  if (paragraphs.length > FRONT_MATTER_MAX_PARAGRAPHS) return [];
  const withText = paragraphs.filter((p) => hasVisibleText(p)).length;
  if (withText < FRONT_MATTER_MIN_TEXT_PARAGRAPHS) return [];
  return [[0, brk.index]];
}

/**
 * Kolabira nizove od 2 ili vise uzastopnih, strukturno praznih odlomaka na tocno 1;
 * nikad na 0. Sve ostalo (ukljucujuci odlomke u tablicama/okvirima/sdt, stilizirane,
 * one s prijelomom odjeljka, poljima, referencama ili vidljivim tekstom) ostaje
 * netaknuto. applied=false znaci da nije bilo sto kolabirati (fail-safe, dokument
 * bajt-identican ulazu).
 */
export function stripOrphanedEmptyParagraphs(documentXml: string): ParagraphCleanupResult {
  const protectedRanges = [
    ...balancedRanges(documentXml, 'w:txbxContent'),
    ...balancedRanges(documentXml, 'w:tbl'),
    ...balancedRanges(documentXml, 'w:sdt'),
    // Naslovnica je jedno od rijetkih mjesta gdje su uzastopni prazni odlomci NAMJERNI: njima se
    // radi okomiti razmak (fakultet gore, naslov u sredini, mentor i datum dolje). Kolabiranje ih
    // je zbijalo u hrpu. Front matter se zato tretira kao zasticena zona (vlasnikova prijava
    // 2026-07-20: "mora vratiti naslovnicu kako je bila").
    ...frontMatterRange(documentXml),
  ];

  const matches: ParagraphMatch[] = [];
  let m: RegExpExecArray | null;
  PARAGRAPH_RE.lastIndex = 0;
  while ((m = PARAGRAPH_RE.exec(documentXml)) !== null) {
    const paragraph = m[0];
    const start = m.index;
    const end = start + paragraph.length;
    // Samozatvarajuci match uvijek zavrsava doslovno s "/>"; upareni uvijek s "</w:p>"
    // (dakle "p>", nikad "/>" neposredno prije). Nedvosmisleno razlikuje granu bez
    // ponovnog testiranja cijelog regexa.
    const isSelfClosing = paragraph.endsWith('/>');

    let qualifies = false;
    if (!insideRanges(start, protectedRanges)) {
      if (isSelfClosing) {
        // Samozatvarajuci tag XML konstrukcijom nema djece: ne moze nositi w:pStyle,
        // ugnjezdeni w:sectPr, zabranjeni sadrzaj ni w:t. Jedina provjera koja je uopce
        // primjenjiva je zasticena zona (gore), pa se qualifiesAsOrphanedEmpty ovdje
        // namjerno preskace.
        qualifies = true;
      } else {
        // Odlomak koji SADRZI tekstualni okvir ili sdt (nije unutar jednog, nego ga
        // sam ugnjezduje): unutarnji zatvaraci sijeku non-greedy match pa bi se dio
        // pogresno obradio kao obicno tijelo. Isti guard kao run-level.ts.
        const nestedProtected = paragraph.includes('<w:txbxContent') || paragraph.includes('<w:sdt');
        if (!nestedProtected) qualifies = qualifiesAsOrphanedEmpty(paragraph);
      }
    }

    matches.push({ start, end, qualifies });
  }

  const toDelete = new Set<number>();
  let paragraphsRemoved = 0;
  let runsCollapsed = 0;

  let i = 0;
  while (i < matches.length) {
    if (!matches[i].qualifies) {
      i++;
      continue;
    }
    let j = i;
    while (j < matches.length && matches[j].qualifies) j++;
    const runLength = j - i;
    // Prazni odlomci neposredno prije naslova PRILOGA se ne diraju: oni "pune" stranicu da prilozi
    // pocnu na novoj. Kolabiranje bi ih povuklo odmah iza literature (vlasnikova prijava). matches[j]
    // je prvi ne-prazni odlomak nakon niza; ako je to naslov priloga, cijeli niz preskacemo.
    const nextStartsAppendix = j < matches.length && startsAppendixSection(documentXml.slice(matches[j].start, matches[j].end));
    if (runLength >= 2 && !nextStartsAppendix) {
      // Prvi u nizu prezivljava; ostatak se brise.
      for (let k = i + 1; k < j; k++) toDelete.add(k);
      paragraphsRemoved += runLength - 1;
      runsCollapsed++;
    }
    i = j;
  }

  if (paragraphsRemoved === 0) {
    return { xml: documentXml, applied: false, paragraphsRemoved: 0, runsCollapsed: 0 };
  }

  let out = '';
  let cursor = 0;
  for (let idx = 0; idx < matches.length; idx++) {
    if (!toDelete.has(idx)) continue;
    const mm = matches[idx];
    out += documentXml.slice(cursor, mm.start);
    cursor = mm.end;
  }
  out += documentXml.slice(cursor);

  return { xml: out, applied: true, paragraphsRemoved, runsCollapsed };
}
