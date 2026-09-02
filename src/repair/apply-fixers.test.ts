import { describe, it, expect } from 'vitest';
import { readZip, writeZip } from './zip-codec';
import { applyFixers } from './apply-fixers';
import { legalFootnoteAnchorFingerprint, legalMarkerAnchorFingerprint } from '../analysis/legal-footnote-structure';

// Ovo je GOLDEN test za writer, isto nacelo kao GOLDEN.md za citac:
// dokazuje da fixer mijenja SAMO ciljanu vrijednost i da SVE ostalo
// (ukljucujuci binarni "media" entry koji simulira sliku) ostaje
// bit-identicno kroz cijeli zip round-trip.

function buildSyntheticDocx() {
  const enc = new TextEncoder();

  const documentXml =
    '<?xml version="1.0"?><w:document><w:body>' +
    '<w:p><w:r><w:t>Ovo je tekst rada koji se ne smije mijenjati.</w:t></w:r></w:p>' +
    '<w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/></w:rPr><w:t>Direktno formatiran odlomak.</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/></w:rPr><w:t>Naslov</w:t></w:r></w:p>' +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1600" w:right="1134" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';

  const stylesXml =
    '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/>' +
    '</w:rPr></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:styleId="Normal">' +
    '<w:pPr><w:spacing w:line="259" w:lineRule="auto"/></w:pPr></w:style></w:styles>';

  const fakeImage = new Uint8Array(2000);
  for (let i = 0; i < fakeImage.length; i++) fakeImage[i] = (i * 37 + 11) % 256;

  const contentTypesXml = '<Types xmlns="..."><Default Extension="png" ContentType="image/png"/></Types>';

  return {
    documentXml,
    stylesXml,
    fakeImage,
    contentTypesXml,
    entries: [
      { name: '[Content_Types].xml', data: enc.encode(contentTypesXml) },
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml) },
      { name: 'word/media/image1.png', data: fakeImage },
    ],
  };
}

