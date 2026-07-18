// Tipizirana, testabilna jezgra za sredjivanje popisa literature (bez DOM-a, bez mreze).
// Radi tri stvari: sortira (abecedno ili zadrzava izvorni redoslijed), uklanja duplikate i
// oznacava uobicajene nedostatke (nema godine, mrezni izvor bez datuma pristupa, prekratak
// zapis). Ne mijenja sadrzaj zapisa (ni tudje brojeve poput "[1]") i ne tvrdi tocan citatni
// stil; to je i dalje na korisniku.

/** 'alphabetical' (zadano, autor-godina stilovi) ili 'appearance' (IEEE/Vancouver i drugi
 *  brojcani stilovi: abecedno sortiranje bi razbilo korespondenciju [1],[2]... s tekstom). */
export type BibSortMode = 'alphabetical' | 'appearance';

export interface BibEntry {
  text: string;
  issues: string[];
}

export interface BibResult {
  entries: BibEntry[];       // jedinstveni zapisi, sortirani prema BibSortMode
  inputCount: number;        // broj unesenih redaka
  duplicatesRemoved: number; // koliko je duplikata izbaceno
  withIssues: number;        // koliko zapisa ima barem jedno upozorenje
  sortMode: BibSortMode;     // stvarno primijenjen nacin (odjek ulaznog opts.sort)
}

// Makni vodece nabrajanje ([1], 1., -) s pocetka zapisa; dijele sortKey i dedupeKey da isti
// zapis s brojem i bez njega broje kao identican (numeriran popis, cesto pri rucnom lijepljenju).
function stripLeadingMarker(text: string): string {
  return text.replace(/^\s*[[(]?\d+[\]).]?\s+/, '').replace(/^[-•*\s]+/, '');
}

// Kljuc za sortiranje: makni vodece nabrajanje pa uzmi prezime (do prvog zareza).
function sortKey(text: string): string {
  const stripped = stripLeadingMarker(text);
  const head = stripped.split(',')[0] || stripped;
  return head.toLowerCase().trim();
}

// Sekundarni kljuc unutar istog autora: godina objave, od starije prema novijoj (FAQ i vodic
// to izricito obecavaju). Trazi SAMO prije URL-a, isti razlog kao u detectIssues (portal
// putanje imaju 4-znamenkaste segmente koji nisu prava godina). Bez prepoznate godine ide
// na kraj unutar iste autorske skupine (Number.POSITIVE_INFINITY), ne na pocetak nasumice.
function sortYear(text: string): number {
  const urlMatch = text.match(/(https?:\/\/|www\.)/i);
  const scope = urlMatch ? text.slice(0, urlMatch.index) : text;
  const m = scope.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}

// Kljuc za duplikate: makni vodece nabrajanje, mala slova, sazeti razmaci, bez zavrsne interpunkcije.
function dedupeKey(text: string): string {
  return stripLeadingMarker(text).toLowerCase().replace(/\s+/g, ' ').replace(/[\s.,;]+$/, '').trim();
}

export function detectIssues(text: string): string[] {
  const issues: string[] = [];
  // Godina izdanja se trazi SAMO prije URL-a (ako postoji): portal/permalink putanje cesto
  // sadrze 4-znamenkasti segment ("/2021/03/clanak") koji bi inace lazno ugasio upozorenje, i to
  // bas kod mreznih izvora, gdje je "nema godine" najkorisnije.
  const urlMatch = text.match(/(https?:\/\/|www\.)/i);
  const yearScope = urlMatch ? text.slice(0, urlMatch.index) : text;
  // "(n.d.)"/"b.g."/"bez godine" su legitimni APA/hrvatski markeri izvora bez datuma
  // (institucionalni/sivi izvori); ispravno oblikovan zapis ne smije dobiti laznu zamjerku.
  const hasNoDateMarker = /(^|[\s(\[])(n\.\s?d\.|b\.\s?g\.)|bez godine/i.test(yearScope);
  if (!hasNoDateMarker && !/\b(1[89]\d{2}|20\d{2})\b/.test(yearScope)) {
    issues.push('nema godine');
  }
  const hasUrl = !!urlMatch;
  // Datum pristupa mora biti oznacen kljucnom rijeci; goli datum je najcesce datum objave,
  // pa ga ne prihvacamo kao dokaz datuma pristupa (inace lazni negativ). "citirano" je
  // standardni hrvatski Vancouver/IEEE marker (STEM/medicina). Poznato ogranicenje: rijec se
  // trazi bilo gdje u zapisu, pa naslov koji sadrzi "pristup" moze ugasiti upozorenje.
  const hasAccess = /(pristup|preuzeto|posjeć|posjec|accessed|retrieved|citirano|cited)/i.test(text);
  if (hasUrl && !hasAccess) {
    issues.push('mrežni izvor bez datuma pristupa');
  }
  if (text.replace(/\s/g, '').length < 12) {
    issues.push('vrlo kratak zapis, možda nepotpun');
  }
  return issues;
}

export function organizeBibliography(raw: string, opts?: { sort?: BibSortMode }): BibResult {
  const sortMode: BibSortMode = opts?.sort ?? 'alphabetical';
  const rawLines = (raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  // Spoji prelomljene retke: redak koji pocinje GOLIM URL-om ili golim DOI-jem je nastavak
  // prethodne jedinice (cesto pri kopiranju iz PDF-a gdje se referenca prelama), ne nova
  // referenca. Goli DOI ("10.1234/xyz" ili "doi.org/...") je uobicajen kod Vancouver/IEEE
  // STEM/medicinskih referenci. Namjerno konzervativno: samo URL/DOI nastavak je siguran
  // signal; ostale prelome ostavljamo. ALI ne spajamo ako je i sam prethodni redak goli
  // URL/DOI, inace bi webografija (vise zasebnih URL-ova, jedan po retku) kolabirala u jednu.
  const isBareUrl = (s: string): boolean => /^(https?:\/\/|www\.|doi\.org\/|10\.\d{4,9}\/)/i.test(s);
  const lines: string[] = [];
  for (const line of rawLines) {
    const prev = lines[lines.length - 1];
    if (lines.length && isBareUrl(line) && !isBareUrl(prev)) {
      lines[lines.length - 1] += ' ' + line;
    } else {
      lines.push(line);
    }
  }
  const inputCount = lines.length;

  const seen = new Set<string>();
  const unique: string[] = [];
  let duplicatesRemoved = 0;
  for (const line of lines) {
    const key = dedupeKey(line);
    if (seen.has(key)) { duplicatesRemoved++; continue; }
    seen.add(key);
    unique.push(line);
  }

  // 'appearance' (IEEE/Vancouver): abecedno sortiranje bi razbilo brojcani popis, jer sortKey
  // namjerno strippa vodece "[1]"/"1." da abecedni poredak radi kad TAKVIH brojeva nema.
  // Zadrzi izvorni redoslijed (vec je izvorni nakon dedupa, koji ide po prvom pojavljivanju).
  if (sortMode === 'alphabetical') {
    unique.sort((a, b) => {
      const byAuthor = sortKey(a).localeCompare(sortKey(b), 'hr');
      return byAuthor !== 0 ? byAuthor : sortYear(a) - sortYear(b);
    });
  }

  const entries = unique.map(text => ({ text, issues: detectIssues(text) }));
  const withIssues = entries.filter(e => e.issues.length > 0).length;

  return { entries, inputCount, duplicatesRemoved, withIssues, sortMode };
}

// Ciste, sredjene reference kao tekst za kopiranje (jedan zapis po retku).
export function bibliographyText(result: BibResult): string {
  return result.entries.map(e => e.text).join('\n');
}
