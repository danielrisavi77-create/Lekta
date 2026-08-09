import { describe, expect, it } from 'vitest';
import { applyFixers } from './apply-fixers';
import { anchorFingerprintForXml } from '../analysis/element-structure';
import { writeZip, readZip } from './zip-codec';

const documentXml = '<w:document><w:body>' +
  '<w:p><w:r><w:t>Uvod i Tablica 1.</w:t></w:r></w:p>' +
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
  '<w:p><w:r><w:t>Izvorni tekst.</w:t></w:r></w:p>' +
  '<w:sectPr/></w:body></w:document>';

function target() {
  const anchor = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
  return {
    id: 'element-table-test', kind: 'table' as const,
    anchor: { bodyChildIndex: 1, tableIndex: 0 },
    anchorFingerprint: anchorFingerprintForXml('table', anchor),
    description: 'Rezultati ankete', position: 'above' as const,
    replaceManualCaption: true, label: 'Tablica',
  };
}

async function docx() {
  const enc = new TextEncoder();
  return writeZip([
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/styles.xml', data: enc.encode('<w:styles><w:style w:styleId="Normal"/></w:styles>') },
  ]);
}

describe('element-caption-fixer', () => {
  it('umece SEQ natpis, Caption stil i cuva tablicu', async () => {
    const result = await applyFixers(await docx(), [{ fixerId: 'element-caption-fixer', ruleId: 'caption', params: { version: 1, elements: [target()], labels: { table: 'Tablica', figure: 'Slika', chart: 'Grafikon' }, lists: [{ kind: 'table', title: 'Popis tablica', placement: 'before-intro' }], references: [{ paragraphIndex: 1, start: 15, end: 16, elementId: 'element-table-test' }] } }]);
    expect(result.changelog).toHaveLength(1);
    const entries = await readZip(result.docxBytes);
    const xml = new TextDecoder().decode(entries.find((entry) => entry.name === 'word/document.xml')!.data);
    const styles = new TextDecoder().decode(entries.find((entry) => entry.name === 'word/styles.xml')!.data);
    // RE-58: broj vise NIJE SEQ polje nego obican tekst u sidru (vidi komentar uz fieldXml).
    expect(xml).not.toContain('SEQ Tablica');
    expect(xml).toContain('w:name="LektaCaption_element_table_test"');
    // Popis vise NIJE `TOC \c` polje: taj prekidac skuplja SEQ polja, a natpisi ih namjerno nemaju
    // (RE-58), pa je popis nakon Fields.Update() u Wordu bio PRAZAN, dok je provjera "Popisi slika
    // i tablica" svejedno davala bodove jer trazi samo naslov popisa. Sada je stavka staticna
    // (Lekta racuna broj, kao i u natpisu), a Word popunjava samo broj stranice preko PAGEREF na
    // vec postojece sidro oko broja.
    expect(xml).not.toContain('TOC \\h \\z \\c');
    expect(xml).toContain('Popis tablica');
    expect(xml).toContain('Tablica 1. Rezultati ankete');
    expect(xml).toContain('PAGEREF LektaCaption_element_table_test');
    expect(xml).toContain('REF LektaCaption_element_table_test');
    expect(xml).toContain('Rezultati ankete</w:t>');
    expect(xml).toContain('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t>');
    expect(styles).toContain('w:styleId="Caption"');
  });

  it('odbija promijenjeno sidro i druga primjena je already-ok', async () => {
    const params = { version: 1 as const, elements: [target()], labels: { table: 'Tablica' }, lists: [{ kind: 'table' as const, title: 'Popis tablica', placement: 'before-intro' as const }] };
    const first = await applyFixers(await docx(), [{ fixerId: 'element-caption-fixer', ruleId: 'caption', params }]);
    const second = await applyFixers(first.docxBytes, [{ fixerId: 'element-caption-fixer', ruleId: 'caption', params }]);
    expect(second.skippedReasons.caption).toBe('already-ok');
    expect(second.docxBytes).toEqual(first.docxBytes);
    const stale = { ...target(), anchorFingerprint: '00000000' };
    const rejected = await applyFixers(await docx(), [{ fixerId: 'element-caption-fixer', ruleId: 'caption', params: { version: 1, elements: [stale] } }]);
    expect(rejected.skippedReasons.caption).toBe('no-target');
  });
});

describe('element-caption-fixer: vidljivi tekst natpisa', () => {
  /**
   * RE-57. Oznaka i broj bili su odvojeni razmakom u `<w:t>` BEZ xml:space="preserve", pa ga XML
   * normalizacija odbaci kao rubni razmak. Word je natpis prikazivao kao "Tablica1." umjesto
   * "Tablica 1.". Nadjeno otvaranjem izlaza fixera pravim Wordom uz osvjezavanje polja; u samom
   * XML-u se ne vidi, jer je razmak fizicki zapisan.
   *
   * Test cita SPOJENI tekst odlomka, dakle ono sto korisnik vidi, a ne sirovi XML.
   */
  it('natpis zadrzava razmak izmedju oznake i broja', async () => {
    const result = await applyFixers(await docx(), [{
      fixerId: 'element-caption-fixer', ruleId: 'caption',
      params: { version: 1, elements: [target()], labels: { table: 'Tablica', figure: 'Slika', chart: 'Grafikon' } },
    }]);
    expect(result.changelog).toHaveLength(1);
    const entries = await readZip(result.docxBytes);
    const xml = new TextDecoder().decode(entries.find((entry) => entry.name === 'word/document.xml')!.data);

    const caption = xml.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*?LektaCaption_[\s\S]*?<\/w:p>/)?.[0] ?? '';
    expect(caption, 'natpis mora postojati').not.toBe('');
    const visible = [...caption.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join('');
    expect(visible).toBe('Tablica 1. Rezultati ankete');
    // Razmak prezivi samo uz izricito ocuvanje; bez njega Word prikaze "Tablica1.".
    expect(caption).toContain('<w:t xml:space="preserve">Tablica </w:t>');
  });
});