describe('applyFixers golden round-trip', () => {
  it('legal-footnote-repair-fixer kroz zip mijenja document.xml i footnotes.xml', async () => {
    const enc = new TextEncoder();
    const documentXml = '<w:document><w:body><w:p><w:r><w:t>Tekst </w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p></w:body></w:document>';
    const footnotesXml = '<w:footnotes><w:footnote w:id="1"><w:p><w:r><w:t>ibid.</w:t></w:r></w:p></w:footnote></w:footnotes>';
    const original = await writeZip([
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/footnotes.xml', data: enc.encode(footnotesXml) },
    ]);
    const result = await applyFixers(original, [{
      ruleId: 'legal', fixerId: 'legal-footnote-repair-fixer', params: {
        version: 1,
        markers: [{ paragraphIndex: 1, start: 6, end: 7, footnoteId: 1, anchorFingerprint: legalMarkerAnchorFingerprint(1, 6, 7, 'Tekst 1.'), confirmed: true }],
        operations: [{ id: 'legal-op', footnoteId: 1, kind: 'fix-ibid', anchorFingerprint: legalFootnoteAnchorFingerprint(1, 'ibid.'), start: 0, end: 5, replacementText: 'Ibid.', confirmed: true, reason: 'profil' }],
        bibliographyLinks: [],
      },
    }]);
    const entries = await readZip(result.docxBytes);
    const get = (name: string) => new TextDecoder().decode(entries.find((entry) => entry.name === name)!.data);
    expect(result.changelog).toHaveLength(1);
    expect(get('word/document.xml')).toContain('w:footnoteReference w:id="1"');
    expect(get('word/footnotes.xml')).toContain('Ibid.');
  });

  it('heading-style-fixer kreira nedostajući numbering.xml part i relaciju', async () => {
    const enc = new TextEncoder();
    const documentXml = '<w:document><w:body><w:p><w:r><w:t>1. Uvod</w:t></w:r></w:p></w:body></w:document>';
    const stylesXml = '<w:styles><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
    const contentTypesXml = '<Types></Types>';
    const relsXml = '<Relationships></Relationships>';
    const original = await writeZip([
      { name: '[Content_Types].xml', data: enc.encode(contentTypesXml) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(relsXml) },
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    ]);
    const result = await applyFixers(original, [{
      ruleId: 'heading-numbering',
      fixerId: 'heading-style-fixer',
      params: {
        targets: [{ paragraphIndex: 1, level: 1, numbered: true, removeManualNumbering: true }],
        options: { numbering: { maxLevel: 3, format: 'decimal', trailingDot: true } },
      },
    }]);
    const entries = await readZip(result.docxBytes);
    const dec = new TextDecoder();
    expect(entries.some((entry) => entry.name === 'word/numbering.xml')).toBe(true);
    expect(dec.decode(entries.find((entry) => entry.name === 'word/numbering.xml')!.data)).toContain('Lekta Heading Numbering');
    expect(dec.decode(entries.find((entry) => entry.name === '[Content_Types].xml')!.data)).toContain('/word/numbering.xml');
    expect(dec.decode(entries.find((entry) => entry.name === 'word/_rels/document.xml.rels')!.data)).toContain('relationships/numbering');
  });

  it('mijenja samo ciljane vrijednosti, sve ostalo bit-identicno', async () => {
    const fixture = buildSyntheticDocx();
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'margina-desno', fixerId: 'margins-fixer', params: { right: 2.5 } },
      { ruleId: 'font-glavni', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', fontSizePt: 12 } },
      // Poravnanja u fixtureu NEMA (Word ga izostavlja kad je lijevo). Popravak ga mora STVORITI,
      // inace bi obostrano poravnanje bilo nepopravljivo na vecini stvarnih radova.
      { ruleId: 'poravnanje', fixerId: 'alignment-fixer', params: { val: 'both' } },
    ]);

    expect(result.changelog).toHaveLength(3);
    expect(result.skipped).toEqual([]);

    const newEntries = await readZip(result.docxBytes);
    const dec = new TextDecoder();
    const newDocumentXml = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
    const newStylesXml = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);
    const newImage = newEntries.find((e) => e.name === 'word/media/image1.png')!.data;
    const newContentTypes = dec.decode(newEntries.find((e) => e.name === '[Content_Types].xml')!.data);

    // Ciljane promjene primijenjene
    expect(newDocumentXml).toContain('w:right="1417"'); // 2.5cm
    expect(newStylesXml).toContain('w:ascii="Times New Roman"');
    expect(newStylesXml).toContain('<w:sz w:val="24"/>'); // 12pt = 24 half-points

    // KRITICNO: sve netaknuto ostaje bas netaknuto
    expect(newDocumentXml).toContain('w:top="1600"'); // razlicito od right, dokazuje da je SAMO right dirano
    expect(newDocumentXml).toContain('Ovo je tekst rada koji se ne smije mijenjati.');
    expect(newStylesXml).toContain('w:line="259"'); // prored nismo trazili

    expect(newImage).toEqual(fixture.fakeImage); // binarni entry bit-identican
    expect(newContentTypes).toBe(fixture.contentTypesXml); // netaknuti xml entry bit-identican

    expect(newEntries).toHaveLength(fixture.entries.length); // nista izgubljeno ni dodano

    // Novostvoreni w:jc mora biti U w:pPr stila Normal i na shemom propisanom mjestu (iza
    // w:spacing), inace Word dokument prijavljuje kao ostecen.
    const normalStyle = newStylesXml.match(/<w:style\b[^>]*w:styleId="Normal"[\s\S]*?<\/w:style>/)![0];
    expect(normalStyle).toContain('<w:jc w:val="both"/>');
    expect(normalStyle.indexOf('<w:spacing')).toBeLessThan(normalStyle.indexOf('<w:jc'));
  });

  it('baca gresku ako docx nema word/document.xml (nije valjan Word dokument)', async () => {
    const enc = new TextEncoder();
    const brokenDocx = await writeZip([{ name: 'something-else.xml', data: enc.encode('<x/>') }]);

    await expect(
      applyFixers(brokenDocx, [{ ruleId: 'x', fixerId: 'margins-fixer', params: { right: 2.5 } }]),
    ).rejects.toThrow();
  });

  it('kad nijedan popravak nije primijenjen, vraca ULAZNE bajtove bit-identicne', async () => {
    const fixture = buildSyntheticDocx();
    const originalDocx = await writeZip(fixture.entries);

    // Margina vec ima ciljanu vrijednost (top 1600 nije dirana; right na postojecu 1134/2.0cm).
    // Fixeri koji vrijednost STVARAJU (poravnanje) namjerno nisu u ovom skupu: ovdje se dokazuje
    // da dokument kojem stvarno nista ne treba izlazi bajt-identican.
    const result = await applyFixers(originalDocx, [
      { ruleId: 'vec-ok', fixerId: 'margins-fixer', params: { right: 2.0 } },
    ]);

    expect(result.changelog).toHaveLength(0);
    expect(result.skipped).toEqual(['vec-ok']);
    // Bez rekompresije i bez re-encode: dokument bez popravaka se NE prepisuje.
    expect(result.docxBytes).toEqual(originalDocx);
  });

  it('deep (Feature B): font fixer cisti izravno formatiranje tijela, naslov i bold prezivljavaju', async () => {
    const fixture = buildSyntheticDocx();
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'font-glavni', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', deep: true } },
    ]);

    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0].afterLabel).toContain('izravno formatiranje uklonjeno u 1 odlomaka');

    const newEntries = await readZip(result.docxBytes);
    const dec = new TextDecoder();
    const newDocumentXml = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
    const newStylesXml = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);

    expect(newStylesXml).toContain('w:ascii="Times New Roman"'); // docDefaults popravljen
    expect(newDocumentXml).not.toContain('Calibri'); // direct override tijela uklonjen
    expect(newDocumentXml).toContain('<w:b/>'); // bold prezivljava
    expect(newDocumentXml).toContain('w:ascii="Georgia"'); // stilizirani naslov netaknut
    expect(newDocumentXml).toContain('Direktno formatiran odlomak.');
  });

  it('theme-only rFonts (stock Word): upisuje doslovni font i UKLANJA referencu na temu', async () => {
    const enc = new TextEncoder();
    // Stock Word predlozak: docDefaults ima SAMO theme atribute, Normal bez spacinga.
    const themeStyles =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/>' +
      '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>';
    const doc =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Rucno postavljen TNR preko theme predloska.</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const docx = await writeZip([
      { name: 'word/document.xml', data: enc.encode(doc) },
      { name: 'word/styles.xml', data: enc.encode(themeStyles) },
    ]);

    const result = await applyFixers(docx, [
      { ruleId: 'font-glavni', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', deep: true } },
    ]);

    // Ovo je najcesci oblik na svijetu: dokument koji je Word sam napravio. Prije se popravak
    // ovdje predavao (theme-only = nema sto krpati), pa font nije bio popravljiv. Sada se doslovni
    // font UPISUJE, a referenca na temu se MORA ukloniti jer po shemi ima prednost nad doslovnim
    // imenom, pa bi inace tekst ostao Calibri unatoc upisanom Times New Romanu.
    expect(result.changelog).toHaveLength(1);
    expect(result.skipped).toEqual([]);

    const dec = new TextDecoder();
    const newEntries = await readZip(result.docxBytes);
    const newStyles = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);
    const newDoc = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);

    expect(newStyles).toContain('w:ascii="Times New Roman"');
    expect(newStyles).toContain('w:hAnsi="Times New Roman"');
    expect(newStyles).not.toContain('w:asciiTheme');
    expect(newStyles).not.toContain('w:hAnsiTheme');
    // Tekst zavrsava na cilju: ili run i dalje nosi TNR, ili ga nasljedjuje iz docDefaults.
    expect(newDoc).not.toContain('Calibri');
    expect(newDoc).toContain('Rucno postavljen TNR preko theme predloska.');
  });

  it('deep-only: stil VEC na cilju (patch no-op) ali deep i dalje cisti run-override', async () => {
    const enc = new TextEncoder();
    // docDefaults VEC ima Times New Roman (backstop postoji, patch je no-op),
    // Normal bez rFonts. Deep svejedno treba ocistiti run-level Calibri override.
    const styles =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>';
    const doc =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:t>Tekst tijela rada.</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const docx = await writeZip([
      { name: 'word/document.xml', data: enc.encode(doc) },
      { name: 'word/styles.xml', data: enc.encode(styles) },
    ]);

    const result = await applyFixers(docx, [
      { ruleId: 'font-glavni', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', deep: true } },
    ]);

    expect(result.changelog).toHaveLength(1); // deep-only promjena je primijenjena
    expect(result.changelog[0].afterLabel).toContain('izravno formatiranje uklonjeno');
    const newEntries = await readZip(result.docxBytes);
    const newDoc = new TextDecoder().decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
    expect(newDoc).not.toContain('w:ascii="Calibri"'); // run-override skinut, run pao na TNR docDefaults
    expect(newDoc).toContain('Tekst tijela rada.'); // sadrzaj netaknut
  });

  it('Normal stil koji nadjacava cilj i sam se poravnava s ciljem (tekst zavrsi na TNR)', async () => {
    const enc = new TextEncoder();
    // docDefaults ima literal ascii+hAnsi (backstop postoji), ALI Normal stil
    // definira SVOJ rFonts=Arial koji nadjacava docDefaults za Normal-odlomke.
    const styles =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/>' +
      '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:style></w:styles>';
    const doc =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Rucni TNR preko Arial Normala.</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const docx = await writeZip([
      { name: 'word/document.xml', data: enc.encode(doc) },
      { name: 'word/styles.xml', data: enc.encode(styles) },
    ]);

    const result = await applyFixers(docx, [
      { ruleId: 'font-glavni', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', deep: true } },
    ]);

    // Stara zastita je ovdje ODUSTAJALA od dubokog ciscenja, jer bi run pao na Normal=Arial.
    // Sada se umjesto odustajanja i sam Normal dovodi na cilj, pa ISHOD (tekst je TNR) vrijedi
    // bez obzira nosi li ga run ili ga nasljedjuje. Arial ne smije ostati nigdje.
    const newEntries = await readZip(result.docxBytes);
    const dec = new TextDecoder();
    const newDoc = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
    const newStyles = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);

    expect(newStyles).not.toContain('"Arial"');   // kao VRIJEDNOST atributa; u tekstu rada smije stajati
    expect(newStyles).toContain('w:ascii="Times New Roman"');
    expect(newDoc).not.toContain('"Arial"');
    expect(newDoc).toContain('Rucni TNR preko Arial Normala.');
  });

  // Isti slucaj, ali Normal definira SAMO w:hAnsi. To je slot iz kojeg se crtaju hrvatski
  // dijakriticki znakovi, pa mora zavrsiti na cilju jednako kao i w:ascii.
  it('Normal koji nadjacava cilj SAMO preko w:hAnsi takodjer zavrsi na cilju (dijakritika)', async () => {
    const enc = new TextEncoder();
    const styles =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/>' +
      '<w:rPr><w:rFonts w:hAnsi="Arial"/></w:rPr></w:style></w:styles>';
    const doc =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t>Rijec s dijakritikom: cscdz.</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const docx = await writeZip([
      { name: 'word/document.xml', data: enc.encode(doc) },
      { name: 'word/styles.xml', data: enc.encode(styles) },
    ]);

    const result = await applyFixers(docx, [
      { ruleId: 'font-glavni', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', deep: true } },
    ]);

    const dec2 = new TextDecoder();
    const entries2 = await readZip(result.docxBytes);
    const newDoc = dec2.decode(entries2.find((e) => e.name === 'word/document.xml')!.data);
    const newStyles = dec2.decode(entries2.find((e) => e.name === 'word/styles.xml')!.data);
    expect(newStyles).not.toContain('Arial');
    expect(newStyles).toContain('w:hAnsi="Times New Roman"');
    expect(newDoc).not.toContain('Arial');
  });

  it('paragraph-spacing-fixer (shallow): stilski w:before/w:after na 0, w:line i document.xml netaknuti', async () => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const stylesXml =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>' +
      '</w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Normal"><w:pPr>' +
      '<w:spacing w:before="160" w:after="240" w:line="360" w:lineRule="auto"/>' +
      '</w:pPr></w:style></w:styles>';
    const documentXml =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:r><w:t>Tekst bez izravnog razmaka na odlomku.</w:t></w:r></w:p>' +
      '</w:body></w:document>';

    const entries = [
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    ];
    const originalDocx = await writeZip(entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'razmak-odlomaka', fixerId: 'paragraph-spacing-fixer', params: {} },
    ]);

    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0].beforeLabel).toBe('Razmak prije/poslije: 8 pt / 12 pt');
    expect(result.changelog[0].afterLabel).toBe('Razmak prije/poslije: 0 pt / 0 pt');

    const newEntries = await readZip(result.docxBytes);
    const newStylesXml = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);
    const newDocumentXml = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);

    expect(newStylesXml).toContain('w:before="0"');
    expect(newStylesXml).toContain('w:after="0"');
    // Prored (w:line/w:lineRule) na istom tagu nije trazen i ostaje netaknut.
    expect(newStylesXml).toContain('w:line="360"');
    expect(newStylesXml).toContain('w:lineRule="auto"');

    // document.xml uopce nije meta ovog fixera: bit-identican original bajtovima.
    expect(newDocumentXml).toBe(documentXml);
  });

  it('deep (Feature B): paragraph-spacing fixer cisti izravni razmak tijela, naslov s vlastitim razmakom prezivljava', async () => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const stylesXml =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>' +
      '</w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Normal"><w:pPr>' +
      '<w:spacing w:before="160" w:after="240"/>' +
      '</w:pPr></w:style></w:styles>';
    const documentXml =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:pPr><w:spacing w:before="240" w:after="240"/></w:pPr>' +
      '<w:r><w:t>Odlomak s izravnim razmakom preko Normal stila.</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="500" w:after="500"/></w:pPr>' +
      '<w:r><w:t>Naslov s vlastitim, namjernim razmakom.</w:t></w:r></w:p>' +
      '</w:body></w:document>';

    const entries = [
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    ];
    const originalDocx = await writeZip(entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'razmak-odlomaka', fixerId: 'paragraph-spacing-fixer', params: { deep: true } },
    ]);

    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0].afterLabel).toBe('Razmak prije/poslije: 0 pt / 0 pt; izravno formatiranje uklonjeno u 1 odlomaka');

    const newEntries = await readZip(result.docxBytes);
    const newStylesXml = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);
    const newDocumentXml = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);

    expect(newStylesXml).toContain('w:before="0"');
    expect(newStylesXml).toContain('w:after="0"');

    // Direct override na Normal-odlomku uklonjen (pao na stilski 0/0 backstop).
    expect(newDocumentXml).not.toContain('w:before="240"');
    expect(newDocumentXml).not.toContain('w:after="240"');
    expect(newDocumentXml).toContain('Odlomak s izravnim razmakom preko Normal stila.');

    // Naslov (nije Normal, ima svoj pStyle) zadrzava vlastiti, namjerni razmak.
    expect(newDocumentXml).toContain('w:before="500"');
    expect(newDocumentXml).toContain('w:after="500"');
    expect(newDocumentXml).toContain('Naslov s vlastitim, namjernim razmakom.');
  });

  it('deep BEZ stilskog backstopa (Normal bez w:spacing) NE cisti tijelo: nema regresije na Word default', async () => {
    const enc = new TextEncoder();

    // Normal stil postoji ali NEMA w:spacing uopce (nema w:before/w:after ni
    // w:line): patch je no-op i result.found ostaje prazan.
    const stylesXml =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
    const documentXml =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:pPr><w:spacing w:before="240" w:after="240"/></w:pPr>' +
      '<w:r><w:t>Odlomak s izravnim razmakom bez stilskog backstopa.</w:t></w:r></w:p>' +
      '</w:body></w:document>';

    const docx = await writeZip([
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    ]);

    const result = await applyFixers(docx, [
      { ruleId: 'razmak-odlomaka', fixerId: 'paragraph-spacing-fixer', params: { deep: true } },
    ]);

    // Normal nema w:spacing, sto je stanje u SVAKOM dokumentu koji je Word sam napravio. Prije se
    // popravak tu predavao; sada se backstop stvara, pa se izravni razmak smije ocistiti jer
    // odlomak pada na ciljanih 0/0, a ne na Wordov default.
    expect(result.changelog).toHaveLength(1);
    expect(result.skipped).toEqual([]);

    const dec2 = new TextDecoder();
    const entries2 = await readZip(result.docxBytes);
    const newStyles = dec2.decode(entries2.find((e) => e.name === 'word/styles.xml')!.data);
    const newDoc = dec2.decode(entries2.find((e) => e.name === 'word/document.xml')!.data);
    expect(newStyles).toContain('<w:spacing w:before="0" w:after="0"/>');
    expect(newDoc).not.toContain('w:before="240"');
    expect(newDoc).toContain('Odlomak s izravnim razmakom bez stilskog backstopa.');
  });

  it('empty-paragraph-fixer: kolabira niz od 4 prazna odlomka na 1, styles.xml netaknut', async () => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const documentXml =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:r><w:t>Prvi odlomak s tekstom.</w:t></w:r></w:p>' +
      '<w:p></w:p><w:p></w:p><w:p></w:p><w:p></w:p>' +
      '<w:p><w:r><w:t>Drugi odlomak s tekstom.</w:t></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/>' +
      '</w:sectPr></w:body></w:document>';

    const stylesXml =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>' +
      '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>';

    const entries = [
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    ];
    const originalDocx = await writeZip(entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'prazni-odlomci', fixerId: 'empty-paragraph-fixer', params: {} },
    ]);

    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0].fixerId).toBe('empty-paragraph-fixer');
    expect(result.changelog[0].ruleId).toBe('prazni-odlomci');

    const newEntries = await readZip(result.docxBytes);
    const newDocumentXml = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
    const newStylesXml = newEntries.find((e) => e.name === 'word/styles.xml')!.data;

    // Tocno 1 prazan odlomak prezivljava tamo gdje su bila 4.
    const emptyCount = (newDocumentXml.match(/<w:p><\/w:p>/g) ?? []).length;
    expect(emptyCount).toBe(1);

    // Tekstualni odlomci i sectPr netaknuti.
    expect(newDocumentXml).toContain('Prvi odlomak s tekstom.');
    expect(newDocumentXml).toContain('Drugi odlomak s tekstom.');
    expect(newDocumentXml).toContain('w:top="1417"');

    // styles.xml uopce ne dira ovaj fixer: bit-identican original bajtovima, ne samo toContain.
    expect(newStylesXml).toEqual(enc.encode(stylesXml));
  });

  // === footnote-spacing-fixer ===
  // Isti obrazac kao paragraph-spacing-fixer testovi iznad, ali FootnoteText
  // stil (backstop) zivi u styles.xml (kao Normal), dok direktni override
  // po odlomku zivi u word/footnotes.xml (kao document.xml za tijelo).
  // Namjerna, zasebna fixture (ne buildSyntheticDocx): buildSyntheticDocx
  // nema footnotes.xml niti FootnoteText stil, a dodavanje trece varijable
  // (footnote opcije) bi zakompliciralo fixture koju 8 postojecih testova
  // vec oslanja na tocno zadani oblik.
  function buildFootnoteDocx(opts: { footnoteTextBackstop?: boolean; footnoteSpacingOverride?: boolean } = {}) {
    const enc = new TextEncoder();
    const backstop = opts.footnoteTextBackstop !== false;
    const override = opts.footnoteSpacingOverride === true;

    const documentXml =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:r><w:t>Tekst tijela rada koji se ne smije mijenjati.</w:t></w:r></w:p>' +
      '</w:body></w:document>';

    // FootnoteText backstop (kad postoji) ima before=120/after=60 (6pt/3pt),
    // namjerno RAZLICITO od Normal stila (before=200/after=200, 10pt/10pt),
    // da testovi dokazu da fixer dira SAMO FootnoteText, ne Normal.
    const footnoteTextStyleBlock = backstop
      ? '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="Fusnota"/><w:pPr>' +
        '<w:spacing w:before="120" w:after="60"/></w:pPr></w:style>'
      : '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="Fusnota"/></w:style>';

    const stylesXml =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>' +
      '</w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Normal"><w:pPr>' +
      '<w:spacing w:before="200" w:after="200"/></w:pPr></w:style>' +
      footnoteTextStyleBlock +
      '</w:styles>';

    const footnotePPr = override
      ? '<w:pPr><w:pStyle w:val="FootnoteText"/><w:spacing w:before="120" w:after="60"/></w:pPr>'
      : '<w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>';

    const footnotesXml =
      '<?xml version="1.0"?><w:footnotes>' +
      '<w:footnote w:id="1"><w:p>' +
      footnotePPr +
      '<w:r><w:t>Tekst fusnote s napomenom.</w:t></w:r></w:p></w:footnote>' +
      '</w:footnotes>';

    return {
      documentXml,
      stylesXml,
      footnotesXml,
      entries: [
        { name: 'word/document.xml', data: enc.encode(documentXml) },
        { name: 'word/styles.xml', data: enc.encode(stylesXml) },
        { name: 'word/footnotes.xml', data: enc.encode(footnotesXml) },
      ],
    };
  }

  it('footnote-spacing-fixer (shallow): FootnoteText stil na 0/0, Normal stil i document.xml netaknuti', async () => {
    const dec = new TextDecoder();
    const fixture = buildFootnoteDocx();
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'razmak-fusnota', fixerId: 'footnote-spacing-fixer', params: {} },
    ]);

    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0].beforeLabel).toBe('Razmak prije/poslije (fusnote): 6 pt / 3 pt');
    expect(result.changelog[0].afterLabel).toBe('Razmak prije/poslije (fusnote): 0 pt / 0 pt');

    const newEntries = await readZip(result.docxBytes);
    const newStylesXml = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);
    const newDocumentXml = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);

    // FootnoteText stil patchan na 0/0.
    expect(newStylesXml).toContain(
      '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="Fusnota"/><w:pPr>' +
        '<w:spacing w:before="0" w:after="0"/></w:pPr></w:style>',
    );
    // Normal stil (razlicit ciljani before/after) ostaje netaknut.
    expect(newStylesXml).toContain('<w:spacing w:before="200" w:after="200"/>');

    // document.xml uopce nije meta ovog fixera: bit-identican original bajtovima.
    expect(newDocumentXml).toBe(fixture.documentXml);
  });

  it('footnote-spacing-fixer (deep): direktni override na footnote odlomku strippan kad FootnoteText backstop postoji', async () => {
    const dec = new TextDecoder();
    const fixture = buildFootnoteDocx({ footnoteSpacingOverride: true });
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'razmak-fusnota', fixerId: 'footnote-spacing-fixer', params: { deep: true } },
    ]);

    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0].afterLabel).toBe(
      'Razmak prije/poslije (fusnote): 0 pt / 0 pt; izravno formatiranje uklonjeno u 1 odlomaka (fusnote)',
    );

    const newEntries = await readZip(result.docxBytes);
    const newStylesXml = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);
    const newFootnotesXml = dec.decode(newEntries.find((e) => e.name === 'word/footnotes.xml')!.data);
    const newDocumentXml = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);

    // Stilski backstop (FootnoteText) patchan na 0/0.
    expect(newStylesXml).toContain(
      '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="Fusnota"/><w:pPr>' +
        '<w:spacing w:before="0" w:after="0"/></w:pPr></w:style>',
    );

    // Direktni override na footnote odlomku uklonjen (pao na 0/0 backstop preko stila).
    expect(newFootnotesXml).not.toContain('w:before="120"');
    expect(newFootnotesXml).not.toContain('w:after="60"');
    expect(newFootnotesXml).toContain('Tekst fusnote s napomenom.');

    // document.xml nije meta ovog fixera (dira samo styles.xml + footnotes.xml).
    expect(newDocumentXml).toBe(fixture.documentXml);
  });

  it('FootnoteText stil bez w:spacing: backstop se stvara, pa se izravni razmak fusnote cisti', async () => {
    const fixture = buildFootnoteDocx({ footnoteTextBackstop: false, footnoteSpacingOverride: true });
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'razmak-fusnota', fixerId: 'footnote-spacing-fixer', params: { deep: true } },
    ]);

    // Stil FootnoteText postoji, ali bez w:spacing. Razlika prema "stil uopce ne postoji" je bitna:
    // stil se i dalje NE izmislja (v. test nize), ali kad postoji, razmak se u njega upisuje.
    expect(result.changelog).toHaveLength(1);
    expect(result.skipped).toEqual([]);

    const dec2 = new TextDecoder();
    const entries2 = await readZip(result.docxBytes);
    const newStyles = dec2.decode(entries2.find((e) => e.name === 'word/styles.xml')!.data);
    const newFootnotes = dec2.decode(entries2.find((e) => e.name === 'word/footnotes.xml')!.data);
    expect(newStyles).toContain('<w:spacing w:before="0" w:after="0"/>');
    expect(newFootnotes).not.toContain('w:before="120"');
  });

  it('FootnoteText stil koji UOPCE ne postoji se ne izmislja (granica ostaje)', async () => {
    const enc = new TextEncoder();
    const styles = '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault></w:docDefaults></w:styles>';
    const doc = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Tijelo.</w:t></w:r></w:p></w:body></w:document>';
    const notes = '<?xml version="1.0"?><w:footnotes><w:footnote w:id="1"><w:p><w:pPr><w:spacing w:before="120"/></w:pPr><w:r><w:t>Nota.</w:t></w:r></w:p></w:footnote></w:footnotes>';
    const docx = await writeZip([
      { name: 'word/document.xml', data: enc.encode(doc) },
      { name: 'word/styles.xml', data: enc.encode(styles) },
      { name: 'word/footnotes.xml', data: enc.encode(notes) },
    ]);

    const result = await applyFixers(docx, [
      { ruleId: 'razmak-fusnota', fixerId: 'footnote-spacing-fixer', params: { deep: true } },
    ]);

    expect(result.changelog).toHaveLength(0);
    expect(result.skipped).toEqual(['razmak-fusnota']);
    expect(result.docxBytes).toEqual(docx);
  });

  it('footnote-spacing-fixer bez word/footnotes.xml u zipu: skipped, ne baca, ostali entryji netaknuti', async () => {
    const enc = new TextEncoder();
    const documentXml =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:r><w:t>Rad bez ijedne fusnote.</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const stylesXml =
      '<?xml version="1.0"?><w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>' +
      '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>';
    const entries = [
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    ];
    const originalDocx = await writeZip(entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'razmak-fusnota', fixerId: 'footnote-spacing-fixer', params: {} },
    ]);

    // Fail-safe put (parts.footnotesXml je undefined, gate u fixers.ts): ne baca,
    // vraca skipped, i bez ijednog primijenjenog popravka ulazni bajtovi ostaju
    // bit-identicni (isti obrazac kao "nijedan popravak nije primijenjen" test).
    expect(result.changelog).toHaveLength(0);
    expect(result.skipped).toEqual(['razmak-fusnota']);
    expect(result.docxBytes).toEqual(originalDocx);
  });

  it('mijenja SAMO stvarno promijenjeni dio: styles fix ne re-enkodira document.xml', async () => {
    const fixture = buildSyntheticDocx();
    const originalDocx = await writeZip(fixture.entries);
    const originalEntries = await readZip(originalDocx);
    const originalDocumentBytes = originalEntries.find((e) => e.name === 'word/document.xml')!.data;

    const result = await applyFixers(originalDocx, [
      { ruleId: 'font-glavni', fixerId: 'font-fixer', params: { fontName: 'Times New Roman' } },
    ]);

    expect(result.changelog).toHaveLength(1);
    const newEntries = await readZip(result.docxBytes);
    const newDocumentBytes = newEntries.find((e) => e.name === 'word/document.xml')!.data;
    // document.xml nije bio meta nijednog fixera pa dekomprimirani sadrzaj
    // mora biti bit-identican originalu (nikakav decode/encode round-trip).
    expect(newDocumentBytes).toEqual(originalDocumentBytes);
  });

  // === page-number-alignment-fixer ===
  // Prvi fixer koji cita/pise VISE zip entryja po regexu (word/footerN.xml,
  // word/headerN.xml) umjesto jednog fiksno imenovanog opcionalnog parta.
  // Namjerno se NE koristi rels/content-types wiring (footerReference) jer
  // apply-fixers.ts footerHeaderParts populacija je cisto ime-po-regexu, ne
  // ovisi o sectPr referenci - to je i tocka koju "orphan" test dolje dokazuje.
  function footerPagePart(jc: string) {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:p><w:pPr><w:jc w:val="${jc}"/></w:pPr>` +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:t>1</w:t></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
      '</w:p></w:ftr>'
    );
  }

  function buildFooterHeaderDocx(parts: Record<string, string>) {
    const enc = new TextEncoder();
    const documentXml =
      '<?xml version="1.0"?><w:document><w:body>' +
      '<w:p><w:r><w:t>Tekst tijela rada koji se ne smije mijenjati.</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const stylesXml = '<?xml version="1.0"?><w:styles></w:styles>';
    const entries = [
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml) },
      ...Object.entries(parts).map(([name, content]) => ({ name, data: enc.encode(content) })),
    ];
    return { documentXml, stylesXml, entries };
  }

  it('page-number-alignment-fixer (shallow): footer1.xml poravnat desno, document.xml/styles.xml bit-identicni', async () => {
    const dec = new TextDecoder();
    const fixture = buildFooterHeaderDocx({ 'word/footer1.xml': footerPagePart('left') });
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'poravnanje-broja-stranice', fixerId: 'page-number-alignment-fixer', params: {} },
    ]);

    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0].beforeLabel).toBe('Poravnanje broja stranice: lijevo');
    expect(result.changelog[0].afterLabel).toBe('Poravnanje broja stranice: desno');

    const newEntries = await readZip(result.docxBytes);
    const newFooterXml = dec.decode(newEntries.find((e) => e.name === 'word/footer1.xml')!.data);
    const newDocumentXml = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
    const newStylesXml = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);

    expect(newFooterXml).toContain('<w:jc w:val="right"/>');
    expect(newDocumentXml).toBe(fixture.documentXml);
    expect(newStylesXml).toBe(fixture.stylesXml);
  });

  // RE-04: params.align se sada STVARNO propagira (prije je fixer imao tvrdo upisano 'right' i
  // ignorirao params). 'center' dokazuje propagaciju: default (bez params) uvijek daje 'right', pa
  // 'right' ne bi razlikovao "propagirano" od "tvrdo upisano".
  it('page-number-alignment-fixer: params.align se propagira (RE-04, ne samo tvrdo "right")', async () => {
    const fixture = buildFooterHeaderDocx({ 'word/footer1.xml': footerPagePart('left') });
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'poravnanje-broja-stranice', fixerId: 'page-number-alignment-fixer', params: { align: 'center' } },
    ]);

    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0].afterLabel).toBe('Poravnanje broja stranice: sredina');

    const newEntries = await readZip(result.docxBytes);
    const dec = new TextDecoder();
    const newFooterXml = dec.decode(newEntries.find((e) => e.name === 'word/footer1.xml')!.data);
    expect(newFooterXml).toContain('<w:jc w:val="center"/>');
  });

  it('page-number-alignment-fixer: no-op kad je PAGE polje vec desno poravnato', async () => {
    const fixture = buildFooterHeaderDocx({ 'word/footer1.xml': footerPagePart('right') });
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'poravnanje-broja-stranice', fixerId: 'page-number-alignment-fixer', params: {} },
    ]);

    expect(result.changelog).toHaveLength(0);
    expect(result.skipped).toEqual(['poravnanje-broja-stranice']);
    expect(result.docxBytes).toEqual(originalDocx);
  });

  it('page-number-alignment-fixer: dokument bez footer/header partova -> skipped, ne baca', async () => {
    const fixture = buildFooterHeaderDocx({});
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'poravnanje-broja-stranice', fixerId: 'page-number-alignment-fixer', params: {} },
    ]);

    expect(result.changelog).toHaveLength(0);
    expect(result.skipped).toEqual(['poravnanje-broja-stranice']);
    expect(result.docxBytes).toEqual(originalDocx);
  });

  it('page-number-alignment-fixer: VISE partova, SAMO stvarno promijenjeni se re-enkodira', async () => {
    const dec = new TextDecoder();
    const fixture = buildFooterHeaderDocx({
      'word/footer1.xml': footerPagePart('left'), // krivo -> mora se promijeniti
      'word/footer2.xml': footerPagePart('right'), // vec ispravno -> mora ostati bit-identican
    });
    const originalDocx = await writeZip(fixture.entries);
    const originalEntries = await readZip(originalDocx);
    const originalFooter2Bytes = originalEntries.find((e) => e.name === 'word/footer2.xml')!.data;

    const result = await applyFixers(originalDocx, [
      { ruleId: 'poravnanje-broja-stranice', fixerId: 'page-number-alignment-fixer', params: {} },
    ]);

    expect(result.changelog).toHaveLength(1);
    // Samo footer1 je STVARNO touchan (footer2 je vec ispravan pa se ne broji u
    // touchedCount); broj-podnozja napomena se pojavljuje samo kad je touchedCount>1.
    expect(result.changelog[0].afterLabel).toBe('Poravnanje broja stranice: desno');

    const newEntries = await readZip(result.docxBytes);
    const newFooter1 = dec.decode(newEntries.find((e) => e.name === 'word/footer1.xml')!.data);
    const newFooter2Bytes = newEntries.find((e) => e.name === 'word/footer2.xml')!.data;
    expect(newFooter1).toContain('<w:jc w:val="right"/>');
    // footer2 vec ispravan: bit-identican (nikakav decode/encode round-trip).
    expect(newFooter2Bytes).toEqual(originalFooter2Bytes);
  });

  it('page-number-alignment-fixer: VISE stvarno pogresnih partova -> changelog spominje broj podnozja/zaglavlja', async () => {
    const fixture = buildFooterHeaderDocx({
      'word/footer1.xml': footerPagePart('left'),
      'word/header1.xml': footerPagePart('center'),
    });
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'poravnanje-broja-stranice', fixerId: 'page-number-alignment-fixer', params: {} },
    ]);

    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0].afterLabel).toBe('Poravnanje broja stranice: desno (2 podnožja/zaglavlja)');

    const dec = new TextDecoder();
    const newEntries = await readZip(result.docxBytes);
    expect(dec.decode(newEntries.find((e) => e.name === 'word/footer1.xml')!.data)).toContain('<w:jc w:val="right"/>');
    expect(dec.decode(newEntries.find((e) => e.name === 'word/header1.xml')!.data)).toContain('<w:jc w:val="right"/>');
  });

  it('page-number-alignment-fixer: nereferencirani ("orphan") footer se SVEJEDNO popravlja (namjerno siri opseg od audita)', async () => {
    // Ovaj footer nema footerReference ni u jednom sectPr (nije wiran preko rels/
    // content-types), pa ga analyzeDocx pageNumberAlignment check NIKAD ne vidi.
    // Fixer ga svejedno popravlja jer opseg partova (regex po imenu) je namjerno
    // siri od audit-vidljivog opsega (rels-razrijesene mete) - popravljanje
    // nereferenciranog dijela je bezopasno jer dokument ga nikad ne renderira.
    const dec = new TextDecoder();
    const fixture = buildFooterHeaderDocx({ 'word/footer3.xml': footerPagePart('center') });
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'poravnanje-broja-stranice', fixerId: 'page-number-alignment-fixer', params: {} },
    ]);

    expect(result.changelog).toHaveLength(1);
    const newEntries = await readZip(result.docxBytes);
    const newFooter3 = dec.decode(newEntries.find((e) => e.name === 'word/footer3.xml')!.data);
    expect(newFooter3).toContain('<w:jc w:val="right"/>');
  });

  // RE-27: runFixer tvrdi (u vlastitom komentaru) da su "nedostajuci parametri NO-OP, ne pad", ali
  // to nije vrijedilo za skalarne brojcane parametre: nedostajuca/nevaljana vrijednost bi prosla
  // kroz cmToTwips/ptToHalfPoints/multiplierToTwips kao NaN, koji Number(...)/String(...) pretvore
  // u LITERALNI string "NaN" upisan u XML atribut, prijavljeno kao USPJESAN popravak (schema-nevaljan
  // dokument isporucen kao popravljen). Isto za "whitelist" stringove (w:val enumeracije): nevaljana
  // vrijednost bi se doslovno upisala u XML umjesto da se odbije.
  describe('RE-27: skalarni parametri i whitelist stringovi se validiraju (Number.isFinite / whitelist) -> NO-OP umjesto NaN/nevaljane vrijednosti', () => {
    it('paper-size-fixer s params:{} je NO-OP (prije: upisivao w:w="NaN"/w:h="NaN")', async () => {
      const fixture = buildSyntheticDocx();
      const originalDocx = await writeZip(fixture.entries);
      const result = await applyFixers(originalDocx, [{ ruleId: 'r1', fixerId: 'paper-size-fixer', params: {} }]);
      expect(result.changelog).toHaveLength(0);
      expect(result.skipped).toEqual(['r1']);
      const newEntries = await readZip(result.docxBytes);
      const dec = new TextDecoder();
      const newDoc = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
      expect(newDoc).not.toContain('NaN');
      expect(newDoc).toBe(fixture.documentXml);
    });

    it('line-spacing-fixer s params:{} je NO-OP (prije: upisivao w:line="NaN")', async () => {
      const fixture = buildSyntheticDocx();
      const originalDocx = await writeZip(fixture.entries);
      const result = await applyFixers(originalDocx, [{ ruleId: 'r1', fixerId: 'line-spacing-fixer', params: {} }]);
      expect(result.changelog).toHaveLength(0);
      expect(result.skipped).toEqual(['r1']);
      const newEntries = await readZip(result.docxBytes);
      const dec = new TextDecoder();
      const newStyles = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);
      expect(newStyles).not.toContain('NaN');
      expect(newStyles).toBe(fixture.stylesXml);
    });

    it('margins-fixer s nevaljanom (non-finite) vrijednosti za JEDNU marginu: ta margina se preskace, ostale prolaze', async () => {
      const fixture = buildSyntheticDocx();
      const originalDocx = await writeZip(fixture.entries);
      const result = await applyFixers(originalDocx, [
        { ruleId: 'r1', fixerId: 'margins-fixer', params: { right: 2.5, top: 'abc' } },
      ]);
      expect(result.changelog).toHaveLength(1);
      const newEntries = await readZip(result.docxBytes);
      const dec = new TextDecoder();
      const newDoc = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
      expect(newDoc).not.toContain('NaN');
      expect(newDoc).toContain('w:right="1417"'); // 2,5cm primijenjen
      expect(newDoc).toContain('w:top="1600"'); // nevaljan top netaknut (izvorna vrijednost)
    });

    it('font-fixer s nevaljanim (non-finite) fontSizePt: velicina se preskace (fontName i dalje prolazi ako je poslan)', async () => {
      const fixture = buildSyntheticDocx();
      const originalDocx = await writeZip(fixture.entries);
      const result = await applyFixers(originalDocx, [
        { ruleId: 'r1', fixerId: 'font-fixer', params: { fontName: 'Arial', fontSizePt: 'abc' } },
      ]);
      const newEntries = await readZip(result.docxBytes);
      const dec = new TextDecoder();
      const newStyles = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);
      expect(newStyles).not.toContain('NaN');
      expect(newStyles).toContain('w:ascii="Arial"'); // font i dalje primijenjen
      expect(newStyles).toContain('w:val="22"'); // izvorna velicina netaknuta
    });

    it('alignment-fixer s params:{} (bez val) je NO-OP umjesto pada (prije: TypeError iz escapeXmlAttr)', async () => {
      const fixture = buildSyntheticDocx();
      const originalDocx = await writeZip(fixture.entries);
      const result = await applyFixers(originalDocx, [{ ruleId: 'r1', fixerId: 'alignment-fixer', params: {} }]);
      expect(result.changelog).toHaveLength(0);
      expect(result.skipped).toEqual(['r1']);
    });

    it('alignment-fixer s nepoznatom vrijednosti vala (izvan whiteliste) je NO-OP, ne upisuje je doslovno', async () => {
      const fixture = buildSyntheticDocx();
      const originalDocx = await writeZip(fixture.entries);
      const result = await applyFixers(originalDocx, [
        { ruleId: 'r1', fixerId: 'alignment-fixer', params: { val: 'bogus' } },
      ]);
      expect(result.changelog).toHaveLength(0);
      expect(result.skipped).toEqual(['r1']);
    });

    it('page-number-alignment-fixer s nepoznatom vrijednosti align (izvan whiteliste) NE upisuje je doslovno u w:jc', async () => {
      const fixture = buildFooterHeaderDocx({ 'word/footer1.xml': footerPagePart('left') });
      const originalDocx = await writeZip(fixture.entries);
      const result = await applyFixers(originalDocx, [
        { ruleId: 'r1', fixerId: 'page-number-alignment-fixer', params: { align: 'bogus' } },
      ]);
      const newEntries = await readZip(result.docxBytes);
      const dec = new TextDecoder();
      const newFooter = dec.decode(newEntries.find((e) => e.name === 'word/footer1.xml')!.data);
      expect(newFooter).not.toContain('w:val="bogus"');
    });

    it('footnote-typography-fixer s nevaljanim (non-finite) fontSizePt: velicina se preskace (fixer dira FootnoteText STIL u styles.xml, footnotes.xml je samo gate)', async () => {
      const enc = new TextEncoder();
      const documentXml = '<?xml version="1.0"?><w:document><w:body><w:p/></w:body></w:document>';
      const stylesXml =
        '<?xml version="1.0"?><w:styles><w:style w:type="paragraph" w:styleId="FootnoteText">' +
        '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr></w:style></w:styles>';
      const footnotesXml = '<?xml version="1.0"?><w:footnotes><w:footnote w:id="1"><w:p/></w:footnote></w:footnotes>';
      const entries = [
        { name: 'word/document.xml', data: enc.encode(documentXml) },
        { name: 'word/styles.xml', data: enc.encode(stylesXml) },
        { name: 'word/footnotes.xml', data: enc.encode(footnotesXml) },
      ];
      const originalDocx = await writeZip(entries);
      const result = await applyFixers(originalDocx, [
        { ruleId: 'r1', fixerId: 'footnote-typography-fixer', params: { fontName: 'Arial', fontSizePt: 'abc' } },
      ]);
      const newEntries = await readZip(result.docxBytes);
      const dec = new TextDecoder();
      const newStyles = dec.decode(newEntries.find((e) => e.name === 'word/styles.xml')!.data);
      expect(newStyles).not.toContain('NaN');
      expect(newStyles).toContain('w:ascii="Arial"');
      expect(newStyles).toContain('w:val="20"'); // izvorna velicina netaknuta
    });

    /**
     * IZRAVNO oblikovanje u fusnotama nadjacava stil, pa je bez `deep` popravak tvrdio promjenu
     * koje nije bilo. Izmjereno 2026-09-01 na `pravo-integrirani-fusnote`: fusnote su i nakon
     * popravka ostale Calibri 9 pt, dok je changelog javljao "Times New Roman, 10 pt".
     */
    const fusnoteZip = async (rPrFusnote: string) => {
      const enc = new TextEncoder();
      return writeZip([
        { name: 'word/document.xml', data: enc.encode('<?xml version="1.0"?><w:document><w:body><w:p/></w:body></w:document>') },
        {
          name: 'word/styles.xml',
          data: enc.encode(
            '<?xml version="1.0"?><w:styles><w:style w:type="paragraph" w:styleId="FootnoteText">' +
              '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/></w:rPr></w:style></w:styles>',
          ),
        },
        {
          name: 'word/footnotes.xml',
          data: enc.encode(
            '<?xml version="1.0"?><w:footnotes><w:footnote w:id="1"><w:p>' +
              '<w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>' +
              `<w:r><w:rPr>${rPrFusnote}</w:rPr><w:t>tekst fusnote</w:t></w:r>` +
              '</w:p></w:footnote></w:footnotes>',
          ),
        },
      ]);
    };
    const fusnoteXml = async (docx: Uint8Array) =>
      new TextDecoder().decode((await readZip(docx)).find((e) => e.name === 'word/footnotes.xml')!.data);
    const IZRAVNO = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/>';

    it('BASELINE: bez `deep` izravno oblikovanje fusnota ostaje (zateceno ponasanje)', async () => {
      const result = await applyFixers(await fusnoteZip(IZRAVNO), [
        { ruleId: 'r1', fixerId: 'footnote-typography-fixer', params: { fontName: 'Times New Roman', fontSizePt: 10 } },
      ]);
      const foot = await fusnoteXml(result.docxBytes);
      expect(foot).toContain('w:ascii="Calibri"');
      expect(foot).toContain('<w:sz w:val="18"/>');
    });

    it('uz `deep` izravni font i velicina u fusnotama nestaju, pa stil dolazi do izrazaja', async () => {
      const result = await applyFixers(await fusnoteZip(IZRAVNO), [
        { ruleId: 'r1', fixerId: 'footnote-typography-fixer', params: { fontName: 'Times New Roman', fontSizePt: 10, deep: true } },
      ]);
      const foot = await fusnoteXml(result.docxBytes);
      expect(foot).not.toContain('w:ascii="Calibri"');
      expect(foot).not.toContain('<w:sz w:val="18"/>');
      expect(foot).toContain('tekst fusnote'); // tekst netaknut
      expect(result.changelog.some((c) => c.afterLabel.includes('(fusnote)'))).toBe(true);
    });

    it('`deep` ne dira bold/italic ni druga run-svojstva', async () => {
      const result = await applyFixers(await fusnoteZip(`${IZRAVNO}<w:b/><w:i/>`), [
        { ruleId: 'r1', fixerId: 'footnote-typography-fixer', params: { fontName: 'Times New Roman', fontSizePt: 10, deep: true } },
      ]);
      const foot = await fusnoteXml(result.docxBytes);
      expect(foot).toContain('<w:b/>');
      expect(foot).toContain('<w:i/>');
    });

    /**
     * PROROD FUSNOTA: cetvrta grana provjere "Oblikovanje fusnota", do 2026-09-01 bez ijednog puta
     * popravka. Profil ga propisuje kroz `footnoteSpacing` (21 profil, svi `pravo-*`), provjera ga
     * boduje kroz `fspOk`, a nijedna stavka ga nije slala i nijedan patch ga nije pisao:
     * `patchFootnoteTextSpacing` dira samo `w:before`/`w:after`. Izmjereno na
     * `pravo-integrirani-fusnote`: profil trazi 1,0, dokument ima 1,15.
     */
    const fusnoteSProredom = async () => {
      const enc = new TextEncoder();
      return writeZip([
        { name: 'word/document.xml', data: enc.encode('<?xml version="1.0"?><w:document><w:body><w:p/></w:body></w:document>') },
        {
          name: 'word/styles.xml',
          data: enc.encode(
            '<?xml version="1.0"?><w:styles><w:style w:type="paragraph" w:styleId="FootnoteText">' +
              '<w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr>' +
              '<w:rPr><w:sz w:val="18"/></w:rPr></w:style></w:styles>',
          ),
        },
        {
          name: 'word/footnotes.xml',
          data: enc.encode(
            '<?xml version="1.0"?><w:footnotes><w:footnote w:id="1"><w:p>' +
              '<w:pPr><w:pStyle w:val="FootnoteText"/><w:spacing w:line="276" w:lineRule="auto"/></w:pPr>' +
              '<w:r><w:t>tekst fusnote</w:t></w:r></w:p></w:footnote></w:footnotes>',
          ),
        },
      ]);
    };
    const stilXml = async (docx: Uint8Array) =>
      new TextDecoder().decode((await readZip(docx)).find((e) => e.name === 'word/styles.xml')!.data);

    it('BASELINE: bez `lineSpacing` prored stila fusnota ostaje netaknut', async () => {
      const result = await applyFixers(await fusnoteSProredom(), [
        { ruleId: 'r1', fixerId: 'footnote-typography-fixer', params: { fontSizePt: 10, deep: true } },
      ]);
      expect(await stilXml(result.docxBytes)).toContain('w:line="276"');
    });

    it('`lineSpacing` upisuje prored u stil FootnoteText (mnozitelj -> 240-tine)', async () => {
      const result = await applyFixers(await fusnoteSProredom(), [
        { ruleId: 'r1', fixerId: 'footnote-typography-fixer', params: { lineSpacing: 1 } },
      ]);
      const stil = await stilXml(result.docxBytes);
      expect(stil).toContain('w:line="240"');
      expect(stil).not.toContain('w:line="276"');
      expect(result.changelog.some((c) => c.afterLabel.includes('1,00x prored'))).toBe(true);
    });

    it('uz `deep` nestaje i IZRAVNI prored u odlomku fusnote, inace bi nadjacao stil', async () => {
      const result = await applyFixers(await fusnoteSProredom(), [
        { ruleId: 'r1', fixerId: 'footnote-typography-fixer', params: { lineSpacing: 1, deep: true } },
      ]);
      const foot = await fusnoteXml(result.docxBytes);
      expect(foot).not.toContain('w:line="276"');
      expect(foot).toContain('tekst fusnote'); // tekst netaknut
    });

    it('nevaljan mnozitelj se odbacuje, stil ostaje netaknut', async () => {
      for (const lineSpacing of [0, -1, 99, 'abc']) {
        const result = await applyFixers(await fusnoteSProredom(), [
          { ruleId: 'r1', fixerId: 'footnote-typography-fixer', params: { lineSpacing } },
        ]);
        expect(await stilXml(result.docxBytes), `mnozitelj ${lineSpacing}`).toContain('w:line="276"');
      }
    });
  });

  // RE-26: applyFixers samu sebe u komentaru zove "fail-safe", ali runFixer se dosad pozivao BEZ
  // try/catch: fixer koji baci (npr. neocekivana kombinacija ulaza koju RE-27-stil validacija jos
  // ne pokriva za sve fixere, npr. ugnjezdeni target objekti nizovnih fixera) obarao je CIJELU
  // bateriju, ukljucivo popravke koji su VEC uspjesno primijenjeni PRIJE njega u istom pozivu.
  describe('RE-26: fixer koji baci (npr. page-numbering-fixer s ne-string fmt u targetu) ne obara cijelu bateriju', () => {
    it('valjan popravak PRIJE fixera-koji-baca ostaje primijenjen; onaj koji baca zavrsi u skipped, applyFixers ne baca', async () => {
      const enc = new TextEncoder();
      const documentXml =
        '<?xml version="1.0"?><w:document><w:body>' +
        '<w:p><w:r><w:t>tekst</w:t></w:r></w:p>' +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
        '<w:pgMar w:top="1600" w:right="1134" w:bottom="1417" w:left="1417"/></w:sectPr>' +
        '</w:body></w:document>';
      const entries = [
        { name: 'word/document.xml', data: enc.encode(documentXml) },
        { name: 'word/styles.xml', data: enc.encode('<?xml version="1.0"?><w:styles></w:styles>') },
      ];
      const originalDocx = await writeZip(entries);

      const result = await applyFixers(originalDocx, [
        { ruleId: 'valjan-margina', fixerId: 'margins-fixer', params: { right: 2.5 } },
        // fmt kao BROJ umjesto stringa: escapeXmlAttr unutar patchSectionPageNumbering baca
        // TypeError ('s.replace is not a function'), jer ovaj ugnjezdeni target-objekt fixer
        // nije obuhvacen RE-27-ovom validacijom top-level skalara.
        { ruleId: 'ruzan-baca', fixerId: 'page-numbering-fixer', params: { targets: [{ sectionIndex: 0, fmt: 123 }] } },
      ]);

      expect(result.changelog).toHaveLength(1);
      expect(result.changelog[0].ruleId).toBe('valjan-margina');
      expect(result.skipped).toEqual(['ruzan-baca']);

      const newEntries = await readZip(result.docxBytes);
      const dec = new TextDecoder();
      const newDoc = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
      expect(newDoc).toContain('w:right="1417"'); // 2,5cm i dalje primijenjeno
    });
  });
});
