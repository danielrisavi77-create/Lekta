/**
 * INSTITUCIJA NIJE KARTICA, INSTITUCIJA JE PISMO (Z11, `design/templates/pricing/Pricing.dc.html`).
 *
 * Fakultet ne kupuje paket s cjenika nego dogovara ustanovu, pa se ponuda ne smije crtati kao treca
 * kartica uz studentske cijene. List je u `var(--font-doc)` (Georgia), dakle u glasu koji u ovom
 * sustavu glumi TUDJI dokument, a ne u glasu sucelja.
 *
 * BEZ DATUMA U ZAGLAVLJU: datum bi od staticne stranice napravio dokument koji zastarijeva svakim
 * danom u kojem ga nitko ne osvjezi.
 *
 * Nema iznosa: cijena po ustanovi je na upit, pa ovaj modul ne uvozi cjenik.
 */
import './pricing-receipt.css';

/** Tekst pisma, doslovno iz predloska. Podatak, bez DOM-a. */
export const PRICING_LETTER_COPY = {
  eyebrow: 'Za fakultete i katedre',
  naslov: 'Institucija nije kartica. Institucija je pismo.',
  uvod: 'Fakultetski profil pravila, izvještaj za katedru i odobrenje alata za cijeli odsjek dogovaraju se izravno. Cijena po ustanovi, na upit.',
  zaglavljeOznaka: 'ZA FAKULTETE I KATEDRE',
  oslovljavanje: 'Poštovana dekanice, poštovani dekane,',
  tijelo: [
    'Lekta provjerava oblikovanje, strukturu, opseg i citiranje studentskih radova prema pravilniku Vašeg fakulteta, lokalno u pregledniku studenta. Za ustanovu nudimo: profil pravila izrađen iz Vašeg pravilnika i potvrđen s katedrom, zbirni izvještaj o tehničkoj spremnosti radova po odsjeku (bez teksta radova) te odobrenje alata za sve studente odsjeka.',
    'Lekta ne piše, ne prepravlja i ne ocjenjuje sadržaj radova, i nije provjera plagijata. Rado ćemo Vam pokazati profil na uzorku Vaših radova.',
  ] as readonly string[],
  potpisUvod: 'S poštovanjem,',
  potpis: 'Lekta',
  cta: 'Zatraži ponudu',
} as const;

export interface PricingLetterOptions {
  /**
   * Kontakt adresa. Prosljedjuje ju pozivatelj iz produkcijske konfiguracije, pa modul ne uvozi
   * konfiguraciju; adresa se time ne moze razici s onom koju ostatak proizvoda koristi.
   */
  readonly contactEmail: string;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderPricingLetter(mount: HTMLElement, options: PricingLetterOptions): HTMLElement {
  const blok = el('div', 'pl-block');

  const uvodnik = el('div', 'pl-intro');
  uvodnik.append(
    el('p', 'pl-eyebrow', PRICING_LETTER_COPY.eyebrow),
    el('h3', 'pl-title', PRICING_LETTER_COPY.naslov),
    el('p', 'pl-lead', PRICING_LETTER_COPY.uvod),
  );

  const list = el('div', 'pl-letter');
  const zaglavlje = el('div', 'pl-letterhead');
  zaglavlje.append(
    el('span', 'pl-letterhead-brand', PRICING_LETTER_COPY.potpis),
    el('span', 'pl-letterhead-tag', PRICING_LETTER_COPY.zaglavljeOznaka),
  );
  list.append(zaglavlje, el('p', 'pl-salutation', PRICING_LETTER_COPY.oslovljavanje));
  for (const odlomak of PRICING_LETTER_COPY.tijelo) list.append(el('p', 'pl-para', odlomak));

  const potpisBlok = el('p', 'pl-signoff', PRICING_LETTER_COPY.potpisUvod);
  potpisBlok.append(el('br'), el('span', 'pl-sign', PRICING_LETTER_COPY.potpis));
  list.append(potpisBlok);

  const akcije = el('div', 'pl-actions');
  const gumb = el('a', 'pl-btn', PRICING_LETTER_COPY.cta);
  gumb.href = `mailto:${options.contactEmail}`;
  const adresa = el('a', 'pl-mail', options.contactEmail);
  adresa.href = `mailto:${options.contactEmail}`;
  akcije.append(gumb, adresa);
  list.append(akcije);

  blok.append(uvodnik, list);
  mount.replaceChildren(blok);
  return blok;
}
