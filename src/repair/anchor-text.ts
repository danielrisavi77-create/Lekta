/**
 * JEDINA normalizacija sidrenog teksta u popravku.
 *
 * Postoji jer su tri mjesta koja usporedjuju sidra (`heading-style` u `apply-fixers.ts`,
 * `link-doi-fixer`, `required-section-fixer`) imala tri KOPIJE ove logike. Kopije su se razisle i
 * to je proizvelo dvije regresije u proizvodu, obje izmjerene:
 *
 *   `1.<w:tab/>UVOD`  Sidro nastaje iz teksta ANALIZE (`src/docx/parser.ts` za `<w:tab/>` emitira
 *                     `\t`), a provjerava se protiv izvlakaca koji cita SAMO `<w:t>`. Podudaranja
 *                     nije bilo, pa se odbacivao CIJELI zahtjev za oblikovanjem naslova. To je
 *                     Wordov standardni zapis rucno numeriranog naslova.
 *   `1.UVOD`          `croatian-typography-fixer` radi PRIJE anchor-ovisnih fixera i umece razmak
 *                     iza tocke (`1. UVOD`), cime obara sidro `required-section-fixera`.
 *
 * Zato se usporedjuje SAMO po slovima i brojkama: sve sto razlikuje put (tabulator, prijelom,
 * interpunkcija, navodnici, crtice, velika slova) ispada iz usporedbe. Identitet i dalje drze
 * otisak odlomka (primarno), jedinstvenost teksta u dokumentu i podudaranje na istom indeksu.
 *
 * IZMJERENO 2026-08-31: od 19 commitanih fixtura NIJEDNA nema `<w:tab/>`, dok ga ima 32 od 38
 * stvarnih studentskih radova (84%). Sinteticki korpus po konstrukciji nije mogao sadrzavati
 * ovaj razred kvara; fixtura `tests/fixtures/docx-word/anchor-cases.docx` je zato napisana pravim
 * Wordom i nasla ga je odmah.
 */
export function normalizeAnchorText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .toLocaleLowerCase('hr-HR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Normalizirani vidljivi tekst odlomka iz njegova XML-a.
 *
 * `<w:tab/>`, `<w:br/>` i `<w:cr/>` emitiraju RAZMAK, ne nista. To je druga polovica istog kvara
 * kao normalizacija iznad: bez nje sidro puca cim netko tabulator pretvori u pravi razmak.
 *
 * IZMJERENO 2026-08-31 na fixturi `manual-toc.docx` (rucni sadrzaj, najcesci rizicni oblik u
 * stvarnim radovima): `croatian-typography-fixer` kategorijom `text-tabs` zamjenjuje `<w:tab/>`
 * razmakom unutar `<w:t>`. Izvlacenje koje cita samo `<w:t>` daje prije `1 uvod1`, a poslije
 * `1 uvod 1`; sidro se razilazi iako se odlomak sadrzajno nije promijenio, i
 * `required-section-fixer` je padao na `stale-anchor`.
 *
 * Time se izjednacava i s `src/docx/parser.ts`, koji za te elemente emitira tabulator odnosno
 * prijelom retka: normalizacija oba oblika svodi na razmak.
 */
export function anchorTextOfXml(paragraphXml: string): string {
  const joined = [...paragraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(?:tab|br|cr)\b[^>]*\/?>/g)]
    .map((match) => (match[1] === undefined ? ' ' : match[1]))
    .join('');
  return normalizeAnchorText(joined);
}
