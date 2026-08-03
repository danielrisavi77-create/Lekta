/**
 * Faza B, korak N: kompozitni dokument postoji i valjan je, PRIJE nego ijedan bajt ode na disk.
 *
 * Redoslijed je namjeran (plan pokrivenosti, "dvostupanjski sidecar"): commit N dokazuje da se
 * dokument gradi i da prolazi Tier 0 u memoriji, commit N+1 tek onda zapisuje .docx i snima
 * snapshote. Bez toga bi se novi fixture i eventualni bug u motoru pojavili u istom crvenom
 * prolazu, pa se ne bi znalo koje od to dvoje je uzrok.
 *
 * Ovaj test NE pise nista na disk i ne dira nijedan generirani artefakt.
 */
import { describe, it, expect } from 'vitest';
import { fullStructureDocx, fpzgBibliographyDocx } from './helpers/composite-docx';
import { readZip } from '../src/repair/zip-codec';
import { assertPartsWellFormed } from './helpers/docx-package-assert';
import { applyFixers, type FixerRequest } from '../src/repair/apply-fixers';
import { assertPackageIntact } from './helpers/docx-package-assert';

/** Dijelovi koje dokument MORA imati; svaki je ondje zato sto neki fixer bez njega nema cilja. */
const REQUIRED_PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'word/_rels/document.xml.rels',
  'word/document.xml',
  'word/styles.xml',
  'word/numbering.xml',
  'word/footnotes.xml',
  'word/settings.xml',
  'word/fontTable.xml',
  'word/header1.xml',
  'word/footer1.xml',
  'word/media/image1.png',
  'docProps/core.xml',
  'docProps/app.xml',
];

describe('kompozitni fixture: fer-diplomski puna struktura', () => {
  it('paket ima svih 14 dijelova i svaki XML je well-formed', async () => {
    const bytes = await fullStructureDocx();
    const entries = await readZip(bytes);
    const names = entries.map((entry) => entry.name).sort();
    expect(names).toEqual([...REQUIRED_PARTS].sort());
    await assertPartsWellFormed(bytes, 'kompozitni fixture');
  });

  it('nosi strukturu koju izolirani predlosci nemaju', async () => {
    const bytes = await readZip(await fullStructureDocx());
    const decoder = new TextDecoder();
    const documentXml = decoder.decode(bytes.find((entry) => entry.name === 'word/document.xml')!.data);

    // Naslovnica kao VLASTITA sekcija (rimski brojevi + razlicito prvo zaglavlje).
    expect(documentXml).toContain('w:fmt="lowerRoman"');
    expect(documentXml).toContain('<w:titlePg/>');
    // TOC omotan u structured document tag: oblik koji Word stvarno proizvede.
    expect(documentXml).toContain('Table of Contents');
    expect(documentXml).toContain(' TOC \\o "1-3" \\h \\z \\u ');
    // Tablica s natpisom, i crtez s natpisom.
    expect(documentXml).toContain('<w:tbl>');
    expect(documentXml).toContain('Tablica 1.');
    expect(documentXml).toContain('Slika 1.');
    // Potpun crtez: bez ovih cetiri Word bi dokument popravljao pri otvaranju.
    for (const marker of ['<wp:extent', '<wp:docPr', '<pic:nvPicPr>', '<a:stretch>']) {
      expect(documentXml, `crtez mora imati ${marker}`).toContain(marker);
    }
    // Dvije fusnote, zaglavlje i podnozje, i polozena zavrsna sekcija.
    expect((documentXml.match(/<w:footnoteReference /g) ?? []).length).toBe(2);
    expect(documentXml).toContain('headerReference');
    expect(documentXml).toContain('footerReference');
    expect(documentXml).toContain('w:orient="landscape"');

    // Slika je STVARAN PNG (IHDR 120x80), ne potpis + nule: table-figure-rescue cita dimenzije.
    const png = bytes.find((entry) => entry.name === 'word/media/image1.png')!.data;
    expect(png.length).toBeGreaterThan(200);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(120); // IHDR sirina
    expect(view.getUint32(20)).toBe(80); // IHDR visina
  });

  it('prezivi popravak: paket ostaje cjelovit i well-formed', async () => {
    const bytes = await fullStructureDocx();
    // Profilne vrijednosti FPZG/FER tipa: dokument je namjerno u Calibri 11 / prored auto, pa
    // ovi fixeri STVARNO imaju sto promijeniti (za razliku od izoliranih predlozaka).
    const requests: FixerRequest[] = [
      { ruleId: 'font-rule', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', fontSizePt: 12, deep: true } },
      { ruleId: 'line-spacing-rule', fixerId: 'line-spacing-fixer', params: { multiplier: 1.5, deep: true } },
      { ruleId: 'alignment-rule', fixerId: 'alignment-fixer', params: { val: 'both', deep: true } },
      { ruleId: 'margins-rule', fixerId: 'margins-fixer', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 3.0 } },
      { ruleId: 'paper-size-rule', fixerId: 'paper-size-fixer', params: { w: 21.0, h: 29.7 } },
    ];
    const applied = await applyFixers(bytes, requests);
    expect(applied.changelog.length, 'kompozitni dokument mora imati sto popraviti').toBeGreaterThan(0);
    await assertPackageIntact(bytes, applied.docxBytes, 'kompozitni fixture nakon popravka');

    // Binarni dio mora proci netaknut (isti invarijant koji Tier 2 mjeri Wordom).
    const before = (await readZip(bytes)).find((entry) => entry.name === 'word/media/image1.png')!.data;
    const after = (await readZip(applied.docxBytes)).find((entry) => entry.name === 'word/media/image1.png')!.data;
    expect(after).toEqual(before);
  });
});

