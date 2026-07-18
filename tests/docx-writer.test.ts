/**
 * Round-trip validacija produkcijskog .docx writera NASIM parserom:
 * buildDocxBytes -> ZipReader -> text('word/document.xml') -> parseXml, pa
 * asertacije nad OOXML cvorovima (jc, b, sz, spacing, ind, pageBreakBefore).
 */
import { describe, it, expect } from 'vitest';
import {
  buildDocxBytes,
  docxBlob,
  titlePageDoc,
  statementDoc,
  bibliographyDoc,
  DOCX_MIME,
  type DocSpec,
} from '../src/docx/docx-writer';
import { ZipReader, parseXml } from '../src/docx/parser';
import { attr, els, first } from '../src/utils/helpers';
import { buildTitlePage } from '../src/tools/title-page';
import { buildStatement } from '../src/tools/statement';

/** Otvori bajtove ZipReaderom (isti parser kao u aplikaciji). */
function openZip(bytes: Uint8Array): ZipReader {
  return new ZipReader(bytes.buffer as ArrayBuffer);
}

/** Round-trip: bajtovi -> word/document.xml -> XML dokument. */
async function readDocument(bytes: Uint8Array): Promise<Document> {
  const zip = openZip(bytes);
  const xml = await zip.text('word/document.xml');
  expect(xml).toBeTruthy();
  return parseXml(xml, 'word/document.xml');
}

/** Puni tekst odlomka (svi w:t unutar w:p). */
function paraText(p: Element): string {
  return els(p, 'w:t').map((t) => t.textContent || '').join('');
}

/** Nadji odlomak po tocnom tekstu ili baci gresku. */
function paraOf(doc: Document, text: string): Element {
  const p = els(doc, 'w:p').find((el) => paraText(el) === text);
  if (!p) throw new Error(`Nema odlomka s tekstom: ${text}`);
  return p;
}

