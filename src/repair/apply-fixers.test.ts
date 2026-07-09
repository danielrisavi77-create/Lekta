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
