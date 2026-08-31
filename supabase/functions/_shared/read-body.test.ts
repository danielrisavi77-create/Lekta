import { describe, it, expect } from 'vitest';
import { readTextBounded } from './read-body';

/**
 * Audit P1-04 / P1-06: granica tijela mora vrijediti i kad klijent LAZE ili sUTI o duljini.
 *
 * Prvi test u svakom paru dokazuje da provjera GRIZE (tijelo prolazi granicu, zahtjev je odbijen),
 * a ne samo da uredan slucaj prolazi. Obrnut redoslijed je ono sto je staru provjeru i pustilo
 * zivjeti: `content-length` na urednom prometu uvijek postoji i uvijek je tocan, pa je izgledala
 * ispravno dok god je nitko nije napao.
 */

/** Zahtjev BEZ `content-length` zaglavlja: tijelo dolazi kao stream, tocno kao kod chunkeda. */
function streamingRequest(payload: Uint8Array, chunkSize = 1024): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < payload.byteLength; i += chunkSize) {
        controller.enqueue(payload.subarray(i, Math.min(i + chunkSize, payload.byteLength)));
      }
      controller.close();
    },
  });
  return new Request('https://lekta.test/fn', {
    method: 'POST',
    body: stream,
    // @ts-expect-error duplex je obavezan za stream tijelo, ali ga TS lib jos ne opisuje
    duplex: 'half',
  });
}

/**
 * Zahtjev s KONTROLIRANIM `content-length` zaglavljem.
 *
 * `content-length` je u Fetch specifikaciji zabranjeno zaglavlje (forbidden header name): pri
 * `new Request(..., { headers })` preglednik i Deno ga TIHO ODBACE, pa se lazno ni posteno
 * zaglavlje kroz pravi Request uopce ne da postaviti. Na zici ga naravno ima, jer ga ondje pise
 * posiljatelj, ne mi. Zato ovdje slazemo minimalan objekt s onim dvjema stvarima koje
 * `readTextBounded` cita: `headers` i `body`. Samostalan `new Headers()` nema guard, pa prima i
 * zabranjena imena.
 */
function requestWithLength(payload: Uint8Array, declared: string, chunkSize = 1024): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < payload.byteLength; i += chunkSize) {
        controller.enqueue(payload.subarray(i, Math.min(i + chunkSize, payload.byteLength)));
      }
      controller.close();
    },
  });
  const headers = new Headers();
  headers.set('content-length', declared);
  return { headers, body: stream } as unknown as Request;
}

const MAX = 4 * 1024;

describe('readTextBounded', () => {
  it('odbija tijelo iznad granice i kad `content-length` UOPCE NE POSTOJI', async () => {
    const payload = new TextEncoder().encode('x'.repeat(MAX * 4));
    const req = streamingRequest(payload);
    expect(req.headers.get('content-length')).toBeNull();

    const out = await readTextBounded(req, MAX);
    expect(out).toEqual({ ok: false, reason: 'too_large' });
  });

  it('odbija tijelo iznad granice i kad `content-length` LAZE da je malo', async () => {
    const payload = new TextEncoder().encode('y'.repeat(MAX * 4));
    const req = requestWithLength(payload, '10');
    expect(req.headers.get('content-length')).toBe('10');

    const out = await readTextBounded(req, MAX);
    expect(out).toEqual({ ok: false, reason: 'too_large' });
  });

  it('odbija rano, bez ijednog citanja, kad zaglavlje posteno prizna prekoracenje', async () => {
    // Ne mjerimo `pull` (ReadableStream ga zove vec pri konstrukciji, da napuni red), nego to je
    // li itko uopce uzeo reader: rano odbijanje smije proci bez diranja izvora.
    let readerUzet = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(8)); controller.close(); },
    });
    const spy = new Proxy(stream, {
      get(target, prop, receiver) {
        if (prop === 'getReader') { readerUzet = true; }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const headers = new Headers();
    headers.set('content-length', String(MAX * 10));
    const req = { headers, body: spy } as unknown as Request;

    const out = await readTextBounded(req, MAX);
    expect(out).toEqual({ ok: false, reason: 'too_large' });
    expect(readerUzet).toBe(false);
    expect(stream.locked).toBe(false);
  });

  it('propusta tijelo TOCNO na granici (granica je strogo vece)', async () => {
    const payload = new TextEncoder().encode('z'.repeat(MAX));
    const out = await readTextBounded(streamingRequest(payload), MAX);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.text.length).toBe(MAX);
  });

  it('vraca uredan JSON tekst za normalan zahtjev', async () => {
    const body = JSON.stringify({ references: [{ title: 'Nešto', year: 2020 }] });
    const req = new Request('https://lekta.test/fn', { method: 'POST', body });

    const out = await readTextBounded(req, MAX);
    expect(out.ok).toBe(true);
    if (out.ok) expect(JSON.parse(out.text).references[0].title).toBe('Nešto');
  });

  it('ne lomi viseoktetni znak koji padne preko granice dva chunka', async () => {
    // "š" je 0xC5 0xA1: uz chunkSize 1 svaki bajt stize zasebno.
    const tekst = 'čćžšđ ' .repeat(50);
    const payload = new TextEncoder().encode(tekst);
    const out = await readTextBounded(streamingRequest(payload, 1), MAX);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.text).toBe(tekst);
  });

  it('mjeri BAJTOVE, ne znakove', async () => {
    // 3 znaka x 2 bajta = 6 bajtova; granica 5 mora odbiti.
    const payload = new TextEncoder().encode('ššš');
    expect(payload.byteLength).toBe(6);
    const out = await readTextBounded(streamingRequest(payload, 1), 5);
    expect(out).toEqual({ ok: false, reason: 'too_large' });
  });

  it('prazno tijelo nije greska ovog sloja', async () => {
    const req = new Request('https://lekta.test/fn', { method: 'POST' });
    const out = await readTextBounded(req, MAX);
    expect(out).toEqual({ ok: true, text: '' });
  });
});