describe('buildDocxBytes: OOXML plumbing', () => {
  const simple: DocSpec = { paragraphs: [{ text: 'Prvi odlomak' }, { text: 'Drugi odlomak' }] };

  it('arhivu otvara ZipReader i sadrzi sve obvezne dijelove', () => {
    const zip = openZip(buildDocxBytes(simple));
    const names = zip.names();
    expect(names).toContain('[Content_Types].xml');
    expect(names).toContain('_rels/.rels');
    expect(names).toContain('word/document.xml');
    expect(names).toContain('word/_rels/document.xml.rels');
    expect(names).toContain('word/styles.xml');
  });

  it('document.xml.rels povezuje styles.xml (bez relacije Word ignorira docDefaults)', async () => {
    const zip = openZip(buildDocxBytes(simple));
    const relsText = await zip.text('word/_rels/document.xml.rels');
    expect(relsText).toBeTruthy();
    const rels = parseXml(relsText, 'word/_rels/document.xml.rels');
    const styles = els(rels, 'Relationship').find(
      (r) => attr(r, 'Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
    );
    expect(styles).toBeTruthy();
    expect(attr(styles!, 'Target')).toBe('styles.xml');
  });

  it('styles.xml deklarira Times New Roman 12 (sz 24 pola-tocke) kao docDefault', async () => {
    const zip = openZip(buildDocxBytes(simple));
    const styles = parseXml(await zip.text('word/styles.xml'), 'word/styles.xml');
    const rFonts = first(styles, 'w:rFonts');
    expect(attr(rFonts, 'w:ascii')).toBe('Times New Roman');
    expect(attr(first(styles, 'w:sz'), 'w:val')).toBe('24');
  });

  it('document.xml se parsira i sadrzi tekst svih odlomaka', async () => {
    const doc = await readDocument(buildDocxBytes(simple));
    const texts = els(doc, 'w:p').map(paraText);
    expect(texts).toEqual(['Prvi odlomak', 'Drugi odlomak']);
  });

  it('[Content_Types].xml je valjan XML i deklarira document.xml', async () => {
    const zip = openZip(buildDocxBytes(simple));
    const ct = parseXml(await zip.text('[Content_Types].xml'), '[Content_Types].xml');
    const overrides = els(ct, 'Override');
    const main = overrides.find((o) => attr(o, 'PartName') === '/word/document.xml');
    expect(main).toBeTruthy();
    expect(attr(main!, 'ContentType')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );
  });

  it('XML znakovi u tekstu se escapiraju i vracaju identicni', async () => {
    const doc = await readDocument(
      buildDocxBytes({ paragraphs: [{ text: 'A & B < C > "D"' }] }),
    );
    expect(paraText(els(doc, 'w:p')[0])).toBe('A & B < C > "D"');
  });

  it('kontrolni znakovi (nevaljani u XML 1.0) se uklanjaju, dokument ostaje valjan', async () => {
    // \x00 i \x0C iz paste-a; tab/LF su valjani pa se cuvaju.
    const doc = await readDocument(
      buildDocxBytes({ paragraphs: [{ text: 'Ivic\x00 Ana\x0C Horvat' }] }),
    );
    expect(paraText(els(doc, 'w:p')[0])).toBe('Ivic Ana Horvat');
  });

  it('spacingBeforePt i spacingAfterPt postaju w:before i w:after u twipima (1 pt = 20)', async () => {
    const doc = await readDocument(
      buildDocxBytes({ paragraphs: [{ text: 'Razmaknut', spacingBeforePt: 12, spacingAfterPt: 6 }] }),
    );
    const sp = first(paraOf(doc, 'Razmaknut'), 'w:spacing');
    expect(attr(sp, 'w:before')).toBe('240');
    expect(attr(sp, 'w:after')).toBe('120');
  });

  it('pageBreakBefore emitira w:pageBreakBefore', async () => {
    const doc = await readDocument(
      buildDocxBytes({ paragraphs: [{ text: 'Bez preloma' }, { text: 'Nova stranica', pageBreakBefore: true }] }),
    );
    expect(first(paraOf(doc, 'Nova stranica'), 'w:pageBreakBefore')).toBeTruthy();
    expect(first(paraOf(doc, 'Bez preloma'), 'w:pageBreakBefore')).toBeNull();
  });

  it('indentHangingCm emitira w:ind s jednakim w:left i w:hanging', async () => {
    const doc = await readDocument(
      buildDocxBytes({ paragraphs: [{ text: 'Jedinica', indentHangingCm: 1.25 }] }),
    );
    const ind = first(paraOf(doc, 'Jedinica'), 'w:ind');
    expect(attr(ind, 'w:left')).toBe('709'); // 1,25 cm * 567 twipa
    expect(attr(ind, 'w:hanging')).toBe('709');
  });

  it('sizePt, bold, italic i font zavrsavaju u rPr', async () => {
    const doc = await readDocument(
      buildDocxBytes({
        paragraphs: [{ text: 'Formatiran', sizePt: 20, bold: true, italic: true, font: 'Arial' }],
      }),
    );
    const p = paraOf(doc, 'Formatiran');
    expect(attr(first(p, 'w:sz'), 'w:val')).toBe('40'); // pola-tocke
    expect(first(p, 'w:b')).toBeTruthy();
    expect(first(p, 'w:i')).toBeTruthy();
    expect(attr(first(p, 'w:rFonts'), 'w:ascii')).toBe('Arial');
  });

  it('sectPr ima zadani A4 pgSz i margine 2,5 cm u twipima', async () => {
    const doc = await readDocument(buildDocxBytes(simple));
    const pgSz = first(doc, 'w:pgSz');
    const pgMar = first(doc, 'w:pgMar');
    expect(attr(pgSz, 'w:w')).toBe(String(Math.round(21 * 567)));
    expect(attr(pgSz, 'w:h')).toBe(String(Math.round(29.7 * 567)));
    expect(attr(pgMar, 'w:top')).toBe(String(Math.round(2.5 * 567)));
    expect(attr(pgMar, 'w:left')).toBe(String(Math.round(2.5 * 567)));
  });

  it('docxBlob vraca Blob s ispravnim MIME tipom i sadrzajem', () => {
    const blob = docxBlob(simple);
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.size).toBe(buildDocxBytes(simple).length);
  });
});

