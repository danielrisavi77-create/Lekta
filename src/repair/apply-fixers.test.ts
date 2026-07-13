import { describe, it, expect } from 'vitest';
import { readZip, writeZip } from './zip-codec';
import { applyFixers } from './apply-fixers';

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
  it('mijenja samo ciljane vrijednosti, sve ostalo bit-identicno', async () => {
    const fixture = buildSyntheticDocx();
    const originalDocx = await writeZip(fixture.entries);

    const result = await applyFixers(originalDocx, [
      { ruleId: 'margina-desno', fixerId: 'margins-fixer', params: { right: 2.5 } },
      { ruleId: 'font-glavni', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', fontSizePt: 12 } },
      // Namjerno trazimo fixer za atribut koji ne postoji u ovom fixtureu
      // (nema w:jc taga), da dokazemo fail-safe skip ponasanje.
      { ruleId: 'nepostojeci-atribut', fixerId: 'alignment-fixer', params: { val: 'both' } },
    ]);

    expect(result.changelog).toHaveLength(2);
    expect(result.skipped).toEqual(['nepostojeci-atribut']);

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

    // Margina vec ima ciljanu vrijednost (top 1600 nije dirana; right na postojecu 1134/2.0cm)
    const result = await applyFixers(originalDocx, [
      { ruleId: 'vec-ok', fixerId: 'margins-fixer', params: { right: 2.0 } },
      { ruleId: 'nepostojeci-atribut', fixerId: 'alignment-fixer', params: { val: 'both' } },
    ]);

    expect(result.changelog).toHaveLength(0);
    expect(result.skipped).toEqual(['vec-ok', 'nepostojeci-atribut']);
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

  it('deep BEZ stilskog backstopa (theme-only rFonts) NE cisti tijelo: nema regresije na theme', async () => {
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

    // Stilski patch ne uspije (theme-only, patch-only politika) I deep se NE
    // primijeni: da jest, dokument bi pao na Calibri theme umjesto na TNR.
    expect(result.changelog).toHaveLength(0);
    expect(result.skipped).toEqual(['font-glavni']);
    expect(result.docxBytes).toEqual(docx);
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

  it('deep NE cisti font kad Normal stil nadjacava cilj drugim fontom (regresija-zastita)', async () => {
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

    // docDefaults se patcha (changelog nije prazan), ALI deep NE skida run TNR:
    // da ga skine, run bi pao na Normal=Arial umjesto na cilj TNR.
    const newEntries = await readZip(result.docxBytes);
    const dec = new TextDecoder();
    const newDoc = dec.decode(newEntries.find((e) => e.name === 'word/document.xml')!.data);
    expect(newDoc).toContain('w:ascii="Times New Roman"'); // run TNR ostaje
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

    // Stilski patch ne uspije (Normal nema w:spacing, nema backstopa) I deep se
    // NE primijeni: da jest, dokument bi pao na Wordov default umjesto na cilj.
    expect(result.changelog).toHaveLength(0);
    expect(result.skipped).toEqual(['razmak-odlomaka']);
    expect(result.docxBytes).toEqual(docx);
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
});
