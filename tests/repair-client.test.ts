import { encodeRepairFrame } from '../src/report/repair-framing';
import { describe, it, expect } from 'vitest';

import {
  decodeBase64,
  buildRepairMeta,
  uploadRepair,
  REPAIR_MAX_REFERENCES,
  type RepairMeta,
} from '../src/report/repair-client';
import { TERMS_VERSION } from '../src/legal/legal-content';

const config = { endpoint: 'https://edge/repair-docx' };

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function b64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function meta(over: Partial<RepairMeta> = {}): RepairMeta {
  return {
    workType: 'diplomski',
    signals: { words: 12000, titleMarker: 'graduate' },
    requests: [{ fixerId: 'font-fixer', ruleId: 'font', params: { fontName: 'Times New Roman' } }],
    fileName: 'moj-rad.docx',
    consentVersion: TERMS_VERSION,
    ...over,
  };
}

describe('decodeBase64', () => {
  it('round-trip poznatih bajtova', () => {
    const bytes = [0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x7f];
    expect(Array.from(decodeBase64(b64(bytes)))).toEqual(bytes);
  });
  it('prazan string -> prazan niz', () => {
    expect(decodeBase64('').length).toBe(0);
  });
});

describe('buildRepairMeta (sanitizacija)', () => {
  const requests = [{ fixerId: 'font-fixer', ruleId: 'font', params: {} }];

  it('mapira nepoznatu vrstu rada u zavrsni (fallback)', () => {
    expect(buildRepairMeta({ workType: 'nesto', requests }).workType).toBe('zavrsni');
  });
  it('zadrzava valjanu naplatnu vrstu', () => {
    expect(buildRepairMeta({ workType: 'doktorski', requests }).workType).toBe('doktorski');
  });

  /**
   * OCEKIVANJE OBRNUTO 2026-08-17 (audit DOCX-01/02). Ranija verzija ovog testa TVRDILA je da
   * meta nosi `parsedStructure`, dakle naslov, autora i naslove poglavlja. Naslovi poglavlja su
   * doslovan tekst rada, a server ih je koristio samo kao presence-check: otisak se racuna iz
   * bajtova uploadanog zipa (RE-18). Polje je zato uklonjeno i ovaj test sada cuva da se NE
   * vrati, jer bi povratak bio tihi regres u privatnosti koji nista ne bi srusilo.
   */
  it('ne salje naslov, autora ni naslove poglavlja', () => {
    const m = buildRepairMeta({ workType: 'diplomski', requests, words: 9000, titleMarker: 'graduate' });
    expect('parsedStructure' in m).toBe(false);
    expect(m.signals).toEqual({ words: 9000, titleMarker: 'graduate' });
    const flat = JSON.stringify(m);
    expect(flat).not.toMatch(/paragraph|excerpt|fullText|headings|title"|author/i);
  });
  it('izostavlja opcijska polja kad ih nema', () => {
    const m = buildRepairMeta({ workType: 'zavrsni', requests });
    expect('profileStatus' in m).toBe(false);
    expect('confirmedMismatch' in m).toBe(false);
    expect(m.signals.words).toBe(null);
  });
  it('ukljucuje confirmedMismatch samo kad je true', () => {
    expect(buildRepairMeta({ workType: 'zavrsni', requests, confirmedMismatch: true }).confirmedMismatch).toBe(true);
    expect('confirmedMismatch' in buildRepairMeta({ workType: 'zavrsni', requests, confirmedMismatch: false })).toBe(false);
  });
  it('WS-6.3: uvijek zigose consentVersion tekucim TERMS_VERSION (server ga trajno biljezi)', () => {
    const m = buildRepairMeta({ workType: 'zavrsni', requests });
    expect(m.consentVersion).toBe(TERMS_VERSION);
  });

  describe('K4: reference za provjeru u korpusu', () => {
    const base = { workType: 'zavrsni', requests } as const;

    it('salje samo naslov i godinu (nista suvisno)', () => {
      const m = buildRepairMeta({ ...base, references: [{ title: '  Sekundarna hipertenzija  ', year: 2014 }] });
      expect(m.references).toEqual([{ title: 'Sekundarna hipertenzija', year: 2014 }]);
    });

    it('izbacuje reference bez naslova (kljuc korpusa je naslov)', () => {
      const m = buildRepairMeta({ ...base, references: [{ title: '   ', year: 2014 }, { title: 'Ima naslov', year: null }] });
      expect(m.references).toEqual([{ title: 'Ima naslov', year: null }]);
    });

    it('nevaljana godina postaje null, ne NaN (NaN bi u JSON-u pao na null tiho)', () => {
      const m = buildRepairMeta({ ...base, references: [{ title: 'Rad', year: Number.NaN }] });
      expect(m.references![0].year).toBe(null);
    });

    it('kapira popis, ne salje neogranicenu literaturu', () => {
      const many = Array.from({ length: REPAIR_MAX_REFERENCES + 25 }, (_, i) => ({ title: `Rad ${i}`, year: 2020 }));
      expect(buildRepairMeta({ ...base, references: many }).references).toHaveLength(REPAIR_MAX_REFERENCES);
    });

    it('bez referenci polje uopce ne postoji (nema provjere)', () => {
      expect('references' in buildRepairMeta(base)).toBe(false);
      expect('references' in buildRepairMeta({ ...base, references: [] })).toBe(false);
      expect('references' in buildRepairMeta({ ...base, references: [{ title: '', year: null }] })).toBe(false);
    });
  });
});

describe('uploadRepair: sourceCheck je DODATAK, nikad uvjet', () => {
  const ok = (extra: Record<string, unknown>) =>
    uploadRepair(config, 'jwt', new Uint8Array([1]), meta(), async () =>
      res(200, { docxBase64: b64([0x50, 0x4b]), ...extra }));

  it('procita valjan sourceCheck', async () => {
    const out = await ok({ sourceCheck: { found: [{ index: 2, verdict: 'weak', score: 0.71, matchedTitle: 'Naslov', where: 'FFZG', url: 'https://x/1' }], checked: 5, total: 9, truncated: true } });
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.sourceCheck).toEqual({
      found: [{ index: 2, verdict: 'weak', score: 0.71, matchedTitle: 'Naslov', where: 'FFZG', url: 'https://x/1' }],
      checked: 5, total: 9, truncated: true,
    });
  });

  it('stari server bez K3 (nema polja) -> null, popravak SVEJEDNO stize', async () => {
    const out = await ok({ fileName: 'a.docx' });
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(out.sourceCheck).toBe(null);
  });

  it('smece umjesto objekta -> null, bez rusenja', async () => {
    for (const junk of [null, 'da', 42, {}, { found: 'ne-niz', checked: 1, total: 1 }, { found: [], checked: 1, total: 0 }]) {
      const out = await ok({ sourceCheck: junk });
      expect(out.kind).toBe('ok');
      if (out.kind === 'ok') expect(out.sourceCheck).toBe(null);
    }
  });

  it('odbacuje verdikt koji korpus NE SMIJE donijeti (not-found)', async () => {
    const out = await ok({ sourceCheck: { found: [{ index: 0, verdict: 'not-found', score: 0.1, matchedTitle: 'X', where: 'Y', url: null }], checked: 1, total: 1 } });
    if (out.kind === 'ok') expect(out.sourceCheck!.found).toEqual([]);
  });

  it('checked veci od total se skresa (brojac ne smije lagati na vise)', async () => {
    const out = await ok({ sourceCheck: { found: [], checked: 99, total: 4 } });
    if (out.kind === 'ok') expect(out.sourceCheck).toEqual({ found: [], checked: 4, total: 4, truncated: false });
  });

  it('checked < total je djelomicno i kad server ne posalje zastavicu', async () => {
    const out = await ok({ sourceCheck: { found: [], checked: 2, total: 7 } });
    if (out.kind === 'ok') expect(out.sourceCheck!.truncated).toBe(true);
  });
});

