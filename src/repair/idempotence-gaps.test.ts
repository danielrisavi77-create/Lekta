/**
 * Idempotencija za fixere koji ju nigdje nisu imali (P3-3 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Mjerenje je islo u tri koraka i svaki je suzio zadatak:
 *   1. Golden test idempotencije vrti se nad svih 31 fixera, ali TIHO preskace svakoga koji na
 *      sintetickom dokumentu nista ne promijeni. Stvarno provjerenih: 9.
 *   2. Od preostala 22, njih 16 ima idempotenciju u VLASTITOM testu (bibliography, croatian
 *      typography, field-integrity, toc-field, title-page, required-section, table-figure-rescue,
 *      ...). Njihovo odsustvo iz goldena je uredno pokrice na drugom mjestu.
 *   3. Ostaje 7 fixera koji nemaju NIKAKAV vlastiti test. Oni su predmet ove datoteke.
 *
 * Za svaki se gradi dokument koji ga DOISTA aktivira (inace bi tvrdnja opet bila vakuumska), pa se
 * tvrdi da je druga primjena bit-identican no-op.
 */
import { describe, expect, it } from 'vitest';
import { applyFixers, type FixerRequest } from './apply-fixers';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const enc = new TextEncoder();

interface Part {
  name: string;
  xml: string;
}

async function pack(parts: Part[]): Promise<Uint8Array> {
  const { writeZip } = await import('./zip-codec');
  return writeZip(parts.map((p) => ({ name: p.name, data: enc.encode(p.xml) })));
}

function doc(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
}

