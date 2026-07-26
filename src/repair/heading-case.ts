// src/repair/heading-case.ts
//
// Velika slova naslova: JEDINI popravak koji dira AUTOROV TEKST, pa nikad ne ide pod "Popravi sve"
// nego iskljucivo uz izricitu privolu za tu stavku.
//
// ZASTO SE NE RJESAVA OBLIKOVANJEM: Word ima `w:caps`, koji tekst samo PRIKAZUJE velikim slovima,
// a sam tekst ostavlja kakav jest. To bi zavaralo i nas ("Oblikovanje naslova po razinama" cita
// stvarni tekst preko isUppercaseText) i svakoga tko rad kopira ili pretrazuje. Ako uputa trazi
// velika slova, posteno je promijeniti tekst i to jasno reci, ne sakriti promjenu u prikaz.
//
// Hrvatska lokalizacija je bitna: "đ" mora dati "Đ", a ne "D".

/** Velika slova po hrvatskim pravilima, uz cuvanje XML entiteta (&amp; ne smije postati &AMP;).
 *  RE-09: heksadecimalna referenca (&#x161;) mora ostati NETAKNUTA, ne samo decimalna (&#233;):
 *  bez zastite, "x" unutar nje uppercasea u "X" (&#X161;), sto XML CharRef gramatika ne dopusta
 *  (literal "x" mora biti malo slovo), pa bi Word izlaz otvorio kroz "repair". */
export function toCroatianUpper(text: string): string {
  return text
    .split(/(&[a-zA-Z]+;|&#x[0-9a-fA-F]+;|&#\d+;)/)
    .map((part, i) => (i % 2 === 1 ? part : part.toLocaleUpperCase('hr-HR')))
    .join('');
}

/** Je li tekst vec u cijelosti velikim slovima (ista logika kao provjera u analizi)? */
export function isAlreadyUpper(text: string): boolean {
  const letters = (String(text || '').match(/\p{L}+/gu) || []).join('');
  return letters.length > 1 && letters === letters.toLocaleUpperCase('hr-HR');
}

export interface HeadingCaseResult {
  xml: string;
  applied: boolean;
  /** Koliko je naslova stvarno promijenjeno. */
  changed: number;
}

const PARAGRAPH_RE = /<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>/g;

// Izgradi mapu styleId -> razina naslova (1-9) iz stylesXml: prepoznaje i doslovni Wordov styleId
// "HeadingN" i lokalizirano/vlastito ime (npr. "Naslov 1", "Naslov1"). NAMJERNO STROZE (usidreno
// od pocetka do kraja) od headingLevel u src/docx/parser.ts (analiza): ova funkcija PREPISUJE
// autorov tekst, pa lazni pogodak (npr. stil nazvan "NaslovIzvora" ili "BodyHeading1") ima puno
// tezu posljedicu ovdje nego u analizi koja samo boduje. "Heading 1"/"Naslov1"/"Naslov 1" i slicno
// jos uvijek prolaze; "NotHeading1Body" ili "Naslov1Caption" vise ne.
const HEADING_STYLE_NAME_RE = /^\s*(?:heading|naslov)\s*([1-9])\s*$/i;

function headingStyleLevels(stylesXml: string): Map<string, number> {
  const levels = new Map<string, number>();
  const re = /<w:style\b[^>]*\/>|<w:style\b[^>]*>[\s\S]*?<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stylesXml)) !== null) {
    if (!/w:type="paragraph"/.test(m[0])) continue;
    const idMatch = m[0].match(/w:styleId="([^"]*)"/);
    if (!idMatch) continue;
    // Provjeri IME i styleId NEOVISNO (ne "ime ako postoji, inace id"): stil moze imati heading-nalik
    // styleId (npr. "Naslov2") uz nepovezano/generickо ime (npr. "Custom"), pa bi provjera SAMO imena
    // (kad postoji) taj stil ostavila NEPREPOZNATIM, sto bi kasnije lazno otvorilo outlineLvl rezervu
    // (Codex adversarijalni nalaz, drugi krug pregleda).
    const nameMatch = m[0].match(/<w:name\b[^>]*w:val="([^"]*)"/);
    const level = (nameMatch && nameMatch[1].match(HEADING_STYLE_NAME_RE)) || idMatch[1].match(HEADING_STYLE_NAME_RE);
    if (level) levels.set(idMatch[1], Number(level[1]));
  }
  return levels;
}

/**
 * Pretvori tekst naslova zadanih razina u velika slova, u `word/document.xml`.
 *
 * Dira ISKLJUCIVO sadrzaj `w:t` elemenata unutar odlomaka cija je `w:pStyle` jedna od trazenih
 * razina (ili, bez stila, cija razina proizlazi iz DIREKTNOG w:outlineLvl na samom odlomku). Sve
 * ostalo (oznake, polja, fusnotne reference, oblikovanje runova) ostaje netaknuto, pa se promjena
 * ne moze prosiriti izvan naslova.
 *
 * RE-08: `stylesXml` je OPCIONALAN (bez njega ponasanje ostaje doslovni "Heading{n}", kao prije),
 * ali kad je zadan, prepoznaje i lokalizirani/vlastiti styleId (npr. hrvatski Word/LibreOffice
 * "Naslov1"), koji analiza i patchHeadingFormat vec prepoznaju preko id-ili-ime pretrage.
 */
