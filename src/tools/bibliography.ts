// Tipizirana, testabilna jezgra za sredjivanje popisa literature (bez DOM-a, bez mreze).
// Radi tri stvari: abecedno sortira (hrvatski poredak), uklanja duplikate i oznacava
// uobicajene nedostatke (nema godine, mrezni izvor bez datuma pristupa, prekratak zapis).
// Ne mijenja sadrzaj zapisa i ne tvrdi tocan citatni stil; to je i dalje na korisniku.

export interface BibEntry {
  text: string;
  issues: string[];
}

export interface BibResult {
  entries: BibEntry[];       // jedinstveni zapisi, abecedno sortirani
  inputCount: number;        // broj unesenih redaka
  duplicatesRemoved: number; // koliko je duplikata izbaceno
  withIssues: number;        // koliko zapisa ima barem jedno upozorenje
}

// Kljuc za sortiranje: makni vodece nabrajanje ([1], 1., -) pa uzmi prezime (do prvog zareza).
function sortKey(text: string): string {
  const stripped = text.replace(/^\s*[[(]?\d+[\]).]?\s+/, '').replace(/^[-•*\s]+/, '');
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

// Kljuc za duplikate: mala slova, sazeti razmaci, bez zavrsne interpunkcije.
function dedupeKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[\s.,;]+$/, '').trim();
}

export function detectIssues(text: string): string[] {
  const issues: string[] = [];
  if (!/\b(1[89]\d{2}|20\d{2})\b/.test(text)) {
    issues.push('nema godine');
  }
  const hasUrl = /(https?:\/\/|www\.)/i.test(text);
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

export function organizeBibliography(raw: string): BibResult {
  const rawLines = (raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  // Spoji prelomljene retke: redak koji pocinje GOLIM URL-om je nastavak prethodne jedinice
  // (cesto pri kopiranju iz PDF-a gdje se referenca prelama), ne nova referenca. Namjerno
  // konzervativno: samo URL-nastavak je siguran signal; ostale prelome ostavljamo. ALI ne
  // spajamo ako je i sam prethodni redak goli URL, inace bi webografija/popis mreznih izvora
  // (vise zasebnih URL-ova, jedan po retku) kolabirao u jednu jedinicu.
  const isBareUrl = (s: string): boolean => /^(https?:\/\/|www\.)/i.test(s);
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

  unique.sort((a, b) => {
    const byAuthor = sortKey(a).localeCompare(sortKey(b), 'hr');
    return byAuthor !== 0 ? byAuthor : sortYear(a) - sortYear(b);
  });

  const entries = unique.map(text => ({ text, issues: detectIssues(text) }));
  const withIssues = entries.filter(e => e.issues.length > 0).length;

  return { entries, inputCount, duplicatesRemoved, withIssues };
}

// Ciste, sredjene reference kao tekst za kopiranje (jedan zapis po retku).
export function bibliographyText(result: BibResult): string {
  return result.entries.map(e => e.text).join('\n');
}
