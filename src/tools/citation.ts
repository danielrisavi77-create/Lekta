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
// autor-godina (APA/Harvard obitelj), fusnota (Chicago/pravne biljeske), te dva numericka
// stila (IEEE, Vancouver) koja Lekta profili stvarno koriste (recommendedCitation tokeni).
// 'autor-godina' = naslijedeni genericki autor-godina (back-compat, hrvatske strukturne rijeci).
// 'apa'/'harvard'/'chicago-author-date' = VJERNI pod-stilovi (validirani protiv doi.org/CSL).
export type CitationStyle = 'autor-godina' | 'apa' | 'harvard' | 'chicago-author-date' | 'fusnota' | 'ieee' | 'vancouver';

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
  /** Datum pristupa mreznom izvoru, slobodan format (npr. "2. 7. 2026."). */
  accessed?: string;
  institution?: string;
}

/** Normaliziran DOI kao https://doi.org/... ili prazno. Prihvaca goli DOI i puni URL.
 *  Exportano za citation-spec renderer (behaviour-neutralno). */
export function doiUrl(doi?: string): string {
  const d = (doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return d ? `https://doi.org/${d}` : '';
}

export interface ParsedAuthor {
  last: string;
  first: string;
}

// Organizacijske rijeci: kad se pojave (a nema zareza), autor je ustanova/tijelo, ne osoba,
// pa se NE razbija na prezime/ime (inace "Vlada Republike Hrvatske" -> "Hrvatske, V. R.").
//
// Granica se NE oslanja na \b: u JS-u je \b ASCII pa pada i ispred dijakritika ("škola" -> \b
// prije š ne postoji) i ispred sklonidbenog nastavka ("Republik" + "a" -> \b izmedu dva slova
// ne postoji), zbog cega su korijeni tiho bili mrtvi. Umjesto toga konzumiramo ne-slovnu
// granicu (?:^|[^\p{L}\p{N}]) uz 'u' flag. Dvije skupine:
//  - ORG_STEM: korijen dovoljno distinktivan da hvata i sklonjene oblike (dopusten nastavak
//    slova): "akademij" -> Akademija/Akademije, "republik" -> Republika/Republike.
//  - ORG_FULL: pune rijeci gdje bi korijen lazno hvatao OSOBE, pa traze trailing granicu
//    (?![\p{L}]): "ured" (ne "urednik"), "vladi" (ne "Vladimir"), "vlada" (ne "vladar").
// Poznato ogranicenje: "Vlada" je i musko ime, pa "Vlada Gotovac" (osoba) i dalje ispada kao
// ustanova; institucionalno znacenje je u citatima daleko cesce, pa svjesno ostaje default.
const ORG_STEM = [
  'ministarstv', 'sveučiliš', 'sveucilis', 'fakultet', 'institut', 'akademij',
  'republik', 'udruženj', 'udruzenj', 'knjižnic', 'knjiznic', 'društv', 'drustv',
  'agencij', 'komisij', 'zaklad', 'muzej', 'nakladn', 'škol', 'skol',
];
// Poznato ogranicenje: ENGLESKI grupni autori bez zareza (World Health Organization, United
// Nations...) jos se ne prepoznaju pa ispadaju kao osoba ("Organization, W. H."). Detekcija je
// u dijeljenom parseAuthors (koristi ga i citation-spec renderer), pa se ne prosiruje ovdje
// bez sireg testiranja; hrvatski institucijski nazivi (ministarstv/sveucilis/...) su pokriveni.
const ORG_FULL = [
  'vlada', 'vlade', 'vladi', 'vladu', 'zavod', 'ured', 'odbor', 'centar',
  'savez', 'udruga', 'udruge', 'komora', 'komore', 'sabor', 'sabora',
];
const ORG_KEYWORDS = new RegExp(
  '(?:^|[^\\p{L}\\p{N}])(?:(?:' + ORG_STEM.join('|') + ')|(?:(?:' + ORG_FULL.join('|') + ')(?![\\p{L}])))',
  'iu',
);

/** Razbije slobodan unos autora u strukturu prezime/ime. Prazni unosi se odbacuju.
 *  Ustanova/tijelo (bez zareza, s organizacijskom rijeci) ostaje doslovno, bez inicijala. */
export function parseAuthors(raw: string | undefined): ParsedAuthor[] {
  if (!raw) return [];
  return raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((chunk): ParsedAuthor[] => {
      if (!chunk.includes(',') && ORG_KEYWORDS.test(chunk)) {
        return [{ last: chunk, first: '' }];
      }
      if (chunk.includes(',')) {
        const segs = chunk.split(',').map((s) => s.trim()).filter(Boolean);
        // Placeholder trazi ';' izmedju autora, ali kopirana referenca cesto vec ima zareze
        // ("Kovacic, Ivan, Horvat, Ana"): vise od jednog "prezime, ime" para u istom chunku.
        // Ne odbacuj visak tiho - uparuje uzastopne segmente kao (prezime, ime); neparni
        // zavrsni segment ostaje samostalni autor bez imena (bolje djelomican podatak nego
        // nestao koautor).
        const out: ParsedAuthor[] = [];
        for (let i = 0; i < segs.length; i += 2) out.push({ last: segs[i], first: segs[i + 1] || '' });
        return out;
      }
      // "Ivan Ivic" -> zadnja rijec je prezime
      const parts = chunk.split(/\s+/);
      if (parts.length === 1) return [{ last: parts[0], first: '' }];
      const last = parts[parts.length - 1];
      const first = parts.slice(0, -1).join(' ');
      return [{ last, first }];
    });
}

/** "Ana Maria" -> "A. M."; crtica u imenu se zadrzava ("Jean-Baptiste" -> "J.-B.").
 *  Exportano za citation-spec renderer. */
export function initials(first: string): string {
  return first
    .split(/\s+/)
    .filter(Boolean)
    .map((sp) => sp.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + '.').join('-'))
    .join(' ');
}

