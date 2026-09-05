/**
 * PSEUDONIMIZACIJA DOCX PAKETA (F1).
 *
 * NIJE dio app bundlea (isti obrazac kao `src/repair/recipe.ts`).
 *
 * Nacelo: za brisanje osobnog podatka je propust FATALAN, a za mjerenje je propust samo pristranost
 * koju se imenuje. Zato je skener ovdje namjerno SIRI od produkcijskog: hvata `w:author` bilo gdje,
 * ne samo ondje gdje ga analiza cita.
 *
 * Zamjena se ne oslanja na nadu nego se DOKAZUJE: nakon zamjene se pokrece `leakScan` koji trazi
 * svaki pojam iz rjecnika po SVIM dijelovima paketa. Dokument s ijednim preostalim pogotkom se
 * odbija, ne isporucuje.
 *
 * Sto se NE dira, jer bi unistilo strukturu koja se testira:
 *  - komentar se ANONIMIZIRA, ne brise (broj komentara je znacajka),
 *  - `w:ins`/`w:del` ostaju revizije, mijenja im se samo autor,
 *  - stilovi, numeriranje, sekcije, polja i sadrzaj rada ostaju netaknuti,
 *  - dokument se NIKAD ne otvara Wordom ni LibreOfficeom (spremanje kroz alat prepisuje rsid,
 *    odbacuje w15/w16 dijelove i prepisuje `docProps`, dakle unistava upravo ono sto se mjeri).
 */
import { createHmac } from 'node:crypto';

export type DocxParts = Record<string, string>;

export interface PseudonymizeResult {
  parts: DocxParts;
  /** Nositelji koji su stvarno ocisceni (npr. `core.creator`, `comments.author`). */
  carriersCleaned: string[];
  /** Pojmovi prepoznati kao osobni podatak (broj, NIKAD sam sadrzaj). */
  dictionarySize: number;
  /** Pojmovi koji su nakon zamjene JOS prisutni; mora biti prazno. */
  leaks: string[];
  /** Mapa pojam -> pseudonim, za keyring IZVAN repozitorija. Nikad se ne commita. */
  mapping: Record<string, string>;
}

/** Najkraci pojam koji se smije zamjenjivati. Krace bi razaralo obicne rijeci. */
const MIN_TERM_LENGTH = 3;

/**
 * Nositelji imena u metapodacima: `[dio, regex s jednom grupom, oznaka]`.
 * Vrijednosti odavde cine RJECNIK koji se zatim trazi po CIJELOM paketu, i u vidljivom tekstu.
 */
const METADATA_CARRIERS: Array<[part: string, re: RegExp, label: string]> = [
  ['docProps/core.xml', /<dc:creator>([^<]*)<\/dc:creator>/g, 'core.creator'],
  ['docProps/core.xml', /<cp:lastModifiedBy>([^<]*)<\/cp:lastModifiedBy>/g, 'core.lastModifiedBy'],
  ['docProps/app.xml', /<Company>([^<]*)<\/Company>/g, 'app.company'],
  ['docProps/app.xml', /<Manager>([^<]*)<\/Manager>/g, 'app.manager'],
];

/** Nositelji imena u atributima; ciste se svugdje gdje se atribut pojavi. */
const ATTRIBUTE_CARRIERS: Array<[re: RegExp, label: string]> = [
  [/\sw:author="([^"]*)"/g, 'author'],
  [/\sw:initials="([^"]*)"/g, 'initials'],
  [/\sw15:author="([^"]*)"/g, 'people.author'],
  [/\sw:lastModifiedBy="([^"]*)"/g, 'lastModifiedBy'],
];

/**
 * Rijeci koje na naslovnici izgledaju kao ime, a nisu: ustanove, vrste rada, gradovi, zvanja.
 * Namjerno velikim slovima i bez dijakritike i s njom, jer se u radovima pojavljuju oba oblika.
 */
const NOT_A_NAME = new Set(
  [
    'SVEUCILISTE', 'SVEUČILIŠTE', 'FAKULTET', 'FAKULTETA', 'VELEUCILISTE', 'VELEUČILIŠTE', 'ODJEL',
    'STUDIJ', 'STUDIJA', 'SMJER', 'KATEDRA', 'ZAVOD', 'AKADEMIJA', 'SKOLA', 'ŠKOLA',
    'ZAVRSNI', 'ZAVRŠNI', 'DIPLOMSKI', 'SEMINARSKI', 'DOKTORSKI', 'SPECIJALISTICKI', 'SPECIJALISTIČKI',
    'RAD', 'RADA', 'DISERTACIJA', 'TEMA', 'NASLOV', 'SADRZAJ', 'SADRŽAJ', 'SAZETAK', 'SAŽETAK',
    'ZAGREB', 'SPLIT', 'RIJEKA', 'OSIJEK', 'ZADAR', 'PULA', 'DUBROVNIK', 'VARAZDIN', 'VARAŽDIN',
    'MENTOR', 'MENTORICA', 'KOMENTOR', 'STUDENT', 'STUDENTICA', 'AUTOR', 'KANDIDAT',
    'POLITICKIH', 'POLITIČKIH', 'ZNANOSTI', 'EKONOMSKI', 'PRAVNI', 'FILOZOFSKI', 'GRAFICKI', 'GRAFIČKI',
    'PRIJEDIPLOMSKI', 'PREDDIPLOMSKI', 'INTEGRIRANI', 'STRUCNI', 'STRUČNI', 'GODINA', 'AKADEMSKA',
  ],
);

