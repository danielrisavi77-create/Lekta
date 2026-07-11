import { describe, it, expect } from 'vitest';
import {
  INTEGRITY_RETENTION_DAYS,
  integrityConsentText,
  buildIntegrityConsent,
} from '../src/integrity/integrity-consent';
import {
  buildIntegrityRequest,
  runIntegrityCheck,
  type IntegrityConfig,
} from '../src/integrity/integrity-client';

/** Fetch stub koji vrati zadani status i tijelo (bez mreze). */
const fetchStub = (status: number, body: any = {}) =>
  (async () => ({ status, json: async () => body })) as unknown as typeof fetch;

const throwingFetch = (async () => {
  throw new Error('mreza pala');
}) as unknown as typeof fetch;

describe('integrityConsent', () => {
  it('default retencija je 7 dana i tekst je iskren o slanju/cuvanju/treniranju', () => {
    expect(INTEGRITY_RETENTION_DAYS).toBe(7);
    const t = integrityConsentText();
    expect(t).toContain('7 dana');
    expect(t).toContain('cijeli tekst');
    expect(t.toLowerCase()).toContain('treniranje');
  });

  it('tekst odrazava zadani broj dana', () => {
    expect(integrityConsentText(3)).toContain('3 dana');
  });

  it('buildIntegrityConsent slaze zapis s timestampom i verzijom uvjeta', () => {
    const c = buildIntegrityConsent({ timestamp: '2026-07-11T10:00:00Z', termsVersion: 'v2' });
    expect(c.sendsFullText).toBe(true);
    expect(c.notForTraining).toBe(true);
    expect(c.retentionDays).toBe(7);
    expect(c.timestamp).toBe('2026-07-11T10:00:00Z');
    expect(c.termsVersion).toBe('v2');
    expect(c.text).toContain('7 dana');
  });
});

describe('buildIntegrityRequest (privola je uvjet slanja teksta)', () => {
  const consent = buildIntegrityConsent({ timestamp: '2026-07-11T10:00:00Z', termsVersion: 'v2' });

  it('s privolom ukljucuje tekst, jezik, vrstu i mode', () => {
    const req = buildIntegrityRequest('tekst rada', 'hr', 'diplomski', 'full', consent);
    expect(req.text).toBe('tekst rada');
    expect(req.lang).toBe('hr');
    expect(req.workType).toBe('diplomski');
    expect(req.mode).toBe('full');
    expect(req.consent).toBe(consent);
  });

  it('bez privole baca (tekst se ne smije poslati)', () => {
    expect(() => buildIntegrityRequest('tekst', 'hr', 'diplomski', 'teaser', null)).toThrow();
  });
});

describe('runIntegrityCheck (inertno + mapiranje odgovora)', () => {
  const consent = buildIntegrityConsent({ timestamp: '2026-07-11T10:00:00Z', termsVersion: 'v2' });
  const req = buildIntegrityRequest('tekst', 'hr', 'diplomski', 'full', consent);
  const cfg: IntegrityConfig = { endpoint: 'https://x/functions/v1/integrity-check' };

  it('bez endpointa je inertno (error, ne salje nista)', async () => {
    const out = await runIntegrityCheck({ endpoint: '' }, 'jwt', req, fetchStub(200, {}));
    expect(out.kind).toBe('error');
  });

  it('200 -> ok s izvjestajem', async () => {
    const out = await runIntegrityCheck(cfg, 'jwt', req, fetchStub(200, { report: { similarity: 12 } }));
    expect(out).toEqual({ kind: 'ok', report: { similarity: 12 } });
  });

  it('402 -> paywall', async () => {
    const out = await runIntegrityCheck(cfg, 'jwt', req, fetchStub(402));
    expect(out.kind).toBe('paywall');
  });

  it('401 -> unauthorized', async () => {
    const out = await runIntegrityCheck(cfg, 'jwt', req, fetchStub(401));
    expect(out.kind).toBe('unauthorized');
  });

  it('429 -> rate_limited', async () => {
    const out = await runIntegrityCheck(cfg, 'jwt', req, fetchStub(429));
    expect(out.kind).toBe('rate_limited');
  });

  it('neocekivani status -> error sa statusom', async () => {
    const out = await runIntegrityCheck(cfg, 'jwt', req, fetchStub(500));
    expect(out).toMatchObject({ kind: 'error', status: 500 });
  });

  it('mrezna greska -> error', async () => {
    const out = await runIntegrityCheck(cfg, 'jwt', req, throwingFetch);
    expect(out.kind).toBe('error');
  });
});
