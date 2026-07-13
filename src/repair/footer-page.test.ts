// Unit + integracijski testovi za K5 (BL-07b): podnozje s PAGE poljem.
// Pokriva primitive (rId/part imenovanje, content-types/rels umetanje, footerReference +
// xmlns:r), footerPageFixer i CIJELI applyFixers part flow (novi zip entry + uskladjeni rels/
// content-types), no-op na postojeci footer, idempotenciju i allow-list backstop.

import { describe, it, expect } from 'vitest';
import {
  buildFooterPageXml,
  nextRelationshipId,
  nextFooterPartName,
  addContentTypeOverride,
  addRelationship,
  addFooterReferenceToSection,
  FOOTER_CONTENT_TYPE,
  FOOTER_REL_TYPE,
} from './xml-patch';
import { footerPageFixer, type DocxXmlParts } from './fixers';
import { applyFixers } from './apply-fixers';
import { readZip, writeZip } from './zip-codec';
import { multiSectionDocx } from '../../tests/helpers/synthetic-docx';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const CT =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';
const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

function docWithSect(sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>'): string {
  return `<w:document ${NS}><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p>${sect}</w:body></w:document>`;
}
function partsFor(documentXml: string): DocxXmlParts {
  return { documentXml, stylesXml: '', contentTypesXml: CT, documentRelsXml: RELS, addedParts: [] };
}

describe('primitivi: footer part flow', () => {
  it('buildFooterPageXml sadrzi PAGE polje i jc', () => {
    const xml = buildFooterPageXml('right');
    expect(xml).toContain('<w:ftr');
    expect(xml).toContain('<w:instrText xml:space="preserve"> PAGE </w:instrText>');
    expect(xml).toContain('<w:jc w:val="right"/>');
  });

  it('nextRelationshipId = max+1', () => {
    expect(nextRelationshipId(RELS)).toBe('rId2');
    expect(nextRelationshipId('<Relationships><Relationship Id="rId7"/><Relationship Id="rId3"/></Relationships>')).toBe('rId8');
    expect(nextRelationshipId('<Relationships></Relationships>')).toBe('rId1');
  });

  it('nextFooterPartName preskace zauzeta imena', () => {
    expect(nextFooterPartName(CT, [])).toBe('word/footer1.xml');
    const ctWith1 = CT.replace('</Types>', '<Override PartName="/word/footer1.xml" ContentType="x"/></Types>');
    expect(nextFooterPartName(ctWith1, [])).toBe('word/footer2.xml');
    expect(nextFooterPartName(CT, ['word/footer1.xml'])).toBe('word/footer2.xml');
  });

  it('addContentTypeOverride dodaje jednom, drugi put no-op', () => {
    const r1 = addContentTypeOverride(CT, '/word/footer1.xml', FOOTER_CONTENT_TYPE);
    expect(r1.applied).toBe(true);
    expect(r1.xml).toContain('<Override PartName="/word/footer1.xml"');
    const r2 = addContentTypeOverride(r1.xml, '/word/footer1.xml', FOOTER_CONTENT_TYPE);
    expect(r2.applied).toBe(false);
    expect(r2.xml).toBe(r1.xml);
  });

  it('addRelationship dodaje jednom, drugi put no-op', () => {
    const r1 = addRelationship(RELS, 'rId2', FOOTER_REL_TYPE, 'footer1.xml');
    expect(r1.applied).toBe(true);
    expect(r1.xml).toContain('Id="rId2"');
    expect(r1.xml).toContain('Target="footer1.xml"');
    const r2 = addRelationship(r1.xml, 'rId2', FOOTER_REL_TYPE, 'footer1.xml');
    expect(r2.applied).toBe(false);
  });

  it('addFooterReferenceToSection umece na pocetak sekcije i osigurava xmlns:r', () => {
    const res = addFooterReferenceToSection(docWithSect(), 0, 'rId2');
    expect(res.applied).toBe(true);
    expect(res.xml).toContain('<w:sectPr><w:footerReference w:type="default" r:id="rId2"/>');
    expect(res.xml).toMatch(/<w:document[^>]*xmlns:r="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships"/);
  });

  it('addFooterReferenceToSection no-op ako sekcija VEC ima footerReference', () => {
    const doc = docWithSect('<w:sectPr><w:footerReference w:type="default" r:id="rId9"/><w:pgSz w:w="1" w:h="1"/></w:sectPr>');
    const res = addFooterReferenceToSection(doc, 0, 'rId2');
    expect(res.applied).toBe(false);
    expect(res.xml).toBe(doc);
  });

  it('addFooterReferenceToSection no-op na sectPrChange (pracene promjene)', () => {
    const doc = docWithSect('<w:sectPr><w:pgMar w:top="1"/><w:sectPrChange w:id="1"><w:sectPr><w:pgMar w:top="2"/></w:sectPr></w:sectPrChange></w:sectPr>');
    expect(addFooterReferenceToSection(doc, 0, 'rId2').applied).toBe(false);
  });

  it('addFooterReferenceToSection NE duplira xmlns:r kad vec postoji', () => {
    const doc = `<w:document ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p/><w:sectPr><w:pgSz w:w="1" w:h="1"/></w:sectPr></w:body></w:document>`;
    const res = addFooterReferenceToSection(doc, 0, 'rId2');
    expect((res.xml.match(/xmlns:r=/g) ?? []).length).toBe(1);
  });
});

