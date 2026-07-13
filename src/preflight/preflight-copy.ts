/**
 * Studentski copy sloj za Provjeru prije predaje. Nacelo "signali, ne presuda":
 * svaka kartica opisuje ARTEFAKT u dokumentu, nikad namjeru osobe; kaze zasto
 * je to problem PRI PREDAJI (fakultetski sustav to vidi), i zavrsava konkretnom
 * radnjom u Wordu ili literaturi. Zabranjene rijeci: plagijat, varanje, prijevara.
 *
 * Serverski `recommendation`/`title` iz pipelinea su pisani za ispitivaca
 * ("diskvalificira rad", "zatraziti od autora") i NIKAD se ne prikazuju: UI
 * uzima override odavde. Test (preflight-copy.test.ts) trazi da SVAKI
 * STUDENT_VISIBLE_CODES ima unos (osim dinamickih koji nose vlastiti tekst).
 */
import { STUDENT_VISIBLE_CODES } from './tier-filter';

export interface CopyEntry {
  /** Studentu prilagodjen naslov (zamjenjuje serverski title). */
  title: string;
  /** Objasnjenje + radnja; {n} se ne interpolira ovdje (evidence nosi brojeve). */
  body: string;
  /** Ton kartice za semafor kad severity nije dovoljan (npr. pozitivno zeleno). */
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}

/** Naslovi grupa po modulu (studentski jezik, ne interni module_name). */
export const MODULE_LABELS: Record<string, string> = {
  m1_metadata: 'Metapodaci dokumenta',
  m1_content: 'Skriveni i neuobičajeni sadržaj',
  m1_styles: 'Word tragovi i stilovi',
  m2_citations: 'Citati i popis literature',
  m2_references: 'Reference u javnim bazama',
};

/** Redoslijed prikaza grupa (compliance tok: sadrzaj -> citati -> reference). */
export const MODULE_ORDER: readonly string[] = [
  'm2_citations', 'm2_references', 'm1_content', 'm1_styles', 'm1_metadata',
];

