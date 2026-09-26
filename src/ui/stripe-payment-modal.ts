/**
 * Modal placanja (F18, 2026-09-23): Stripe Payment Element u stranici. U `app.ts` ga poziva
 * `proceedReportCheckout` na mjestu gdje je prije stajao `location.href` na vanjski checkout.
 *
 * Zasto zaseban modul, a ne jos jedan blok u `app.ts`: ratchet `tests/ui-module-budget.test.ts`
 * trazi da monolit `app.ts` ne raste, a i broj rucnih dodira `hidden` ondje ima strop. Cijela
 * logika (ucitavanje Stripe.js, montiranje, potvrda, stanje gumba, otvaranje i zatvaranje) zato
 * zivi ovdje; `app.ts` zadrzava samo lijeni most od tri retka.
 *
 * Ovisnosti o `app.ts` se PRIMAJU kao argumenti (toast, trapModal, releaseModal, config,
 * token, onPaid), a ne uvoze, da modul ne zatvori kruzni uvoz s monolitom koji ga lijeno ucitava.
 *
 * Prije ovoga je paywall radio `location.href` na hosted checkout Merchant of Record providera.
 * Nakon uspjesne naplate nastavlja se ISTIM putem kao prije kad se korisnik vracao s placanja:
 * `onPaid` je `handleUnlockReport`, koji provjeri pravo i otkljuca izvjestaj. ALI tek kad je pravo
 * stvarno knjizeno: stvara ga asinkroni webhook, pa se na njega ceka (`waitForEntitlement`).
 * Bez toga bi handleUnlockReport u istoj sekundi dobio paywall i placenom korisniku ponudio
 * kupnju. Ako pravo ni nakon cekanja nije vidljivo, korisnik dobije poruku da ne placa ponovno,
 * a paywall se NE prikazuje. `processing` (odgodjeni bankovni nacini) nije uspjeh i ne otkljucava.
 *
 * `purchase_completed` se ovdje NE salje: salje ga handleUnlockReport kad otkljucavanje uspije,
 * pa bi drugi poziv ovdje dvaput brojao istu kupnju u KPI-ju.
 */

import {
  loadStripeJs,
  mountPaymentElement,
  confirmPayment,
  waitForEntitlement,
  type EntitlementPollConfig,
  type EntitlementWait,
  type StripeLike,
  type StripeElements,
} from '../report/stripe-payment.ts';

/** Ono sto `createCheckout` vrati na uspjeh; drzi se labavo da modul ne ovisi o cijelom tipu. */
export interface StripePaymentArgs {
  out: { clientSecret: string; publishableKey: string; paymentIntentId?: string };
  toast: (message: string) => void;
  trapModal: (el: Element) => void;
  releaseModal: (el: Element) => void;
  /** Supabase URL i anon kljuc (productionConfig) za provjeru je li pravo knjizeno. */
  config: EntitlementPollConfig;
  token: string | null;
  /** Nastavak nakon naplate; isti koji se prije izvodio pri povratku s placanja. */
  onPaid: () => void | Promise<void>;
  /** Samo za testove: zamjena za cekanje na webhook. */
  waitForBooking?: (paymentIntentId: string) => Promise<EntitlementWait>;
  doc?: Document;
}

/** Poruka kad je placanje potvrdjeno, a webhook pravo jos nije knjizio. */
export const PAID_PENDING_MESSAGE =
  'Plaćanje je primljeno, a potvrda još stiže. Ne plaćaj ponovno: za minutu klikni Otključaj puni izvještaj.';
/** Poruka za nacine placanja koji ostaju u obradi (npr. bankovni prijenos). */
export const PAYMENT_PROCESSING_MESSAGE =
  'Plaćanje se obrađuje. Izvještaj se otključava kad banka potvrdi uplatu; ne plaćaj ponovno.';

function el<T extends HTMLElement>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null;
}

interface ActiveModal {
  modal: HTMLElement;
  release: (el: Element) => void;
  doc: Document;
  onKey: (e: KeyboardEvent) => void;
}

let active: ActiveModal | null = null;