/** Autor-godina (APA-slicno): "Prezime, I., & Prezime, I." Isti format kao authorsApa
 *  (uklj. 21+ autora elipsu), pa delegira umjesto paralelne kopije koja moze divergirati. */
function authorsAuthorYear(list: ParsedAuthor[]): string {
  return authorsApa(list);
}

/** Harvard kompaktni inicijali: "Ann Marie" -> "A.M." (bez razmaka; cite-them-right).
 *  Crtica u imenu se zadrzava ("Jean-Baptiste" -> "J.-B."). */
function initialsCompact(first: string): string {
  return first
    .split(/\s+/)
    .filter(Boolean)
    .map((sp) => sp.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + '.').join('-'))
    .join('');
}

// Vjerni autor-datum autor-formati (razlikuju apa7/harvard/chicago; validirano protiv doi.org/CSL).
/** APA 7: "Prezime, I. I."; spoj ", & " (Oxford zarez pred &).
 *  21+ autora (sekcija 9.8): prvih 19, elipsa, pa ZADNJI autor (bez &). */
function authorsApa(list: ParsedAuthor[]): string {
  if (!list.length) return '';
  const fmt = (a: ParsedAuthor) => (a.first ? `${a.last}, ${initials(a.first)}` : a.last);
  if (list.length === 1) return fmt(list[0]);
  if (list.length > 20) {
    // Elipsa je jedan znak (…), ne tri tocke, da je tidy() ne skupi u jednu tocku.
    return `${list.slice(0, 19).map(fmt).join(', ')}, … ${fmt(list[list.length - 1])}`;
  }
  return `${list.slice(0, -1).map(fmt).join(', ')}, & ${fmt(list[list.length - 1])}`;
}
/** Harvard (cite-them-right): "Prezime, I.I."; spoj " and " (bez Oxford zareza). */
function authorsHarvard(list: ParsedAuthor[]): string {
  if (!list.length) return '';
  const fmt = (a: ParsedAuthor) => (a.first ? `${a.last}, ${initialsCompact(a.first)}` : a.last);
  if (list.length === 1) return fmt(list[0]);
  return `${list.slice(0, -1).map(fmt).join(', ')} and ${fmt(list[list.length - 1])}`;
}
/** Chicago autor-datum: prvi "Prezime, Ime" (PUNO ime), ostali "Ime Prezime"; spoj ", and " (Oxford).
 *  11+ autora (CMOS 17, 14.76/15.9): prvih 7, pa "et al.". */