describe('footerPageFixer', () => {
  it('umece footer uskladjeno (footerRef + content-type + rel + novi part)', () => {
    const out = footerPageFixer(partsFor(docWithSect()), { sectionIndex: 0, align: 'right' });
    expect(out.applied).toBe(true);
    expect(out.parts.documentXml).toContain('<w:footerReference w:type="default" r:id="rId2"/>');
    expect(out.parts.contentTypesXml).toContain('<Override PartName="/word/footer1.xml"');
    expect(out.parts.documentRelsXml).toContain('Type="' + FOOTER_REL_TYPE + '"');
    expect(out.parts.addedParts).toHaveLength(1);
    expect(out.parts.addedParts?.[0].name).toBe('word/footer1.xml');
    expect(out.parts.addedParts?.[0].content).toContain(' PAGE ');
  });

  it('no-op bez part flowa (nema content-types/rels)', () => {
    const out = footerPageFixer({ documentXml: docWithSect(), stylesXml: '' }, { sectionIndex: 0 });
    expect(out.applied).toBe(false);
  });

  it('no-op kad ciljani indeks ne postoji', () => {
    const out = footerPageFixer(partsFor(docWithSect()), { sectionIndex: 5 });
    expect(out.applied).toBe(false);
  });

  it('align izvan whitelist (injection pokusaj) -> sigurno svedeno na right', () => {
    // Adversarial LOW nalaz: params je nesiguran cast; navodnik u align bi razbio w:jc.
    const out = footerPageFixer(partsFor(docWithSect()), { sectionIndex: 0, align: '"/><x' as unknown as 'right' });
    expect(out.applied).toBe(true);
    const footer = out.parts.addedParts?.[0].content ?? '';
    expect(footer).toContain('<w:jc w:val="right"/>');
    expect(footer).not.toContain('"/><x');
  });
});