export function upperCaseHeadings(documentXml: string, levels: number[], stylesXml = ''): HeadingCaseResult {
  const wantedLevels = new Set(levels);
  if (!wantedLevels.size) return { xml: documentXml, applied: false, changed: 0 };
  const styleLevels = stylesXml ? headingStyleLevels(stylesXml) : new Map<string, number>();

  let changed = 0;
  const xml = documentXml.replace(PARAGRAPH_RE, (paragraph) => {
    // RE-10: ukloni <w:pPrChange> (stari, VEC NEVAZECI snimak pPr iz track changes) prije trazenja
    // pStyle. Bez ovoga, odlomak demotiran s HeadingN na Normal (sto Word cesto zapisuje kao
    // IZOSTANAK pStyle elementa, jer je Normal zadani) moze pogresno "pronaci" stari pStyle=HeadingN
    // zarobljen unutar pPrChange snimka kao jedini <w:pStyle> u cijelom odlomku, i tretirati vise
    // ne-naslov tekst kao naslov (izvan opsega privole za ovaj popravak).
    const withoutPPrChange = paragraph.replace(/<w:pPrChange\b[^>]*>[\s\S]*?<\/w:pPrChange>/, '');
    const style = withoutPPrChange.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/);
    // Razrijesi STVARNU razinu odlomka (neovisno o tome je li trazena), pa je TEK NA KRAJU usporedi
    // s wantedLevels. Bitno: outlineLvl je rezerva SAMO kad NEMA prepoznatog stila uopce, ne kad
    // prepoznati stil postoji ali nije trazena razina (inace bi npr. Heading2 s "vise" izravnim
    // outlineLvl=0 na istom odlomku pogresno ispao kao trazeni Heading1).
    let resolvedLevel: number | null = null;
    if (style) {
      // Doslovni Wordov oblik uvijek prepoznat, neovisno o stylesXml (bez regresije na stare pozive).
      const literal = style[1].match(/^Heading([1-9])$/);
      if (literal) resolvedLevel = Number(literal[1]);
      else if (styleLevels.has(style[1])) resolvedLevel = styleLevels.get(style[1])!;
    }
    if (resolvedLevel === null) {
      // Bez prepoznatog stila: DIREKTAN w:outlineLvl na odlomku Word ISTO tretira kao naslov
      // (outlineLvl je 0-indeksiran 0-8, razina = vrijednost + 1; isti raspon kao headingLevel).
      const pPr = withoutPPrChange.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/);
      const outline = pPr?.[0].match(/<w:outlineLvl\b[^>]*w:val="([0-8])"(?!\d)/);
      if (outline) resolvedLevel = Number(outline[1]) + 1;
    }
    if (resolvedLevel === null || !wantedLevels.has(resolvedLevel)) return paragraph;

    // Tekst odlomka za odluku "je li vec veliko": bez toga bi se svaki prolaz brojao kao promjena.
    const plain = (paragraph.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ''))
      .join('');
    if (!plain.trim() || isAlreadyUpper(plain)) return paragraph;

    let touched = false;
    const out = paragraph.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (_m, open: string, inner: string, close: string) => {
      const upper = toCroatianUpper(inner);
      if (upper !== inner) touched = true;
      return open + upper + close;
    });
    if (touched) changed++;
    return out;
  });

  return { xml, applied: changed > 0, changed };
}

export interface HeadingCaseSuggestion {
  level: number;
  from: string;
  to: string;
}

/**
 * Sto bi se promijenilo, bez ikakve izmjene dokumenta. Sluzi opciji "samo prijedlog": korisnik
 * vidi tocan popis naslova i njihov novi oblik, pa moze odluciti rucno.
 */
export function headingCaseSuggestions(
  headings: Array<{ level?: number | null; text?: string | null }>,
  levels: number[],
  limit = 50,
): HeadingCaseSuggestion[] {
  const wanted = new Set(levels);
  const out: HeadingCaseSuggestion[] = [];
  for (const h of headings || []) {
    const level = Number(h?.level);
    const text = String(h?.text ?? '').trim();
    if (!wanted.has(level) || !text || isAlreadyUpper(text)) continue;
    out.push({ level, from: text, to: toCroatianUpper(text) });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Prijedlog numeriranja naslova (SAMO prijedlog, nikad automatska primjena).
 *
 * Numeriranje se ne primjenjuje automatski jer bi znacilo pisati u autorov rad na mjestu gdje
 * pogreska nije samo kozmeticka: kriva razina ili preskocen broj mijenjaju znacenje strukture.
 * Zato se racuna tocan predlozeni broj po dokument-poretku i prepusta se autoru.
 */
export function headingNumberSuggestions(
  headings: Array<{ level?: number | null; text?: string | null }>,
  maxLevel = 3,
  limit = 60,
): Array<{ level: number; from: string; to: string }> {
  const counters: number[] = [];
  const out: Array<{ level: number; from: string; to: string }> = [];
  for (const h of headings || []) {
    const level = Number(h?.level);
    const text = String(h?.text ?? '').trim();
    if (!Number.isFinite(level) || level < 1 || level > maxLevel || !text) continue;
    counters.length = Math.max(counters.length, level);
    counters[level - 1] = (counters[level - 1] || 0) + 1;
    for (let i = level; i < counters.length; i++) counters[i] = 0;
    const prefix = counters.slice(0, level).filter((n) => n > 0).join('.');
    const bare = text.replace(/^\s*(?:(?:[IVXLCDM]+)|(?:\d+(?:\.\d+)*))\.?\s+/i, '');
    const proposed = `${prefix}. ${bare}`;
    if (proposed !== text && out.length < limit) out.push({ level, from: text, to: proposed });
  }
  return out;
}
