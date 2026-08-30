/**
 * Sigurnosni testovi parsera (obrana od zlonamjernog .docx):
 *  - dekompresijska bomba: deklarirana velicina iznad granice i "lazljiva" bomba (mala
 *    deklarirana velicina, golem stvarni izlaz) moraju biti odbijene s ZipLimitError;
 *  - valjan deflate zapis se i dalje ispravno cita (cap ne lomi legitimne datoteke);
 *  - parseXml odbija ulaz s <!DOCTYPE (billion laughs defense-in-depth).
 */
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { ZipReader, ZipLimitError, parseXml, MAX_DECOMPRESSED_BYTES } from '../src/docx/parser';

function u16(v: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }
function u32(v: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; }

/** Minimalni ZIP s jednim deflate-raw (metoda 8) zapisom; declaredUncomp se moze lagati.
 *  CRC se ne provjerava u ZipReaderu pa je 0. */
function makeDeflateZip(name: string, payload: Buffer, declaredUncomp?: number): ArrayBuffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const comp = deflateRawSync(payload);
  const uncomp = declaredUncomp ?? payload.length;
  const local = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0x21),
    u32(0), u32(comp.length), u32(uncomp),
    u16(nameBuf.length), u16(0), nameBuf, comp,
  ]);
  const central = Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0x21),
    u32(0), u32(comp.length), u32(uncomp),
    u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0),
    nameBuf,
  ]);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(1), u16(1),
    u32(central.length), u32(local.length), u16(0),
  ]);
  const buf = Buffer.concat([local, central, eocd]);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('ZipReader: obrana od dekompresijske bombe', () => {
  it('valjan deflate zapis se ispravno cita (cap ne lomi legitimne datoteke)', async () => {
    const zip = new ZipReader(makeDeflateZip('word/document.xml', Buffer.from('bok svijete', 'utf8')));
    expect(await zip.text('word/document.xml')).toBe('bok svijete');
  });

  it('deklarirana velicina iznad granice = odbijeno prije dekompresije', async () => {
    const zip = new ZipReader(
      makeDeflateZip('a.xml', Buffer.from('x'.repeat(4000)), 10_000_000),
      { maxDecompressedBytes: 1024 },
    );
    await expect(zip.data('a.xml')).rejects.toBeInstanceOf(ZipLimitError);
  });

  it('lazljiva bomba (mala deklarirana, golem stvarni izlaz) = odbijena streaming capom', async () => {
    // deklarirano 10 bajtova, stvarno 50 000 -> pred-filtar prolazi, streaming cap prekida
    const zip = new ZipReader(
      makeDeflateZip('a.xml', Buffer.from('A'.repeat(50_000)), 10),
      { maxDecompressedBytes: 1024 },
    );
    await expect(zip.data('a.xml')).rejects.toBeInstanceOf(ZipLimitError);
  });

  it('granica je razumno visoka za realan diplomski (>= 100 MB)', () => {
    expect(MAX_DECOMPRESSED_BYTES).toBeGreaterThanOrEqual(100 * 1024 * 1024);
  });
});

describe('parseXml: odbijanje DTD-a (billion laughs)', () => {
  it('odbija <!DOCTYPE prije parsiranja', () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaa">]><r>&a;</r>';
    expect(() => parseXml(evil, 'test')).toThrow(/DTD/i);
  });

  it('parsira normalan XML bez DTD-a', () => {
    const doc = parseXml('<Properties><Pages>5</Pages></Properties>', 'test');
    expect(doc.getElementsByTagName('Pages')[0]?.textContent).toBe('5');
  });
});

