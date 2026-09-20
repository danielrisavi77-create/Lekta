/**
 * CJENIK KAO RACUN NA STOLU (Z11, `design/templates/pricing/Pricing.dc.html`).
 *
 * Racun ima dvije stavke i jednu istinu: lokalna provjera je 0,00 i uvijek ukljucena, a popravak
 * forme je JEDNA cijena po vrsti rada. Iznos NIKAD ne ovisi o broju odabranih zahvata; to je isti
 * ugovor koji nad panelom popravka cuva ledger u `src/ui/repair-price-slider.ts`, samo izrecen na
 * mjestu gdje korisnik cijenu prvi put vidi.
 *
 * MODUL NEMA VLASTITE TEKSTOVE O CIJENI. Svi natpisi i sva formatiranja iznosa dolaze iz
 * `src/report/pricing.ts`, koji je jedini izvor. To nije stil nego gard: `tests/pricing-receipt.test.ts`
 * pada ako se u ovoj datoteci pojavi iznos kao literal, jer bi to bio novi izvor cijene u nastajanju,
 * a upravo je to bio kvar koji Z11 zatvara (tri izvora, tri razlicite cijene).
 *
 * OVISNOSTI SU NAMJERNO PLITKE: cijene, tokeni i TIP plana. Plan se uvozi samo kao tip, pa se u
 * izvodjenju ne povlaci nista iz analizatora i racun se moze crtati na stranici koja analizator
 * nema (`/saznaj-vise/`).
 */
import {
  PRICING_COPY,
  WORK_TYPE_ORDER,
  WORK_TYPE_TIERS,
  formatEurAmount,
  formatEurPrice,
  type PricingScopeRow,
  type ReportWorkType,
} from '../report/pricing';
import type { RepairPlan } from '../ui/results/repair-plan';
import './pricing-receipt.css';

/**
 * Onaj dio plana popravka koji racun uopce moze pokazati. `Pick` a ne vlastiti oblik: tako tip
 * ostaje vezan na STVARNI `buildRepairPlan`, pa se preimenovanje polja vidi kao tipska greska
 * umjesto da racun tiho ostane bez opsega.
 */
export type PricingReceiptPlan = Pick<RepairPlan, 'sigurni' | 'odluka' | 'rucni'>;

export interface PricingReceiptOptions {
  /** Naplatna vrsta rada; u opcenitom nacinu je samo pocetni odabir izbornika. */
  readonly workType: ReportWorkType;
  /** Ime analizirane datoteke; kad ga nema, racun je opcenit. */
  readonly fileName?: string | null;
  /** Stvarni plan popravka iz analize; kad ga nema, opseg je opceniti popis. */
  readonly plan?: PricingReceiptPlan | null;
  /** Je li placeni sloj ziv. Neziv znaci gumb "Uskoro", nikad ponuda koja ne radi. */
  readonly live: boolean;
}

export interface PricingReceiptHandle {
  readonly element: HTMLElement;
  /** Je li stavka popravka odabrana. */
  repairSelected(): boolean;
  /** Ukupan iznos u eurima; 0 kad je popravak iskljucen. */
  totalEur(): number;
  /** Vrsta rada po kojoj se racun trenutno obracunava. */
  workType(): ReportWorkType;
  /** Promijeni vrstu rada izvana (npr. kad korisnik promijeni profil). */
  setWorkType(workType: ReportWorkType): void;
}

/** Broj zahvata iz plana koje racun imenuje u opsegu; ostatak je pokriven istom cijenom. */
const MAX_IMENOVANIH_ZAHVATA = 3;

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

/**
 * Opseg racuna. Iz STVARNOG plana kad ga ima, inace opceniti popis iz `PRICING_COPY`.
 *
 * Mjera uz redak je "zahvat", nikad cijena: cijena po komadu je upravo ono sto ovaj proizvod ne
 * naplacuje, pa je ne smije ni napisati.
 */
function opsegRedci(plan: PricingReceiptPlan | null, windowDays: number): PricingScopeRow[] {
  const iz_plana = (plan?.sigurni ?? []).slice(0, MAX_IMENOVANIH_ZAHVATA).map((stavka) => ({
    label: stavka.prije && stavka.poslije
      ? `${stavka.label} ${stavka.prije} → ${stavka.poslije}`
      : stavka.label,
    value: PRICING_COPY.opsegZahvat,
  }));
  const redci: PricingScopeRow[] = iz_plana.length > 0 ? iz_plana : [...PRICING_COPY.opsegOpci];
  redci.push(PRICING_COPY.opsegIzvjestaj);
  redci.push({
    label: PRICING_COPY.opsegPonovneProvjere,
    value: `${windowDays} ${PRICING_COPY.opsegDana}`,
  });
  return redci;
}

