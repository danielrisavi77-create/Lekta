/**
 * Gard za razrjesavanje ZADANOG PARAGRAF STILA kad `w:default="1"` nedostaje.
 *
 * Do 2026-09-01 je `parseStyles` zadani stil prihvacao ISKLJUCIVO uz tu zastavicu. Dokument bez nje
 * je za analizu ostajao bez ijednog nasljedivog paragraf stila, pa su odlomci bez `w:pStyle` dobivali
 * `align`, `line`, `before` i `after` = null. Poravnanje takvih odlomaka zavrsavalo je u kanti
 * `'default'`, koja nikad nije `both`, pa `format.justify.body` nije mogao proci NI NAKON ispravnog
 * popravka: popravak je pisao u stil `Normal` (`resolveDefaultParagraphStyleId` u
 * `src/repair/xml-patch.ts` ima fallback po IMENU), a analiza taj stil nije citala.
 *
 * PRESUDIO JE WORD, ne citanje sheme: u popravljenom `fpzg-novinarstvo-bibliografija` (stil `Normal`
 * doveden na `w:jc="both"`) `Paragraph.Alignment` za odlomke bez vlastitog `w:jc` vraca
 * wdAlignParagraphJustify. Word `Normal` dakle PRIMJENJUJE i bez zastavice.
 *
 * Nije rubni slucaj: zastavice nema 14 od 19 commitanih fixtura, medju njima stvarni LibreOffice
 * izlaz (`lo-fpzg-zavrsni-*`) i `mef-doktorski-disertacija`.
 */
import { describe, it, expect } from 'vitest';
import { parseXml, parseStyles } from '../src/docx/parser';

const styles = (inner: string) => parseStyles(parseXml(`<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${inner}</w:styles>`, 'test'));
const NORMAL_BODY = '<w:pPr><w:jc w:val="both"/><w:spacing w:line="360" w:lineRule="auto"/></w:pPr>';

describe('parseStyles: zadani paragraf stil', () => {
  it('BASELINE: uz w:default="1" ponasanje je nepromijenjeno', () => {
    const s = styles(`<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/>${NORMAL_BODY}</w:style>`);
    expect(s.defaultParagraphStyleId).toBe('Normal');
    expect(s.resolve('Normal').p.align).toBe('both');
  });

  it('bez zastavice se `Normal` prepoznaje po IDU, kao sto Word i renderira', () => {
    const s = styles(`<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/>${NORMAL_BODY}</w:style>`);
    expect(s.defaultParagraphStyleId).toBe('Normal');
    expect(s.resolve(s.defaultParagraphStyleId).p.align).toBe('both');
  });

  it('prepoznaje se i po IMENU kad je id lokaliziran (`Standardno`, LibreOffice/hrvatski Word)', () => {
    const s = styles(`<w:style w:type="paragraph" w:styleId="Standardno"><w:name w:val="Standard"/>${NORMAL_BODY}</w:style>`);
    expect(s.defaultParagraphStyleId).toBe('Standardno');
  });

  it('zastavica ima PREDNOST pred imenom, pa fallback ne otima vec razrijeseni stil', () => {
    const s = styles(
      `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/>${NORMAL_BODY}</w:style>` +
        '<w:style w:type="paragraph" w:styleId="Tijelo" w:default="1"><w:name w:val="Body"/><w:pPr><w:jc w:val="left"/></w:pPr></w:style>',
    );
    expect(s.defaultParagraphStyleId).toBe('Tijelo');
  });

  /** Bez kandidata se NE izmislja nasljedjivanje: `null` je tocan odgovor, ne propust. */
  it('bez `Normal`/`Standard` stila ostaje null', () => {
    const s = styles('<w:style w:type="paragraph" w:styleId="Naslov1"><w:name w:val="heading 1"/></w:style>');
    expect(s.defaultParagraphStyleId).toBeNull();
  });

  /** Znakovni stil imena "Normal" ne smije postati zadani PARAGRAF stil. */
  it('stil koji nije paragraf tipa se preskace', () => {
    const s = styles('<w:style w:type="character" w:styleId="Normal"><w:name w:val="Normal"/></w:style>');
    expect(s.defaultParagraphStyleId).toBeNull();
  });
});
