/**
 * Cuva sinkronizaciju vidljivog FAQ-a (<div class="faq">) i FAQPage JSON-LD mirrora.
 *
 * STRANICA SE PROMIJENILA 2026-09-03: FAQ vise ne zivi na `/`, nego na `/saznaj-vise/`, jer je `/`
 * postalo iskljucivo mjesto za ucitavanje dokumenta. Strukturirani podaci moraju stajati NA ISTOJ
 * stranici kao vidljiv sadrzaj koji opisuju; JSON-LD koji tvrdi FAQ kojeg na toj stranici nema nije
 * samo crven test nego pogresan zapis prema trazilici.
 * Ako se pitanje doda u vidljivi FAQ a ne u strukturirane podatke (ili obrnuto), Google rich
 * results prikazuju zastarjeli set - ovaj test to hvata prije deploya. Konkretan povod: honesty
 * pitanje "nije provjera plagijata" bilo je u vidljivom FAQ-u, ali ne i u JSON-LD-u.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * COPY-01: formulacije koje tvrde vise nego sto dokaz nosi. Izmjereno na stvarnom korpusu na dan
 * uvodenja: 49 od 248 ciljanih provjera razrijeseno (19,8 %), 3 od 102 dokumenta `pass`, a razina
 * dokaza A u completion ledgeru ima 0 profila od 410. Zato javni tekst ne smije tvrditi da se
 * popravlja CIJELI dokument.
 *
 * Popis je namjerno uzak i doslovan. Siroka heuristika (npr. rijec "cijeli" bilo gdje) palila bi
 * na prozu, prvi lazni nalaz bi doveo do gasenja garda, i ostali bismo bez ijedne provjere.
 */
const OVERCLAIMS = [
  'u velikoj mjeri',
  'ispravlja cijeli',
  'popravlja cijeli',
  'u potpunosti popravlja',
];

function overclaims(htmlText: string): string[] {
  const lower = htmlText.toLowerCase();
  return OVERCLAIMS.filter((phrase) => lower.includes(phrase));
}

describe('FAQ JSON-LD mirror', () => {
  const html = readFileSync(join(root, 'saznaj-vise', 'index.html'), 'utf8');

  // Vidljivi FAQ: <div class="faq"> ... </div> (bez ugnijezdjenih divova, pa non-greedy do prvog </div>)
  const faqBlock = html.match(/<div class="faq">([\s\S]*?)<\/div>/);
  const visible = [...(faqBlock?.[1] ?? '').matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) =>
    decodeEntities(m[1]),
  );

  // FAQPage JSON-LD: nadji <script application/ld+json> blok ciji je @type FAQPage
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]),
  );
  const faqPage = scripts.find((s) => s['@type'] === 'FAQPage');
  const structured = ((faqPage?.mainEntity ?? []) as Array<{ name: string }>).map((q) => q.name.trim());

  it('vidljivi FAQ i JSON-LD sadrze ista pitanja istim redom', () => {
    expect(visible.length).toBeGreaterThan(0);
    expect(structured).toEqual(visible);
  });

  it('honesty pitanje o plagijatu je i u vidljivom FAQ-u i u strukturiranim podacima', () => {
    const plagijat = /plagijat/i;
    expect(visible.some((q) => plagijat.test(q))).toBe(true);
    expect(structured.some((q) => plagijat.test(q))).toBe(true);
  });

  it('svako JSON-LD pitanje ima neprazan odgovor', () => {
    const answers = ((faqPage?.mainEntity ?? []) as Array<{ acceptedAnswer?: { text?: string } }>).map(
      (q) => q.acceptedAnswer?.text ?? '',
    );
    expect(answers.length).toBe(structured.length);
    for (const a of answers) expect(a.length).toBeGreaterThan(10);
  });

  /**
   * Ova je tvrdnja dosad postojala SAMO za cetiri druge stranice, a index.html je usporedivao
   * jedino PITANJA. Odgovor je zato mogao tiho odlutati izmedu vidljivog FAQ-a i JSON-LD-a,
   * a JSON-LD je onaj koji Google prikazuje. Izmjereno na dan uvodenja: 7 pitanja, 0 drifta.
   */
  it('vidljivi i JSON-LD odgovor su identicni za svako pitanje', () => {
    const visibleAnswers = [
      ...(faqBlock?.[1] ?? '').matchAll(/<summary>[\s\S]*?<\/summary><p>([\s\S]*?)<\/p>/g),
    ].map((m) => decodeEntities(m[1]));
    const entries = (faqPage?.mainEntity ?? []) as Array<{ name: string; acceptedAnswer?: { text?: string } }>;
    expect(visibleAnswers.length).toBe(entries.length);
    entries.forEach((q, i) => {
      expect(decodeEntities(q.acceptedAnswer?.text ?? ''), `pitanje "${q.name}"`).toBe(visibleAnswers[i]);
    });
  });

  /**
   * COPY-01: javni copy ne smije tvrditi vise nego sto dokaz nosi. Mjereno na stvarnom
   * korpusu: 49 od 248 ciljanih provjera razrijeseno, 3 od 102 dokumenta `pass`, a razina
   * dokaza A ima 0 profila. Formulacija "u velikoj mjeri" je zato uklonjena iz OBA mirrora.
   */
  it('odgovor o automatskom popravku ne obecava cijeli dokument', () => {
    const entries = (faqPage?.mainEntity ?? []) as Array<{ name: string; acceptedAnswer?: { text?: string } }>;
    const q = entries.find((e) => /automatski ispraviti cijeli Word/i.test(e.name));
    expect(q, 'pitanje o automatskom popravku postoji').toBeDefined();
    const answer = decodeEntities(q?.acceptedAnswer?.text ?? '');
    expect(answer).toMatch(/odabrane tehničke elemente/i);
    expect(answer).toMatch(/završni pregled/i);
    expect(overclaims(html)).toEqual([]);
  });

  /**
   * Gard bez dokaza da grize se ne racuna (tvrdo pravilo repozitorija). Mutacija je ovdje, a ne
   * u gate-mutations.test.ts, jer ondje svaka mutacija gradi ThesisProfile i mjeri verifikacijski
   * lanac; ovo je druga populacija (javni tekst). Obje grane su dokazane: nemutiran ulaz mora
   * biti cist, inace "prolazi" i gard koji vristi na sve.
   */
  it('gard na preuveličan copy stvarno grize', () => {
    const mutiran = html.replace(
      'Ne cijeli dokument, nego odabrane tehničke elemente.',
      'Da, u velikoj mjeri.',
    );
    expect(mutiran, 'mutacija je stvarno promijenila ulaz').not.toBe(html);
    expect(overclaims(mutiran)).toContain('u velikoj mjeri');
    expect(overclaims(html), 'baseline: nemutiran ulaz je cist').toEqual([]);
  });
});