/**
 * Ulaz koji je motivirao nadogradnju `@xmldom/xmldom` 0.9.10 -> 0.9.12.
 *
 * VAZNO: meta su tocno one ranjivosti koje su dosezive iz `DOMParser.parseFromString` uz ZADANE
 * opcije, dakle onako kako ih Lekta stvarno zove. To su popravci iz 0.9.12, ne 0.9.11:
 *
 *  - GHSA-965w-775f-mr7g: kvadratna MEMORIJA na duboko/ponovljeno imenovanom prostoru. DOCX je
 *    gusto namespacean (w:, r:, wp:, a:), pa je to doslovno oblik ulaza koji alat prima.
 *  - GHSA-8344-3jmq-59r6: deduplikacija atributa O(M^2); neprijateljski broj duplih atributa
 *    zaglavi parsiranje.
 *  - GHSA-93r5-fhx6-vmg9: oporavak od neispravnog ulaza kvadratan umjesto linearan (skeniranje
 *    imena zaustavlja se na ugnijezdjenom `<`).
 *
 * 0.9.11 popravlja SAMO serijalizator uz `{ requireWellFormed: true }` (GHSA-w2rr-34g9-rvrj,
 * GHSA-4w3w-2rp5-g8jm), sto je put koji ovaj repozitorij ne koristi. Zaustavljanje na 0.9.11 ne bi
 * zatvorilo nijedan od tri gornja kvara.
 *
 * MJERI SE VRIJEME, NE ISHOD. `parseXml` odbija samo DTD i `parsererror`, a xmldom na neispravnom
 * XML-u uredno vraca dokument (isto upozorenje stoji u CLAUDE.md). Tvrdnja "baca" bila bi lazno
 * zelena; kvadratno ponasanje obara tvrdnja "zavrsi u ogranicenom vremenu".
 *
 * DOKAZ DA GARD GRIZE (izmjereno 2026-08-30, ne pretpostavljeno): uz `@xmldom/xmldom` vracen na
 * 0.9.10 tvrdnja o namespaceovima PADA na 8207 ms protiv granice od 5000 ms; na 0.9.12 prolazi.
 *
 * POSTENO O OPSEGU: od pet tvrdnji ovdje SAMO ta jedna stvarno razlikuje 0.9.10 od 0.9.12 pri ovim
 * velicinama. Preostale cetiri prolaze na OBJE verzije i stoje kao regresijski prag za ubuduce
 * (duplikati atributa, oporavak od neispravnog imena, ostecen PI), ne kao dokaz ovog popravka.
 * Tko im pojaca velicine, neka ponovno izmjeri obje verzije prije nego tvrdi da grizu.
 */
describe('@xmldom/xmldom: neprijateljski ulaz zavrsava u ogranicenom vremenu', () => {
  const BUDGET_MS = 5000;

  function elapsed(run: () => void): number {
    const started = Date.now();
    try {
      run();
    } catch {
      // Odbijanje je uredan ishod; mjeri se iskljucivo vrijeme do zavrsetka.
    }
    return Date.now() - started;
  }

  it('KONTROLA: benigni dokument usporedive velicine je daleko unutar granice', () => {
    // Bez kontrole granica ne znaci nista: spor stroj bi obarao i posve zdrav parser.
    const benign = `<r>${'<c>tekst</c>'.repeat(3000)}</r>`;
    const ms = elapsed(() => parseXml(benign, 'test'));
    expect(ms, `benigni dokument trajao ${ms} ms`).toBeLessThan(BUDGET_MS);
  });

  it('duboko ponovljen namespace ne trosi kvadratnu memoriju (GHSA-965w-775f-mr7g)', () => {
    // Svaki element deklarira VLASTITI prefiks: prije popravka se mapa prefiksa kopirala za svaki.
    const depth = 3000;
    const open = Array.from({ length: depth }, (_, i) => `<p${i}:e xmlns:p${i}="urn:x${i}">`).join('');
    const close = Array.from({ length: depth }, (_, i) => `</p${depth - 1 - i}:e>`).join('');
    const ms = elapsed(() => parseXml(`${open}${close}`, 'test'));
    expect(ms, `${depth} ugnijezdjenih namespace deklaracija trajalo ${ms} ms`).toBeLessThan(BUDGET_MS);
  });

  it('neprijateljski broj duplih atributa ne zaglavi parsiranje (GHSA-8344-3jmq-59r6)', () => {
    const attrs = Array.from({ length: 5000 }, () => 'a="1"').join(' ');
    const ms = elapsed(() => parseXml(`<r ${attrs}/>`, 'test'));
    expect(ms, `5000 duplih atributa trajalo ${ms} ms`).toBeLessThan(BUDGET_MS);
  });

  it('oporavak od neispravnog imena je linearan (GHSA-93r5-fhx6-vmg9)', () => {
    // Skeniranje imena mora stati na ugnijezdjenom `<`, inace backtracka kvadratno.
    const hostile = `<${'a'.repeat(40_000)}<b>x</b>`;
    const ms = elapsed(() => parseXml(hostile, 'test'));
    expect(ms, `neispravno ime od 40k znakova trajalo ${ms} ms`).toBeLessThan(BUDGET_MS);
  });

  it('ostecena processing instruction i nevaljana imena zavrsavaju', () => {
    for (const bad of [`<?${'a'.repeat(20_000)}`, '<1neispravno>x</1neispravno>', '<a<b>x</a<b>']) {
      const ms = elapsed(() => parseXml(bad, 'test'));
      expect(ms, `ulaz (${bad.slice(0, 12)}) trajao ${ms} ms`).toBeLessThan(BUDGET_MS);
    }
  });
});