describe('titlePageDoc: naslovnica iz TitlePageModel', () => {
  const model = buildTitlePage({
    university: 'Sveučilište u Zagrebu',
    faculty: 'Fakultet političkih znanosti',
    study: 'Diplomski studij politologije',
    author: 'Ana Anić',
    title: 'Politika i mediji',
    subtitle: 'Studija slučaja',
    workType: 'Diplomski rad',
    mentor: 'prof. dr. sc. Ivo Ivić',
    place: 'Zagreb',
    year: '2026',
  });

  it('sve linije modela su prisutne, svaka kao svoj odlomak, bez praznih odlomaka', async () => {
    const doc = await readDocument(buildDocxBytes(titlePageDoc(model)));
    const paras = els(doc, 'w:p');
    expect(paras.length).toBe(model.lines.length);
    for (const p of paras) expect(paraText(p).trim()).not.toBe('');
    for (const line of model.lines) expect(paraOf(doc, line.text)).toBeTruthy();
  });

  it('JMBAG i kolegij retci NE ispadaju iz genericke naslovnice (TITLE_GROUPS ih nosi)', async () => {
    // Regresija: genericka grana filtrira retke po TITLE_GROUPS popisima uloga; uloga koja
    // fali u popisu tiho bi nestala iz .docx-a iako je u modelu i pregledu.
    const withIds = buildTitlePage({
      university: 'Sveučilište u Zagrebu', study: 'Politologija', course: 'Metode istraživanja',
      author: 'Ana Anić', studentId: '0036512345', title: 'Naslov rada', place: 'Zagreb', year: '2026',
    });
    const doc = await readDocument(buildDocxBytes(titlePageDoc(withIds)));
    expect(els(doc, 'w:p').length).toBe(withIds.lines.length);
    expect(paraOf(doc, 'JMBAG: 0036512345')).toBeTruthy();
    expect(paraOf(doc, 'Kolegij: Metode istraživanja')).toBeTruthy();
  });

  it('naslov je centriran, bold i veci od retka ustanove', async () => {
    const doc = await readDocument(buildDocxBytes(titlePageDoc(model)));
    const title = paraOf(doc, 'Politika i mediji');
    expect(attr(first(title, 'w:jc'), 'w:val')).toBe('center');
    expect(first(title, 'w:b')).toBeTruthy();
    const titleSz = Number(attr(first(title, 'w:sz'), 'w:val'));
    const uniSz = Number(attr(first(paraOf(doc, 'Sveučilište u Zagrebu'), 'w:sz'), 'w:val'));
    expect(titleSz).toBeGreaterThan(uniSz);
  });

  it('svi retci naslovnice su centrirani', async () => {
    const doc = await readDocument(buildDocxBytes(titlePageDoc(model)));
    for (const p of els(doc, 'w:p')) {
      expect(attr(first(p, 'w:jc'), 'w:val')).toBe('center');
    }
  });

  it('skupine razdvaja w:spacing w:before na prvom retku skupine, ne prazni odlomci', async () => {
    const doc = await readDocument(buildDocxBytes(titlePageDoc(model)));
    // Prvi redak druge skupine (autor), trece skupine (mentor) i placeyear nose razmak.
    for (const text of ['Ana Anić', 'Mentor: prof. dr. sc. Ivo Ivić', 'Zagreb, 2026.']) {
      const before = Number(attr(first(paraOf(doc, text), 'w:spacing'), 'w:before'));
      expect(before).toBeGreaterThan(0);
    }
    // Prvi redak prve skupine nema razmak prije (vrh stranice).
    expect(first(paraOf(doc, 'Sveučilište u Zagrebu'), 'w:spacing')).toBeNull();
  });
});

describe('titlePageDoc s predloskom fakulteta', () => {
  const template: import('../src/title-pages/template-schema').TitlePageTemplate = {
    id: 'fpzg-doctoral',
    unitId: 'fpzg',
    level: 'doctoral',
    name: 'FPZG doktorski rad',
    provenance: { status: 'official', sourceIds: ['x'] },
    status: 'draft',
    marginsCm: { top: 3, right: 3, bottom: 3, left: 3 },
    defaultFont: 'Arial',
    elements: [
      { role: 'faculty', required: true, elementProvenance: 'official-rules', group: 0, sizePt: 16, uppercase: true },
      { role: 'author', required: true, elementProvenance: 'official-rules', group: 1, sizePt: 16 },
      { role: 'title', required: true, elementProvenance: 'official-rules', group: 1, sizePt: 22, bold: true },
      { role: 'placeyear', required: true, elementProvenance: 'official-rules', group: 2, sizePt: 14 },
    ],
  };
  const model = buildTitlePage(
    {
      faculty: 'Fakultet političkih znanosti',
      author: 'Ana Anić',
      title: 'Politika i mediji',
      place: 'Zagreb',
      year: '2026',
    },
    template,
  );

  it('poredak odlomaka = poredak elemenata predloska, font iz predloska (defaultFont fallback)', async () => {
    const doc = await readDocument(buildDocxBytes(titlePageDoc(model, template)));
    const texts = els(doc, 'w:p').map(paraText);
    expect(texts).toEqual([
      'Fakultet političkih znanosti', 'Ana Anić', 'Politika i mediji', 'Zagreb, 2026.',
    ]);
    for (const text of texts) {
      expect(attr(first(paraOf(doc, text), 'w:rFonts'), 'w:ascii')).toBe('Arial');
    }
    expect(attr(first(paraOf(doc, 'Politika i mediji'), 'w:sz'), 'w:val')).toBe('44');
  });

  it('w:caps nosi samo uppercase element; tekst ostaje netransformiran', async () => {
    const doc = await readDocument(buildDocxBytes(titlePageDoc(model, template)));
    expect(first(paraOf(doc, 'Fakultet političkih znanosti'), 'w:caps')).toBeTruthy();
    expect(first(paraOf(doc, 'Ana Anić'), 'w:caps')).toBeNull();
  });

  it('margine dolaze iz template.marginsCm', async () => {
    const doc = await readDocument(buildDocxBytes(titlePageDoc(model, template)));
    const pgMar = first(doc, 'w:pgMar');
    expect(attr(pgMar, 'w:top')).toBe(String(Math.round(3 * 567)));
    expect(attr(pgMar, 'w:left')).toBe(String(Math.round(3 * 567)));
  });

  it('razmak skupina na promjeni group vrijednosti, prvi redak bez razmaka', async () => {
    const doc = await readDocument(buildDocxBytes(titlePageDoc(model, template)));
    expect(first(paraOf(doc, 'Fakultet političkih znanosti'), 'w:spacing')).toBeNull();
    expect(Number(attr(first(paraOf(doc, 'Ana Anić'), 'w:spacing'), 'w:before'))).toBeGreaterThan(0);
    expect(first(paraOf(doc, 'Politika i mediji'), 'w:spacing')).toBeNull();
    expect(Number(attr(first(paraOf(doc, 'Zagreb, 2026.'), 'w:spacing'), 'w:before'))).toBeGreaterThan(0);
  });
});