function authorsChicagoAD(list: ParsedAuthor[]): string {
  if (!list.length) return '';
  const f0 = list[0];
  const firstStr = f0.first ? `${f0.last}, ${f0.first}` : f0.last;
  if (list.length === 1) return firstStr;
  const nat = (a: ParsedAuthor) => (a.first ? `${a.first} ${a.last}` : a.last);
  if (list.length > 10) {
    return `${[firstStr, ...list.slice(1, 7).map(nat)].join(', ')}, et al.`;
  }
  const rest = list.slice(1).map(nat);
  const lastOne = rest.pop() as string;
  return rest.length ? `${firstStr}, ${rest.join(', ')}, and ${lastOne}` : `${firstStr}, and ${lastOne}`;
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

/** Ukloni visestruke razmake i suvisnu interpunkciju na spojevima.
 *  Exportano za citation-spec renderer (isti cleanup za spec-drivene citate). */
export function tidy(s: string): string {
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

/** "181-181" -> "181" (jedna stranica zapisana kao raspon; Crossref/uvoz cesto tako daje). */
function collapsePages(p?: string): string {
  const s = (p || '').trim();
  const m = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  return m && m[1] === m[2] ? m[1] : s;
}

/** Naslov u navodnicima sa zarezom UNUTAR navodnika ("Naslov,"): Harvard cite-them-right
 *  I IEEE dijele ovaj oblik. Dvostruki navodnici + zarez unutra su NAMJERNI: to je oblik koji
 *  doi.org/CSL harvard-cite-them-right procesor emitira i protiv kojeg je motor validiran
 *  (264/264). Britanska knjiga CTR koristi jednostruke navodnike; taj oblik zivi u per-fakultet
 *  spec-u. */
function quotedTrailingComma(title: string): string {
  const t = (title || '').trim().replace(/[.,]$/, '');
  return t ? `"${t},"` : '';
}

/** Vise urednika zbornika (odvojenih ";") spojenih po stilu. connector = "&" (APA) ili "and"
 *  (Harvard/Chicago); oxford = Oxford zarez pred veznikom za 3+ (APA/Chicago da, Harvard ne).
 *  multi = ima li vise od jednog urednika (za "Eds." vs "Ed." / "eds" vs "ed."). */
function joinEditors(raw: string, connector: string, oxford: boolean): { text: string; multi: boolean } {
  const names = raw.split(';').map((s) => s.trim()).filter(Boolean);
  if (names.length <= 1) return { text: raw.trim(), multi: false };
  if (names.length === 2) return { text: `${names[0]} ${connector} ${names[1]}`, multi: true };
  const head = names.slice(0, -1).join(', ');
  return { text: `${head}${oxford ? ',' : ''} ${connector} ${names[names.length - 1]}`, multi: true };
}

/** CMOS 9.61 elizija inkluzivnih brojeva (163-186 -> 163-86; 1181-1206 -> 1181-206). Samo Chicago.
 *  Isti oblik koji doi.org/CSL chicago-author-date procesor emitira. */
function chicagoElide(startStr: string, endStr: string): string {
  const a = parseInt(startStr, 10);
  const b = parseInt(endStr, 10);
  if (!(b > a)) return `${startStr}-${endStr}`;
  const as = String(a);
  const bs = String(b);
  if (a < 100 || a % 100 === 0 || as.length !== bs.length) return `${a}-${b}`; // sve znamenke
  let i = 0;
  while (i < as.length && as[i] === bs[i]) i++;
  const lastTwo = a % 100;
  // n01-n09: samo promijenjeni dio; inace bar dvije znamenke (vise ako je promjena u stotici).
  const keepFrom = lastTwo >= 1 && lastTwo <= 9 ? i : Math.min(i, bs.length - 2);
  return `${a}-${bs.slice(keepFrom)}`;
}

/** Chicago stranice: skupi identican raspon (181-181 -> 181) pa primijeni CMOS 9.61 eliziju. */
function chicagoPages(p?: string): string {
  const s = collapsePages(p);
  const m = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  return m ? chicagoElide(m[1], m[2]) : s;
}

// --- Vjerni autor-datum stilovi: apa7 / harvard (cite-them-right) / chicago-author-date -----
// Validirano protiv doi.org/CSL (scripts/render-fidelity-audit.mjs) na clancima; knjiga/poglavlje
// po stilskim prirucnicima. Strukturne rijeci su ENGLESKE (In, Eds., pp., Available at) jer su to
// engleski standardi; hrvatske adaptacije (FPZG) su per-fakultet citation-spec, ne motor.

function formatApa(inp: CitationInput): string {
  const A = authorsApa(parseAuthors(inp.authors));
  const year = inp.year ? `(${inp.year}).` : (A ? '(n.d.).' : '');
  const t = inp.title || '';
  const doi = doiUrl(inp.doi);
  const parts: string[] = [];
  // Element autora zavrsava tockom prije godine ("Autor. (Godina).") i za grupnog autora
  // (osobni ju dobiva "gratis" od zavrsnog inicijala; ustanova bez zareza nema inicijal).
  const lead = [A ? withDot(A) : '', year].filter(Boolean).join(' ');
  if (lead) parts.push(withDot(lead));
  switch (inp.type) {
    case 'clanak': {
      parts.push(withDot(t));
      const pgs = collapsePages(inp.pages);
      const vi = `${[inp.container, inp.volume].filter(Boolean).join(', ')}${inp.issue ? `(${inp.issue})` : ''}${pgs ? `, ${pgs}` : ''}`;
      if (vi) parts.push(withDot(vi));
      if (doi) parts.push(doi);
      else if (inp.url) parts.push(inp.url); // mrezni clanak bez DOI-a: URL na kraju (Hrcak/Srce)
      break;
    }
    case 'knjiga':
    case 'zavrsni': {
      parts.push(withDot(t));
      if (inp.type === 'zavrsni') parts.push(withDot(inp.institution ? `[Neobjavljeni završni rad, ${inp.institution}]` : '[Neobjavljeni završni rad]'));
      else if (inp.publisher) parts.push(withDot(inp.publisher)); // APA7 ISPUSTA mjesto
      if (doi) parts.push(doi);
      break;
    }
    case 'poglavlje': {
      parts.push(withDot(t));
      let ed = '';
      if (inp.editor) {
        const e = joinEditors(inp.editor, '&', true); // APA: "A & B" / "A, B, & C"
        ed = `${e.text} (${e.multi ? 'Eds.' : 'Ed.'}), `;
      }
      const pg = inp.pages ? ` (pp. ${inp.pages})` : '';
      if (inp.container) parts.push(withDot(`In ${ed}${inp.container}${pg}`));
      if (inp.publisher) parts.push(withDot(inp.publisher));
      if (doi) parts.push(doi);
      break;
    }
    case 'mrezni': {
      parts.push(withDot(t));
      if (inp.publisher) parts.push(withDot(inp.publisher));
      const link = doi || inp.url;
      if (link) parts.push(link);
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

function formatHarvard(inp: CitationInput): string {
  const A = authorsHarvard(parseAuthors(inp.authors));
  const year = inp.year ? `(${inp.year})` : (A ? '(no date)' : '');
  const t = inp.title || '';
  const doi = doiUrl(inp.doi);
  const lead = [A, year].filter(Boolean).join(' ');
  const parts: string[] = [];
  switch (inp.type) {
    case 'clanak': {
      const volIss = inp.volume ? `${inp.volume}${inp.issue ? `(${inp.issue})` : ''}` : '';
      const loc = [inp.container, volIss].filter(Boolean).join(', ');
      const pgs = collapsePages(inp.pages);
      const pg = pgs ? `, ${/[-–]/.test(pgs) ? 'pp.' : 'p.'} ${pgs}` : ''; // cite-them-right: p. jedna, pp. raspon
      parts.push(withDot(`${lead} ${quotedTrailingComma(t)} ${loc}${pg}`.trim()));
      if (doi) parts.push(withDot(`Available at: ${doi}`));
      else if (inp.url) { // online clanak bez DOI-a: Available at URL (+ Accessed datum)
        const acc = inp.accessed ? ` (Accessed: ${inp.accessed})` : '';
        parts.push(withDot(`Available at: ${inp.url}${acc}`));
      }
      break;
    }
    case 'knjiga':
    case 'zavrsni': {
      parts.push(withDot(`${lead} ${t}`.trim()));
      if (inp.type === 'zavrsni') parts.push(withDot(inp.institution ? `Unpublished thesis. ${inp.institution}` : 'Unpublished thesis'));
      else { const pub = [inp.place, inp.publisher].filter(Boolean).join(': '); if (pub) parts.push(withDot(pub)); }
      if (doi) parts.push(withDot(`Available at: ${doi}`));
      break;
    }
    case 'poglavlje': {
      // cite-them-right: "'Naslov,' in Ur. (ed.) Knjiga. Mjesto: Izdavac, pp. Str."
      let ed = '';
      if (inp.editor) {
        const e = joinEditors(inp.editor, 'and', false); // CTR: "A and B" (bez Oxford zareza)
        ed = `${e.text} (${e.multi ? 'eds' : 'ed.'}) `;
      }
      parts.push(withDot(`${lead} ${quotedTrailingComma(t)} in ${ed}${inp.container || ''}`.trim()));
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      const tail = [pub, inp.pages ? `pp. ${inp.pages}` : ''].filter(Boolean).join(', ');
      if (tail) parts.push(withDot(tail));
      if (doi) parts.push(withDot(`Available at: ${doi}`));
      break;
    }
    case 'mrezni': {
      parts.push(withDot(`${lead} ${t}`.trim()));
      if (inp.publisher) parts.push(withDot(inp.publisher));
      const link = doi || inp.url;
      if (link) { const acc = inp.accessed ? ` (Accessed: ${inp.accessed})` : ''; parts.push(withDot(`Available at: ${link}${acc}`)); }
      break;
    }
    case 'propis': {
      parts.push(withDot(`${lead} ${t}`.trim()));
      const src = [inp.container, inp.issue].filter(Boolean).join(', ');
      if (src) parts.push(withDot(src));
      break;
    }
  }
  return tidy(parts.join(' '));
}

function formatChicagoAuthorDate(inp: CitationInput): string {
  const A = authorsChicagoAD(parseAuthors(inp.authors));
  const year = inp.year || 'n.d.';
  const t = inp.title || '';
  const doi = doiUrl(inp.doi);
  const parts: string[] = [];
  if (A) parts.push(withDot(A));
  if (A || inp.year) parts.push(withDot(year));
  switch (inp.type) {
    case 'clanak': {
      parts.push(quoted(t));
      const pgs = chicagoPages(inp.pages);
      // Broj bez sveska nosi oznaku "no." iza zareza (CMOS 15.48); uz svezak ide u zagradi.
      const volPart = inp.volume ? ` ${inp.volume}` : '';
      const issPart = inp.issue ? (inp.volume ? ` (${inp.issue})` : `, no. ${inp.issue}`) : '';
      const loc = `${inp.container || ''}${volPart}${issPart}${pgs ? `: ${pgs}` : ''}`;
      if (loc.trim()) parts.push(withDot(loc));
      if (doi) parts.push(withDot(doi));
      else if (inp.url) parts.push(withDot(inp.url)); // clanak bez DOI-a: URL na kraju
      break;
    }
    case 'knjiga':
    case 'zavrsni': {
      parts.push(withDot(t));
      if (inp.type === 'zavrsni') parts.push(withDot(inp.institution ? `Thesis, ${inp.institution}` : 'Thesis'));
      else { const pub = [inp.place, inp.publisher].filter(Boolean).join(': '); if (pub) parts.push(withDot(pub)); }
      if (doi) parts.push(withDot(doi));
      break;
    }
    case 'poglavlje': {
      // Chicago: "\"Naslov.\" In Knjiga, edited by Ur., Str. Mjesto: Izdavac."
      parts.push(quoted(t));
      const ed = inp.editor ? `edited by ${joinEditors(inp.editor, 'and', true).text}` : '';
      const inWork = inp.container ? `In ${inp.container}` : '';
      const seg = [inWork, ed, chicagoPages(inp.pages)].filter(Boolean).join(', ');
      if (seg) parts.push(withDot(seg));
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      if (pub) parts.push(withDot(pub));
      if (doi) parts.push(withDot(doi));
      break;
    }
    case 'mrezni': {
      parts.push(quoted(t));
      if (inp.publisher) parts.push(withDot(inp.publisher));
      // CMOS 15.50/15.51: datum pristupa je zaseban element "Accessed ..." PRIJE URL-a.
      if (inp.accessed) parts.push(withDot(`Accessed ${inp.accessed}`));
      const link = doi || inp.url;
      if (link) parts.push(withDot(link));
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

// --- Numericki stilovi (IEEE, Vancouver) -----------------------------------
// Referentni redak (bibliografski unos). U tekstu se koristi broj [n] koji ovisi o
// redoslijedu pojavljivanja pa ga generator ne moze znati -> inText je prazan (kao fusnota).
// Plain-text izlaz (bez kurziva); struktura i interpunkcija prate javne stilske specifikacije.

/** IEEE autori: inicijali ISPRED prezimena ("A. A. Prezime"), zadnji spojen s "and". */
function authorsIeee(list: ParsedAuthor[]): string {
  if (!list.length) return '';
  const fmt = (a: ParsedAuthor) => (a.first ? `${initials(a.first)} ${a.last}` : a.last);
  if (list.length === 1) return fmt(list[0]);
  if (list.length === 2) return `${fmt(list[0])} and ${fmt(list[1])}`;
  const head = list.slice(0, -1).map(fmt).join(', ');
  return `${head}, and ${fmt(list[list.length - 1])}`;
}

/** Vancouver inicijali: bez tocaka i razmaka ("Ana Maria" -> "AM"). */
function vancInitials(first: string): string {
  return first.split(/[\s-]+/).filter(Boolean).map((p) => p[0].toUpperCase()).join('');
}

/** Vancouver autori: "Prezime AA"; 7+ autora -> prvih 6 pa "et al.". */
function authorsVancouver(list: ParsedAuthor[]): string {
  if (!list.length) return '';
  const fmt = (a: ParsedAuthor) => (a.first ? `${a.last} ${vancInitials(a.first)}` : a.last);
  const shown = list.length > 6 ? list.slice(0, 6) : list;
  const joined = shown.map(fmt).join(', ');
  return list.length > 6 ? `${joined}, et al.` : joined;
}

function formatIeee(inp: CitationInput): string {
  const A = authorsIeee(parseAuthors(inp.authors));
  const t = inp.title || '';
  const parts: string[] = [];
  if (A) parts.push(`${A},`);

  switch (inp.type) {
    case 'knjiga': {
      if (t) parts.push(withDot(t));
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      const tail = [pub, inp.year].filter(Boolean).join(', ');
      if (tail) parts.push(withDot(tail));
      break;
    }
    case 'zavrsni': {
      if (t) parts.push(withDot(t));
      const kind = inp.institution ? `Neobjavljeni završni rad, ${inp.institution}` : 'Neobjavljeni završni rad';
      parts.push(withDot([kind, inp.year].filter(Boolean).join(', ')));
      break;
    }
    case 'clanak': {
      if (t) parts.push(quotedTrailingComma(t));
      const vol = inp.volume ? `vol. ${inp.volume}` : '';
      const no = inp.issue ? `no. ${inp.issue}` : '';
      const pp = inp.pages ? `pp. ${inp.pages}` : '';
      const seg = [inp.container, vol, no, pp, inp.year].filter(Boolean).join(', ');
      if (seg) parts.push(withDot(seg));
      const doi = doiUrl(inp.doi);
      if (doi) parts.push(withDot(doi));
      break;
    }
    case 'poglavlje': {
      if (t) parts.push(quotedTrailingComma(t));
      const ed = inp.editor ? `${inp.editor}, Ed. ` : '';
      const inWork = inp.container ? `in ${inp.container}` : '';
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      const pp = inp.pages ? `pp. ${inp.pages}` : '';
      const seg = [inWork, `${ed}${pub}`.trim(), inp.year, pp].filter(Boolean).join(', ');
      if (seg) parts.push(withDot(seg));
      break;
    }
    case 'mrezni': {
      if (t) parts.push(quotedTrailingComma(t));
      if (inp.publisher) parts.push(withDot(inp.publisher));
      const link = doiUrl(inp.doi) || inp.url;
      if (link) {
        const acc = inp.accessed ? ` (accessed ${inp.accessed})` : '';
        parts.push(withDot(`${link}${acc}`));
      }
      break;
    }
    case 'propis': {
      if (t) parts.push(withDot(t));
      const src = [inp.container, inp.issue].filter(Boolean).join(', ');
      if (src) parts.push(withDot(src));
      break;
    }
  }
  return tidy(parts.join(' '));
}

function formatVancouver(inp: CitationInput): string {
  const A = authorsVancouver(parseAuthors(inp.authors));
  const parts: string[] = [];
  if (A) parts.push(withDot(A));
  const t = inp.title || '';

  switch (inp.type) {
    case 'knjiga': {
      if (t) parts.push(withDot(t));
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      const tail = [pub, inp.year].filter(Boolean).join('; ');
      if (tail) parts.push(withDot(tail));
      break;
    }
    case 'zavrsni': {
      if (t) parts.push(withDot(`${t} [završni rad]`));
      const tail = [inp.institution, inp.year].filter(Boolean).join('; ');
      if (tail) parts.push(withDot(tail));
      break;
    }
    case 'clanak': {
      if (t) parts.push(withDot(t));
      if (inp.container) parts.push(withDot(inp.container));
      const vi = `${inp.year || ''}${inp.volume ? ';' + inp.volume : ''}${inp.issue ? '(' + inp.issue + ')' : ''}${inp.pages ? ':' + inp.pages : ''}`;
      if (vi) parts.push(withDot(vi));
      const doi = doiUrl(inp.doi);
      if (doi) parts.push(withDot(doi));
      break;
    }
    case 'poglavlje': {
      if (t) parts.push(withDot(t));
      const inWork = inp.container
        ? (inp.editor ? `In: ${inp.editor}, editor. ${inp.container}` : `In: ${inp.container}`)
        : '';
      if (inWork) parts.push(withDot(inWork));
      const pub = [inp.place, inp.publisher].filter(Boolean).join(': ');
      const tail = [pub, inp.year].filter(Boolean).join('; ');
      if (tail) parts.push(withDot(tail));
      if (inp.pages) parts.push(withDot(`p. ${inp.pages}`));
      break;
    }
    case 'mrezni': {
      if (t) parts.push(withDot(`${t} [Internet]`));
      const pubYear = [inp.publisher, inp.year].filter(Boolean).join('; ');
      if (pubYear) parts.push(withDot(pubYear));
      const link = doiUrl(inp.doi) || inp.url;
      if (link) {
        const cited = inp.accessed ? `[cited ${inp.accessed}]. ` : '';
        parts.push(`${cited}Available from: ${link}`);
      }
      break;
    }
    case 'propis': {
      if (t) parts.push(withDot(t));
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

/** Strukturne rijeci in-text oblika po stilu. Vjerni stilovi (apa/harvard/chicago) koriste
 *  ENGLESKE oznake (& / and, et al., n.d./no date) da se in-text slaze s njihovim engleskim
 *  referentnim retkom; genericki 'autor-godina' zadrzava hrvatske (i, i sur., bez dat.). */
interface InTextStyle { two: string; etAl: string; noDate: string; comma: boolean; }
const IN_TEXT: Record<string, InTextStyle> = {
  'autor-godina': { two: ' i ', etAl: ' i sur.', noDate: 'bez dat.', comma: true },
  apa: { two: ' & ', etAl: ' et al.', noDate: 'n.d.', comma: true },
  harvard: { two: ' and ', etAl: ' et al.', noDate: 'no date', comma: false },
  'chicago-author-date': { two: ' and ', etAl: ' et al.', noDate: 'n.d.', comma: false },
};

/** In-text oblik autor-godina: 1 autor (Prezime), 2 (A i/and/& B), 3+ (A i sur./et al.).
 *  cfg razlikuje veznik, oznaku "vise autora", oznaku bez godine i zarez pred godinom. */
function inTextAuthorYear(list: ParsedAuthor[], year: string, cfg: InTextStyle): string {
  if (!list.length) return '';
  const yr = year || cfg.noDate;
  const sur = (a: ParsedAuthor) => a.last; // institucija ima cijeli naziv u "last"
  let who: string;
  if (list.length === 1) who = sur(list[0]);
  else if (list.length === 2) who = `${sur(list[0])}${cfg.two}${sur(list[1])}`;
  else who = `${sur(list[0])}${cfg.etAl}`;
  return cfg.comma ? `(${who}, ${yr})` : `(${who} ${yr})`;
}

/** Jedno polje forme za jednu vrstu izvora. `recommended` ulazi u "preporuceno dodati". */
export interface SourceTypeFieldSpec {
  key: keyof CitationInput;
  recommended?: boolean;
}

/**
 * KANONSKI popis polja po vrsti izvora: jedini izvor istine za koja polja postoje za koju
 * vrstu i koja su od njih preporucena. citation-web.ts (SOURCE_TYPES, forma i bulk-kartica)
 * i RECOMMENDED ispod citaju OVU tablicu; ne dupliciraj popis polja nigdje drugdje (prije su
 * postojala tri odvojena, rucno odrzavana popisa koja su se razisla - vidi audit 2026-07-17).
 */
export const SOURCE_TYPE_FIELDS: Record<SourceType, SourceTypeFieldSpec[]> = {
  knjiga: [
    { key: 'authors', recommended: true },
    { key: 'title', recommended: true },
    { key: 'year', recommended: true },
    { key: 'place' },
    { key: 'publisher', recommended: true },
  ],
  clanak: [
    { key: 'authors', recommended: true },
    { key: 'title', recommended: true },
    { key: 'container', recommended: true },
    { key: 'volume' },
    { key: 'issue' },
    { key: 'year', recommended: true },
    { key: 'pages' },
    { key: 'doi' },
  ],
  poglavlje: [
    { key: 'authors', recommended: true },
    { key: 'title', recommended: true },
    { key: 'editor', recommended: true },
    { key: 'container', recommended: true },
    { key: 'place' },
    { key: 'publisher', recommended: true },
    { key: 'year', recommended: true },
    { key: 'pages' },
  ],
  mrezni: [
    { key: 'authors' },
    { key: 'title', recommended: true },
    { key: 'publisher' },
    { key: 'year', recommended: true },
    { key: 'url', recommended: true },
    { key: 'doi' },
    { key: 'accessed', recommended: true },
  ],
  zavrsni: [
    { key: 'authors', recommended: true },
    { key: 'title', recommended: true },
    { key: 'institution', recommended: true },
    { key: 'year', recommended: true },
  ],
  propis: [
    { key: 'title', recommended: true },
    { key: 'container', recommended: true },
    { key: 'issue', recommended: true },
    { key: 'year' },
  ],
};

const RECOMMENDED: Record<SourceType, Array<keyof CitationInput>> = Object.fromEntries(
  (Object.keys(SOURCE_TYPE_FIELDS) as SourceType[]).map(
    (t) => [t, SOURCE_TYPE_FIELDS[t].filter((f) => f.recommended).map((f) => f.key)] as const,
  ),
) as Record<SourceType, Array<keyof CitationInput>>;

const FIELD_LABEL: Partial<Record<keyof CitationInput, string>> = {
  authors: 'autor',
  title: 'naslov',
  container: 'izvor (časopis/zbornik/službeni list)',
  editor: 'urednik',
  year: 'godina',
  publisher: 'izdavač',
  url: 'poveznica',
  institution: 'ustanova',
  accessed: 'datum pristupa',
  issue: 'broj',
};

export function formatCitation(inp: CitationInput, style: CitationStyle): CitationResult {
  let citation: string;
  switch (style) {
    case 'fusnota': citation = formatFusnota(inp); break;
    case 'ieee': citation = formatIeee(inp); break;
    case 'vancouver': citation = formatVancouver(inp); break;
    case 'apa': citation = formatApa(inp); break;
    case 'harvard': citation = formatHarvard(inp); break;
    case 'chicago-author-date': citation = formatChicagoAuthorDate(inp); break;
    default: citation = formatAutorGodina(inp);
  }
  // Autor-datum stilovi imaju in-text (veznik/oznake po stilu). Fusnota i numericki koriste
  // broj biljeske/[n] pa je in-text prazan.
  const cfg = IN_TEXT[style];
  const inText = cfg
    ? inTextAuthorYear(parseAuthors(inp.authors), (inp.year || '').trim(), cfg)
    : '';
  const missing = (RECOMMENDED[inp.type] || [])
    .filter((f) => !(inp[f] && String(inp[f]).trim()))
    .map((f) => FIELD_LABEL[f] || String(f));
  return { citation, inText, missing };
}
