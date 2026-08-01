import { describe, expect, it } from 'vitest';
import { ensureHeadingStyles, patchHeadingParagraphs } from './xml-patch';
import { headingStyleFixer, type DocxXmlParts } from './fixers';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const styles = `<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
const documentXml = `<w:document ${NS}><w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr><w:t>1. Uvod</w:t></w:r></w:p><w:p><w:r><w:t>Tekst</w:t></w:r></w:p></w:body></w:document>`;
const numbering = `<w:numbering ${NS}></w:numbering>`;

describe('heading style XML fixer', () => {
  it('generira style-linked multilevel list, uklanja ručni prefiks i nastavlja na istom numId', () => {
    const source = documentXml.replace('<w:t>1. Uvod</w:t>', '<w:t>1. Uvod</w:t>');
    const options = { numbering: { maxLevel: 3, format: 'decimal' as const, trailingDot: true } };
    const first = headingStyleFixer(
      { documentXml: source, stylesXml: styles, numberingXml: numbering },
      [{ paragraphIndex: 1, level: 1, numbered: true, removeManualNumbering: true }],
      options,
    );
    expect(first.parts.numberingXml).toContain('w:name w:val="Lekta Heading Numbering"');
    expect(first.parts.numberingXml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(first.parts.numberingXml).toContain('w:lvlText w:val="%1.%2."');
    expect(first.parts.numberingXml).toContain('<w:lvlRestart w:val="1"/>');
    expect(first.parts.documentXml).not.toContain('<w:t>1. Uvod</w:t>');
    expect(first.parts.documentXml).toContain('<w:t>Uvod</w:t>');
    const second = headingStyleFixer(first.parts, [{ paragraphIndex: 1, level: 1, numbered: true, removeManualNumbering: true }], options);
    expect(second.applied).toBe(false);
    expect((first.parts.numberingXml?.match(/Lekta Heading Numbering/g) ?? [])).toHaveLength(1);
  });

  it('odbija duplikate i indekse izvan dokumenta bez XML izmjene', () => {
    const duplicate = headingStyleFixer(
      { documentXml, stylesXml: styles },
      [{ paragraphIndex: 1, level: 1 }, { paragraphIndex: 1, level: 2 }],
    );
    expect(duplicate.applied).toBe(false);
    expect(duplicate.reason).toBe('invalid-params');

    const outOfBounds = headingStyleFixer(
      { documentXml, stylesXml: styles },
      [{ paragraphIndex: 3, level: 1 }],
    );
    expect(outOfBounds.applied).toBe(false);
    expect(outOfBounds.reason).toBe('invalid-params');
  });

  it('dodaje Heading stil, keepNext i promovira ciljani odlomak', () => {
    const ensured = ensureHeadingStyles(styles, [1], { pageBreakLevels: [1] });
    expect(ensured.applied).toBe(true);
    expect(ensured.xml).toContain('w:styleId="Heading1"');
    expect(ensured.xml).toContain('<w:keepNext/>');
    expect(ensured.xml).toContain('<w:outlineLvl w:val="0"/>');
    expect(ensured.xml).toContain('<w:pageBreakBefore/>');

    const patched = patchHeadingParagraphs(documentXml, [{
      paragraphIndex: 1,
      level: 1,
      clearDirectFont: true,
      clearDirectSize: true,
      clearDirectAlignment: true,
    }]);
    expect(patched.applied).toBe(true);
    expect(patched.xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(patched.xml).not.toContain('w:ascii="Arial"');
    expect(patched.xml).not.toContain('<w:sz w:val="20"/>');
    expect(patched.xml).not.toContain('<w:jc w:val="center"/>');
    expect(patched.xml).toContain('<w:t>1. Uvod</w:t>');
  });

  it('ponovna primjena je no-op, a postojeći Heading stil se ne duplicira', () => {
    const first = headingStyleFixer(
      { documentXml, stylesXml: styles },
      [{ paragraphIndex: 1, level: 1 }],
    );
    expect(first.applied).toBe(true);
    const second = headingStyleFixer(first.parts, [{ paragraphIndex: 1, level: 1 }]);
    expect(second.applied).toBe(false);
    expect((first.parts.stylesXml.match(/w:styleId="Heading1"/g) ?? [])).toHaveLength(1);
  });

  it('ne mijenja ciljani tekst niti drugi odlomak', () => {
    const parts: DocxXmlParts = { documentXml, stylesXml: styles };
    const result = headingStyleFixer(parts, [{ paragraphIndex: 1, level: 2 }]);
    expect(result.parts.documentXml).toContain('<w:t>1. Uvod</w:t>');
    expect(result.parts.documentXml).toContain('<w:t>Tekst</w:t>');
    expect(result.parts.documentXml).toContain('<w:p><w:r><w:t>Tekst</w:t></w:r></w:p>');
  });

  it('dodaje profilno višerazinsko numeriranje samo nenumeriranom naslovu', () => {
    const result = headingStyleFixer(
      { documentXml: documentXml.replace('1. Uvod', 'Uvod'), stylesXml: styles, numberingXml: numbering },
      [{ paragraphIndex: 1, level: 1, numbered: true, removeManualNumbering: true }],
      { numbering: { maxLevel: 3, format: 'decimal', trailingDot: true } },
    );
    expect(result.parts.numberingXml).toContain('<w:abstractNum');
    expect(result.parts.numberingXml).toContain('<w:num w:numId="1">');
    expect(result.parts.documentXml).toContain('<w:numPr>');
    expect(result.afterLabel).toContain('višerazinsko numeriranje');
  });
});