describe.each(['izjava.html', 'alati.html', 'landing_usporedba.html', 'citati-i-literatura.html'])('FAQ JSON-LD mirror: %s', (page) => {
  // Isti obrazac kao index.html gore, primijenjen po stranici umjesto generalizirano preko
  // svih *.html (siri sweep otkrio je vec postojeci, nepovezan drift na naslovnica.html i
  // citat.html izvan dosega ove promjene). Konkretan povod za izjava.html: FAQPage JSON-LD
  // odgovor na "Je li izjava o izvornosti obavezna?" izostavljao je zavrsnu recenicu
  // "Provjeri sluzbene upute." koju vidljivi <details> ima.
  const html = readFileSync(join(root, page), 'utf8');
  const faqBlock = html.match(/<div class="faq">([\s\S]*?)<\/div>/);
  const visible = [...(faqBlock?.[1] ?? '').matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) =>
    decodeEntities(m[1]),
  );
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]),
  );
  const faqPage = scripts.find((s) => s['@type'] === 'FAQPage');
  const structured = ((faqPage?.mainEntity ?? []) as Array<{ name: string; acceptedAnswer?: { text?: string } }>);

  it('vidljivi FAQ i JSON-LD sadrze ista pitanja istim redom', () => {
    expect(visible.length).toBeGreaterThan(0);
    expect(structured.map((q) => q.name.trim())).toEqual(visible);
  });

  it('vidljivi i JSON-LD odgovor su identicni za svako pitanje', () => {
    const visibleAnswers = [...(faqBlock?.[1] ?? '').matchAll(/<summary>[\s\S]*?<\/summary><p>([\s\S]*?)<\/p>/g)].map(
      (m) => decodeEntities(m[1]),
    );
    expect(visibleAnswers.length).toBe(structured.length);
    structured.forEach((q, i) => {
      expect(decodeEntities(q.acceptedAnswer?.text ?? ''), `pitanje "${q.name}"`).toBe(visibleAnswers[i]);
    });
  });
});

describe('literatura.html FAQ: IEEE/Vancouver poredak (bibliography.ts sort toggle)', () => {
  // Uzak test za ono sto je ova promjena dirala (redoslijed IEEE/Vancouver naspram abecednog);
  // NE generalizira na sve *.html FAQ blokove - siri sweep (nazalost) otkrio je vec postojeci,
  // nepovezan drift pitanja/odgovora na naslovnica.html/izjava.html/citat.html koji ova promjena
  // ne dira i ne popravlja.
  const html = readFileSync(join(root, 'literatura.html'), 'utf8');
  const faqBlock = html.match(/<div class="faq">([\s\S]*?)<\/div>/);
  const visible = [...(faqBlock?.[1] ?? '').matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) =>
    decodeEntities(m[1]),
  );
  const visibleAnswer = decodeEntities(
    faqBlock?.[1]?.match(/Kojim redom se slaže popis literature\?<\/summary><p>([\s\S]*?)<\/p>/)?.[1] ?? '',
  );
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]),
  );
  const faqPage = scripts.find((s) => s['@type'] === 'FAQPage');
  const structured = ((faqPage?.mainEntity ?? []) as Array<{ name: string; acceptedAnswer?: { text?: string } }>);
  const structuredAnswer = structured.find((q) => q.name === 'Kojim redom se slaže popis literature?')?.acceptedAnswer?.text ?? '';

  it('"Kojim redom..." pitanje spominje IEEE/Vancouver izuzetak, i vidljivo i u JSON-LD-u', () => {
    expect(visible).toContain('Kojim redom se slaže popis literature?');
    expect(visibleAnswer).toMatch(/IEEE|Vancouver/);
    expect(structuredAnswer).toMatch(/IEEE|Vancouver/);
  });

  it('vidljivi i JSON-LD odgovor na "Kojim redom..." su identicni', () => {
    expect(structuredAnswer).toBe(visibleAnswer);
  });
});