describe('statementDoc: izjava iz StatementModel', () => {
  const model = buildStatement({
    author: 'Ana Anić',
    workType: 'Diplomski rad',
    title: 'Politika i mediji',
    place: 'Zagreb',
    date: '3. srpnja 2026.',
  });

  it('naslov je centriran i bold, tijelo justificirano', async () => {
    const doc = await readDocument(buildDocxBytes(statementDoc(model)));
    const heading = paraOf(doc, model.heading);
    expect(attr(first(heading, 'w:jc'), 'w:val')).toBe('center');
    expect(first(heading, 'w:b')).toBeTruthy();
    const body = paraOf(doc, model.body);
    expect(attr(first(body, 'w:jc'), 'w:val')).toBe('both');
  });

  it('potpisna linija i ime su poravnati desno, mjesto i datum prisutni', async () => {
    const doc = await readDocument(buildDocxBytes(statementDoc(model)));
    const line = els(doc, 'w:p').find((p) => /^_+$/.test(paraText(p)));
    expect(line).toBeTruthy();
    expect(attr(first(line!, 'w:jc'), 'w:val')).toBe('right');
    const name = paraOf(doc, model.signatureName);
    expect(attr(first(name, 'w:jc'), 'w:val')).toBe('right');
    expect(paraOf(doc, model.placeDate)).toBeTruthy();
  });

  it('bez mjesta/datuma i imena, potpisna linija se NE ispisuje (uskladeno s web pregledom)', async () => {
    // izjava-page.ts prikazuje potpisni blok samo uz (model.placeDate || model.signatureName);
    // .docx export mora vrijediti isto, inace prazan potpisni blok ispada samo u preuzetom fajlu.
    const empty = buildStatement({ author: '', workType: 'Diplomski rad', title: 'Naslov', place: '', date: '' });
    const doc = await readDocument(buildDocxBytes(statementDoc(empty)));
    const line = els(doc, 'w:p').find((p) => /^_+$/.test(paraText(p)));
    expect(line).toBeFalsy();
  });
});

describe('bibliographyDoc: popis literature', () => {
  const entries = [
    'Anić, A. (2024). Prva knjiga. Zagreb: Izdavač.',
    'Barić, B. (2023). Druga knjiga. Split: Izdavač.',
  ];

  it('svaka jedinica je zaseban odlomak s visecim uvlacenjem 1,25 cm', async () => {
    const doc = await readDocument(buildDocxBytes(bibliographyDoc(entries)));
    const paras = els(doc, 'w:p');
    expect(paras.length).toBe(entries.length + 1); // naslov + jedinice
    for (const entry of entries) {
      const ind = first(paraOf(doc, entry), 'w:ind');
      expect(attr(ind, 'w:left')).toBe('709');
      expect(attr(ind, 'w:hanging')).toBe('709');
    }
  });

  it('zadani naslov je Literatura, prilagodjeni se postuje, naslov nema uvlacenje', async () => {
    const zadani = await readDocument(buildDocxBytes(bibliographyDoc(entries)));
    const naslov = paraOf(zadani, 'Literatura');
    expect(first(naslov, 'w:b')).toBeTruthy();
    expect(first(naslov, 'w:ind')).toBeNull();

    const prilagodjeni = await readDocument(
      buildDocxBytes(bibliographyDoc(entries, 'Popis literature')),
    );
    expect(paraOf(prilagodjeni, 'Popis literature')).toBeTruthy();
  });

  it('prazne jedinice se preskacu', async () => {
    const doc = await readDocument(buildDocxBytes(bibliographyDoc(['', '  ', entries[0]])));
    expect(els(doc, 'w:p').length).toBe(2); // naslov + jedna stvarna jedinica
  });
});