describe('uploadRepair', () => {
  it('bez endpointa -> error', async () => {
    const out = await uploadRepair({ endpoint: '' }, 'jwt', new Uint8Array([1]), meta());
    expect(out.kind).toBe('error');
  });

  it('200 -> dekodiran docx + changelog + fileName + jobId', async () => {
    const out = await uploadRepair(config, 'jwt', new Uint8Array([0x50, 0x4b]), meta(), async () =>
      res(200, { docxBase64: b64([0x50, 0x4b, 0x03, 0x04]), fileName: 'x-popravljeno.docx', changelog: [{ ruleId: 'font', beforeLabel: 'Arial', afterLabel: 'TNR' }], skipped: ['margine'], slotId: 's1', jobId: 'j1' }),
    );
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') {
      expect(Array.from(out.docxBytes)).toEqual([0x50, 0x4b, 0x03, 0x04]);
      expect(out.fileName).toBe('x-popravljeno.docx');
      expect(out.changelog).toHaveLength(1);
      expect(out.skipped).toEqual(['margine']);
      expect(out.jobId).toBe('j1');
    }
  });

  it('200 bez docxBase64 -> error', async () => {
    const out = await uploadRepair(config, 'jwt', new Uint8Array([1]), meta(), async () => res(200, { changelog: [] }));
    expect(out.kind).toBe('error');
  });

  it('salje Authorization header i FormData s file + meta', async () => {
    let seen: RequestInit | undefined;
    await uploadRepair(config, 'jwt-token', new Uint8Array([0x50, 0x4b]), meta(), async (_url, init) => {
      seen = init;
      return res(200, { docxBase64: b64([1]) });
    });
    expect((seen?.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token');
    // FormData ne smije imati rucno postavljen content-type (boundary postavlja runtime).
    expect((seen?.headers as Record<string, string>)['content-type']).toBeUndefined();
    const body = seen?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const sentMeta = JSON.parse(String(body.get('meta')));
    expect(sentMeta.workType).toBe('diplomski');
    expect(sentMeta.signals).toEqual({ words: 12000, titleMarker: 'graduate' });
    expect(body.get('file')).toBeInstanceOf(Blob);
  });

  it('409 -> tier_mismatch s predlozenim tierom (suggestedWorkType)', async () => {
    const out = await uploadRepair(config, 'j', new Uint8Array([1]), meta({ workType: 'seminarski' }), async () => res(409, { error: 'tier_mismatch', suggestedWorkType: 'diplomski' }));
    expect(out).toEqual({ kind: 'tier_mismatch', suggestedWorkType: 'diplomski' });
  });

  it('409 bez suggestedWorkType -> pada na workType iz odgovora', async () => {
    const out = await uploadRepair(config, 'j', new Uint8Array([1]), meta({ workType: 'seminarski' }), async () => res(409, { error: 'tier_mismatch', workType: 'zavrsni' }));
    expect(out).toEqual({ kind: 'tier_mismatch', suggestedWorkType: 'zavrsni' });
  });

  it('402 -> paywall s vrstom rada', async () => {
    const out = await uploadRepair(config, 'j', new Uint8Array([1]), meta({ workType: 'diplomski' }), async () => res(402, { workType: 'diplomski' }));
    expect(out).toEqual({ kind: 'paywall', workType: 'diplomski' });
  });

  it('mapira 429/401/413/415', async () => {
    expect((await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(429, {}))).kind).toBe('rate_limited');
    expect((await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(401, {}))).kind).toBe('unauthorized');
    expect((await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(413, {}))).kind).toBe('too_large');
    expect((await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(415, {}))).kind).toBe('invalid_docx');
  });

  // RE-33: 429 nosi razlog da poruka ne tvrdi "besplatnih" i kad je posrijedi placeni strop ili
  // dijeljeni IP-cap (korisnik osobno nije nista potrosio).
  it('429 nosi reason kad ga server posalje (free_user/free_ip/paid_daily)', async () => {
    for (const reason of ['free_user', 'free_ip', 'paid_daily'] as const) {
      const out = await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(429, { reason }));
      expect(out).toEqual({ kind: 'rate_limited', reason });
    }
  });

  it('429 bez reason (stari server) -> reason undefined, ne baca', async () => {
    const out = await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(429, {}));
    expect(out).toEqual({ kind: 'rate_limited', reason: undefined });
  });

  it('429 s nepoznatim reason stringom se odbacuje (whitelist)', async () => {
    const out = await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(429, { reason: 'nesto-drugo' }));
    expect(out).toEqual({ kind: 'rate_limited', reason: undefined });
  });

  it('422 no_live_fixers vs ostalo', async () => {
    expect((await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(422, { error: 'no_live_fixers' }))).kind).toBe('no_live_fixers');
    expect((await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(422, { error: 'invalid_docx' }))).kind).toBe('invalid_docx');
  });

  it('WS-6.3: 400 consent_required -> error s uputom za osvjezavanje', async () => {
    const out = await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => res(400, { error: 'consent_required', termsVersion: '2026-07-19' }));
    expect(out.kind).toBe('error');
    expect((out as { message: string }).message).toMatch(/privol|Uvjeti/i);
  });

  it('mrezna greska -> error', async () => {
    const out = await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => { throw new Error('offline'); });
    expect(out).toMatchObject({ kind: 'error', message: 'offline' });
  });

  // Prekid (istekao rok) mora imati vlastitu poruku: kao "mrezna greska" bi izgledao kao kvar
  // posluzitelja, a korisnik treba znati da moze samo ponoviti.
  it('AbortError -> vlastita poruka o prekidu, ne genericka mrezna greska', async () => {
    const out = await uploadRepair(config, 'j', new Uint8Array([1]), meta(), async () => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      throw e;
    });
    expect(out.kind).toBe('error');
    expect((out as { message: string }).message).toMatch(/predugo|prekinut/i);
  });

  it('signal se prosljedjuje fetchu samo kad je zadan', async () => {
    let seen: unknown = 'nije pozvano';
    const spy = async (_u: unknown, init: any) => { seen = 'signal' in (init ?? {}); return res(200, { docxBase64: '', changelog: [] }); };
    await uploadRepair(config, 'j', new Uint8Array([1]), meta(), spy as unknown as typeof fetch);
    expect(seen).toBe(false);
    const ac = new AbortController();
    await uploadRepair(config, 'j', new Uint8Array([1]), meta(), spy as unknown as typeof fetch, { signal: ac.signal });
    expect(seen).toBe(true);
  });
});

