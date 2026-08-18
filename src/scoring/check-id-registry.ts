/**
 * STABILNI IDENTITETI PROVJERA (faza 2 Lekta Error Corpus).
 *
 * Engine povijesno nema `checkId` na check objektu; identitet nalaza je hrvatski `check.title`
 * (UI string). To je krhko za dugorocne testove (prijevod/preformulacija naslova rusi test).
 * Ovdje uvodimo STABILNI, hijerarhijski, jezicno-neovisan ID po naslovu - BEZ diranja produkcije
 * (golden ostaje bajt-identican: ne mijenjamo Check ni analyzeDocx). Korpus testovi keyaju po
 * stableCheckId(title), ne po samom naslovu.
 *
 * Kad se doda nova provjera: dodaj joj ovdje stabilni ID (tests/corpus-ids.test.ts to iznuduje -
 * svaki emitiran naslov MORA imati ID, ID-evi su jedinstveni i dobro oblikovani).
 *
 * Namespace (neovisan o `check.category` u engineu):
 *   format.*   font/velicina/prored/poravnanje/razmaci odlomka
 *   page.*     margine/format stranice/brojevi stranica
 *   footnote.* fusnote (prisutnost/oblik/oznaka/razmak)
 *   structure.*naslovi/dijelovi/hijerarhija/word-stilovi
 *   toc.*      sadrzaj
 *   title.*    naslovnica
 *   scope.*    opseg (rijeci/kartice/stranice/omjer)
 *   method.*   metodologija empirijskog rada
 *   manual.*   rucne provjere
 *   citation.* autor-godina citati
 *   reference.*popis literature / bibliografski zapisi
 *   legal.*    pravne fusnote i pravni izvori
 *   element.*  tablice/slike/poveznice/prazni odlomci
 */

/** Legacy hrvatski naslov -> stabilni ID. Iscrpno za sve provjere iz inventara (faza 1). */
export const CHECK_ID_BY_TITLE: Record<string, string> = {
  // --- formatting -----------------------------------------------------------------------
  'Dominantni font': 'format.font.dominant',
  'Veličina osnovnog teksta': 'format.size.body',
  'Prored osnovnog teksta': 'format.spacing.body',
  'Razmak prije i poslije odlomka': 'format.spacing.paragraph',
  'Poravnanje osnovnog teksta': 'format.justify.body',
  'Tehničko-tipografska dosljednost': 'format.typography.consistency',
  'Margine dokumenta': 'page.margins',
  'Format stranice A4': 'page.size.a4',
  'Format stranice (A4)': 'page.size.a4-list',
  'Format stranice (A3/A0)': 'page.size.project',
  'Automatske fusnote': 'footnote.present',
  'Oblikovanje fusnota': 'footnote.format',
  'Položaj i stil oznaka fusnota': 'footnote.marker',
  'Razmak prije i poslije fusnota': 'footnote.spacing',

  // --- structure ------------------------------------------------------------------------
  'Hijerarhija naslova': 'structure.heading.hierarchy',
  'Dubina decimalnog numeriranja': 'structure.heading.depth',
  'Oblikovanje naslova po razinama': 'structure.heading.format',
  'Numeriranje naslova': 'structure.heading.numbering',
  'Poravnanje naslova slijeva': 'structure.heading.align',
  'Uporaba Word stilova naslova': 'structure.heading.word-styles',
  'Osnovni dijelovi rada': 'structure.sections.basic',
  'Dijelovi verificiranog profila': 'structure.sections.profile',
  'Broj glavnih poglavlja': 'structure.chapters.count',
  'Sažeci u samom radu': 'structure.abstract',
  'Ključne riječi u samom radu': 'structure.keywords',

  // --- TOC (sadrzaj) --------------------------------------------------------------------
  'Sadržaj dokumenta': 'toc.present',
  'Detalji automatskog sadržaja': 'toc.field',
  'Font i veličina sadržaja': 'toc.format',
  'Brojevi stranica u sadržaju': 'toc.page-numbers',
  'Naslovi dokumenta ↔ sadržaj': 'toc.coverage',

  // --- page numbers ---------------------------------------------------------------------
  'Brojevi stranica': 'page.numbers.present',
  'Položaj broja stranice': 'page.numbers.position',
  'Naslovnica bez broja stranice': 'page.numbers.title-suppressed',
  'Numeriranje od prve stranice Uvoda': 'page.numbers.start',
  'Shema numeriranja stranica': 'page.numbers.scheme',

  // --- title page (naslovnica) ----------------------------------------------------------
  'Elementi naslovne stranice': 'title.elements',
  'Raspored naslovne stranice': 'title.layout',
  'Redoslijed elemenata naslovnice': 'title.order',
  'Tipografija korica i naslovnice': 'title.typography',

  // --- scope (opseg) --------------------------------------------------------------------
  'Profilni opseg riječi': 'scope.words',
  'Opseg u autorskim karticama': 'scope.cards',
  'Opseg u stranicama': 'scope.pages',
  'Omjer Uvoda i Zaključka': 'scope.intro-conclusion-ratio',

  // --- methodology ----------------------------------------------------------------------
  'Metodološka varijanta rada': 'method.variant',
  'Struktura metodološkog profila': 'method.structure',
  'Etički aspekti empirijskog istraživanja': 'method.ethics',

  // --- manual ---------------------------------------------------------------------------
  'Zahtjevi za ručnu završnu provjeru': 'manual.checks',

  // --- citations (author-year) ----------------------------------------------------------
  'Prepoznate citatnice': 'citation.recognized',
  'Citirano → literatura': 'citation.author-year.missing-reference',
  'Literatura → citirano': 'reference.uncited',
  'Automatizacija citatnog stila': 'citation.style-automation',
  'Potpunost bibliografskih zapisa': 'reference.completeness',
  'Lokator uz izravne citate': 'citation.direct-quote-locator',
  'Dosljednost interpunkcije citatnica': 'citation.punctuation',
  'Abecedni poredak literature': 'reference.alphabetical',
  'Isti autor i godina (a/b/c)': 'citation.author-year.suffix',
  'Minimalan broj izvora profila': 'reference.min-count',
  'Datumi pristupa mrežnim izvorima': 'reference.access-date',

  // --- legal citations ------------------------------------------------------------------
  'Pravne fusnote': 'legal.footnotes-present',
  'Klasifikacija pravnih izvora': 'legal.source-classification',
  'Potpunost prvog navođenja': 'legal.first-citation-completeness',
  'op. cit. → prvo navođenje': 'legal.opcit',
  'Slijed Ibid.': 'legal.ibid',
  'Kratica id. u istoj bilješci': 'legal.id-abbrev',
  'Propisi i uvedene kratice': 'legal.act-abbrev',
  'Sudska praksa': 'legal.case-law',
  'Fusnote ↔ bibliografija': 'legal.footnote-bibliography',

  // --- elements (tablice/slike/poveznice) ----------------------------------------------
  'Naslovi tablica': 'element.table.caption',
  'Naslovi slika i grafikona': 'element.figure.caption',
  'Izvori ispod slika i tablica': 'element.source',
  'Popisi slika i tablica': 'element.lists',
  'Oblik poveznica': 'element.link-form',
  'Prazni odlomci': 'element.empty-paragraphs',
};