describe('element-caption-fixer: unakrsna uputa u recenici', () => {
  /**
   * RE-58. Sidro je oko BROJA, i broj je obican tekst, pa REF u recenicu vrati samo broj i
   * sklonjena oznaka ostaje autorova. Dokazano pravim Wordom uz Fields.Update(): recenica je
   * prije i poslije osvjezavanja ZNAK PO ZNAK ista, a broj je postao ziva uputa sa skokom.
   *
   * RE-57 na drugom mjestu: ostatak runa oko polja ("...u Tablici ") zavrsava razmakom, pa i on
   * mora ici u <w:t xml:space="preserve">; bez toga Word prikaze "u Tablici1".
   */
  const documentWithSentence = '<w:document><w:body>' +
    '<w:p><w:r><w:t>Rezultati su prikazani u Tablici 1, a metoda slijedi.</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:sectPr/></w:body></w:document>';

  it('polje zamjenjuje SAMO broj i cuva razmake oko sebe', async () => {
    const enc = new TextEncoder();
    const bytes = await writeZip([
      { name: 'word/document.xml', data: enc.encode(documentWithSentence) },
      { name: 'word/styles.xml', data: enc.encode('<w:styles><w:style w:styleId="Normal"/></w:styles>') },
    ]);
    const anchor = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const start = 'Rezultati su prikazani u Tablici '.length;
    const result = await applyFixers(bytes, [{
      fixerId: 'element-caption-fixer', ruleId: 'caption',
      params: {
        version: 1,
        elements: [{
          id: 'element-table-test', kind: 'table' as const,
          anchor: { bodyChildIndex: 1, tableIndex: 0 },
          anchorFingerprint: anchorFingerprintForXml('table', anchor),
          description: 'Pregled', position: 'above' as const, replaceManualCaption: true, label: 'Tablica',
        }],
        labels: { table: 'Tablica', figure: 'Slika', chart: 'Grafikon' },
        references: [{ paragraphIndex: 1, start, end: start + 1, elementId: 'element-table-test' }],
      },
    }]);
    expect(result.changelog).toHaveLength(1);
    const xml = new TextDecoder().decode(
      (await readZip(result.docxBytes)).find((entry) => entry.name === 'word/document.xml')!.data,
    );

    const sentence = xml.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*?Rezultati[\s\S]*?<\/w:p>/)?.[0] ?? '';
    expect(sentence, 'recenica mora postojati').not.toBe('');
    // Vidljivi tekst mora ostati IDENTICAN izvorniku: mijenja se samo mehanika ispod.
    const visible = [...sentence.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join('');
    expect(visible).toBe('Rezultati su prikazani u Tablici 1, a metoda slijedi.');
    // Sklonjena oznaka ostaje IZVAN polja, u obicnom tekstu.
    expect(sentence).toContain('<w:t xml:space="preserve">Rezultati su prikazani u Tablici </w:t>');
    expect(sentence).toContain('REF LektaCaption_element_table_test');
    // Unutar polja je samo broj.
    expect(sentence).toMatch(/fldCharType="separate"\/><\/w:r><w:r><w:t>1<\/w:t>/);
  });
});

describe('element-caption-fixer: popis mora imati stavke', () => {
  it('bez ijednog natpisa te vrste popis se NE umece (prazan naslov je bio cijeli kvar)', async () => {
    // Trazi se popis SLIKA, a dokument ima samo tablicu: prije bi se umetnuo naslov "Popis slika"
    // s TOC poljem koje nista ne skuplja, provjera bi ga priznala, a u Wordu bi ostao prazan.
    const result = await applyFixers(await docx(), [{
      fixerId: 'element-caption-fixer', ruleId: 'caption',
      params: { version: 1, elements: [target()], labels: { table: 'Tablica', figure: 'Slika' }, lists: [{ kind: 'figure', title: 'Popis slika', placement: 'before-intro' }] },
    }]);
    const entries = await readZip(result.docxBytes);
    const xml = new TextDecoder().decode(entries.find((entry) => entry.name === 'word/document.xml')!.data);
    expect(xml).not.toContain('Popis slika');
  });

  it('svaka stavka popisa nosi sidro na svoj natpis, pa broj stranice nije izmisljen', async () => {
    const result = await applyFixers(await docx(), [{
      fixerId: 'element-caption-fixer', ruleId: 'caption',
      params: { version: 1, elements: [target()], labels: { table: 'Tablica' }, lists: [{ kind: 'table', title: 'Popis tablica', placement: 'before-intro' }] },
    }]);
    const entries = await readZip(result.docxBytes);
    const xml = new TextDecoder().decode(entries.find((entry) => entry.name === 'word/document.xml')!.data);
    const bookmarks = [...xml.matchAll(/w:name="(LektaCaption_[A-Za-z0-9_]+)"/g)].map((m) => m[1]);
    const pagerefs = [...xml.matchAll(/PAGEREF (LektaCaption_[A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(pagerefs.length).toBeGreaterThan(0);
    for (const ref of pagerefs) expect(bookmarks).toContain(ref);
  });
});
