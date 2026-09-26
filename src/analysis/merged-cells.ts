/**
 * T65: jedna detekcija spojenih celija za analizu (table-figure-rescue.ts) i popravak
 * (repair/table-figure-rescue-fixer.ts). Prije su postojale dvije: analiza je isla kroz DOM
 * localName (bilo koji prefiks), a fixer kroz regex s ASCII prefiksom. Za <ž:gridSpan>, gdje je
 * `ž` vezan uz Wordov namespace, analiza je rekla "spojeno", a fixer je tablicu tretirao kao
 * obicnu i prepisao tcW spojene celije sirinom jednog stupca.
 *
 * Funkcija radi nad XML TEKSTOM tablice, jer fixer i nema DOM: on reze sirovi document.xml.
 * Analiza joj daje serijalizirani element tablice. Smjer ovisnosti je repair -> analysis.
 *
 * Pravila:
 *  - gleda se lokalno ime uz BILO KOJI XML NCName prefiks (i ne-ASCII: `ž`, `č1`, U+200C), jer
 *    drugi prefiks za isti imenski prostor ne smije zaobici gard;
 *  - w:hMerge i w:vMerge su uvijek spajanje;
 *  - w:gridSpan NIJE spajanje samo kad ima barem jedan `val` atribut i SVI njegovi `val` atributi
 *    (bilo kojeg prefiksa) glase 1. Bez vrijednosti, s neispravnom vrijednoscu ili s ijednim val
 *    razlicitim od 1 racuna se kao spajanje: tada se equalColumns preskace, sto je sigurna strana
 *    (grid ostaje netaknut);
 *  - XML komentari, CDATA i processing instructioni se prije pretrage uklanjaju, jer oznake u
 *    njima nisu elementi;
 *  - `>` unutar navodnika atributa ne zavrsava element.
 *
 * Svjesno ogranicenje: imenski prostor prefiksa se ne razrjesava (fragment tablice u fixeru nema
 * xmlns deklaracije). Element gridSpan/hMerge/vMerge iz stranog imenskog prostora zato se broji
 * kao spajanje; to je sigurna strana (equalColumns se preskace) i ista odluka kao u analizi.
 */

/**
 * NCName prema XML 1.0 (5. izdanje) NameStartChar i NameChar, bez dvotocke. Tocni rasponi, ne
 * aproksimacija kroz Unicode kategorije. Ne dopusta razmak, `=`, navodnike ni `<`, pa ne moze
 * uhvatiti tekst iz atributa.
 */
// Izvor regexa pisan je kroz String.raw, pa escape sekvence (\u, \s) tumaci regex s /u zastavicom.
const NAME_START = String.raw`A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}`;
const NAME_CHAR = String.raw`${NAME_START}\-.0-9\u00B7\u0300-\u036F\u203F-\u2040`;
const NCNAME = `[${NAME_START}][${NAME_CHAR}]*`;
/**
 * Tekst atributa: sve do `>`, ali `>` unutar navodnika ne zavrsava element. Navodnik ne prelazi
 * `<` (u dobro oblikovanom XML-u `<` nije dopusten u vrijednosti atributa), pa nezatvoren navodnik
 * ne skenira ostatak dokumenta za svaki element (bez kvadratnog vremena na zlonamjernom ulazu).
 */
const ATTRIBUTES = `(?:[^>"'<]|"[^"<]*"|'[^'<]*')*`;
const MERGE_ELEMENT = new RegExp(String.raw`<(?:${NCNAME}:)?(gridSpan|hMerge|vMerge)(?=[\s/>])(${ATTRIBUTES})>`, 'gu');
/**
 * Jedan atribut: ime (s prefiksom ili bez) i vrijednost u navodnicima. Atributi se citaju redom,
 * pa vrijednost svakog atributa bude "pojedena" zajedno s njim; `val=` UNUTAR vrijednosti drugog
 * atributa (npr. x:note=' val="1" ') zato nije val atribut.
 */
const ATTRIBUTE = new RegExp(String.raw`(?:(${NCNAME}):)?(${NCNAME})\s*=\s*(?:"([^"]*)"|'([^']*)')`, 'gu');
const NON_MARKUP_SECTIONS: ReadonlyArray<readonly [string, string]> = [['<!--', '-->'], ['<![CDATA[', ']]>'], ['<?', '?>']];

/**
 * Uklanja komentare, CDATA i processing instructione: oznake u njima nisu elementi. Linearni
 * prolaz kroz indexOf umjesto lijenog regexa, jer je regex na nezatvorenim sekcijama bio kvadratan
 * (100 000 nezatvorenih komentara: oko 70 s). Nezatvorena sekcija ostaje u tekstu, pa se oznake
 * iza nje i dalje vide; to je sigurna strana (vise oznaka spajanja znaci preskoceni equalColumns).
 */
function stripNonMarkup(xml: string): string {
  const kept: string[] = [];
  let cursor = 0;
  let scan = 0;
  while (scan < xml.length) {
    const lt = xml.indexOf('<', scan);
    if (lt < 0) break;
    const section = NON_MARKUP_SECTIONS.find(([open]) => xml.startsWith(open, lt));
    if (!section) { scan = lt + 1; continue; }
    const end = xml.indexOf(section[1], lt + section[0].length);
    if (end < 0) break;
    kept.push(xml.slice(cursor, lt));
    cursor = end + section[1].length;
    scan = cursor;
  }
  kept.push(xml.slice(cursor));
  return kept.join('');
}

/** Je li jedan element (lokalno ime + tekst atributa) oznaka spajanja celija. */
export function isMergeMarker(localName: string, attributes: string): boolean {
  if (localName === 'hMerge' || localName === 'vMerge') return true;
  if (localName !== 'gridSpan') return false;
  const values = [...attributes.matchAll(ATTRIBUTE)]
    .filter((match) => match[2] === 'val')
    .map((match) => (match[3] ?? match[4] ?? '').trim());
  return values.length === 0 || values.some((raw) => !/^\+?0*1$/.test(raw));
}

/** Ima li XML tablice barem jednu spojenu celiju. Ista odluka za analizu i fixer. */
export function hasMergedCellsXml(tableXml: string): boolean {
  const markupOnly = stripNonMarkup(tableXml);
  for (const match of markupOnly.matchAll(MERGE_ELEMENT)) {
    if (isMergeMarker(match[1], match[2])) return true;
  }
  return false;
}
