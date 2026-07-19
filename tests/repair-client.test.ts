import { describe, it, expect } from 'vitest';

import {
  decodeBase64,
  buildRepairMeta,
  uploadRepair,
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
    parsedStructure: { title: 'Rad', author: 'Ana', headings: [] },
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
  const parsedStructure = { title: 'Naslov', author: 'Autor', headings: [{ level: 1, text: 'Uvod' }] };
  const requests = [{ fixerId: 'font-fixer', ruleId: 'font', params: {} }];

  it('mapira nepoznatu vrstu rada u zavrsni (fallback)', () => {
    expect(buildRepairMeta({ workType: 'nesto', parsedStructure, requests }).workType).toBe('zavrsni');
  });
  it('zadrzava valjanu naplatnu vrstu', () => {
    expect(buildRepairMeta({ workType: 'doktorski', parsedStructure, requests }).workType).toBe('doktorski');
  });
  it('nikad ne nosi doslovni tekst rada, samo struktura + signali', () => {
    const m = buildRepairMeta({ workType: 'diplomski', parsedStructure, requests, words: 9000, titleMarker: 'graduate' });
    expect(m.parsedStructure).toEqual(parsedStructure);
    expect(m.signals).toEqual({ words: 9000, titleMarker: 'graduate' });
    const flat = JSON.stringify(m);
    expect(flat).not.toMatch(/paragraph|excerpt|fullText/i);
  });
  it('izostavlja opcijska polja kad ih nema', () => {
    const m = buildRepairMeta({ workType: 'zavrsni', parsedStructure, requests });
    expect('profileStatus' in m).toBe(false);
    expect('confirmedMismatch' in m).toBe(false);
    expect(m.signals.words).toBe(null);
  });
  it('ukljucuje confirmedMismatch samo kad je true', () => {
    expect(buildRepairMeta({ workType: 'zavrsni', parsedStructure, requests, confirmedMismatch: true }).confirmedMismatch).toBe(true);
    expect('confirmedMismatch' in buildRepairMeta({ workType: 'zavrsni', parsedStructure, requests, confirmedMismatch: false })).toBe(false);
  });
  it('WS-6.3: uvijek zigose consentVersion tekucim TERMS_VERSION (server ga trajno biljezi)', () => {
    const m = buildRepairMeta({ workType: 'zavrsni', parsedStructure, requests });
    expect(m.consentVersion).toBe(TERMS_VERSION);
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
});
