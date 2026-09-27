/**
 * Ozicenje placanja u stranici (F18 krug 4, nalaz pregleda): modul `src/ui/stripe-payment-modal.ts`
 * ima vlastite testove nad SINTETICKIM markupom, pa bi mogao biti savrseno ispravan, a da ga
 * `app.ts` zove s krivim argumentima ili da `/rad/` nema elemente koje trazi. Tada bi korisnik
 * dobio samo poruku "Plaćanje nije dostupno na ovoj stranici." i nijedan test to ne bi vidio.
 *
 * Ovdje se cita STVARNI `src/ui/app.ts` i STVARNI `rad/index.html`. HTML se parsira kao DOM
 * (ne greppa), a poziv se rastavlja na kljuceve objekta argumenata.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const app = readFileSync(join(ROOT, 'src', 'ui', 'app.ts'), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(join(ROOT, 'rad', 'index.html'), 'utf8');

/** Jedan redak s definicijom funkcije; app.ts drzi svaku funkciju u jednom retku. */
function functionLine(name: string): string {
  const line = app.split('\n').find((l) => l.startsWith(`async function ${name}(`) || l.startsWith(`function ${name}(`));
  if (!line) throw new Error(`${name} nije pronadjen u app.ts`);
  return line;
}

/** Tekst objekta argumenata iz `callee({ ... })`, s uravnotezenim zagradama. */
function objectArgOf(source: string, callee: string): string {
  const start = source.indexOf(`${callee}({`);
  if (start < 0) throw new Error(`${callee}({ nije pronadjen`);
  let depth = 0;
  const open = start + callee.length + 1;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`${callee}({ nema zatvorenu zagradu`);
}

/** Kljuc -> izraz za plitki objekt `a,b:c,d:e`; kraci oblik `a` znaci `a:a`. */
function shallowEntries(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of body.split(',')) {
    const [key, ...rest] = part.split(':');
    const k = key.trim();
    if (!k) continue;
    out.set(k, rest.length ? rest.join(':').trim() : k);
  }
  return out;
}

describe('ozicenje placanja: app.ts -> stripe-payment-modal', () => {
  const line = functionLine('proceedReportCheckout');

  it('proceedReportCheckout lijeno ucitava modul modala i zove openStripePaymentModal', () => {
    expect(line).toContain("import('./stripe-payment-modal')");
    expect(line).toContain('.openStripePaymentModal({');
  });

  it('poziv nosi onPaid (otkljucavanje) i config (cekanje na webhook), uz ostale argumente', () => {
    const args = shallowEntries(objectArgOf(line, '.openStripePaymentModal'));
    // Nastavak nakon naplate mora biti isti koji otkljucava izvjestaj; bez njega bi korisnik
    // platio i ostao pred zakljucanim izvjestajem.
    expect(args.get('onPaid')).toBe('handleUnlockReport');
    // Bez configa waitForEntitlement vraca `unknown` i otkljucava bez cekanja na knjizenje prava.
    expect(args.get('config')).toBe('productionConfig');
    for (const key of ['out', 'toast', 'trapModal', 'releaseModal', 'token']) expect(args.has(key), key).toBe(true);
  });

  it('lijeni uvoz je tipiziran, pa tsc provjerava argumente poziva (bez any)', () => {
    expect(app).toContain("let _stripeModalPromise: Promise<typeof import('./stripe-payment-modal')>|null=null;");
    expect(app).not.toMatch(/_stripeModalPromise\s*:\s*any\b/);
  });
});

describe('ozicenje placanja: stvarni rad/index.html', () => {
  // Ne `DOMParser`: tests/setup/xml-dom.ts ga globalno zamjenjuje XML parserom (xmldom). HTML
  // dokument happy-doma parsira stranicu kao preglednik (isti obrazac kao analyzer-boundary.test.ts).
  const doc = document.implementation.createHTMLDocument('rad');
  doc.documentElement.innerHTML = html;

  it('stripePaymentModal, stripePaymentElement i confirmStripePayment postoje', () => {
    for (const id of ['stripePaymentModal', 'stripePaymentElement', 'confirmStripePayment']) {
      expect(doc.getElementById(id), id).not.toBeNull();
    }
  });

  it('spremnik elementa i gumb za placanje su UNUTAR modala, a modal je skriven dok se ne otvori', () => {
    const modal = doc.getElementById('stripePaymentModal')!;
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(modal.getAttribute('role')).toBe('dialog');
    for (const id of ['stripePaymentElement', 'confirmStripePayment', 'stripePaymentStatus', 'closeStripePayment', 'cancelStripePayment']) {
      const el = doc.getElementById(id);
      expect(el, id).not.toBeNull();
      expect(modal.contains(el), `${id} je unutar #stripePaymentModal`).toBe(true);
    }
    expect(doc.getElementById('confirmStripePayment')!.tagName).toBe('BUTTON');
  });

  it('svaki ID je jedinstven (getElementById inace vraca prvi, mozda krivi)', () => {
    for (const id of ['stripePaymentModal', 'stripePaymentElement', 'confirmStripePayment']) {
      expect(doc.querySelectorAll(`[id="${id}"]`).length, id).toBe(1);
    }
  });
});
