// @vitest-environment node
// Klijent se pokrece samo u Nodeu (runner na radnoj stanici); happy-dom fetch ne salje tijelo zahtjeva.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MAX_RESPONSE_BYTES, assertLoopbackEndpoint, httpLayaClient } from '../../scripts/laya/runtime-client.ts';
import type { LayaInferenceRequest } from '../../scripts/laya/runtime-client.ts';
import { makeCase, makeResult } from '../helpers/laya-v2-fixtures.ts';

const request = (): LayaInferenceRequest => {
  const c = makeCase();
  return { schemaVersion: 2, taskId: 'reference.completeness/finding-v2', caseId: c.caseId, inputDigest: c.inputDigest, modelInput: c.modelInput,
    labelOrder: ['finding_supported', 'possible_false_positive', 'extraction_uncertain', 'insufficient_evidence'] };
};

describe('lokalni endpoint', () => {
  it.each(['http://127.0.0.1:8765', 'http://localhost:8765/', 'http://[::1]:8765'])('prihvaca %s', (url) => {
    expect(() => assertLoopbackEndpoint(url)).not.toThrow();
  });
  it.each(['https://127.0.0.1:8765', 'http://10.0.0.5:8765', 'http://laya.example.com', 'http://user:pw@127.0.0.1:8765', 'nije url'])('odbija %s', (url) => {
    expect(() => assertLoopbackEndpoint(url)).toThrow();
    expect(() => httpLayaClient(url)).toThrow();
  });
});

describe('http klijent nad lokalnim serverom', () => {
  let server: Server;
  let base = '';
  const seen: unknown[] = [];
  let mode: 'ok' | 'error' | 'big' | 'invalid' | 'slow' = 'ok';

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        seen.push({ url: req.url, body: JSON.parse(body) });
        if (mode === 'error') { res.statusCode = 500; res.end('{}'); return; }
        if (mode === 'big') { res.end(JSON.stringify({ pad: 'x'.repeat(MAX_RESPONSE_BYTES + 10) })); return; }
        if (mode === 'invalid') { res.end('nije json'); return; }
        if (mode === 'slow') { setTimeout(() => res.end(JSON.stringify(makeResult())), 300); return; }
        res.end(JSON.stringify(makeResult()));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('salje samo omotnicu s modelInput i vraca sirovi odgovor', async () => {
    mode = 'ok'; seen.length = 0;
    expect(await httpLayaClient(base).infer(request())).toEqual(makeResult());
    const sent = seen[0] as { url: string; body: Record<string, unknown> };
    expect(sent.url).toBe('/v2/infer');
    expect(Object.keys(sent.body).sort()).toEqual(['caseId', 'inputDigest', 'labelOrder', 'modelInput', 'schemaVersion', 'taskId']);
    expect(JSON.stringify(sent.body)).not.toContain('provenance');
  });

  it.each(['error', 'big', 'invalid'] as const)('kvar (%s) je null, bez bacanja', async (m) => {
    mode = m;
    expect(await httpLayaClient(base).infer(request())).toBeNull();
  });

  it('timeout je null', async () => {
    mode = 'slow';
    expect(await httpLayaClient(base, { timeoutMs: 50 }).infer(request())).toBeNull();
  });

  it('nedostupan runtime je null', async () => {
    expect(await httpLayaClient('http://127.0.0.1:1', { timeoutMs: 500 }).infer(request())).toBeNull();
  });
});
