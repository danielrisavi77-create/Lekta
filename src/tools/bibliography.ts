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

// Kljuc za duplikate: mala slova, sazeti razmaci, bez zavrsne interpunkcije.
function dedupeKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[\s.,;]+$/, '').trim();
}

export function detectIssues(text: string): string[] {
  const issues: string[] = [];
  if (!/\b(1[89]\d{2}|20\d{2})\b/.test(text)) {
    issues.push('nema godine');
  }
  const hasUrl = /https?:\/\//i.test(text);
  const hasAccess = /(pristup|preuzeto|accessed|\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4})/i.test(text);
  if (hasUrl && !hasAccess) {
    issues.push('mrežni izvor bez datuma pristupa');
  }
  if (text.replace(/\s/g, '').length < 12) {
    issues.push('vrlo kratak zapis, možda nepotpun');
  }
  return issues;
}

export function organizeBibliography(raw: string): BibResult {
  const lines = (raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
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

  unique.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'hr'));

  const entries = unique.map(text => ({ text, issues: detectIssues(text) }));
  const withIssues = entries.filter(e => e.issues.length > 0).length;

  return { entries, inputCount, duplicatesRemoved, withIssues };
}

// Ciste, sredjene reference kao tekst za kopiranje (jedan zapis po retku).
export function bibliographyText(result: BibResult): string {
  return result.entries.map(e => e.text).join('\n');
}
