import { describe, expect, it } from 'vitest';
import { analyzeTypographyStructure, editableNodes, extractBodyParagraphs } from './typography-structure';

const doc = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:r><w:t>Ovo  je tekst,bez razmaka...!!</w:t><w:tab/></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Tablica  je,zaštićena...</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>URL https://example.test/a  b i e-mail a@b.test</w:t></w:r></w:p>
<w:sectPr/></w:body></w:document>`;

describe('typography-structure', () => {
  it('analizira samo izravne body odlomke i sigurne promjene', () => {
    expect(extractBodyParagraphs(doc)).toHaveLength(2);
    const result = analyzeTypographyStructure(doc);
    expect(result.occurrences.some((x) => x.category === 'multiple-spaces')).toBe(true);
    expect(result.occurrences.some((x) => x.category === 'ellipsis')).toBe(true);
    expect(result.occurrences.some((x) => x.rawText.includes('https'))).toBe(false);
    expect(result.summary.high).toBeGreaterThan(0);
  });

  it('profilne kategorije uključuje samo uz potvrđena pravila', () => {
    const withoutProfile = analyzeTypographyStructure('<w:document><w:body><w:p><w:r><w:t>1.5 20%</w:t></w:r></w:p></w:body></w:document>', { rules: { decimalSeparator: ',' }, profileRulesVerified: false });
    const withProfile = analyzeTypographyStructure('<w:document><w:body><w:p><w:r><w:t>1.5 20%</w:t></w:r></w:p></w:body></w:document>', { rules: { decimalSeparator: ',' }, profileRulesVerified: true });
    expect(withoutProfile.occurrences.some((x) => x.category === 'decimal-comma')).toBe(false);
    expect(withProfile.occurrences.some((x) => x.category === 'decimal-comma')).toBe(true);
  });
});

/**
 * DEFINICIJA TAB-STOPA NIJE TABULATOR, IAKO SE ELEMENT ZOVE ISTO.
 *
 * `<w:tab>` postoji u dva nesrodna znacenja:
 *   `<w:r><w:tab/></w:r>`                              tabulator u tekstu (CT_Empty, BEZ atributa)
 *   `<w:pPr><w:tabs><w:tab w:val="right" .../></w:tabs>`  definicija tab-stopa (CT_TabStop, w:val je obavezan)
 *
 * `editableNodes` je trazio `<w:tab\b[^>]*\/>` nad CIJELIM XML-om odlomka, dakle i nad `<w:pPr>`,
 * pa je definicije tab-stopova nabrajao kao urediv cvor. `croatian-typography-fixer` ih je zatim
 * zamjenjivao tekstom i proizvodio `<w:tabs><w:t> </w:t></w:tabs>`, sto shema ne dopusta.
 *
 * IZMJERENO 2026-09-03, Word 14.0 uz OpenAndRepair=false: takav paket Word ODBIJA otvoriti
 * ("error processing the XML file, Part: /word/document.xml"). Pogodjeno je 6 od 38 stvarnih
 * studentskih radova nakon ZADANOG popravka (local-04, -05, -13, -15, -16, -17), a 0 od 7
 * commitanih fixtura: sinteticki korpus ovaj razred po konstrukciji ne sadrzi.
 *
 * Ni jedan jeftiniji gard ga nije vidio: `integrityFailure` je bio `null` na svih 6, a Tier 1
 * (lxml `strict-open.py`) ih proglasava ispravnima, jer paket JEST dobro oblikovan XML. Nevaljan
 * je samo po shemi.
 */
describe('editableNodes: definicija tab-stopa nije urediv cvor', () => {
  const tabStop = '<w:tab w:val="right" w:leader="dot" w:pos="4536"/>';
  const paragraph = `<w:p><w:pPr><w:tabs>${tabStop}</w:tabs></w:pPr><w:r><w:tab/><w:t>Potpis</w:t></w:r></w:p>`;

  it('nabraja tabulator iz runa, a definiciju tab-stopa preskace', () => {
    const tabs = editableNodes(paragraph).filter((node) => node.kind === 'tab');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.xml).toBe('<w:tab/>');
  });

  it('tekstualni cvor i dalje se nabraja normalno (negativna kontrola)', () => {
    const text = editableNodes(paragraph).filter((node) => node.kind === 'text');
    expect(text).toHaveLength(1);
    expect(text[0]?.text).toBe('Potpis');
  });

  it('odlomak s vise tab-stopova ne daje nijedan urediv tabulator', () => {
    const samoStopovi = `<w:p><w:pPr><w:tabs>${tabStop}<w:tab w:val="left" w:pos="1134"/></w:tabs></w:pPr><w:r><w:t>bez tabulatora</w:t></w:r></w:p>`;
    expect(editableNodes(samoStopovi).filter((node) => node.kind === 'tab')).toHaveLength(0);
  });
});