/** Titule koje stoje uz ime, pa ih se ne smije pobrkati sa samim imenom. */
const TITLE_TOKENS = /(?:prof|doc|dr|sc|mr|mag|univ|spec|izv|red|ing|bacc|dipl)\.?/gi;

const NAME_WORD = '[A-ZČĆŽŠĐ][a-zčćžšđ]{2,}';

/**
 * Imena koja postoje SAMO u vidljivom tekstu (naslovnica), ne u metapodacima.
 *
 * Bez ovoga je pseudonimizacija bila vakuumska na vecini radova: izmjereno 2026-08-23, 218 od 246
 * dokumenata je i nakon ciscenja metapodataka zadrzalo uzorak "Ime Prezime" na naslovnici, a 82
 * dokumenta uopce nemaju ime u metapodacima, pa im rjecnik nije imao odakle nastati.
 *
 * Dvije visokopouzdane skupine, namjerno bez "pametnog" pogadjanja po cijelom tekstu:
 *  1. iza oznake uloge (`Mentor:`, `Student:`, `Autor:` ...), uz preskocene titule,
 *  2. odlomak koji se SAM po sebi sastoji samo od dvije ili tri velike rijeci (tako se ime pise
 *     na naslovnici), a nijedna nije institucionalni pojam.
 */
export function frontMatterNames(documentXml: string): string[] {
  const paragraphs = [...documentXml.slice(0, 200_000).matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .slice(0, 60)
    .map((m) => [...m[1].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join('').trim())
    .filter(Boolean);

  const out = new Set<string>();
  const roleRe = new RegExp(`(?:mentor|mentorica|komentor|student|studentica|autor|kandidat|kandidatkinja)\\s*:?\\s*(.{0,60})`, 'i');

  for (const text of paragraphs) {
    const role = roleRe.exec(text);
    if (role?.[1]) {
      const cleaned = role[1].replace(TITLE_TOKENS, ' ');
      const m = new RegExp(`${NAME_WORD}(?:\\s+${NAME_WORD}){1,2}`).exec(cleaned);
      if (m && !m[0].split(/\s+/).some((w) => NOT_A_NAME.has(w.toUpperCase()))) out.add(m[0].trim());
    }
    // Odlomak koji je SAMO ime.
    const solo = new RegExp(`^${NAME_WORD}(?:\\s+${NAME_WORD}){1,2}$`).exec(text.replace(TITLE_TOKENS, '').trim());
    if (solo && !solo[0].split(/\s+/).some((w) => NOT_A_NAME.has(w.toUpperCase()))) out.add(solo[0].trim());
  }
  return [...out];
}

/** Deterministicki, citljiv pseudonim. Salt je PO DOKUMENTU, pa ista osoba u dva rada dobiva
 *  razlicite tokene: inace bi pseudonimizacija sama gradila graf povezivanja. */
function pseudonymFor(term: string, salt: string, index: number): string {
  const digest = createHmac('sha256', salt).update(term).digest('hex').slice(0, 4).toUpperCase();
  return `OSOBA_${index}_${digest}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Zamjena po granici rijeci, da "Ana" ne raskomada "Analiza".
 * Granica je namjerno definirana preko NE-slova (Unicode), a ne preko `\b`, jer je `\b` u JS-u
 * ASCII pojam i pred hrvatskom dijakritikom pada (poznata zamka u ovom repozitoriju).
 */
function replaceTerm(text: string, term: string, replacement: string): string {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(term)})(?=[^\\p{L}\\p{N}]|$)`, 'giu');
  return text.replace(re, (_m, pre: string) => `${pre}${replacement}`);
}

/** Pojmovi vrijedni zamjene: dovoljno dugi i ne cisto brojcani. */
function usableTerms(raw: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const value of raw) {
    const trimmed = value.trim();
    if (trimmed.length < MIN_TERM_LENGTH) continue;
    if (/^[\d\s.,:;-]+$/.test(trimmed)) continue;
    out.add(trimmed);
    // I pojedini dijelovi punog imena ("Ana Anic" -> "Ana", "Anic"), jer se u tekstu rada
    // prezime cesto pojavljuje samo.
    for (const piece of trimmed.split(/[\s,]+/)) {
      if (piece.length >= MIN_TERM_LENGTH && !/^[\d.]+$/.test(piece)) out.add(piece);
    }
  }
  // Dulji pojmovi prvi: "Ana Anic" se mora zamijeniti prije nego "Ana" razbije taj isti niz.
  return [...out].sort((a, b) => b.length - a.length);
}

