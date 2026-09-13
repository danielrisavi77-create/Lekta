import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry, PRODUCT_JOURNEY_EVENTS } from '../src/ui/telemetry';

/**
 * T14 (plan razvoja): mjerenje toka uz postojecu privolu i ogranicene podatke.
 *
 * Tri tvrdnje:
 *  1. sanitizacija odbacuje SVE izvan bijele liste, pa sadrzaj dokumenta ne moze uci u dogadjaj ni omaskom;
 *  2. bez privole `granted` nista ne odlazi, i promjena privole djeluje ODMAH (cita se pri svakom pozivu);
 *  3. svaki dogadjaj toka iz `PRODUCT_JOURNEY_EVENTS` je stvarno emitiran negdje u `src/` (mrtvo ime u registru
 *     bi mjerilo tok koji ne postoji).
 */
const KORIJEN = join(__dirname, '..');

function svePlusDatoteke(dir: string, out: string[] = []): string[] {
  for (const ime of readdirSync(dir)) {
    const p = join(dir, ime);
    if (statSync(p).isDirectory()) svePlusDatoteke(p, out);
    else if (/\.(ts|mts)$/.test(ime) && !/\.test\./.test(ime)) out.push(p);
  }
  return out;
}

describe('sanitizacija dogadjaja', () => {
  const { sanitizeEventData } = createTelemetry({ config: () => ({ analyticsEndpoint: 'https://x.invalid/e' }), consent: () => 'granted' });

  it('zadrzava samo dopustene kljuceve skalarnih vrijednosti', () => {
    expect(sanitizeEventData({ category: 'formatting', documentText: 'privatno' })).toEqual({ category: 'formatting' });
    expect(sanitizeEventData({ fileName: 'diplomski-ivan-horvat.docx', title: 'Naslov rada', author: 'I. H.', comment: 'mentor', count: 3 })).toEqual({ count: 3 });
    expect(sanitizeEventData({ count: { nested: 1 }, kind: ['a'], ms: 12 })).toEqual({ ms: 12 });
    expect(sanitizeEventData(null)).toEqual({});
  });
});

describe('privola', () => {
  afterEach(() => vi.restoreAllMocks());

  it('bez privole `granted` dogadjaj ne odlazi i vraca false; promjena privole djeluje odmah', async () => {
    let consent: unknown = 'denied';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { trackEvent } = createTelemetry({ config: () => ({ analyticsEndpoint: 'https://x.invalid/e' }), consent: () => consent });
    const trackEventWithoutConsent = (event: string) => trackEvent(event);
    expect(await trackEventWithoutConsent('analysis_completed')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    consent = 'granted';
    expect(await trackEvent('analysis_completed', { profileId: 'p', documentText: 'ne' })).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.event).toBe('analysis_completed');
    expect(body.profileId).toBe('p');
    expect(body).not.toHaveProperty('documentText');
    consent = 'denied';
    expect(await trackEvent('analysis_completed')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('greska analitike ne prekida proizvod: fetch koji baca daje false, ne iznimku', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { trackEvent } = createTelemetry({ config: () => ({ analyticsEndpoint: 'https://x.invalid/e' }), consent: () => 'granted' });
    await expect(trackEvent('repair_completed', { count: 1 })).resolves.toBe(false);
  });
});

describe('dogadjaji toka su stvarno emitirani', () => {
  const izvor = svePlusDatoteke(join(KORIJEN, 'src')).map((p) => readFileSync(p, 'utf8')).join('\n');

  it('svako ime iz registra pojavljuje se kao emitiran dogadjaj u src/', () => {
    for (const [korak, ime] of Object.entries(PRODUCT_JOURNEY_EVENTS)) {
      // `trackEvent(...)`, `ctx.trackEvent?.(...)` i `deps.track?.(...)` (ruta /rad/) su sve isti kanal.
      const re = new RegExp(`(trackEvent|track)(\\?\\.)?\\(\\s*'${ime}'`);
      expect(re.test(izvor), `${korak} -> '${ime}' se nigdje ne emitira`).toBe(true);
    }
  });

  it('registar pokriva sedam koraka iz plana, bez duplikata imena', () => {
    const imena = Object.values(PRODUCT_JOURNEY_EVENTS);
    expect(imena.length).toBe(7);
    expect(new Set(imena).size).toBe(7);
  });

  it('MUTACIJA: izmisljeno ime u registru bi palo na prvoj tvrdnji', () => {
    expect(/(trackEvent|track)(\?\.)?\(\s*'dogadjaj_koji_ne_postoji'/.test(izvor)).toBe(false);
  });
});
