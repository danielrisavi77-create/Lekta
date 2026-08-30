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

/** Izbaceni duplikat: njegov izvorni tekst + na koji zadrzani zapis je mapiran (dedupeKey pogodak).
 *  Da korisnik moze provjeriti je li spoj tocan, ne samo vidjeti brojku. */
export interface RemovedDuplicate {
  text: string;
  mappedTo: string;
}

export interface BibResult {
  entries: BibEntry[];       // jedinstveni zapisi, sortirani prema BibSortMode
  inputCount: number;        // broj unesenih redaka
  duplicatesRemoved: number; // koliko je duplikata izbaceno
  removedDuplicates: RemovedDuplicate[]; // isti brojac, ali s uvidom KOJI zapis i NA STO je mapiran
  withIssues: number;        // koliko zapisa ima barem jedno upozorenje
  sortMode: BibSortMode;     // stvarno primijenjen nacin (odjek ulaznog opts.sort)
}

// Makni vodece nabrajanje ([1], 1., -) s pocetka zapisa; dijele sortKey i dedupeKey da isti
// zapis s brojem i bez njega broje kao identican (numeriran popis, cesto pri rucnom lijepljenju).
function stripLeadingMarker(text: string): string {
  return text.replace(/^\s*[[(]?\d+[\]).]?\s+/, '').replace(/^[-•*\s]+/, '');
}

// Godina objave: granica NIJE \b. U JS-u je \b ASCII, pa izmedu dijakritickog slova i znamenke
// POSTOJI granica ("MZOŠ2019" -> "2019" prolazi kao godina), dok ista ASCII oznaka ("MZOS2019")
// ne prolazi: isti zapis se ponasao razlicito ovisno o dijakritiku. Umjesto \b konzumiramo
// ne-slovnu/ne-brojcanu granicu (?:^|[^\p{L}\p{N}]) uz 'u' flag; isti obrazac koji vec koriste
// counter.ts (kratice) i citation.ts (organizacijske rijeci). Godina je GRUPA 1, ne m[0], jer
// m[0] nosi i pojedeni granicni znak ("(2019" -> parseInt daje NaN).
const YEAR_RE = /(?:^|[^\p{L}\p{N}])(1[89]\d{2}|20\d{2})(?![\p{L}\p{N}])/u;

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
  const m = scope.match(YEAR_RE);
  return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

// Kljuc za duplikate: makni vodece nabrajanje, mala slova, sazeti razmaci, bez zavrsne interpunkcije.
function dedupeKey(text: string): string {
  return stripLeadingMarker(text).toLowerCase().replace(/\s+/g, ' ').replace(/[\s.,;]+$/, '').trim();
}

// Markeri datuma pristupa (v. detectIssues): STRONG se traze u cijelom zapisu, WEAK samo od
// URL-a nadalje. STRONG mora ostati PODSKUP WEAK-a (svaki STRONG oblik sadrzi neki WEAK korijen).
// Zavrsna granica (?![\p{L}]) uz 'u' flag (isti obrazac kao counter.ts/citation.ts) je NUZNA:
// bez nje je "Posjećenost muzeja" u naslovu sadrzavala "posjećeno" i vratila isti lazni negativ
// zbog kojeg je suzenje i uvedeno. \b se ne koristi jer je u JS-u ASCII pa pada pred dijakritikom.
const ACCESS_STRONG = /(?:pristupljeno|datum\s*pristupa|preuzeto|posjećeno|posjeceno|accessed|retrieved|citirano|cited)(?![\p{L}])/iu;
const ACCESS_WEAK = /(pristup|preuzeto|posjeć|posjec|accessed|retrieved|citirano|cited)/i;

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
  if (!hasNoDateMarker && !YEAR_RE.test(yearScope)) {
    issues.push('nema godine');
  }
  const hasUrl = !!urlMatch;
  // Datum pristupa mora biti oznacen kljucnom rijeci; goli datum je najcesce datum objave,
  // pa ga ne prihvacamo kao dokaz datuma pristupa (inace lazni negativ). "citirano" je
  // standardni hrvatski Vancouver/IEEE marker (STEM/medicina).
  // Rijec se vise NE trazi bilo gdje u zapisu: naslov koji sadrzi "pristup" ("Novi pristup
  // analizi podataka") tiho je gasio upozorenje. Dvije razine:
  //  - ACCESS_STRONG: glagolski/nedvosmisleni oblici koji se u naslovu prakticki ne pojavljuju.
  //    Traze se u CIJELOM zapisu, jer ih stilovi legitimno stavljaju i PRIJE URL-a (Vancouver
  //    "[cited ...]. Available from: URL", hrvatski APA "Preuzeto s URL").
  //  - ACCESS_WEAK: goli korijeni koji su ujedno obicne rijeci ("pristup"). Traze se SAMO od
  //    URL-a nadalje, gdje naslova vise nema ("... https://x.hr (pristup 2.7.2026.)").
  // ACCESS_STRONG je podskup ACCESS_WEAK-a, pa je novi skup pogodaka podskup prijasnjeg:
  // ovaj popravak moze upozorenje samo DODATI, nikad ukloniti.
  const accessTail = urlMatch ? text.slice(urlMatch.index) : '';
  const hasAccess = ACCESS_STRONG.test(text) || ACCESS_WEAK.test(accessTail);
  if (hasUrl && !hasAccess) {
    issues.push('provjeri treba li tvoj citatni stil datum pristupa');
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

  const seen = new Map<string, string>(); // dedupeKey -> ZADRZANI izvorni tekst (prvo pojavljivanje)
  const unique: string[] = [];
  const removedDuplicates: RemovedDuplicate[] = [];
  for (const line of lines) {
    const key = dedupeKey(line);
    const kept = seen.get(key);
    if (kept !== undefined) { removedDuplicates.push({ text: line, mappedTo: kept }); continue; }
    seen.set(key, line);
    unique.push(line);
  }
  const duplicatesRemoved = removedDuplicates.length;

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

  return { entries, inputCount, duplicatesRemoved, removedDuplicates, withIssues, sortMode };
}

// Ciste, sredjene reference kao tekst za kopiranje (jedan zapis po retku).
export function bibliographyText(result: BibResult): string {
  return result.entries.map(e => e.text).join('\n');
}