export function pseudonymizeDocx(parts: DocxParts, options: { salt: string }): PseudonymizeResult {
  const rawTerms = new Set<string>();
  /**
   * Nositelj -> vrijednosti koje je dao. Nositelj se broji kao OCISCEN tek ako je barem jedna
   * njegova vrijednost stvarno zavrsila u rjecniku. Inace bi izvjestaj tvrdio ciscenje koje se
   * nije dogodilo: vrijednost kraca od praga (npr. korisnicko ime "PC") ne postaje pojam, a
   * nositelj je svejedno bio upisan kao ociscen.
   */
  const carrierValues = new Map<string, string[]>();
  const note = (label: string, value: string) => {
    rawTerms.add(value);
    const list = carrierValues.get(label) ?? [];
    list.push(value);
    carrierValues.set(label, list);
  };

  for (const [part, re, label] of METADATA_CARRIERS) {
    const xml = parts[part];
    if (!xml) continue;
    for (const m of xml.matchAll(re)) if (m[1]?.trim()) note(label, m[1]);
  }
  for (const xml of Object.values(parts)) {
    for (const [re, label] of ATTRIBUTE_CARRIERS) {
      for (const m of xml.matchAll(re)) if (m[1]?.trim()) note(label, m[1]);
    }
  }

  // Imena s naslovnice: bez njih je rjecnik prazan na vecini stvarnih radova (izmjereno: 82 od
  // 246 dokumenata uopce nema ime u metapodacima), pa bi "0 procurjelih pojmova" bila vakuumska
  // tvrdnja o dokumentu koji na prvoj stranici i dalje pise ime studenta i mentora.
  const front = frontMatterNames(parts['word/document.xml'] ?? '');
  for (const name of front) note('document.frontMatter', name);

  const terms = usableTerms(rawTerms);
  const mapping: Record<string, string> = {};
  terms.forEach((term, i) => {
    mapping[term] = pseudonymFor(term, options.salt, i + 1);
  });

  const out: DocxParts = {};
  const attributeCleaned = new Set<string>();
  for (const [name, xml] of Object.entries(parts)) {
    let next = xml;
    for (const term of terms) next = replaceTerm(next, term, mapping[term]);
    /**
     * Atributi se prepisuju IZRAVNO, neovisno o duljini vrijednosti.
     *
     * Rjecnik ima najmanju duljinu pojma (3 znaka) jer zamjena po cijelom tekstu inace razara
     * obicne rijeci. Inicijali su redovito dva znaka ("II"), pa kroz rjecnik nikad ne bi prosli i
     * ostajali bi u dokumentu, dok bi izvjestaj tvrdio da je nositelj ociscen. Unutar atributa
     * takvog rizika nema: vrijednost je cijela ime ili inicijali, nikad dio recenice.
     */
    for (const [re, label] of ATTRIBUTE_CARRIERS) {
      next = next.replace(new RegExp(re.source, 'g'), (whole: string, value: string) => {
        const trimmed = (value ?? '').trim();
        if (!trimmed || trimmed.startsWith('OSOBA_')) return whole;
        attributeCleaned.add(label);
        const replacement = mapping[trimmed] ?? pseudonymFor(trimmed, options.salt, 0);
        return whole.replace(`"${value}"`, `"${replacement}"`);
      });
    }
    out[name] = next;
  }

  // DOKAZ, ne nada: nijedan pojam ne smije preostati ni u jednom dijelu.
  const leaks: string[] = [];
  for (const term of terms) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(term)}(?=[^\\p{L}\\p{N}]|$)`, 'iu');
    if (Object.values(out).some((xml) => re.test(xml))) leaks.push(term);
  }

  // Nositelj je OCISCEN samo ako je barem jedna njegova vrijednost stvarno postala pojam.
  const termSet = new Set(terms);
  const carriersCleaned = [
    ...new Set([
      ...[...carrierValues.entries()]
        .filter(([, values]) =>
          values.some((value) => termSet.has(value.trim()) || value.split(/[\s,]+/).some((piece) => termSet.has(piece))),
        )
        .map(([label]) => label),
      // Atributi su prepisani izravno, pa se broje neovisno o rjecniku.
      ...attributeCleaned,
    ]),
  ].sort();

  return {
    parts: out,
    carriersCleaned,
    dictionarySize: terms.length,
    leaks,
    mapping,
  };
}
