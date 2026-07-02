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
  year?: string;
  publisher?: string;
  place?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  /** Datum pristupa mreznom izvoru, slobodan format (npr. "2.7.2026."). */
  accessed?: string;
  institution?: string;
}

export interface ParsedAuthor {
  last: string;
  first: string;
}

/** Razbije slobodan unos autora u strukturu prezime/ime. Prazni unosi se odbacuju. */
export function parseAuthors(raw: string | undefined): ParsedAuthor[] {
  if (!raw) return [];
  return raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
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
  const year = inp.year ? `(${inp.year}).` : '';
  const t = inp.title || '';
  const parts: string[] = [];
  const lead = [A, year].filter(Boolean).join(' ');
  if (lead) parts.push(lead);

  switch (inp.type) {
    case 'knjiga':
    case 'zavrsni': {
      parts.push(withDot(t));
      if (inp.type === 'zavrsni') {
        const kind = inp.institution ? `Neobjavljeni zavrsni rad. ${inp.institution}` : 'Neobjavljeni zavrsni rad';
        parts.push(withDot(kind));
      } else {
        const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
        if (pub) parts.push(withDot(pub));
      }
      break;
    }
    case 'poglavlje': {
      parts.push(withDot(t));
      const inWork = inp.container ? `U: ${inp.container}` : '';
      const pg = inp.pages ? `(str. ${inp.pages})` : '';
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      parts.push(withDot([inWork, pg].filter(Boolean).join(' ')));
      if (pub) parts.push(withDot(pub));
      break;
    }
    case 'clanak': {
      parts.push(withDot(t));
      const vol = inp.volume ? `${inp.container}, ${inp.volume}` : inp.container || '';
      const iss = inp.issue ? `(${inp.issue})` : '';
      const pg = inp.pages ? `, ${inp.pages}` : '';
      parts.push(withDot(`${vol}${iss}${pg}`));
      break;
    }
    case 'mrezni': {
      parts.push(withDot(t));
      if (inp.publisher) parts.push(withDot(inp.publisher));
      if (inp.url) {
        const acc = inp.accessed ? `Pristupljeno ${inp.accessed} ` : '';
        parts.push(`${acc}${inp.url}`);
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
        parts.push(withDot(inp.institution ? `Zavrsni rad, ${inp.institution}` : 'Zavrsni rad'));
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
      const inWork = inp.container ? `u: ${inp.container}` : '';
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      const tail = [pub, inp.year].filter(Boolean).join(', ');
      parts.push(withDot([inWork, tail].filter(Boolean).join(', ')));
      if (inp.pages) parts.push(withDot(`str. ${inp.pages}`));
      break;
    }
    case 'clanak': {
      parts.push(quoted(title));
      const loc = inp.volume ? `${inp.container} ${inp.volume}` : inp.container || '';
      const iss = inp.issue ? `, br. ${inp.issue}` : '';
      const yr = inp.year ? ` (${inp.year})` : '';
      const pg = inp.pages ? `: ${inp.pages}` : '';
      parts.push(withDot(`${loc}${iss}${yr}${pg}`));
      break;
    }
    case 'mrezni': {
      parts.push(quoted(title));
      if (inp.publisher) parts.push(withDot(inp.publisher));
      if (inp.url) {
        const acc = inp.accessed ? ` (pristupljeno ${inp.accessed})` : '';
        parts.push(withDot(`${inp.url}${acc}`));
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
  /** Polja koja nedostaju a preporucena su za dani tip izvora. */
  missing: string[];
}

const RECOMMENDED: Record<SourceType, Array<keyof CitationInput>> = {
  knjiga: ['authors', 'title', 'year', 'publisher'],
  poglavlje: ['authors', 'title', 'container', 'year', 'publisher'],
  clanak: ['authors', 'title', 'container', 'year'],
  mrezni: ['title', 'url'],
  zavrsni: ['authors', 'title', 'year', 'institution'],
  propis: ['title', 'container'],
};

const FIELD_LABEL: Partial<Record<keyof CitationInput, string>> = {
  authors: 'autor',
  title: 'naslov',
  container: 'izvor (casopis/zbornik/sluzbeni list)',
  year: 'godina',
  publisher: 'izdavac',
  url: 'poveznica',
  institution: 'ustanova',
};

export function formatCitation(inp: CitationInput, style: CitationStyle): CitationResult {
  const citation = style === 'autor-godina' ? formatAutorGodina(inp) : formatFusnota(inp);
  const missing = (RECOMMENDED[inp.type] || [])
    .filter((f) => !(inp[f] && String(inp[f]).trim()))
    .map((f) => FIELD_LABEL[f] || String(f));
  return { citation, missing };
}