const NORMAL_STYLES = `<w:styles ${W}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

/**
 * Zajednicka tvrdnja: prvi prolaz MORA nesto promijeniti (inace test ne mjeri nista), a drugi
 * prolaz nad vlastitim izlazom mora biti bit-identican no-op.
 */
async function expectIdempotent(bytes: Uint8Array, request: FixerRequest): Promise<void> {
  const first = await applyFixers(bytes, [request]);
  expect(first.integrityFailure, `${request.fixerId}: paket mora ostati ispravan`).toBeUndefined();
  expect(first.changelog.length, `${request.fixerId}: prvi prolaz nije nista promijenio, test bi bio vakuumski`).toBeGreaterThan(0);

  const second = await applyFixers(first.docxBytes, [request]);
  expect(second.changelog, `${request.fixerId}: druga primjena mora biti no-op`).toHaveLength(0);
  expect(second.docxBytes, `${request.fixerId}: druga primjena mora vratiti bit-identicne bajtove`).toBe(
    first.docxBytes,
  );
}

describe('idempotencija: fixeri bez vlastitog testa', () => {
  it('paper-size-fixer', async () => {
    // Letter (12240x15840 twips) -> A4 (21 x 29,7 cm). Sinteticki golden dokument je VEC A4, pa je
    // tamo no-op; zato ovdje namjerno drugaciji format.
    const bytes = await pack([
      { name: 'word/document.xml', xml: doc('<w:p><w:r><w:t>Tekst</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>') },
      { name: 'word/styles.xml', xml: NORMAL_STYLES },
    ]);
    await expectIdempotent(bytes, { ruleId: 'paper', fixerId: 'paper-size-fixer', params: { w: 21.0, h: 29.7 } });
  });

  it('empty-paragraph-fixer', async () => {
    // Osirotjeli prazni odlomci usred tijela (front matter je zasticen, pa moraju biti iza Uvoda).
    const bytes = await pack([
      {
        name: 'word/document.xml',
        xml: doc(
          '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
            '<w:p><w:r><w:t>Prvi odlomak.</w:t></w:r></w:p>' +
            '<w:p/><w:p/><w:p/>' +
            '<w:p><w:r><w:t>Drugi odlomak.</w:t></w:r></w:p>' +
            '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>',
        ),
      },
      { name: 'word/styles.xml', xml: NORMAL_STYLES },
    ]);
    await expectIdempotent(bytes, { ruleId: 'empty', fixerId: 'empty-paragraph-fixer', params: {} });
  });

  it('heading-format-fixer', async () => {
    // patchHeadingFormat NE izmislja stil, pa Heading1 mora postojati u styles.xml.
    const styles =
      `<w:styles ${W}>` +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:sz w:val="24"/></w:rPr></w:style>' +
      '</w:styles>';
    const bytes = await pack([
      { name: 'word/document.xml', xml: doc('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p><w:sectPr/>') },
      { name: 'word/styles.xml', xml: styles },
    ]);
    await expectIdempotent(bytes, {
      ruleId: 'heading',
      fixerId: 'heading-format-fixer',
      params: { targets: [{ level: 1, sizeHalfPoints: 32, bold: true }] },
    });
  });

  it('footnote-typography-fixer', async () => {
    const footnotes =
      `<w:footnotes ${W}><w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>` +
      '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr><w:t>Biljeska.</w:t></w:r></w:p></w:footnote></w:footnotes>';
    const styles =
      `<w:styles ${W}>` +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:rPr><w:sz w:val="18"/></w:rPr></w:style>' +
      '</w:styles>';
    const bytes = await pack([
      { name: 'word/document.xml', xml: doc('<w:p><w:r><w:t>Tekst</w:t></w:r></w:p><w:sectPr/>') },
      { name: 'word/styles.xml', xml: styles },
      { name: 'word/footnotes.xml', xml: footnotes },
    ]);
    await expectIdempotent(bytes, {
      ruleId: 'fn-typo',
      fixerId: 'footnote-typography-fixer',
      params: { fontName: 'Times New Roman', fontSizePt: 10 },
    });
  });

  it('footnote-spacing-fixer', async () => {
    const footnotes =
      `<w:footnotes ${W}><w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/>` +
      '<w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:t>Biljeska.</w:t></w:r></w:p></w:footnote></w:footnotes>';
    const styles =
      `<w:styles ${W}>` +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/>' +
      '<w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr></w:style>' +
      '</w:styles>';
    const bytes = await pack([
      { name: 'word/document.xml', xml: doc('<w:p><w:r><w:t>Tekst</w:t></w:r></w:p><w:sectPr/>') },
      { name: 'word/styles.xml', xml: styles },
      { name: 'word/footnotes.xml', xml: footnotes },
    ]);
    await expectIdempotent(bytes, { ruleId: 'fn-spacing', fixerId: 'footnote-spacing-fixer', params: {} });
  });

  it('page-numbering-fixer', async () => {
    // Dvije sekcije: prednji dio (rimski) i glavni tekst (arapski od 1). Dokument bez pgNumType,
    // pa prvi prolaz doista postavlja numeriranje.
    const bytes = await pack([
      {
        name: 'word/document.xml',
        xml: doc(
          '<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr><w:r><w:t>Naslovnica</w:t></w:r></w:p>' +
            '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
            '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>',
        ),
      },
      { name: 'word/styles.xml', xml: NORMAL_STYLES },
    ]);
    await expectIdempotent(bytes, {
      ruleId: 'pg-num',
      fixerId: 'page-numbering-fixer',
      params: {
        targets: [
          { sectionIndex: 0, fmt: 'lowerRoman', start: 1 },
          { sectionIndex: 1, fmt: 'decimal', start: 1 },
        ],
      },
    });
  });

  it('page-number-alignment-fixer', async () => {
    const footer = `<w:ftr ${W}><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
      '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
    const bytes = await pack([
      { name: 'word/document.xml', xml: doc('<w:p><w:r><w:t>Tekst</w:t></w:r></w:p><w:sectPr/>') },
      { name: 'word/styles.xml', xml: NORMAL_STYLES },
      { name: 'word/footer1.xml', xml: footer },
    ]);
    await expectIdempotent(bytes, { ruleId: 'pn-align', fixerId: 'page-number-alignment-fixer', params: { align: 'right' } });
  });
});
