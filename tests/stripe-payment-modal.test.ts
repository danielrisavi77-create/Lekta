/**
 * src/ui/stripe-payment-modal.ts: modal placanja koji je preuzeo posao iz app.ts.
 *
 * Kljucna tvrdnja nije crtanje nego NASTAVAK: uspjesna potvrda mora pozvati `onPaid`, jer je to
 * isti nastavak (handleUnlockReport) koji se prije izvodio kad se korisnik vracao s vanjskog
 * checkouta. Bez toga bi korisnik platio i ostao pred zakljucanim izvjestajem.
 *
 * Stripe.js se ne dohvaca: `loadStripeJs` cita globalni `Stripe`, pa ga test postavi na stub.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  openStripePaymentModal,
  closeStripePaymentModal,
  PAID_PENDING_MESSAGE,
  PAYMENT_PROCESSING_MESSAGE,
} from '../src/ui/stripe-payment-modal';
import type { EntitlementWait } from '../src/report/stripe-payment';
import { resetStripeJsLoader } from '../src/report/stripe-payment';

const MARKUP = `
<div class="modal-backdrop hidden" id="stripePaymentModal">
  <div class="modal">
    <button id="closeStripePayment"></button>
    <div data-stripe-payment id="stripePaymentElement"></div>
    <div id="stripePaymentStatus"></div>
    <button id="cancelStripePayment"></button>
    <button id="confirmStripePayment"></button>
  </div>
</div>`;

interface Recorded {
  toasts: string[];
  waitedFor: string[];
  paid: number;
  trapped: number;
  released: number;
}

function harness(
  confirmResult: unknown,
  booking: EntitlementWait = 'booked',
): { args: Parameters<typeof openStripePaymentModal>[0]; rec: Recorded } {
  const rec: Recorded = { toasts: [], waitedFor: [], paid: 0, trapped: 0, released: 0 };
  const elements = { create: () => ({ mount: () => {} }) };
  (globalThis as { Stripe?: unknown }).Stripe = () => ({
    elements: () => elements,
    confirmPayment: async () => confirmResult,
  });
  return {
    rec,
    args: {
      out: { clientSecret: 'pi_1_secret', publishableKey: 'pk_test', paymentIntentId: 'pi_1' },
      toast: (m: string) => rec.toasts.push(m),
      trapModal: () => { rec.trapped += 1; },
      releaseModal: () => { rec.released += 1; },
      config: { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' },
      token: 'jwt',
      waitForBooking: async (id: string) => {
        rec.waitedFor.push(id);
        return booking;
      },
      onPaid: () => { rec.paid += 1; },
    },
  };
}

function btn(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

describe('openStripePaymentModal', () => {
  beforeEach(() => {
    resetStripeJsLoader();
    document.body.innerHTML = MARKUP;
  });

  afterEach(() => {
    closeStripePaymentModal();
    delete (globalThis as { Stripe?: unknown }).Stripe;
  });

  it('otvara modal, hvata fokus i ukljucuje gumb za placanje', async () => {
    const { args, rec } = harness({ paymentIntent: { id: 'pi_1', status: 'succeeded' } });
    await openStripePaymentModal(args);
    expect(document.getElementById('stripePaymentModal')!.classList.contains('hidden')).toBe(false);
    expect(rec.trapped).toBe(1);
    expect(btn('confirmStripePayment').disabled).toBe(false);
  });

  it('uspjesna potvrda ceka knjizenje prava za TAJ PaymentIntent, pa tek onda otkljucava', async () => {
    const { args, rec } = harness({ paymentIntent: { id: 'pi_1', status: 'succeeded' } });
    await openStripePaymentModal(args);
    await btn('confirmStripePayment').onclick!(new MouseEvent('click'));
    expect(rec.waitedFor).toEqual(['pi_1']);
    expect(rec.paid).toBe(1);
    expect(document.getElementById('stripePaymentModal')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('stripePaymentElement')!.innerHTML).toBe('');
  });

  it('pravo jos nije knjizeno: NEMA otkljucavanja (ni paywalla), nego poruka da se ne placa ponovno', async () => {
    const { args, rec } = harness({ paymentIntent: { id: 'pi_1', status: 'succeeded' } }, 'pending');
    await openStripePaymentModal(args);
    await btn('confirmStripePayment').onclick!(new MouseEvent('click'));
    expect(rec.paid).toBe(0);
    expect(rec.toasts).toContain(PAID_PENDING_MESSAGE);
    expect(PAID_PENDING_MESSAGE).toMatch(/Ne plaćaj ponovno/);
  });

  it('okruzenje bez Supabase konfiguracije (unknown) zadrzava stari nastavak', async () => {
    const { args, rec } = harness({ paymentIntent: { id: 'pi_1', status: 'succeeded' } }, 'unknown');
    await openStripePaymentModal(args);
    await btn('confirmStripePayment').onclick!(new MouseEvent('click'));
    expect(rec.paid).toBe(1);
  });

  it('processing nije uspjeh: ne ceka webhook, ne otkljucava, javlja da se placanje obradjuje', async () => {
    const { args, rec } = harness({ paymentIntent: { id: 'pi_1', status: 'processing' } });
    await openStripePaymentModal(args);
    await btn('confirmStripePayment').onclick!(new MouseEvent('click'));
    expect(rec.paid).toBe(0);
    expect(rec.waitedFor).toEqual([]);
    expect(rec.toasts).toContain(PAYMENT_PROCESSING_MESSAGE);
    expect(document.getElementById('stripePaymentModal')!.classList.contains('hidden')).toBe(true);
  });

  it('odbijena kartica ostavlja modal otvoren s porukom i vraca gumb u rad', async () => {
    const { args, rec } = harness({ error: { message: 'Kartica je odbijena.' } });
    await openStripePaymentModal(args);
    await btn('confirmStripePayment').onclick!(new MouseEvent('click'));
    expect(rec.paid).toBe(0);
    expect(document.getElementById('stripePaymentStatus')!.textContent).toBe('Kartica je odbijena.');
    expect(document.getElementById('stripePaymentModal')!.classList.contains('hidden')).toBe(false);
    expect(btn('confirmStripePayment').disabled).toBe(false);
  });

  it('odlazak na bankovnu stranicu se NE prikazuje kao uspjeh', async () => {
    const { args, rec } = harness({});
    await openStripePaymentModal(args);
    await btn('confirmStripePayment').onclick!(new MouseEvent('click'));
    expect(rec.paid).toBe(0);
    expect(document.getElementById('stripePaymentStatus')!.textContent).toBe('Plaćanje se dovršava kod banke.');
  });

  it('Escape zatvara modal (rukovatelj je u modulu, ne u app.ts)', async () => {
    const { args, rec } = harness({});
    await openStripePaymentModal(args);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('stripePaymentModal')!.classList.contains('hidden')).toBe(true);
    expect(rec.released).toBe(1);
  });

  it('bez markupa modala javlja poruku i ne otvara prazan okvir', async () => {
    document.body.innerHTML = '';
    const { args, rec } = harness({});
    await openStripePaymentModal(args);
    expect(rec.toasts).toEqual(['Plaćanje nije dostupno na ovoj stranici.']);
    expect(rec.trapped).toBe(0);
  });

  it('kad se Stripe.js ne ucita, modal se ne otvara nego se javlja greska', async () => {
    const { args, rec } = harness({});
    (globalThis as { Stripe?: unknown }).Stripe = () => {
      throw new Error('pk je neispravan');
    };
    await openStripePaymentModal(args);
    expect(rec.toasts).toEqual(['Plaćanje se nije učitalo. Pokušaj ponovno.']);
    expect(document.getElementById('stripePaymentModal')!.classList.contains('hidden')).toBe(true);
  });

  it('zatvaranje bez otvaranja ne baca', () => {
    expect(() => closeStripePaymentModal()).not.toThrow();
  });
});
