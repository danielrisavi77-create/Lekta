/**
 * TIJELO RADA NIJE UVIJEK U ZADANOM STILU.
 *
 * Fixeri fonta, velicine, proreda i poravnanja rasudjivali su iskljucivo o zadanom paragraf stilu
 * (`Normal`, odnosno `resolveDefaultParagraphStyleId`) i o `docDefaults`. Kad tijelo rada koristi
 * neki drugi stil, taj stil NADJACAVA oboje, pa je popravak upisivao ciljanu vrijednost na mjesto
 * koje nijedan odlomak tijela ne cita. Posljedica nije bila tihi no-op nego LAZNA TVRDNJA: changelog
 * je prijavljivao "Font: Arial -> Times New Roman" dok je tijelo ostajalo Arial.
 *
 * Izmjereno 2026-08-23 na izlazu PRAVOG LibreOfficea (`lo-fpzg-zavrsni-neuskladjen.docx`, tijelo u
 * stilu `BodyText`): font 1/8, velicina 1/6, prored 1/6 i poravnanje 2/4 ostajali su nepromijenjeni.
 * Isti obrazac postoji i u stvarnim Word radovima: `NormalWeb` (tekst zalijepljen s weba) i
 * `Standardno` (hrvatski Word).
 */
import { describe, expect, it } from 'vitest';
import { resolveBodyParagraphStyleId } from '../src/repair/xml-patch';
import { stripDirectFormatting } from '../src/repair/run-level';

const styles = (extra: string) =>
  `<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial"/></w:rPr></w:rPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${extra}</w:styles>`;

const para = (styleId: string | null, text: string, pPrExtra = '') =>
  `<w:p><w:pPr>${styleId ? `<w:pStyle w:val="${styleId}"/>` : ''}${pPrExtra}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;

const LONG = 'tekst tijela rada koji nosi tezinu '.repeat(6);

describe('resolveBodyParagraphStyleId', () => {
  it('prepoznaje stil kojim je tijelo stvarno oblikovano (LibreOffice BodyText)', () => {
    const doc = `<w:document><w:body>${para('BodyText', LONG)}${para('BodyText', LONG)}${para('Heading1', 'Uvod')}</w:body></w:document>`;
    const st = styles('<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/></w:style>');
    expect(resolveBodyParagraphStyleId(doc, st)).toBe('BodyText');
  });

  it('NEGATIVNA KONTROLA: kad je tijelo u zadanom stilu, nema sto nadjacavati', () => {
    const doc = `<w:document><w:body>${para(null, LONG)}${para(null, LONG)}</w:body></w:document>`;
    expect(resolveBodyParagraphStyleId(doc, styles(''))).toBeNull();
  });

  it('NEGATIVNA KONTROLA: naslovi nikad ne postaju "stil tijela", ni kad ih je najvise', () => {
    const doc = `<w:document><w:body>${para('Heading1', LONG)}${para('Heading1', LONG)}${para(null, 'kratko')}</w:body></w:document>`;
    const st = styles('<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>');
    expect(resolveBodyParagraphStyleId(doc, st)).toBeNull();
  });

  it('stil s w:outlineLvl je naslov i kad mu ime nije prepoznatljivo', () => {
    const doc = `<w:document><w:body>${para('MojNaslov', LONG)}${para('MojNaslov', LONG)}</w:body></w:document>`;
    const st = styles('<w:style w:type="paragraph" w:styleId="MojNaslov"><w:name w:val="Moj naslov"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>');
    expect(resolveBodyParagraphStyleId(doc, st)).toBeNull();
  });

  it('natpisi i sadrzaj se preskacu po imenu stila', () => {
    for (const id of ['Caption', 'TOC1', 'FootnoteText', 'Header']) {
      const doc = `<w:document><w:body>${para(id, LONG)}${para(id, LONG)}</w:body></w:document>`;
      expect(resolveBodyParagraphStyleId(doc, styles(`<w:style w:type="paragraph" w:styleId="${id}"/>`)), id).toBeNull();
    }
  });

  it('tezina se racuna po TEKSTU, pa prazni odlomci ne mogu nadglasati tijelo', () => {
    const many = Array.from({ length: 30 }, () => para('Prazan', '')).join('');
    const doc = `<w:document><w:body>${many}${para('BodyText', LONG)}</w:body></w:document>`;
    const st = styles('<w:style w:type="paragraph" w:styleId="BodyText"/><w:style w:type="paragraph" w:styleId="Prazan"/>');
    expect(resolveBodyParagraphStyleId(doc, st)).toBe('BodyText');
  });

  it('rubni stil ispod praga udjela se ne dira', () => {
    const doc = `<w:document><w:body>${para(null, LONG.repeat(9))}${para('Rubni', 'kratko')}</w:body></w:document>`;
    expect(resolveBodyParagraphStyleId(doc, styles('<w:style w:type="paragraph" w:styleId="Rubni"/>'))).toBeNull();
  });
});

describe('deep ciscenje: popis dozvoljenih stilova', () => {
  const doc =
    '<w:document><w:body>' +
    para('BodyText', 'tijelo', '<w:spacing w:lineRule="auto" w:line="240"/>') +
    para('Heading1', 'naslov', '<w:spacing w:lineRule="auto" w:line="240"/>') +
    '</w:body></w:document>';

  it('odlomak u stilu tijela se CISTI kad je stil na popisu', () => {
    const out = stripDirectFormatting(doc, { stripLineSpacing: true, allowedStyleId: ['Normal', 'BodyText'] });
    expect(out.xml).not.toContain('<w:pStyle w:val="BodyText"/><w:spacing');
    // Naslov ostaje netaknut i kad se tijelo cisti.
    expect(out.xml).toContain('<w:pStyle w:val="Heading1"/><w:spacing w:lineRule="auto" w:line="240"/>');
  });

  it('NEGATIVNA KONTROLA: bez stila tijela na popisu odlomak ostaje netaknut', () => {
    const out = stripDirectFormatting(doc, { stripLineSpacing: true, allowedStyleId: 'Normal' });
    expect(out.xml).toContain('<w:pStyle w:val="BodyText"/><w:spacing w:lineRule="auto" w:line="240"/>');
  });

  it('jedan id i dalje radi kao prije (naslijedjeni pozivatelji)', () => {
    const simple = `<w:document><w:body>${para(null, 'tijelo', '<w:spacing w:lineRule="auto" w:line="240"/>')}</w:body></w:document>`;
    const out = stripDirectFormatting(simple, { stripLineSpacing: true, allowedStyleId: 'Normal' });
    expect(out.xml).not.toContain('w:line="240"');
  });
});
