// Besplatni citat generator (SEO free-tool, vidi docs/COMPETITORS.md sekcija 5).
// Cist, tipiziran, deterministican core: bez DOM-a, bez mreze, potpuno testabilan.
// NIJE dio glavnog analizatora ni golden puta; sluzi kao ulazni lijevak na landingu.
//
// Podrzana dva citatna obiteljska stila koja Lekta profili stvarno koriste:
//  - "autor-godina": APA-slicno, drustvene znanosti (npr. FPZG tekstualno)
//  - "fusnota":      Chicago-slicno, pravno i humanisticko (bibliografski redak)
//
// Namjerno konzervativno: bez em/en crtica, bez nagadanja polja koja korisnik nije dao.

export type SourceType = 'knjiga' | 'poglavlje' | 'clanak' | 'mrezni' | 'zavrsni' | 'propis';
export type CitationStyle = 'autor-godina' | 'fusnota';

export interface CitationInput {
  type: SourceType;
  /** Slobodan unos autora, jedan po retku ili odvojeni ";". Npr. "Ivic, Ivan; Horvat, Ana". */
  authors?: string;
  title?: string;
  /** Naslov sireg djela: casopis, zbornik/knjiga za poglavlje, sluzbeni list za propis. */
  container?: string;
  /** Urednik zbornika/knjige (za poglavlje): "I. Urednik" -> "U: I. Urednik (ur.), ...". */
  editor?: string;
  year?: string;
  publisher?: string;
  place?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  /** DOI (npr. "10.1234/abc" ili puni URL); normalizira se u https://doi.org/... */
  doi?: string;
  /** Datum pristupa mreznom izvoru, slobodan format (npr. "2.7.2026."). */
  accessed?: string;
  institution?: string;
}

/** Normaliziran DOI kao https://doi.org/... ili prazno. Prihvaca goli DOI i puni URL. */
function doiUrl(doi?: string): string {
  const d = (doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return d ? `https://doi.org/${d}` : '';
}

export interface ParsedAuthor {
  last: string;
  first: string;
}

// Organizacijske rijeci: kad se pojave (a nema zareza), autor je ustanova/tijelo, ne osoba,
// pa se NE razbija na prezime/ime (inace "Vlada Republike Hrvatske" -> "Hrvatske, V. R.").
const ORG_KEYWORDS =
  /\b(vlada|ministarstvo|zavod|institut|sveučiliš|sveucilis|fakultet|društvo|drustvo|ured|agencija|komisija|odbor|centar|zaklada|udruga|udruženj|udruzenj|savez|republik|akademij|knjižnic|knjiznic|muzej|škola|skola|nakladni)\b/i;

/** Razbije slobodan unos autora u strukturu prezime/ime. Prazni unosi se odbacuju.
 *  Ustanova/tijelo (bez zareza, s organizacijskom rijeci) ostaje doslovno, bez inicijala. */
export function parseAuthors(raw: string | undefined): ParsedAuthor[] {
  if (!raw) return [];
  return raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (!chunk.includes(',') && ORG_KEYWORDS.test(chunk)) {
        return { last: chunk, first: '' };
      }
      if (chunk.includes(',')) {
        const [last, first] = chunk.split(',');
        return { last: last.trim(), first: (first || '').trim() };
      }
      // "Ivan Ivic" -> zadnja rijec je prezime
      const parts = chunk.split(/\s+/);
      if (parts.length === 1) return { last: parts[0], first: '' };
      const last = parts[parts.length - 1];
      const first = parts.slice(0, -1).join(' ');
      return { last, first };
    });
}

function initials(first: string): string {
  return first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + '.')
    .join(' ');
}

/** Autor-godina (APA-slicno): "Prezime, I., & Prezime, I." */
function authorsAuthorYear(list: ParsedAuthor[]): string {
  if (!list.length) return '';
  const fmt = (a: ParsedAuthor) => (a.first ? `${a.last}, ${initials(a.first)}` : a.last);
  if (list.length === 1) return fmt(list[0]);
  const head = list.slice(0, -1).map(fmt).join(', ');
  return `${head}, & ${fmt(list[list.length - 1])}`;
}

