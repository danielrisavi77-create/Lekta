/**
 * Ulazne granice popravka koje su do 2026-08-17 nedostajale (audit DOCX-14, DOCX-19).
 *
 * Zajednicko im je da je ulaz koji ih probija PROLAZIO, i to tiho:
 *
 *   - `params` je imao ogranicen BROJ zahtjeva (64), ali ne i sadrzaj. Jedan zahtjev mogao je
 *     nositi niz od desetaka tisuca indeksa i natjerati fixer na isto toliko prolaza kroz
 *     dokument, a da nijedna granica ne reagira.
 *   - ZIP64 paket ima broj zapisa i offsete zamijenjene sentinelima (0xffff / 0xffffffff), a
 *     prave vrijednosti u zasebnom zapisu koji ovaj citac ne cita. Bez provjere bi sentinel bio
 *     uzet kao stvarna vrijednost i citanje bi krenulo s besmislenog offseta.
 *   - Sifriran zapis se inflate-om ne raspadne nuzno, nego moze dati smece. CRC bi ga uhvatio,
 *     ali s porukom "dokument je ostecen", sto korisnika salje u krivom smjeru: dokument
 *     zasticen lozinkom nije ostecen, samo nije obradiv.
 */
import { describe, it, expect } from 'vitest';
import {
  paramsWithinBudget,
  REPAIR_MAX_PARAM_ARRAY_LENGTH,
  REPAIR_MAX_PARAMS_BYTES,
} from '../src/repair/docx-budget';
import { readZip, writeZip } from '../src/repair/zip-codec';

describe('paramsWithinBudget', () => {
  it('propusta stvarne recepte (mali objekti)', () => {
    expect(paramsWithinBudget({ fontName: 'Times New Roman', deep: true })).toEqual({ ok: true });
    expect(paramsWithinBudget({ elements: [1, 2, 3], entries: [{ id: 'a' }] })).toEqual({ ok: true });
    expect(paramsWithinBudget({})).toEqual({ ok: true });
    expect(paramsWithinBudget(undefined)).toEqual({ ok: true });
  });

  it('odbija predugacak niz, i kad je serijalizirano malo', () => {
    const params = { elements: Array.from({ length: REPAIR_MAX_PARAM_ARRAY_LENGTH + 1 }, (_, i) => i) };
    expect(paramsWithinBudget(params)).toEqual({ ok: false, reason: 'params-array-too-long' });
  });

  /**
   * Niz je namjerno tek malo preko granice i od KRATKIH brojeva, da serijalizirana velicina
   * ostane ispod bajtne granice. Inace bi se okinula bajtna provjera i test bi dokazivao nesto
   * drugo od onoga sto tvrdi (dubinsko pretrazivanje).
   */
  it('nalazi predugacak niz i UGNIJEZDJEN, ne samo na prvoj razini', () => {
    const ids = Array.from({ length: REPAIR_MAX_PARAM_ARRAY_LENGTH + 1 }, (_, i) => i % 10);
    const params = { plan: { steps: [{ meta: { ids } }] } };
    expect(JSON.stringify(params).length).toBeLessThan(REPAIR_MAX_PARAMS_BYTES);
    expect(paramsWithinBudget(params)).toEqual({ ok: false, reason: 'params-array-too-long' });
  });

  it('odbija prevelik serijalizirani sadrzaj', () => {
    const params = { canonicalText: 'x'.repeat(REPAIR_MAX_PARAMS_BYTES + 1) };
    expect(paramsWithinBudget(params)).toEqual({ ok: false, reason: 'params-too-large' });
  });

  it('ciklicka struktura se tretira kao prekoracenje, ne kao ispravan ulaz', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(paramsWithinBudget(cyclic)).toEqual({ ok: false, reason: 'params-too-large' });
  });

  it('granica je tocno na rubu, ne priblizno', () => {
    const exact = { elements: Array.from({ length: REPAIR_MAX_PARAM_ARRAY_LENGTH }, (_, i) => i) };
    expect(paramsWithinBudget(exact)).toEqual({ ok: true });
  });
});

describe('readZip odbija formate koje ne moze pouzdano obraditi', () => {
  /** Napravi valjan mali zip pa mu u EOCD-u postavi ZIP64 sentinel za broj zapisa. */
  async function withZip64Sentinel(): Promise<Uint8Array> {
    const bytes = await writeZip([{ name: 'a.xml', data: new TextEncoder().encode('<a/>') }]);
    const copy = bytes.slice();
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    // EOCD je na kraju (bez komentara): 22 bajta. totalEntries je na +10.
    const eocd = copy.length - 22;
    view.setUint16(eocd + 10, 0xffff, true);
    return copy;
  }

  /** Postavi bit 0 general purpose zastavice u central directory zapisu (= sifriran sadrzaj). */
  async function withEncryptedFlag(): Promise<Uint8Array> {
    const bytes = await writeZip([{ name: 'a.xml', data: new TextEncoder().encode('<a/>') }]);
    const copy = bytes.slice();
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    const eocd = copy.length - 22;
    const centralDirOffset = view.getUint32(eocd + 16, true);
    view.setUint16(centralDirOffset + 8, view.getUint16(centralDirOffset + 8, true) | 0x0001, true);
    return copy;
  }

  it('ZIP64 sentinel se odbija s prepoznatljivom porukom, ne s nejasnom greskom o potpisu', async () => {
    await expect(readZip(await withZip64Sentinel())).rejects.toThrow(/ZIP64/i);
  });

  it('paket zasticen lozinkom se odbija kao ZASTICEN, ne kao ostecen', async () => {
    await expect(readZip(await withEncryptedFlag())).rejects.toThrow(/lozink|sifrir/i);
  });

  it('obican paket i dalje prolazi (granice ne pogadjaju ispravan ulaz)', async () => {
    const ok = await writeZip([{ name: 'word/document.xml', data: new TextEncoder().encode('<w:document/>') }]);
    const entries = await readZip(ok);
    expect(entries.map((e) => e.name)).toEqual(['word/document.xml']);
  });
});