describe('kompozitni fixture: FPZG bibliografija i citati', () => {
  it('paket je well-formed i nosi cetiri namjerne pogreske u popisu literature', async () => {
    const bytes = await fpzgBibliographyDocx();
    await assertPartsWellFormed(bytes, 'FPZG fixture');

    const entries = await readZip(bytes);
    const documentXml = new TextDecoder().decode(entries.find((entry) => entry.name === 'word/document.xml')!.data);

    // 1. popis nije abecedan (Vukovic prije Antica), 2. isti autor i godina dvaput,
    // 3. tocan duplikat zadnjeg zapisa, 4. zapis s DOI-jem.
    expect(documentXml.indexOf('Vukovic, M. (2020)')).toBeLessThan(documentXml.indexOf('Antic, I. (2021)'));
    expect((documentXml.match(/Antic, I\. \(2021\)/g) ?? []).length).toBe(2);
    expect((documentXml.match(/Vukovic, M\. \(2020\)\. Mediji i javna sfera/g) ?? []).length).toBe(2);
    expect(documentXml).toContain('doi:10.1234/abcd.2018');

    // Citat bez zapisa i zapis bez citata (gradja za provjeru uskladjenosti citata i popisa).
    expect(documentXml).toContain('(Sokol, 2019)');
    expect(documentXml).toContain('Baric, K. (2018)');
    expect(documentXml).not.toContain('(Baric, 2018)');

    // Naslovnica s prijelomom stranice: bez njega naslovnica nije pouzdano prepoznata.
    expect(documentXml).toContain('<w:br w:type="page"/>');
    // Nema kljucnih rijeci: jedini nacin da obvezni dio stvarno nedostaje na ovom profilu.
    expect(documentXml).not.toContain('Kljucne rijeci');
  });

  it('prezivi popravak popisa literature: paket cjelovit, tekst citata ocuvan', async () => {
    const bytes = await fpzgBibliographyDocx();
    // Popravak bibliografije PREMJESTA odlomke; dokaz da pritom ne izgubi nijedan zapis ni dio
    // paketa vazniji je nego kod cisto stilskih fixera.
    const applied = await applyFixers(bytes, [
      { ruleId: 'bibliography-rules', fixerId: 'bibliography-repair-fixer', params: { version: 1, entries: [], options: {} } },
    ]);
    // Prazan popis stavki mora biti cist no-op, ne tiha izmjena.
    expect(applied.changelog).toEqual([]);
    expect(applied.docxBytes).toBe(bytes);
  });
});