/** Fusnota/bibliografija (Chicago-slicno): prvi autor obrnut, ostali prirodno. */
function authorsFootnote(list: ParsedAuthor[]): string {
  if (!list.length) return '';
  const first = list[0];
  const firstStr = first.first ? `${first.last}, ${first.first}` : first.last;
  if (list.length === 1) return firstStr;
  const rest = list.slice(1).map((a) => (a.first ? `${a.first} ${a.last}` : a.last));
  const last = rest.pop() as string;
  return rest.length ? `${firstStr}, ${rest.join(', ')} i ${last}` : `${firstStr} i ${last}`;
}

/** Ukloni visestruke razmake i suvisnu interpunkciju na spojevima. */
function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/,{2,}/g, ',')
    .replace(/\(\s*\)/g, '')
    .trim();
}

/** Naslov u navodnicima s tockom unutar navodnika (Chicago-slicno). */
function quoted(title: string): string {
  const t = (title || '').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? `"${t}"` : `"${t}."`;
}

function withDot(s: string | undefined): string {
  const t = (s || '').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function formatAutorGodina(inp: CitationInput): string {
  const A = authorsAuthorYear(parseAuthors(inp.authors));
  // (bez dat.) kad autor postoji a godine nema (APA-slicno "n.d."); bez autora ne dodajemo.
  const year = inp.year ? `(${inp.year}).` : (A ? '(bez dat.).' : '');
  const t = inp.title || '';
  const parts: string[] = [];
  const lead = [A, year].filter(Boolean).join(' ');
  if (lead) parts.push(withDot(lead)); // tocka iza autora i kad nema inicijala/godine (kao fusnota)

  switch (inp.type) {
    case 'knjiga':
    case 'zavrsni': {
      parts.push(withDot(t));
      if (inp.type === 'zavrsni') {
        const kind = inp.institution ? `Neobjavljeni završni rad. ${inp.institution}` : 'Neobjavljeni završni rad';
        parts.push(withDot(kind));
      } else {
        const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
        if (pub) parts.push(withDot(pub));
      }
      break;
    }
    case 'poglavlje': {
      parts.push(withDot(t));
      const ed = inp.editor ? `${inp.editor} (ur.), ` : '';
      const inWork = inp.container ? `U: ${ed}${inp.container}` : '';
      const pg = inp.pages ? `(str. ${inp.pages})` : '';
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      parts.push(withDot([inWork, pg].filter(Boolean).join(' ')));
      if (pub) parts.push(withDot(pub));
      break;
    }
    case 'clanak': {
      parts.push(withDot(t));
      const vol = [inp.container, inp.volume].filter(Boolean).join(', ');
      const iss = inp.issue ? `(${inp.issue})` : '';
      const pg = inp.pages ? `, ${inp.pages}` : '';
      parts.push(withDot(`${vol}${iss}${pg}`));
      const doi = doiUrl(inp.doi);
      if (doi) parts.push(doi);
      break;
    }
    case 'mrezni': {
      parts.push(withDot(t));
      if (inp.publisher) parts.push(withDot(inp.publisher));
      const doi = doiUrl(inp.doi);
      if (doi || inp.url) {
        const acc = inp.accessed ? `Pristupljeno ${inp.accessed} ` : '';
        parts.push(`${acc}${doi || inp.url}`);
      }
      break;
    }
    case 'propis': {
      parts.push(withDot(t));
      const src = [inp.container, inp.issue].filter(Boolean).join(', ');
      if (src) parts.push(withDot(src));
      break;
    }
  }
  return tidy(parts.join(' '));
}

function formatFusnota(inp: CitationInput): string {
  const A = authorsFootnote(parseAuthors(inp.authors));
  const parts: string[] = [];
  if (A) parts.push(withDot(A));

  const title = inp.title || '';
  switch (inp.type) {
    case 'knjiga':
    case 'zavrsni': {
      parts.push(withDot(`${title}`));
      if (inp.type === 'zavrsni') {
        parts.push(withDot(inp.institution ? `Završni rad, ${inp.institution}` : 'Završni rad'));
        if (inp.year) parts.push(withDot(inp.year));
      } else {
        const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
        const tail = [pub, inp.year].filter(Boolean).join(', ');
        if (tail) parts.push(withDot(tail));
      }
      break;
    }
    case 'poglavlje': {
      parts.push(quoted(title));
      const ed = inp.editor ? `${inp.editor} (ur.), ` : '';
      const inWork = inp.container ? `u: ${ed}${inp.container}` : '';
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      const tail = [pub, inp.year].filter(Boolean).join(', ');
      parts.push(withDot([inWork, tail].filter(Boolean).join(', ')));
      if (inp.pages) parts.push(withDot(`str. ${inp.pages}`));
      break;
    }
    case 'clanak': {
      parts.push(quoted(title));
      const loc = [inp.container, inp.volume].filter(Boolean).join(' ');
      const iss = inp.issue ? `, br. ${inp.issue}` : '';
      const yr = inp.year ? ` (${inp.year})` : '';
      const pg = inp.pages ? `: ${inp.pages}` : '';
      parts.push(withDot(`${loc}${iss}${yr}${pg}`));
      const doi = doiUrl(inp.doi);
      if (doi) parts.push(withDot(doi));
      break;
    }
    case 'mrezni': {
      parts.push(quoted(title));
      if (inp.publisher) parts.push(withDot(inp.publisher));
      const doi = doiUrl(inp.doi);
      const link = doi || inp.url;
      if (link) {
        const acc = inp.accessed ? ` (pristupljeno ${inp.accessed})` : '';
        parts.push(withDot(`${link}${acc}`));
      }
      break;
    }
    case 'propis': {
      parts.push(withDot(title));
      const src = [inp.container, inp.issue].filter(Boolean).join(', ');
      if (src) parts.push(withDot(src));
      break;
    }
  }
  return tidy(parts.join(' '));
}

export interface CitationResult {
  citation: string;
  /** Oblik za citiranje U TEKSTU (autor-godina), npr. "(Ivic, 2020)". Prazno za fusnotu
   *  (tamo se u tekstu koristi broj fusnote, koji generator ne moze znati). */
  inText: string;
  /** Polja koja nedostaju a preporucena su za dani tip izvora. */
  missing: string[];
}

/** In-text oblik autor-godina: 1 autor (Prezime, god.), 2 (A i B, god.), 3+ (A i sur., god.). */
function inTextAuthorYear(list: ParsedAuthor[], year: string): string {
  if (!list.length) return '';
  const yr = year || 'bez dat.';
  const sur = (a: ParsedAuthor) => a.last; // institucija ima cijeli naziv u "last"
  let who: string;
  if (list.length === 1) who = sur(list[0]);
  else if (list.length === 2) who = `${sur(list[0])} i ${sur(list[1])}`;
  else who = `${sur(list[0])} i sur.`;
  return `(${who}, ${yr})`;
}

const RECOMMENDED: Record<SourceType, Array<keyof CitationInput>> = {
  knjiga: ['authors', 'title', 'year', 'publisher'],
  poglavlje: ['authors', 'title', 'container', 'editor', 'year', 'publisher'],
  clanak: ['authors', 'title', 'container', 'year'],
  mrezni: ['title', 'url'],
  zavrsni: ['authors', 'title', 'year', 'institution'],
  propis: ['title', 'container'],
};

const FIELD_LABEL: Partial<Record<keyof CitationInput, string>> = {
  authors: 'autor',
  title: 'naslov',
  container: 'izvor (časopis/zbornik/službeni list)',
  editor: 'urednik',
  year: 'godina',
  publisher: 'izdavač',
  url: 'poveznica',
  institution: 'ustanova',
};

export function formatCitation(inp: CitationInput, style: CitationStyle): CitationResult {
  const citation = style === 'autor-godina' ? formatAutorGodina(inp) : formatFusnota(inp);
  const inText = style === 'autor-godina'
    ? inTextAuthorYear(parseAuthors(inp.authors), (inp.year || '').trim())
    : '';
  const missing = (RECOMMENDED[inp.type] || [])
    .filter((f) => !(inp[f] && String(inp[f]).trim()))
    .map((f) => FIELD_LABEL[f] || String(f));
  return { citation, inText, missing };
}