function opsegBlok(redci: readonly PricingScopeRow[]): HTMLElement {
  const blok = el('div', 'pr-scope');
  blok.dataset.pr = 'scope';
  blok.append(el('span', 'pr-scope-title', PRICING_COPY.opsegNaslov));
  for (const redak of redci) {
    const red = el('div', 'pr-scope-row');
    red.append(el('span', 'pr-scope-label', redak.label));
    const vodilica = el('span', 'pr-leader');
    vodilica.setAttribute('aria-hidden', 'true');
    red.append(vodilica, el('span', 'pr-scope-value', redak.value));
    blok.append(red);
  }
  return blok;
}

export function renderPricingReceipt(
  mount: HTMLElement,
  options: PricingReceiptOptions,
): PricingReceiptHandle {
  const opcenit = !options.fileName && !options.plan;
  let vrstaRada: ReportWorkType = options.workType;
  let popravakUkljucen = true;

  const racun = el('div', 'pr-receipt');
  racun.setAttribute('role', 'group');
  racun.setAttribute('aria-label', PRICING_COPY.racunNaslov);

  const perforacijaGore = el('div', 'pr-perf pr-perf--top');
  perforacijaGore.setAttribute('aria-hidden', 'true');
  const perforacijaDolje = el('div', 'pr-perf pr-perf--bottom');
  perforacijaDolje.setAttribute('aria-hidden', 'true');

  // Zaglavlje. Bez datuma: datum na racunu koji jos nije kupnja tvrdi transakciju koje nema.
  const zaglavlje = el('div', 'pr-head');
  zaglavlje.append(el('span', 'pr-brand', 'Lekta'), el('span', 'pr-eyebrow', PRICING_COPY.racunNaslov));
  const predmet = el('span', 'pr-subject', options.fileName || PRICING_COPY.opciPredmet);
  predmet.dataset.pr = 'subject';
  zaglavlje.append(predmet);

  // Izbornik vrste rada postoji SAMO u opcenitom nacinu: kad rad postoji, vrstu rada je odredio
  // profil, pa bi je izbornik ovdje dopustio promijeniti bez promjene analize.
  let izbornik: HTMLSelectElement | null = null;
  const izbornikBlok = el('div', 'pr-worktype');
  if (opcenit) {
    const oznaka = el('label', 'pr-worktype-label', PRICING_COPY.izbornikVrsteRada);
    oznaka.htmlFor = 'prWorkType';
    izbornik = el('select', 'pr-worktype-select');
    izbornik.id = 'prWorkType';
    izbornik.dataset.pr = 'worktype';
    for (const vrsta of WORK_TYPE_ORDER) {
      const opcija = el('option', undefined, WORK_TYPE_TIERS[vrsta].label);
      opcija.value = vrsta;
      izbornik.append(opcija);
    }
    izbornik.value = vrstaRada;
    izbornikBlok.append(oznaka, izbornik);
  }

  // Stavka 1: uvijek ukljucena i uvijek 0,00.
  const besplatniRed = el('div', 'pr-line pr-line--fixed');
  const besplatnaKvacica = el('span', 'pr-tick pr-tick--fixed', '✓');
  besplatnaKvacica.setAttribute('aria-hidden', 'true');
  const besplatnoTijelo = el('span', 'pr-line-body');
  besplatnoTijelo.append(
    el('span', 'pr-line-title', PRICING_COPY.besplatnaStavka),
    el('span', 'pr-line-note', PRICING_COPY.besplatnaStavkaNapomena),
  );
  const besplatniIznos = el('span', 'pr-amount', formatEurAmount(0));
  besplatniIznos.dataset.pr = 'free-amount';
  besplatniRed.append(besplatnaKvacica, besplatnoTijelo, besplatniIznos);

  // Stavka 2: preklopnik. Pravi checkbox, ne div s onClickom: tipkovnica i citac ekrana ga dobivaju
  // besplatno, a stanje je citljivo bez cuvanja u modulu.
  const placeniRed = el('label', 'pr-line pr-line--toggle');
  const preklopnik = el('input', 'pr-check');
  preklopnik.type = 'checkbox';
  preklopnik.checked = popravakUkljucen;
  preklopnik.dataset.pr = 'toggle';
  const placenoTijelo = el('span', 'pr-line-body');
  const placeniNaslov = el('span', 'pr-line-title', PRICING_COPY.placenaStavka);
  const placenaNapomena = el('span', 'pr-line-note');
  placenaNapomena.dataset.pr = 'repair-note';
  placenoTijelo.append(placeniNaslov, placenaNapomena);
  const placeniIznos = el('span', 'pr-amount');
  placeniIznos.dataset.pr = 'repair-amount';
  placeniRed.append(preklopnik, placenoTijelo, placeniIznos);

  const stavke = el('div', 'pr-lines');
  stavke.append(besplatniRed, placeniRed);

  let opsegElement = opsegBlok(opsegRedci(options.plan ?? null, WORK_TYPE_TIERS[vrstaRada].windowDays));

  // Ukupno + pecat. Pecat stoji UZ ukupno, ne preko teksta (Z11), i nosi ga aria-hidden jer je
  // ponavljanje tvrdnje koju racun vec pise rijecima.
  const ukupnoRed = el('div', 'pr-total');
  const ukupnoLijevo = el('span', 'pr-total-left');
  ukupnoLijevo.append(el('span', 'pr-eyebrow', PRICING_COPY.ukupnoNaslov));
  const pecat = el('span', 'pr-stamp');
  pecat.setAttribute('aria-hidden', 'true');
  PRICING_COPY.pecat.forEach((redak, i) => {
    if (i > 0) pecat.append(el('br'));
    pecat.append(document.createTextNode(redak));
  });
  ukupnoLijevo.append(pecat);
  const ukupnoIznos = el('span', 'pr-total-amount');
  ukupnoIznos.dataset.pr = 'total';
  ukupnoRed.append(ukupnoLijevo, ukupnoIznos);

  const ctaBlok = el('div', 'pr-cta');
  ctaBlok.dataset.pr = 'cta';

  const sitniTekst = el('p', 'pr-fine', PRICING_COPY.sitniTekst);

  racun.append(perforacijaGore, zaglavlje);
  if (opcenit) racun.append(izbornikBlok);
  racun.append(stavke, opsegElement, ukupnoRed, ctaBlok, sitniTekst, perforacijaDolje);

  const omot = el('div', 'pr-receipt-wrap');
  omot.append(racun);

  function osvjezi(): void {
    const tier = WORK_TYPE_TIERS[vrstaRada];
    placenaNapomena.textContent = `${tier.label} · ${PRICING_COPY.placenaStavkaNapomena}`;
    placeniIznos.textContent = formatEurAmount(tier.priceEur);

    // Ukupno je tier ILI nula. Broj zahvata se u ovoj aritmetici ne pojavljuje, i to je cijeli
    // ugovor ovog racuna.
    ukupnoIznos.textContent = formatEurPrice(popravakUkljucen ? tier.priceEur : 0);

    const noviOpseg = opsegBlok(opsegRedci(options.plan ?? null, tier.windowDays));
    opsegElement.replaceWith(noviOpseg);
    opsegElement = noviOpseg;
    opsegElement.hidden = !popravakUkljucen;

    ctaBlok.replaceChildren();
    if (!options.live) {
      const gumb = el('button', 'pr-btn pr-btn--soon', PRICING_COPY.ctaUskoro);
      gumb.type = 'button';
      gumb.disabled = true;
      gumb.setAttribute('aria-disabled', 'true');
      ctaBlok.append(gumb, el('span', 'pr-cta-note', PRICING_COPY.ctaUskoroNapomena));
      return;
    }
    const gumb = el('button', 'pr-btn pr-btn--live');
    gumb.type = 'button';
    gumb.textContent = popravakUkljucen
      ? `${PRICING_COPY.ctaPopravi} ${formatEurPrice(tier.priceEur)}`
      : PRICING_COPY.ctaBesplatno;
    ctaBlok.append(gumb);
  }

  preklopnik.addEventListener('change', () => {
    popravakUkljucen = preklopnik.checked;
    osvjezi();
  });
  izbornik?.addEventListener('change', () => {
    const odabir = izbornik.value;
    if (odabir === 'seminarski' || odabir === 'zavrsni' || odabir === 'diplomski' || odabir === 'doktorski') {
      vrstaRada = odabir;
      osvjezi();
    }
  });

  osvjezi();
  mount.replaceChildren(omot);

  return {
    element: omot,
    repairSelected: () => popravakUkljucen,
    totalEur: () => (popravakUkljucen ? WORK_TYPE_TIERS[vrstaRada].priceEur : 0),
    workType: () => vrstaRada,
    setWorkType: (workType: ReportWorkType) => {
      vrstaRada = workType;
      if (izbornik) izbornik.value = workType;
      osvjezi();
    },
  };
}