const COPY: Record<string, CopyEntry> = {
  // --- m1_metadata -----------------------------------------------------
  META_IDENTITY: {
    title: 'Provjeri jesu li metapodaci tvoji',
    body: 'Dokument u svojim metapodacima navodi autora, tvrtku ili predložak. '
      + 'Referade i repozitoriji te podatke vide. Provjeri odgovaraju li tebi; '
      + 'ako ne, u Wordu ih pregledaj kroz Datoteka, Informacije, Provjeri ima li '
      + 'problema, Pregledaj dokument.',
    tone: 'warn',
  },
  OK_META: {
    title: 'Metapodaci su uredni',
    body: 'U metapodacima nema neuobičajenih tragova.',
    tone: 'good',
  },
  // --- m1_content ------------------------------------------------------
  HIDDEN_VANISH: {
    title: 'Skriveni tekst u dokumentu',
    body: 'Dio teksta označen je kao skriven, pa se ne vidi na ekranu ni u ispisu, '
      + 'ali ga fakultetski sustavi normalno čitaju i on ulazi u opseg rada. Prije '
      + 'predaje ga ukloni ili mu vrati vidljivost (Polazno, mali strelica kod Font, '
      + 'odznači Skriveno).',
    tone: 'bad',
  },
  HIDDEN_WHITE: {
    title: 'Nevidljivi (bijeli) tekst',
    body: 'Dio teksta ima bijelu boju pa se ne vidi na bijeloj stranici, ali ga '
      + 'sustavi čitaju i ulazi u opseg. Prije predaje mu vrati vidljivu boju '
      + '(Polazno, Boja fonta) ili ga ukloni.',
    tone: 'bad',
  },
  HIDDEN_TINY: {
    title: 'Tekst mikroskopske veličine',
    body: 'Dio teksta je postavljen na vrlo malu veličinu (2 pt ili manje) pa se '
      + 'praktički ne vidi, ali ostaje u dokumentu. Provjeri te dijelove i vrati im '
      + 'čitljivu veličinu ili ih ukloni prije predaje.',
    tone: 'bad',
  },
  EVASION_ZERO_WIDTH: {
    title: 'Znakovi koji ometaju automatske provjere',
    body: 'Pronađeni su znakovi bez širine (nulti razmaci i slično) koji vizualno '
      + 'ništa ne mijenjaju, ali ometaju automatsku obradu teksta. Obično nastaju '
      + 'kopiranjem s weba. Ukloni ih da dokument prođe tehničke provjere bez zastoja.',
    tone: 'bad',
  },
  EVASION_HOMOGLYPH: {
    title: 'Slova iz drugog pisma',
    body: 'Neka slova izgledaju isto, ali dolaze iz ćirilice ili drugog pisma '
      + '(primjerice ćirilično a umjesto latiničnog). Najčešće nastaju kopiranjem iz '
      + 'drugih izvora. Zamijeni ih standardnim hrvatskim slovima; fakultetski softver '
      + 'ih vidi kao različite znakove.',
    tone: 'bad',
  },
  CHAR_SOFT_HYPHEN: {
    title: 'Meki spojnici u tekstu',
    body: 'Tekst sadrži meke spojnice, obično zaostale nakon kopiranja iz PDF-a. '
      + 'Ne mijenjaju izgled, ali mogu razbiti riječi pri pretraživanju. Preporuka je '
      + 'ukloniti ih (Zamijeni, posebni znak Neobavezna crtica).',
    tone: 'neutral',
  },
  CHAR_CYRILLIC: {
    title: 'Ćirilične riječi u tekstu',
    body: 'U tekstu su pronađene ćirilične riječi. Ako su namjeran citat, u redu je; '
      + 'ako su slučajne (kopiranje iz drugog izvora), zamijeni ih latiničnim pismom.',
    tone: 'neutral',
  },
  LANG_FOREIGN_DOMINANT: {
    title: 'Jezik dokumenta ne odgovara oznaci',
    body: 'Tekst je hrvatski, ali je označen pretežno drugim jezikom. To zna pokvariti '
      + 'provjeru pravopisa i dijeljenje riječi. Označi cijeli tekst i postavi jezik na '
      + 'hrvatski (Pregled, Jezik, Postavi jezik provjere).',
    tone: 'warn',
  },
  LANG_MIXED: {
    title: 'Dijelovi teksta označeni drugim jezikom',
    body: 'Pojedini odlomci nose stranu jezičnu oznaku, čest trag lijepljenja iz više '
      + 'izvora. Ujednači jezik lekture (Pregled, Jezik) prije predaje.',
    tone: 'warn',
  },
  OK_CONTENT: {
    title: 'Nema skrivenog ni neuobičajenog sadržaja',
    body: 'Nisu pronađeni skriveni tekst, nevidljivi znakovi ni miješana pisma.',
    tone: 'good',
  },
  // --- m1_styles -------------------------------------------------------
  TRACKED_CHANGES: {
    title: 'Evidentirane izmjene još su u dokumentu',
    body: 'Dokument sadrži neprihvaćene izmjene. Svatko tko ga otvori vidi cijelu '
      + 'povijest uređivanja, uključujući obrisane rečenice. Prije predaje: Pregled, '
      + 'Prihvati sve izmjene, pa isključi praćenje izmjena.',
    tone: 'warn',
  },
  COMMENTS_PRESENT: {
    title: 'Komentari su još u dokumentu',
    body: 'U dokumentu su ostali komentari. Izbriši ih prije predaje '
      + '(Pregled, Izbriši sve komentare u dokumentu).',
    tone: 'warn',
  },
  FONT_POLLUTION: {
    title: 'Previše različitih fontova',
    body: 'Dokument koristi neuobičajeno mnogo fontova, čest trag sastavljanja iz više '
      + 'izvora, i kvari ujednačen izgled. Ujednači tekst na font koji traži tvoj profil.',
    tone: 'warn',
  },
  STYLE_POLLUTION: {
    title: 'Velik broj prilagođenih stilova',
    body: 'Dokument nosi mnogo prilagođenih stilova, obično zaostalih nakon kopiranja. '
      + 'Ne moraju biti problem, ali pregled i čišćenje nekorištenih stilova daje uredniji '
      + 'dokument.',
    tone: 'neutral',
  },
  OK_STYLES: {
    title: 'Stilovi i fontovi su uredni',
    body: 'Nema neuobičajenih fontova ni zaostalih tragova uređivanja.',
    tone: 'good',
  },
  // --- m2_citations ----------------------------------------------------
  BIBLIO_MISSING: {
    title: 'Popis literature nije prepoznat',
    body: 'Nismo pronašli popis literature s prepoznatljivim zaglavljem (Literatura, '
      + 'Popis literature, Reference). Provjeri ima li rad popis literature i je li '
      + 'naslovljen standardno; bez njega se citati ne mogu provjeriti.',
    tone: 'warn',
  },
  STYLE_AUTHOR_YEAR: {
    title: 'Stil citiranja je autor-godina',
    body: 'Rad koristi autor-godina stil (primjerice Horvat, 2019). Provjera '
      + 'podudarnosti citata i popisa te postojanja referenci u bazama za ovaj stil '
      + 'dolazi u sljedećoj verziji; zasad su provjereni skriveni sadržaj, metapodaci '
      + 'i tehnička čistoća.',
    tone: 'neutral',
  },
  CITE_PHANTOM: {
    title: 'Citat bez izvora u popisu literature',
    body: 'U tekstu se poziva na izvore kojih nema u popisu literature. Ovo je jedan od '
      + 'najčešćih formalnih prigovora pri pregledu rada. Dodaj izvore u literaturu ili '
      + 'ukloni citate koji im ne pripadaju (brojevi su navedeni u dokazu).',
    tone: 'bad',
  },
  CITE_ORPHAN: {
    title: 'Reference u popisu bez citata u tekstu',
    body: 'Neki izvori postoje u popisu literature, ali se nigdje u tekstu ne citiraju. '
      + 'Provjeri jesi li ih zaboravio citirati ili ih ukloni iz popisa (brojevi su u dokazu).',
    tone: 'warn',
  },
  CITE_STATS: {
    title: 'Statistika citiranja',
    body: 'Pregled najčešće citiranih izvora u radu, informativno.',
    tone: 'neutral',
  },
  QUOTES_QUEUE: {
    title: 'Doslovni navodi za tvoju provjeru',
    body: 'Pronašli smo dijelove pod navodnicima. Provjeri da svaki doslovni navod '
      + 'stvarno postoji u izvoru i da uz njega stoji točan citat sa stranicom.',
    tone: 'neutral',
  },
  NUMERIC_QUEUE: {
    title: 'Brojčane tvrdnje uz citat',
    body: 'Pronašli smo tvrdnje s brojkama (postoci, iznosi) uz citat. Prije predaje '
      + 'provjeri da svaka brojka odgovara navedenom izvoru.',
    tone: 'neutral',
  },
  OK_CITATIONS: {
    title: 'Citati i literatura su usklađeni',
    body: 'Svi citati u tekstu imaju izvor u popisu literature i obrnuto.',
    tone: 'good',
  },
  // --- m2_references ---------------------------------------------------
  REF_NO_ENTRIES: {
    title: 'Nema numerirane literature za provjeru postojanja',
    body: 'Provjera postojanja referenci u javnim bazama zasad radi nad numeriranim '
      + '(Vancouver) popisom literature. Za ovaj rad taj popis nije prepoznat, pa je '
      + 'ovaj korak preskočen; ostale provjere su obavljene.',
    tone: 'neutral',
  },
  REF_NOT_FOUND: {
    title: 'Referenca nije pronađena u javnim bazama',
    body: 'Za ovu referencu nismo pronašli podudaranje u bazama Crossref, OpenAlex ni '
      + 'PubMed. To ne znači nužno da izvor ne postoji: knjige, zbornici i domaći izvori '
      + 'često nisu u tim bazama. Provjeri autora, godinu i točan naslov; ako je zapis '
      + 'točan, slobodno ga ostavi.',
    tone: 'warn',
  },
  REF_DOI_INVALID: {
    title: 'DOI reference ne postoji',
    body: 'Referenca navodi DOI koji nismo uspjeli pronaći. Provjeri je li DOI točno '
      + 'prepisan; pogrešan ili nepostojeći DOI treba ispraviti prije predaje.',
    tone: 'bad',
  },
  REF_LIKELY: {
    title: 'Referenca djelomično potvrđena',
    body: 'Pronašli smo blizak zapis u bazama, ali ne potpuno podudaran. Provjeri '
      + 'bibliografske podatke (godina, svezak, stranice, naslov).',
    tone: 'neutral',
  },
  REF_UNCHECKED: {
    title: 'Dio referenci nije provjeren',
    body: 'Neke reference nismo stigli provjeriti (privremena greška baze ili vremenski '
      + 'budžet). Ponovi provjeru prije nego što doneseš zaključke o tim referencama.',
    tone: 'neutral',
  },
  REF_SUMMARY: {
    title: 'Sažetak provjere referenci',
    body: 'Pregled koliko je referenci potvrđeno, koliko domaćih ostaje za ručnu '
      + 'provjeru i koliko nije pronađeno.',
    tone: 'neutral',
  },
  OK_REFERENCES: {
    title: 'Sve provjerljive reference postoje',
    body: 'Sve reference koje se mogu provjeriti pronađene su u javnim bazama; domaći '
      + 'izvori izvan baza navedeni su za tvoju ručnu provjeru.',
    tone: 'good',
  },
};

/** Studentski override za kod, ili null ako kod nije studentski (fail-closed). */
export function copyForCode(code: string): CopyEntry | null {
  return COPY[code] ?? null;
}

export function moduleLabel(moduleId: string): string {
  return MODULE_LABELS[moduleId] ?? moduleId;
}

/** Kodovi koji imaju override ali nisu u allowlisti (za test simetrije). */
export const COVERED_CODES: readonly string[] = Object.keys(COPY);

/** Kodovi iz allowliste bez override (za test potpunosti). Anti-inference
 *  padding koristi OK_META, koji vec ima override, pa nema sintetskih kodova. */
export function missingCopyCodes(): string[] {
  return [...STUDENT_VISIBLE_CODES].filter((c) => !(c in COPY));
}