describe('applyFixers end-to-end: footer part flow nad multiSectionDocx', () => {
  it('dodaje word/footer1.xml, Override, Relationship, footerReference u sekciju 1', async () => {
    const bytes = await multiSectionDocx();
    const res = await applyFixers(bytes, [
      { ruleId: 'footer', fixerId: 'footer-page-fixer', params: { target: { sectionIndex: 1, align: 'right' } } },
    ]);
    expect(res.changelog).toHaveLength(1);
    const entries = await readZip(res.docxBytes);
    const dec = new TextDecoder();
    const byName = (n: string) => entries.find((e) => e.name === n);

    const footer = byName('word/footer1.xml');
    expect(footer, 'novi footer part postoji').toBeTruthy();
    expect(dec.decode(footer!.data)).toContain(' PAGE ');

    expect(dec.decode(byName('[Content_Types].xml')!.data)).toContain('/word/footer1.xml');
    const rels = dec.decode(byName('word/_rels/document.xml.rels')!.data);
    expect(rels).toContain('relationships/footer');
    expect(rels).toContain('Target="footer1.xml"');

    const doc = dec.decode(byName('word/document.xml')!.data);
    expect(doc).toContain('<w:footerReference w:type="default"');
    expect(doc).toMatch(/xmlns:r="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships"/);
    // footerReference je na sekciji 1 (finalni sectPr), ne na naslovnici (sekcija 0).
    expect((doc.match(/<w:footerReference\b/g) ?? []).length).toBe(1);
  });

  it('idempotencija: druga primjena je no-op (bit-identican izlaz)', async () => {
    const bytes = await multiSectionDocx();
    const once = await applyFixers(bytes, [
      { ruleId: 'footer', fixerId: 'footer-page-fixer', params: { target: { sectionIndex: 1 } } },
    ]);
    const twice = await applyFixers(once.docxBytes, [
      { ruleId: 'footer', fixerId: 'footer-page-fixer', params: { target: { sectionIndex: 1 } } },
    ]);
    // Sekcija 1 vec ima footerReference -> no-op -> vraca ULAZNE bajtove.
    expect(twice.changelog).toHaveLength(0);
    expect(twice.docxBytes).toBe(once.docxBytes);
  });

  it('no-op (bit-identican) kad ciljana sekcija vec ima footer', async () => {
    const bytes = await multiSectionDocx();
    // Sekcija 0 (naslovnica) nema footer, ali dodajmo prvo pa probajmo opet istu.
    const first = await applyFixers(bytes, [
      { ruleId: 'footer', fixerId: 'footer-page-fixer', params: { target: { sectionIndex: 0 } } },
    ]);
    const again = await applyFixers(first.docxBytes, [
      { ruleId: 'footer', fixerId: 'footer-page-fixer', params: { target: { sectionIndex: 0 } } },
    ]);
    expect(again.changelog).toHaveLength(0);
    expect(again.docxBytes).toBe(first.docxBytes);
  });

  it('orphan word/footer1.xml u zipu (bez Override) -> novi footer ide u footer2, orphan netaknut', async () => {
    // Adversarial MEDIUM nalaz: imenovanje mora vidjeti stvarna zip imena, inace kolizija s
    // orphanom -> apply-fixers odbaci nas part, a footerReference/Override/rel ostanu dangling.
    const enc = new TextEncoder();
    const orphanDocx = await writeZip([
      { name: '[Content_Types].xml', data: enc.encode(CT) }, // CT NEMA footer1 Override (orphan)
      { name: 'word/_rels/document.xml.rels', data: enc.encode(RELS) },
      { name: 'word/document.xml', data: enc.encode(docWithSect()) },
      { name: 'word/footer1.xml', data: enc.encode(`<w:ftr ${NS}><w:p><w:r><w:t>ORPHAN</w:t></w:r></w:p></w:ftr>`) },
    ]);
    const res = await applyFixers(orphanDocx, [
      { ruleId: 'footer', fixerId: 'footer-page-fixer', params: { target: { sectionIndex: 0 } } },
    ]);
    expect(res.changelog).toHaveLength(1);
    const entries = await readZip(res.docxBytes);
    const dec = new TextDecoder();
    const byName = (n: string) => entries.find((e) => e.name === n);
    // Novi footer u footer2 (footer1 je zauzet orphanom), s PAGE poljem.
    expect(byName('word/footer2.xml'), 'novi footer u footer2').toBeTruthy();
    expect(dec.decode(byName('word/footer2.xml')!.data)).toContain(' PAGE ');
    // Orphan footer1 NETAKNUT (nismo ga prepisali ni obrisali).
    expect(dec.decode(byName('word/footer1.xml')!.data)).toContain('ORPHAN');
    // rels i Override pokazuju na footer2, ne na orphan footer1.
    expect(dec.decode(byName('word/_rels/document.xml.rels')!.data)).toContain('Target="footer2.xml"');
    expect(dec.decode(byName('[Content_Types].xml')!.data)).toContain('/word/footer2.xml');
  });
});
