/**
 * BINARNI OBLIK ODGOVORA POPRAVKA (audit DOCX-05).
 *
 * Odgovor je do 2026-08-18 bio JSON s `docxBase64`. Za dokument od 20 MB to znaci, u istom
 * trenutku: ulazne bajtove, rezultat, base64 string (~27 MB) i JOS jednu njegovu kopiju unutar
 * `JSON.stringify` (~27 MB). Edge runtime ima 256 MB, pa je peak bio visestruko veci od same
 * datoteke bez ijednog razloga.
 *
 * Okvir (duljina + JSON metapodaci + sirovi bajtovi) brise obje kopije stringova.
 *
 * Test drzi tri stvari:
 *   1. okvir je round-trip tocan, ukljucujuci bajtove koji nisu valjan UTF-8 (docx JEST binaran);
 *   2. krnji ili besmislen okvir se ODBIJA umjesto da se "nekako" protumaci, jer bi djelomicno
 *      protumacen okvir zavrsio kao ostecen .docx u korisnikovim rukama;
 *   3. dokument se ne dijeli s ulaznim bufferom (inace bi mali rezultat drzao zivim cijelo tijelo).
 */
import { describe, it, expect } from 'vitest';
import {
  encodeRepairFrame,
  decodeRepairFrame,
  REPAIR_BINARY_CONTENT_TYPE,
  REPAIR_BINARY_REQUEST_HEADER,
  REPAIR_BINARY_REQUEST_VALUE,
} from '../src/report/repair-framing';

/** Bajtovi koji NISU valjan UTF-8: docx je zip, pa okvir mora podnijeti bilo koji bajt. */
const BINARY = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x80, 0x7f, 0x00, 0xc3]);

describe('okvir odgovora popravka', () => {
  it('round-trip cuva metapodatke i bajtove tocno', () => {
    const meta = { fileName: 'rad-popravljeno.docx', changelog: [{ before: 'a', after: 'b' }], jobId: null };
    const frame = encodeRepairFrame(meta, BINARY);
    const out = decodeRepairFrame<typeof meta>(frame);
    expect(out.meta).toEqual(meta);
    expect(Array.from(out.docxBytes)).toEqual(Array.from(BINARY));
  });

  it('podnosi prazan dokument i prazne metapodatke', () => {
    const out = decodeRepairFrame(encodeRepairFrame({}, new Uint8Array()));
    expect(out.meta).toEqual({});
    expect(out.docxBytes.length).toBe(0);
  });

  it('podnosi dijakritiku u metapodacima (UTF-8, ne latin-1)', () => {
    const meta = { fileName: 'završni-rad-popravljeno.docx', poruka: 'čćšđž' };
    const out = decodeRepairFrame<typeof meta>(encodeRepairFrame(meta, BINARY));
    expect(out.meta.fileName).toBe('završni-rad-popravljeno.docx');
    expect(out.meta.poruka).toBe('čćšđž');
  });

  /**
   * Dokument mora biti NEOVISAN o ulaznom bufferu. Da se vraca `subarray`, zadrzavanje malog
   * rezultata drzalo bi zivim cijelo tijelo odgovora, pa bi popravak "rijesio" memoriju samo
   * dok netko ne spremi rezultat.
   */
  it('vraceni dokument ne dijeli buffer s tijelom odgovora', () => {
    const frame = encodeRepairFrame({ a: 1 }, BINARY);
    const out = decodeRepairFrame(frame);
    expect(out.docxBytes.buffer).not.toBe(frame.buffer);
    frame.fill(0);
    expect(Array.from(out.docxBytes)).toEqual(Array.from(BINARY));
  });

  describe('neispravan okvir se odbija, ne nagadja', () => {
    it('tijelo krace od zaglavlja', () => {
      expect(() => decodeRepairFrame(new Uint8Array([1, 2]))).toThrow(/krace od zaglavlja/i);
    });

    it('duljina metapodataka veca od tijela (krnji odgovor)', () => {
      const frame = encodeRepairFrame({ a: 1 }, BINARY);
      new DataView(frame.buffer).setUint32(0, frame.length + 100, true);
      expect(() => decodeRepairFrame(frame)).toThrow(/krnji|prelaze/i);
    });

    it('besmisleno velika duljina se odbija prije alokacije', () => {
      const frame = new Uint8Array(64);
      new DataView(frame.buffer).setUint32(0, 0xfffffff0, true);
      expect(() => decodeRepairFrame(frame)).toThrow(/iznad dopustenog/i);
    });

    it('metapodaci koji nisu JSON', () => {
      const bad = new TextEncoder().encode('{ovo nije json');
      const frame = new Uint8Array(4 + bad.length);
      new DataView(frame.buffer).setUint32(0, bad.length, true);
      frame.set(bad, 4);
      expect(() => decodeRepairFrame(frame)).toThrow(/nisu valjan JSON/i);
    });
  });

  it('konstante zaglavlja su stabilne (klijent i server ih moraju dijeliti)', () => {
    expect(REPAIR_BINARY_REQUEST_HEADER).toBe('X-Lekta-Response');
    expect(REPAIR_BINARY_REQUEST_VALUE).toBe('binary');
    expect(REPAIR_BINARY_CONTENT_TYPE).toBe('application/x-lekta-repair');
  });

  /**
   * Mjeri ono zbog cega izmjena postoji: okvir NE smije nositi base64 rezije. Za 1 MB dokumenta
   * base64 JSON bi bio ~1,33 MB samo za sadrzaj, plus jos jedna kopija pri serijalizaciji.
   */
  it('okvir je velicine dokumenta + metapodaci, bez 33% base64 rezije', () => {
    const big = new Uint8Array(1024 * 1024).fill(0x41);
    const frame = encodeRepairFrame({ fileName: 'x.docx' }, big);
    expect(frame.length).toBeLessThan(big.length + 1024);
    // Zatecen oblik bi bio barem 4/3 velicine; okvir mora biti bitno ispod toga.
    expect(frame.length).toBeLessThan(Math.floor(big.length * 4 / 3));
  });
});
