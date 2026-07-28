import { describe, it, expect } from 'vitest';

import { checkSources } from '../src/report/source-check-client';
import { parseSourceCheck } from '../src/report/source-check-parse';
import { buildRepairMeta } from '../src/report/repair-client';
import { REPAIR_MAX_REFERENCES } from '../src/report/repair-contract';

const config = { endpoint: 'https://edge/source-check' };

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const okBody = {
  found: [{ index: 0, verdict: 'found', score: 0.91, matchedTitle: 'Nadjeni rad', where: 'FFZG', url: 'https://x' }],
  checked: 3, total: 3, truncated: false,
};

describe('checkSources (zasebna, usporedna provjera izvora)', () => {
  it('salje SAMO naslov i godinu, nikad drugo polje reference', async () => {
    let body: any = null;
    await checkSources(config, 'tok', [{ title: 'Naslov', year: 2020, raw: 'Netko (2020) Naslov' } as any], async (_u, init: any) => {
      body = JSON.parse(String(init.body));
      return res(200, okBody);
    });
    expect(body.references).toEqual([{ title: 'Naslov', year: 2020 }]);
    expect(JSON.stringify(body)).not.toContain('raw');
  });

  it('nosi Bearer token', async () => {
    let auth = '';
    await checkSources(config, 'tok-123', [{ title: 'A', year: null }], async (_u, init: any) => {
      auth = init.headers.Authorization;
      return res(200, okBody);
    });
    expect(auth).toBe('Bearer tok-123');
  });

  it('200 -> ok s parsiranim rezultatom', async () => {
    const out = await checkSources(config, 't', [{ title: 'A', year: null }], async () => res(200, okBody));
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(out.result.found[0].matchedTitle).toBe('Nadjeni rad');
  });

  it('429 nosi razlog (korisnik vs IP)', async () => {
    const out = await checkSources(config, 't', [{ title: 'A', year: null }], async () => res(429, { error: 'rate_limited', reason: 'ip' }));
    expect(out).toEqual({ kind: 'rate_limited', reason: 'ip' });
  });

  it('401 -> unauthorized', async () => {
    const out = await checkSources(config, '', [{ title: 'A', year: null }], async () => res(401, { error: 'unauthorized' }));
    expect(out.kind).toBe('unauthorized');
  });

  // Jezgra ugovora: svaki neuspjeh je "nema presude", nikad "izvor ne postoji". Korpus pokriva
  // hrvatske repozitorije, pa ni uredan promasaj nije dokaz nepostojanja, a kamoli pad mreze.
  it('503, mrezni pad i neocekivan oblik daju unavailable, nikad negativan nalaz', async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => res(503, { error: 'unavailable' }),
      async () => { throw new Error('mreza pukla'); },
      async () => res(200, { nesto: 'drugo' }),
    ];
    for (const impl of cases) {
      const out = await checkSources(config, 't', [{ title: 'A', year: null }], impl);
      expect(out.kind).toBe('unavailable');
    }
  });

  it('bez endpointa ili bez referenci s naslovom ne dira mrezu', async () => {
    let called = 0;
    const spy = async () => { called++; return res(200, okBody); };
    expect((await checkSources({ endpoint: '' }, 't', [{ title: 'A', year: null }], spy)).kind).toBe('unavailable');
    expect((await checkSources(config, 't', [{ title: '   ', year: null }], spy)).kind).toBe('unavailable');
    expect(called).toBe(0);
  });

  it('kapa broj poslanih referenci na REPAIR_MAX_REFERENCES', async () => {
    let sent = 0;
    const many = Array.from({ length: REPAIR_MAX_REFERENCES + 25 }, (_v, i) => ({ title: `Rad ${i}`, year: 2020 }));
    await checkSources(config, 't', many, async (_u, init: any) => {
      sent = JSON.parse(String(init.body)).references.length;
      return res(200, okBody);
    });
    expect(sent).toBe(REPAIR_MAX_REFERENCES);
  });
});

describe('parseSourceCheck (dijeljen s repair-clientom)', () => {
  it('odbacuje verdikt izvan {found, weak}', () => {
    const parsed = parseSourceCheck({
      found: [
        { index: 0, verdict: 'not-found', matchedTitle: 'X' },
        { index: 1, verdict: 'weak', matchedTitle: 'Y' },
      ], checked: 2, total: 2,
    });
    expect(parsed?.found.map((f) => f.verdict)).toEqual(['weak']);
  });

  it('checked > total se stisce na total, a djelomicna provjera je uvijek truncated', () => {
    expect(parseSourceCheck({ found: [], checked: 99, total: 5 })).toMatchObject({ checked: 5, truncated: false });
    expect(parseSourceCheck({ found: [], checked: 2, total: 5 })).toMatchObject({ checked: 2, truncated: true });
  });

  it('bezvrijedan oblik -> null (nema sekcije umjesto lazne tvrdnje)', () => {
    expect(parseSourceCheck(null)).toBeNull();
    expect(parseSourceCheck({ found: [], total: 0 })).toBeNull();
    expect(parseSourceCheck({ nesto: 1 })).toBeNull();
  });
});

describe('buildRepairMeta uz zasebnu provjeru izvora', () => {
  const parsedStructure = { title: 'N', author: 'A', headings: [] };
  const requests = [{ fixerId: 'font-fixer', ruleId: 'font', params: {} }];
  const references = [{ title: 'Rad', year: 2021 }];

  it('bez zastavice literatura putuje uz dokument (naslijedjeni put)', () => {
    const m = buildRepairMeta({ workType: 'diplomski', parsedStructure, requests, references });
    expect(m.references).toEqual(references);
    expect(m.sourceCheckSeparate).toBeUndefined();
  });

  it('sa zastavicom se literatura NE salje uz dokument (server je preskace)', () => {
    const m = buildRepairMeta({ workType: 'diplomski', parsedStructure, requests, references, sourceCheckSeparate: true });
    expect(m.sourceCheckSeparate).toBe(true);
    expect(m.references).toBeUndefined();
  });
});