/**
 * Zatvori modal placanja i ocisti spremnik; siguran je i kad modal nikad nije otvoren.
 *
 * Escape hvata ovaj modul, a ne zajednicki rukovatelj u `app.ts`: tako monolit ne mora znati da
 * ovaj modal postoji, pa ratchet velicine `app.ts` ne placa cijenu jos jednog imena.
 */
export function closeStripePaymentModal(): void {
  if (!active) return;
  const { modal, release, doc, onKey } = active;
  active = null;
  doc.removeEventListener('keydown', onKey);
  modal.classList.add('hidden');
  const host = el<HTMLElement>(doc, 'stripePaymentElement');
  if (host) host.innerHTML = '';
  release(modal);
}

/**
 * Otvori modal i montiraj Payment Element za dani PaymentIntent.
 *
 * Greska ucitavanja ili montiranja NE otvara prazan modal: korisnik dobije poruku i ostaje na
 * rezultatu, umjesto da gleda prazan okvir koji izgleda kao pokvareno placanje.
 */
export async function openStripePaymentModal(args: StripePaymentArgs): Promise<void> {
  const doc = args.doc ?? document;
  const modal = el<HTMLElement>(doc, 'stripePaymentModal');
  const host = el<HTMLElement>(doc, 'stripePaymentElement');
  const pay = el<HTMLButtonElement>(doc, 'confirmStripePayment');
  if (!modal || !host || !pay) {
    args.toast('Plaćanje nije dostupno na ovoj stranici.');
    return;
  }
  const status = el<HTMLElement>(doc, 'stripePaymentStatus');

  let stripe: StripeLike;
  let elements: StripeElements;
  try {
    const factory = await loadStripeJs();
    stripe = factory(args.out.publishableKey);
    host.innerHTML = '';
    if (status) status.textContent = '';
    elements = mountPaymentElement({ stripe, clientSecret: args.out.clientSecret, container: host }).elements;
  } catch {
    args.toast('Plaćanje se nije učitalo. Pokušaj ponovno.');
    return;
  }

  for (const id of ['closeStripePayment', 'cancelStripePayment']) {
    const b = el<HTMLButtonElement>(doc, id);
    if (b) b.onclick = closeStripePaymentModal;
  }
  modal.onclick = (e: Event) => {
    if ((e.target as HTMLElement | null)?.id === 'stripePaymentModal') closeStripePaymentModal();
  };

  pay.disabled = false;
  pay.onclick = async () => {
    pay.disabled = true;
    if (status) status.textContent = 'Potvrđujem plaćanje…';
    try {
      const res = await confirmPayment({ stripe, elements, returnUrl: location.href });
      if (res.kind === 'ok') {
        closeStripePaymentModal();
        args.toast('Plaćanje je uspjelo. Čekam potvrdu uplate…');
        const id = args.out.paymentIntentId || res.paymentIntentId;
        const wait = args.waitForBooking ?? ((pi: string) => waitForEntitlement(args.config, args.token, pi));
        const booking = await wait(id);
        // `unknown` (okruzenje bez Supabase konfiguracije) zadrzava stari nastavak bez cekanja.
        if (booking === 'pending') {
          args.toast(PAID_PENDING_MESSAGE);
          return;
        }
        await args.onPaid();
        return;
      }
      if (res.kind === 'processing') {
        closeStripePaymentModal();
        args.toast(PAYMENT_PROCESSING_MESSAGE);
        return;
      }
      // Nacini placanja koji obavezno traze bankovnu stranicu odu na returnUrl; to nije uspjeh
      // i ne smije se tako prikazati.
      if (status) status.textContent = res.kind === 'redirected' ? 'Plaćanje se dovršava kod banke.' : res.message;
    } catch {
      if (status) status.textContent = 'Greška pri potvrdi plaćanja.';
    } finally {
      pay.disabled = false;
    }
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closeStripePaymentModal();
  };
  modal.classList.remove('hidden');
  active = { modal, release: args.releaseModal, doc, onKey };
  doc.addEventListener('keydown', onKey);
  args.trapModal(modal);
  (window as { __lektaIcons?: () => void }).__lektaIcons?.();
}
