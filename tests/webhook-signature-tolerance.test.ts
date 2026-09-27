/**
 * MUTACIJSKI GARD NAD PROVJEROM STRIPE POTPISA.
 *
 * Zasto zaseban test: `verifyStripeSignature` je jedina brana izmedju javnog interneta i
 * knjizenja prava pristupa. Tvrdnja "provjeravamo potpis" prolazi i kad se provjerava samo HMAC,
 * a vrijeme se ignorira. Takav webhook je i dalje ranjiv na replay: jednom presretnut valjan
 * zahtjev ostaje matematicki ispravan zauvijek, jer se tajna ne mijenja.
 *
 * Pravila su ista kao u tests/gate-mutations.test.ts:
 *  1. Mutira se SAMO u memoriji; nijedna datoteka na disku se ne dira.
 *  2. Svaka mutacija ima BASELINE tvrdnju: nemutiran ulaz mora proci, inace mutacija "pada"
 *     zato sto gard vristi na sve.
 *  3. Mutacija imitira STVARAN kvar: izostavljenu provjeru tolerancije i krivi tajni kljuc.
 *
 * Generator ulaza dokazuje da pogadja ciljanu klasu: potpis za istekli `t` racuna se ISTIM
 * HMAC postupkom kao ispravan, pa je matematicki valjan i odbija ga iskljucivo tolerancija.
 * To se ovdje i tvrdi izricito (`mutantBezTolerancije` ga prihvaca).
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

import {
  verifyStripeSignature,
  parseStripeSignatureHeader,
  STRIPE_SIGNATURE_TOLERANCE_SECONDS,
} from '../src/report/webhook';

const SECRET = 'whsec_gard';
const RAW = '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_1"}}}';
const NOW_MS = Date.UTC(2026, 8, 23, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);

/** Zaglavlje kakvo Stripe stvarno salje, potpisano zadanim kljucem nad `${t}.${raw}`. */
function header(t: number, secret = SECRET, raw = RAW): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
}

/**
 * MUTANT: ista provjera bez tolerancije vremena. Doslovna kopija logike iz
 * `verifyStripeSignature` iz koje je izbacen samo `Math.abs(now - t) > tolerancija`.
 */
async function mutantBezTolerancije(raw: string, head: string, secret: string): Promise<boolean> {
  const { timestamp, signatures } = parseStripeSignatureHeader(head);
  if (timestamp === null || signatures.length === 0 || !secret) return false;
  const mac = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  return signatures.includes(mac);
}

describe('gard: Stripe potpis mora nositi vrijeme i tocan kljuc', () => {
  it('BASELINE: svjez potpis ispravnim kljucem prolazi', async () => {
    expect(await verifyStripeSignature(RAW, header(NOW_S), SECRET, NOW_MS)).toEqual({ ok: true });
  });

  it('MUTACIJA 1 (krivi tajni kljuc): odbijen', async () => {
    const krivi = header(NOW_S, 'whsec_napadac');
    expect(await verifyStripeSignature(RAW, krivi, SECRET, NOW_MS)).toEqual({
      ok: false,
      reason: 'signature_mismatch',
    });
  });

  it('MUTACIJA 2 (t stariji od 300 s): odbijen', async () => {
    const istekao = NOW_S - STRIPE_SIGNATURE_TOLERANCE_SECONDS - 1;
    expect(await verifyStripeSignature(RAW, header(istekao), SECRET, NOW_MS)).toEqual({
      ok: false,
      reason: 'timestamp_out_of_tolerance',
    });
  });

  it('MUTACIJA 3 (uklonjena provjera tolerancije): isti ulaz PROLAZI, dakle gard grize', async () => {
    const istekao = NOW_S - STRIPE_SIGNATURE_TOLERANCE_SECONDS - 1;
    const head = header(istekao);
    // Dokaz da generator gadja ciljanu klasu: potpis je valjan HMAC za taj t.
    expect(await mutantBezTolerancije(RAW, head, SECRET)).toBe(true);
    // Stvarna implementacija ga svejedno odbija, i to bas zbog tolerancije.
    expect(await verifyStripeSignature(RAW, head, SECRET, NOW_MS)).toEqual({
      ok: false,
      reason: 'timestamp_out_of_tolerance',
    });
    // Mutant i dalje hvata krivi kljuc: jedina razlika prema stvarnoj provjeri je vrijeme, pa
    // razlika u ishodu iznad ne moze doci ni od cega drugog.
    expect(await mutantBezTolerancije(RAW, header(istekao, 'whsec_napadac'), SECRET)).toBe(false);
  });

  it('tolerancija je 300 s i mjeri se u oba smjera', async () => {
    expect(STRIPE_SIGNATURE_TOLERANCE_SECONDS).toBe(300);
    const naGranici = NOW_S - STRIPE_SIGNATURE_TOLERANCE_SECONDS;
    expect(await verifyStripeSignature(RAW, header(naGranici), SECRET, NOW_MS)).toEqual({ ok: true });
    const izBuducnosti = NOW_S + STRIPE_SIGNATURE_TOLERANCE_SECONDS + 1;
    expect(await verifyStripeSignature(RAW, header(izBuducnosti), SECRET, NOW_MS)).toEqual({
      ok: false,
      reason: 'timestamp_out_of_tolerance',
    });
  });

  it('prazan STRIPE_WEBHOOK_SECRET odbija SVE (fail-closed), ne propusta tiho', async () => {
    expect(await verifyStripeSignature(RAW, header(NOW_S), '', NOW_MS)).toEqual({
      ok: false,
      reason: 'missing_secret',
    });
  });
});
