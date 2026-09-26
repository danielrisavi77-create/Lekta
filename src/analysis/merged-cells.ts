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
 *  - gleda se lokalno ime uz BILO KOJI XML NCName prefiks (i ne-ASCII: `ž`, `č1`), jer drugi
 *    prefiks za isti imenski prostor ne smije zaobici gard;
 *  - w:hMerge i w:vMerge su uvijek spajanje;
 *  - w:gridSpan je spajanje samo kad val NIJE 1. Celija s gridSpan val=1 zauzima jedan stupac.
 *    Bez vrijednosti ili s neispravnom vrijednoscu racuna se kao spajanje: tada se equalColumns
 *    preskace, sto je sigurna strana (grid ostaje netaknut);
 *  - XML komentari se prije pretrage uklanjaju, da zakomentirani element ne ugasi equalColumns.
 */

/**
 * NCName prema XML Namespaces 1.0, bez dvotocke. Pocetni znak: slovo (ukljucivo ne-ASCII),
 * slovni broj (Nl) ili `_`. Dalje jos znamenke, kombinirajuci znakovi, `.`, `-`, U+00B7 i
 * U+203F/U+2040. To je aproksimacija XML NameChar klase kroz Unicode kategorije; ne dopusta
 * razmak, `=`, navodnike ni `<`, pa ne moze uhvatiti tekst iz atributa.
 */
const NCNAME = '[\\p{L}\\p{Nl}_][\\p{L}\\p{Nl}\\p{Mn}\\p{Mc}\\p{Nd}\\p{Pc}.\\-\\u00B7\\u203F\\u2040]*';
const MERGE_ELEMENT = new RegExp(`<(?:${NCNAME}:)?(gridSpan|hMerge|vMerge)(?=[\\s/>])([^>]*)>`, 'gu');
const VAL_ATTRIBUTE = new RegExp(`(?:^|\\s)(?:${NCNAME}:)?val\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'u');

/** Je li jedan element (lokalno ime + tekst atributa) oznaka spajanja celija. */
export function isMergeMarker(localName: string, attributes: string): boolean {
  if (localName === 'hMerge' || localName === 'vMerge') return true;
  if (localName !== 'gridSpan') return false;
  const match = VAL_ATTRIBUTE.exec(attributes);
  const raw = match ? (match[1] ?? match[2] ?? '').trim() : '';
  return !/^\+?0*1$/.test(raw);
}

/** Ima li XML tablice barem jednu spojenu celiju. Ista odluka za analizu i fixer. */
export function hasMergedCellsXml(tableXml: string): boolean {
  const withoutComments = tableXml.replace(/<!--[\s\S]*?-->/g, '');
  for (const match of withoutComments.matchAll(MERGE_ELEMENT)) {
    if (isMergeMarker(match[1], match[2])) return true;
  }
  return false;
}