const ID_FORMAT = /^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/;

/** Namespace svih provjera formata papira; jedini ID prostor koji se izvodi dinamicki. */
export const PAPER_SIZE_ID_PREFIX = 'page.size.';

/**
 * Naslov provjere formata papira nije fiksan: analyzeDocx ga slaze kao
 * `Format stranice (${profile.paperSizes.join('/')})`, pa svaka nova kombinacija formata daje
 * naslov koji rucni registar ne moze unaprijed pokriti. Prije ovoga takve su provjere dobivale
 * `id: null` i tiho ispadale iz svakog ID-based wiringa (npr. `(A4/A3)`).
 *
 * Tri POSTOJECA unosa (`page.size.a4`, `page.size.a4-list`, `page.size.project`) imaju prednost
 * jer se na njih vec oslanja korpus; ovo je fallback samo za neregistrirane kombinacije.
 */
function dynamicPaperSizeId(title: string): string | null {
  const m = /^Format stranice\s*\((.+)\)$/.exec(title);
  if (!m) return null;
  const slug = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug ? `${PAPER_SIZE_ID_PREFIX}${slug}` : null;
}

/** Je li ID identitet provjere formata papira (bilo koja kombinacija formata)? */
export function isPaperSizeCheckId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(PAPER_SIZE_ID_PREFIX);
}

/** Stabilni ID za naslov provjere, ili null ako nije registriran. */
export function stableCheckId(title: string): string | null {
  return CHECK_ID_BY_TITLE[title] ?? dynamicPaperSizeId(title);
}

/** Provjeri je li ID dobro oblikovan (hijerarhijski, kebab, jezicno-neovisan). */
export function isWellFormedCheckId(id: string): boolean {
  return ID_FORMAT.test(id);
}

/** Svi registrirani ID-evi (za provjeru jedinstvenosti). */
export function allCheckIds(): string[] {
  return Object.values(CHECK_ID_BY_TITLE);
}