/**
 * KLIJENT MORA ZNATI OBA OBLIKA ODGOVORA (audit DOCX-05).
 *
 * Deploy nije atomaran: nova stranica se moze naci pred starim serverom (koji ne zna binarni
 * oblik) i stara stranica pred novim (koja ne salje zaglavlje pa dobiva JSON). Ako klijent zna
 * samo jedan oblik, popravak pukne u prijelaznom razdoblju, a to je tocno trenutak kad korisnik
 * ne moze razumjeti zasto.
 *
 * Test drzi i jace svojstvo: oba oblika daju ISTI ishod, do polja. Bez toga bi se razlike uvlacile
 * tiho (npr. `unknownFixers` koji server salje, a jedna grana ga ne cita).
 */
describe('uploadRepair prihvaca binarni I JSON oblik', () => {
  const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
  const serverMeta = {
    fileName: 'rad-popravljeno.docx',
    changelog: [{ before: 'Times', after: 'Times New Roman' }],
    skipped: ['neka-stavka'],
    unknownFixers: ['nepoznat-fixer'],
    slotId: 'slot-1',
    jobId: 'job-1',
    storagePending: true,
    sourceCheck: null,
  };

  const config = { endpoint: 'https://primjer.supabase.co/functions/v1/repair-docx' };
  const meta = { workType: 'diplomski', signals: { words: 1, titleMarker: null }, requests: [], consentVersion: 'v' } as never;

  it('binarni oblik: cita okvir i vraca ok', async () => {
    let sentHeader: string | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sentHeader = (init?.headers as Record<string, string>)?.['X-Lekta-Response'];
      return new Response(encodeRepairFrame(serverMeta, docx) as unknown as BodyInit, {
        status: 200,
        headers: { 'content-type': 'application/x-lekta-repair' },
      });
    }) as unknown as typeof fetch;

    const out = await uploadRepair(config, 'token', docx, meta, fetchImpl);
    expect(sentHeader, 'klijent mora zatraziti binarni oblik').toBe('binary');
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(Array.from(out.docxBytes)).toEqual(Array.from(docx));
    expect(out.fileName).toBe('rad-popravljeno.docx');
    expect(out.unknownFixers).toEqual(['nepoznat-fixer']);
    expect(out.storagePending).toBe(true);
  });

  it('JSON oblik (stariji server) i dalje radi', async () => {
    const b64 = Buffer.from(docx).toString('base64');
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ docxBase64: b64, ...serverMeta }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const out = await uploadRepair(config, 'token', docx, meta, fetchImpl);
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(Array.from(out.docxBytes)).toEqual(Array.from(docx));
    expect(out.unknownFixers).toEqual(['nepoznat-fixer']);
  });

  it('oba oblika daju ISTI ishod (razlika je samo u prijenosu)', async () => {
    const b64 = Buffer.from(docx).toString('base64');
    const binarni = await uploadRepair(config, 't', docx, meta, (async () =>
      new Response(encodeRepairFrame(serverMeta, docx) as unknown as BodyInit, {
        status: 200, headers: { 'content-type': 'application/x-lekta-repair' },
      })) as unknown as typeof fetch);
    const jsonski = await uploadRepair(config, 't', docx, meta, (async () =>
      new Response(JSON.stringify({ docxBase64: b64, ...serverMeta }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch);
    expect(binarni).toEqual(jsonski);
  });

  it('krnji binarni odgovor daje jasnu gresku, ne ostecen dokument', async () => {
    const frame = encodeRepairFrame(serverMeta, docx);
    new DataView(frame.buffer).setUint32(0, frame.length + 999, true);
    const fetchImpl = (async () =>
      new Response(frame as unknown as BodyInit, {
        status: 200, headers: { 'content-type': 'application/x-lekta-repair' },
      })) as unknown as typeof fetch;
    const out = await uploadRepair(config, 't', docx, meta, fetchImpl);
    expect(out.kind).toBe('error');
  });
});
