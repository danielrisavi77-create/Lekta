/**
 * CJENIK: JEDAN IZVOR, JEDAN RACUN (Z11).
 *
 * Tri tvrdnje, i svaka ima mutaciju, jer gard bez dokaza da grize se ne racuna (CLAUDE.md):
 *
 *   1. Racun ispisuje cijenu i prozor ponovnih provjera IZ `src/report/pricing.ts`, za svaku od
 *      cetiri naplatne vrste rada.
 *   2. Iznos NE ovisi o broju odabranih zahvata. To je isti ugovor koji nad panelom popravka cuva
 *      ledger u `repair-price-slider.ts`; ovdje se mjeri na mjestu gdje korisnik cijenu prvi put
 *      vidi. Plan s jednim i plan s devet sigurnih zahvata moraju dati ISTI iznos.
 *   3. NIJEDAN iznos nije literal u modulu prikaza, i nijedan stari izvor cijene nije ostao u
 *      `src/`, `data/`, `saznaj-vise/` ni `index.html`. Ovo je gard nad SAMIM RAZLOGOM Z11: kvar
 *      nije bila kriva cijena nego postojanje vise mjesta koja je tvrde.
 *
 * Zasto se tvrdnja 3 mjeri nad TEKSTOM datoteke a ne nad DOM-om: prikaz s vlastitim literalom
 * izgleda ispravno tocno dok se cijena ne promijeni, pa ga nijedna tvrdnja o ispisu ne vidi.
 *
 * Citanje s diska normalizira CR: repo ima `core.autocrlf`, pa bi usporedba sirovih bajtova mjerila
 * konfiguraciju gita, a ne sadrzaj (CLAUDE.md).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  renderPricingReceipt,
  type PricingReceiptCta,
  type PricingReceiptPlan,
} from '../src/shared/pricing-receipt';
import { renderPricingLetter } from '../src/shared/pricing-letter';
import {
  PRICING_COPY,
  WORK_TYPE_ORDER,
  WORK_TYPE_TIERS,
  formatEurAmount,
  formatEurPrice,
} from '../src/report/pricing';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8').replace(/\r/g, '');

function mount(): HTMLElement {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  return host;
}

/** Odrediste CTA-a u testovima. Racun ga trazi uvijek, pa ga i tvrdnje o necem drugom moraju dati. */
const ULAZ: PricingReceiptCta = { href: '/#analyzer' };

const tekst = (host: HTMLElement, pr: string): string =>
  host.querySelector<HTMLElement>(`[data-pr="${pr}"]`)?.textContent ?? '';

/** Plan s `n` sigurnih zahvata; oblik je onaj koji `buildRepairPlan` stvarno vraca. */
function planSa(n: number): PricingReceiptPlan {
  return {
    sigurni: Array.from({ length: n }, (_, i) => ({
      ruleId: `pravilo-${i}`,
      label: `Zahvat ${i}`,
      prije: null,
      poslije: null,
      potvrda: null,
      preporuka: false,
    })),
    odluka: [],
    rucni: [],
  };
}

/* ---------------------------------------------------------------------------------------------- *
 * 1. Cijena i dani dolaze iz pricing.ts
 * ---------------------------------------------------------------------------------------------- */

describe('racun ispisuje cijenu i prozor iz pricing.ts', () => {
  it.each([...WORK_TYPE_ORDER])('%s: iznos i dani su tierovi, ne prepisane vrijednosti', (workType) => {
    const tier = WORK_TYPE_TIERS[workType];
    const host = mount();
    renderPricingReceipt(host, { workType, live: false, cta: ULAZ });

    expect(tekst(host, 'repair-amount')).toBe(formatEurAmount(tier.priceEur));
    expect(tekst(host, 'total')).toBe(formatEurPrice(tier.priceEur));
    // Prozor ponovnih provjera je dio opsega, pa se cita iz opsega a ne iz zasebnog polja.
    expect(tekst(host, 'scope')).toContain(`${tier.windowDays} ${PRICING_COPY.opsegDana}`);
    expect(tekst(host, 'scope')).toContain(PRICING_COPY.opsegPonovneProvjere);
  });

  it('besplatna stavka je uvijek nula i uvijek prisutna', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: false, cta: ULAZ });
    expect(tekst(host, 'free-amount')).toBe(formatEurAmount(0));
    expect(host.textContent).toContain(PRICING_COPY.besplatnaStavka);
  });

  it('opcenit racun nosi izbornik vrste rada, a racun iz analize ne nosi', () => {
    const opcenit = mount();
    renderPricingReceipt(opcenit, { workType: 'seminarski', live: false, cta: ULAZ });
    expect(opcenit.querySelector('[data-pr="worktype"]')).toBeTruthy();
    expect(tekst(opcenit, 'subject')).toBe(PRICING_COPY.opciPredmet);

    const osoban = mount();
    renderPricingReceipt(osoban, {
      workType: 'diplomski',
      live: false,
      cta: ULAZ,
      fileName: 'diplomski-rad-final-v3.docx',
      plan: planSa(2),
    });
    // Vrstu rada je ondje odredio profil; izbornik bi je dopustio promijeniti bez nove analize.
    expect(osoban.querySelector('[data-pr="worktype"]')).toBeNull();
    expect(tekst(osoban, 'subject')).toBe('diplomski-rad-final-v3.docx');
  });

  it('izbornik vrste rada prevede odabir u cijenu tog tiera', () => {
    const host = mount();
    const racun = renderPricingReceipt(host, { workType: 'seminarski', live: false, cta: ULAZ });
    const izbornik = host.querySelector<HTMLSelectElement>('[data-pr="worktype"]')!;
    izbornik.value = 'doktorski';
    izbornik.dispatchEvent(new Event('change'));

    expect(racun.workType()).toBe('doktorski');
    expect(tekst(host, 'total')).toBe(formatEurPrice(WORK_TYPE_TIERS.doktorski.priceEur));
    expect(tekst(host, 'scope')).toContain(`${WORK_TYPE_TIERS.doktorski.windowDays} ${PRICING_COPY.opsegDana}`);
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * Ziva cijena s checkouta (priceEur) nadjacava zadanu iz pricing.ts
 * ---------------------------------------------------------------------------------------------- */

describe('options.priceEur nadjacava zadanu cijenu iz WORK_TYPE_TIERS', () => {
  it('kad je priceEur zadan, ispisuje se on, ne zadana cijena tiera', () => {
    const host = mount();
    const racun = renderPricingReceipt(host, {
      workType: 'diplomski', live: true, cta: ULAZ, priceEur: 4.5,
    });
    expect(tekst(host, 'repair-amount')).toBe(formatEurAmount(4.5));
    expect(tekst(host, 'total')).toBe(formatEurPrice(4.5));
    expect(racun.totalEur()).toBe(4.5);
    expect(tekst(host, 'cta')).toBe(`${PRICING_COPY.ctaPopravi} ${formatEurPrice(4.5)}`);
  });

  it('bez priceEur, i dalje pada natrag na zadanu cijenu iz WORK_TYPE_TIERS', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: false, cta: ULAZ });
    expect(tekst(host, 'total')).toBe(formatEurPrice(WORK_TYPE_TIERS.diplomski.priceEur));
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * Plan popravka: stvarno stanje (sigurno / odluka / rucno), "i jos N", prazan sigurni
 * ---------------------------------------------------------------------------------------------- */

function stavka(oznaka: string) {
  return { ruleId: oznaka, label: `Zahvat ${oznaka}`, prije: null, poslije: null, potvrda: null, preporuka: false };
}
function rucniStavka(oznaka: string) {
  return { naslov: `Rucno ${oznaka}`, razlog: 'razlog' };
}

describe('opseg racuna prikazuje stvarno stanje plana (Z11)', () => {
  it('plan 0 sigurnih / 3 odluke / 2 rucna: BEZ opcenitog popisa, sa recenicom i brojevima', () => {
    const host = mount();
    renderPricingReceipt(host, {
      workType: 'diplomski', live: false, cta: ULAZ, fileName: 'rad.docx',
      plan: {
        sigurni: [],
        odluka: [stavka('a'), stavka('b'), stavka('c')],
        rucni: [rucniStavka('a'), rucniStavka('b')],
      },
    });
    const opseg = tekst(host, 'scope');
    expect(opseg).toContain(PRICING_COPY.opsegBezSigurnih);
    // Opceniti popis NIJE izmjeren na ovom radu, pa se ne smije prikazati kao da jest.
    for (const redak of PRICING_COPY.opsegOpci) expect(opseg).not.toContain(redak.label);
    expect(opseg).toContain(PRICING_COPY.opsegBrojOdluka);
    expect(opseg).toContain('3');
    expect(opseg).toContain(PRICING_COPY.opsegBrojRucnih);
    expect(opseg).toContain('2');
  });

  it('plan sa 7 sigurnih: imenuje MAX_IMENOVANIH_ZAHVATA (3) i dodaje "i jos 4"', () => {
    const host = mount();
    renderPricingReceipt(host, {
      workType: 'diplomski', live: false, cta: ULAZ, fileName: 'rad.docx',
      plan: {
        sigurni: Array.from({ length: 7 }, (_, i) => stavka(String(i))),
        odluka: [], rucni: [],
      },
    });
    const opseg = tekst(host, 'scope');
    expect(opseg).toContain('Zahvat 0');
    expect(opseg).toContain('Zahvat 1');
    expect(opseg).toContain('Zahvat 2');
    expect(opseg).not.toContain('Zahvat 3');
    expect(opseg).toContain(`${PRICING_COPY.opsegJos} 4`);
    expect(opseg).toContain(PRICING_COPY.opsegBrojSigurnih);
    expect(opseg).toContain('7');
  });

  it('bez plana (opcenit racun): i dalje crta opceniti popis, jer NISTA nije izmjereno', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: false, cta: ULAZ });
    const opseg = tekst(host, 'scope');
    for (const redak of PRICING_COPY.opsegOpci) expect(opseg).toContain(redak.label);
    expect(opseg).not.toContain(PRICING_COPY.opsegBezSigurnih);
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * Pecat "ponovna provjera prije preuzimanja": vidljiv citacu ekrana, dovoljan kontrast (Z11)
 * ---------------------------------------------------------------------------------------------- */

describe('pecat racuna je vidljiv citacu ekrana', () => {
  it('pecat NEMA aria-hidden: jedini je nositelj tvrdnje o ponovnoj provjeri prije preuzimanja', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: false, cta: ULAZ });
    const pecat = host.querySelector('.pr-stamp')!;
    expect(pecat.hasAttribute('aria-hidden')).toBe(false);
    expect(pecat.textContent).toContain(PRICING_COPY.pecat.join(''));
  });

  it('CSS pecata ne postavlja opacity (prigusenje bi srusilo efektivni kontrast)', () => {
    const css = read('src/shared/pricing-receipt.css');
    const blok = css.slice(css.indexOf('.pr-stamp {'), css.indexOf('}', css.indexOf('.pr-stamp {')));
    expect(blok).not.toMatch(/opacity\s*:/);
    expect(blok).toMatch(/font-size:\s*11px/);
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * "cijene s PDV-om" nema izvor u repozitoriju (Z11)
 * ---------------------------------------------------------------------------------------------- */

describe('PRICING_COPY ne tvrdi PDV bez izvora', () => {
  it('nijedan natpis u PRICING_COPY ne spominje PDV', () => {
    const spojeno = JSON.stringify(PRICING_COPY);
    expect(spojeno).not.toMatch(/PDV/i);
  });

  it('MUTACIJA: vracena "s PDV-om" tvrdnja u sitniTekst pada gard', () => {
    const mutiran = { ...PRICING_COPY, sitniTekst: `${PRICING_COPY.sitniTekst} · cijene s PDV-om` };
    expect(JSON.stringify(mutiran)).toMatch(/PDV/i);
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * 2. Preklopnik i neovisnost iznosa o broju zahvata
 * ---------------------------------------------------------------------------------------------- */

describe('preklopnik popravka', () => {
  it('iskljucen daje nulu, ukljucen daje cijenu tiera', () => {
    const host = mount();
    const racun = renderPricingReceipt(host, { workType: 'diplomski', live: false, cta: ULAZ });
    const preklopnik = host.querySelector<HTMLInputElement>('[data-pr="toggle"]')!;

    expect(racun.repairSelected()).toBe(true);
    expect(tekst(host, 'total')).toBe(formatEurPrice(WORK_TYPE_TIERS.diplomski.priceEur));

    preklopnik.checked = false;
    preklopnik.dispatchEvent(new Event('change'));
    expect(racun.repairSelected()).toBe(false);
    expect(racun.totalEur()).toBe(0);
    expect(tekst(host, 'total')).toBe(formatEurPrice(0));

    preklopnik.checked = true;
    preklopnik.dispatchEvent(new Event('change'));
    expect(tekst(host, 'total')).toBe(formatEurPrice(WORK_TYPE_TIERS.diplomski.priceEur));
  });

  it('opseg se skriva kad popravak nije odabran, jer tada nije ukljucen u cijenu', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: false, cta: ULAZ });
    const opseg = host.querySelector<HTMLElement>('[data-pr="scope"]')!;
    expect(opseg.hidden).toBe(false);

    const preklopnik = host.querySelector<HTMLInputElement>('[data-pr="toggle"]')!;
    preklopnik.checked = false;
    preklopnik.dispatchEvent(new Event('change'));
    expect(host.querySelector<HTMLElement>('[data-pr="scope"]')!.hidden).toBe(true);
  });

  /**
   * ATRIBUT `hidden` SAM NE SKRIVA NISTA kad autorski CSS elementu daje `display`.
   *
   * Tvrdnja iznad je prolazila, a preglednik bi opseg svejedno crtao: `.pr-scope{display:grid}` je
   * AUTORSKO pravilo i pobjedjuje UA pravilo `[hidden]{display:none}` bez obzira na specificnost.
   * Zato repozitorij i ima `.tab-details[hidden]`, `.result-details[hidden]` i `.ks-video-play[hidden]`
   * u `page-app.css`; globalnog `[hidden]` pravila NEMA.
   *
   * Ovo je onaj razred laznog zelenog gdje gard mjeri svojstvo u DOM-u, a ne ono sto se nacrta, pa
   * se mjeri CSS: `opseg.hidden === true` je istina i kad je element vidljiv.
   */
  it('CSS stvarno skriva opseg, ne samo atribut hidden', () => {
    const css = read('src/shared/pricing-receipt.css').replace(/\s+/g, '');
    expect(css).toContain('.pr-scope[hidden]{display:none');
  });

  it('MUTACIJA: bez pravila .pr-scope[hidden] gard pada', () => {
    const mutirano = read('src/shared/pricing-receipt.css')
      .replace('.pr-scope[hidden] { display: none; }', '')
      .replace(/\s+/g, '');
    expect(mutirano).not.toContain('.pr-scope[hidden]{display:none');
  });

  it('IZNOS NE OVISI O BROJU ZAHVATA: plan s 1 i plan s 9 daju isti iznos', () => {
    const jedan = mount();
    const a = renderPricingReceipt(jedan, {
      workType: 'diplomski', live: false, cta: ULAZ, fileName: 'rad.docx', plan: planSa(1),
    });
    const iznosJedan = tekst(jedan, 'total');

    const devet = mount();
    const b = renderPricingReceipt(devet, {
      workType: 'diplomski', live: false, cta: ULAZ, fileName: 'rad.docx', plan: planSa(9),
    });

    expect(tekst(devet, 'total')).toBe(iznosJedan);
    expect(b.totalEur()).toBe(a.totalEur());
    expect(b.totalEur()).toBe(WORK_TYPE_TIERS.diplomski.priceEur);
  });

  it('opseg imenuje stvarne zahvate iz plana, ali bez cijene po komadu', () => {
    const host = mount();
    renderPricingReceipt(host, {
      workType: 'diplomski',
      live: false,
      cta: ULAZ,
      fileName: 'rad.docx',
      plan: {
        sigurni: [{
          ruleId: 'page.margins', label: 'Lijeva margina',
          prije: '2,0 cm', poslije: '3,0 cm', potvrda: null, preporuka: false,
        }],
        odluka: [], rucni: [],
      },
    });
    const opseg = tekst(host, 'scope');
    expect(opseg).toContain('Lijeva margina');
    expect(opseg).toContain(PRICING_COPY.opsegZahvat);
    // Cijena po komadu je upravo ono sto se ne naplacuje, pa se ne smije ni napisati.
    expect(opseg).not.toContain('€');
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * Soft launch i pismo
 * ---------------------------------------------------------------------------------------------- */

describe('soft launch i pismo za instituciju', () => {
  it('neziv placeni sloj daje onemogucen gumb "Uskoro" uz besplatnu recenicu', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: false, cta: ULAZ });
    const gumb = host.querySelector<HTMLButtonElement>('[data-pr="cta"] button')!;

    expect(gumb.textContent).toBe(PRICING_COPY.ctaUskoro);
    expect(gumb.disabled).toBe(true);
    expect(gumb.getAttribute('aria-disabled')).toBe('true');
    expect(tekst(host, 'cta')).toContain('Provjera radi već sad, besplatno');
  });

  it('ziv placeni sloj mijenja rijec CTA-a po stanju preklopnika', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: true, cta: ULAZ });
    const cta = () => host.querySelector<HTMLElement>('[data-pr="cta-action"]')!;

    expect(cta().textContent).toBe(
      `${PRICING_COPY.ctaPopravi} ${formatEurPrice(WORK_TYPE_TIERS.diplomski.priceEur)}`,
    );

    const preklopnik = host.querySelector<HTMLInputElement>('[data-pr="toggle"]')!;
    preklopnik.checked = false;
    preklopnik.dispatchEvent(new Event('change'));
    expect(cta().textContent).toBe(PRICING_COPY.ctaBesplatno);
  });

  /**
   * CTA U ZIVOM STANJU MORA NEKAMO VODITI.
   *
   * Prva izvedba je ondje crtala omogucen `<button>` i nijednom mu slusacu nije dala ime: klik nije
   * radio nista. Tvrdnja iznad to nije mogla vidjeti, jer je mjerila `textContent` i `disabled`, a
   * oboje je istina i za gumb koji suti. Zato se mjeri UCINAK: poveznica ima odrediste, rukovatelj
   * se pozove na klik.
   *
   * Granicu je zapisala prethodna izvedba cjenika: "Gumb bez ucinka je gori od poveznice koja vodi
   * dalje" (`renderPricing`, commit `1f23c9f9`).
   */
  it('CTA s poveznicom je <a> sa stvarnim odredistem, ne mrtav gumb', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: true, cta: { href: '/#analyzer' } });
    const cta = host.querySelector<HTMLElement>('[data-pr="cta-action"]')!;

    expect(cta.tagName).toBe('A');
    expect((cta as HTMLAnchorElement).getAttribute('href')).toBe('/#analyzer');
    // Onemogucen `<a>` ne postoji; gard je da CTA nije `<button>` bez slusaca.
    expect(host.querySelector('[data-pr="cta"] button')).toBeNull();
  });

  it('CTA s rukovateljem zove rukovatelja na klik, i to sa stanjem racuna', () => {
    const pozivi: Array<{ workType: string; repairSelected: boolean; totalEur: number }> = [];
    const host = mount();
    renderPricingReceipt(host, {
      workType: 'zavrsni',
      live: true,
      cta: { onClick: (stanje) => pozivi.push({ ...stanje }) },
    });

    const gumb = host.querySelector<HTMLButtonElement>('[data-pr="cta-action"]')!;
    expect(gumb.tagName).toBe('BUTTON');
    expect(gumb.disabled).toBe(false);
    gumb.click();
    expect(pozivi).toEqual([{
      workType: 'zavrsni', repairSelected: true, totalEur: WORK_TYPE_TIERS.zavrsni.priceEur,
    }]);

    // Rukovatelj mora vidjeti STANJE u trenutku klika, ne ono od crtanja.
    const preklopnik = host.querySelector<HTMLInputElement>('[data-pr="toggle"]')!;
    preklopnik.checked = false;
    preklopnik.dispatchEvent(new Event('change'));
    host.querySelector<HTMLButtonElement>('[data-pr="cta-action"]')!.click();
    expect(pozivi[1]).toEqual({ workType: 'zavrsni', repairSelected: false, totalEur: 0 });
  });

  /**
   * MUTACIJA nad samim gardom: CTA bez ucinka mora pasti. Poziva se kroz `as unknown`, jer tip vec
   * zabranjuje `{}`; ovo mjeri IZVODJENJE, dakle pozivatelja bez tipova (JS), i tvrdi da ni tada ne
   * nastane omogucen gumb koji suti.
   */
  it('MUTACIJA: ziv sloj bez odredista ne daje omogucen gumb', () => {
    const host = mount();
    renderPricingReceipt(host, {
      workType: 'diplomski', live: true, cta: ({} as unknown) as PricingReceiptCta,
    });
    expect(host.querySelector('[data-pr="cta-action"]')).toBeNull();
    const gumb = host.querySelector<HTMLButtonElement>('[data-pr="cta"] button')!;
    expect(gumb.disabled).toBe(true);
    expect(gumb.textContent).toBe(PRICING_COPY.ctaUskoro);
  });

  it('pismo nosi tekst predloska, kontakt iz konfiguracije i NEMA datum', () => {
    const host = mount();
    renderPricingLetter(host, { contactEmail: 'lekta.kontakt@gmail.com' });

    expect(host.textContent).toContain('Poštovana dekanice, poštovani dekane,');
    expect(host.textContent).toContain('Institucija nije kartica. Institucija je pismo.');
    expect(host.querySelector<HTMLAnchorElement>('.pl-btn')?.href).toContain('lekta.kontakt@gmail.com');

    // BEZ DATUMA: ni u zaglavlju ni bilo gdje u pismu. Staticna stranica s datumom zastarijeva
    // svakim danom u kojem je nitko ne osvjezi.
    const sadrzaj = host.textContent ?? '';
    expect(sadrzaj).not.toMatch(/\d{1,2}\.\s?\d{1,2}\.\s?\d{4}/);
    expect(sadrzaj).not.toMatch(/\b(19|20)\d{2}\b/);
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * Sitni tekst racuna ne smije tvrditi retenciju koju proizvod nema
 * ---------------------------------------------------------------------------------------------- */

/**
 * Cjenik je mjesto gdje korisnik prvi put cita sto se s dokumentom dogadja, pa je i mjesto gdje
 * neistina o tome najskuplje kosta: tko vjeruje da je dokument obrisan, nece ga obrisati.
 *
 * Mjeri se protiv DRUGOG izvora na ISTOJ stranici (FAQ na `/saznaj-vise/`), a ne protiv prepisane
 * recenice u testu: tautoloska tvrdnja "tekst je jednak sam sebi" ne moze pasti. Kad se retencija
 * jednom promijeni, ovaj gard trazi da se promijene OBA mjesta.
 */
const ISTINA_O_RETENCIJI = 'dok ih sam ne obrišeš u Moji popravci';

/**
 * STVARNI GARD, ne prepisana recenica u testu: tvrdi da sitni tekst upucuje na "Moji popravci" i
 * NE tvrdi brisanje nakon preuzimanja. Mutacija ispod poziva OVU funkciju nad kopijom
 * `PRICING_COPY`, ne nad literalom kojem se testira samo sam sebi (CLAUDE.md, "gard bez dokaza da
 * grize se ne racuna"): prije ove izmjene mutacija je gradila string i tvrdila stvari O NJEMU, sto
 * ne moze pasti niti da je stvarni `PRICING_COPY.sitniTekst` prekrsi.
 */
function sitniTekstSlaze(sitniTekst: string): boolean {
  return !sitniTekst.includes('briše se nakon preuzimanja')
    && sitniTekst.includes('Moji popravci')
    && sitniTekst.includes('dok ga sam ne obrišeš');
}

describe('sitni tekst racuna se slaze sa stvarnom retencijom', () => {
  it('FAQ na istoj stranici i dalje tvrdi retenciju do korisnikova brisanja', () => {
    // BASELINE za tvrdnju ispod: ako FAQ promijeni rijeci, gard se mora raspasti ovdje, ne tiho.
    expect(read('saznaj-vise/index.html')).toContain(ISTINA_O_RETENCIJI);
  });

  it('racun ne tvrdi brisanje nakon preuzimanja, nego upucuje na Moji popravci', () => {
    expect(sitniTekstSlaze(PRICING_COPY.sitniTekst)).toBe(true);
  });

  it('tvrdnja je ZIVA na stranici, dakle stvarno se i renderira', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: false, cta: ULAZ });
    expect(host.textContent).toContain('Moji popravci');
    expect(host.textContent).not.toContain('briše se nakon preuzimanja');
  });

  it('MUTACIJA: vracena tvrdnja o brisanju nakon preuzimanja pada STVARNI gard', () => {
    // Kopija PRICING_COPY s vracenom starom (netocnom) recenicom, proslijedjena ISTOJ funkciji
    // koja mjeri pravu vrijednost iznad; ne novi, izmisljeni string.
    const mutiran = {
      ...PRICING_COPY,
      sitniTekst: 'Bez pretplate · dokument ide na server samo za popravak i briše se nakon preuzimanja',
    };
    expect(sitniTekstSlaze(mutiran.sitniTekst)).toBe(false);
  });

  it('MUTACIJA: sitniTekst bez "Moji popravci" pada STVARNI gard', () => {
    const mutiran = { ...PRICING_COPY, sitniTekst: 'Bez pretplate · bez prijave za provjeru' };
    expect(sitniTekstSlaze(mutiran.sitniTekst)).toBe(false);
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * 3. Gard: nijedan drugi izvor cijene
 * ---------------------------------------------------------------------------------------------- */

/** Iznos kao literal (npr. `9,99`) u modulu koji cijenu smije samo ISPISATI. */
function literalniIznosi(tekstDatoteke: string): string[] {
  return tekstDatoteke.match(/\d+,\d\d/g) ?? [];
}

/** Datoteke koje cijenu prikazuju, a ne definiraju. */
const MODULI_PRIKAZA = [
  'src/shared/pricing-receipt.ts',
  'src/shared/pricing-letter.ts',
  'src/routes/learn-more/main.ts',
];

/**
 * Stari izvori cijene. Vokabular je doslovan, ne gradjen iz niza: escape se kroz alat zna izgubiti,
 * a to je poznat razred kvara u ovom repozitoriju (gard nad `git commit`, kontrolni bajt u regexu).
 *
 * `price:\s*(39|69|99)\b` i `priceEur:\s*(39|69|99)\b` (Z11) hvataju NUMERICKI oblik uklonjenog
 * `PACKAGES` popisa (39/69/99 EUR) bez znaka `€`, npr. kad bi se vratio kao JS objekt polje.
 */
const STARI_IZVORI = /39 €|69 €|99 €|od 3,99|pricing-tiers|PRICING_TIERS|price:\s*(39|69|99)\b|priceEur:\s*(39|69|99)\b/;

const PODRUCJA = ['src', 'data', 'saznaj-vise', 'index.html'];

/**
 * Samo tekstualni izvori. `data/` nosi 277 MB, od cega su gotovo sve snimke pravilnika u PDF-u:
 * citati ih kao UTF-8 znaci minute i gomilu smeca u memoriji, a cijena u njima ne zivi.
 */
const TEKSTUALNE = /\.(ts|tsx|js|mjs|mts|cjs|json|html|css|md|txt|csv|svg)$/i;

function datoteke(relativna: string): string[] {
  const puna = join(ROOT, relativna);
  if (!existsSync(puna)) return [];
  if (!statSync(puna).isDirectory()) return TEKSTUALNE.test(relativna) ? [relativna] : [];
  return readdirSync(puna).flatMap((e) => datoteke(`${relativna}/${e}`));
}

function starePojave(citac: (f: string) => string): string[] {
  const nalazi: string[] = [];
  for (const podrucje of PODRUCJA) {
    for (const f of datoteke(podrucje)) {
      let sadrzaj: string;
      try { sadrzaj = citac(f); } catch { continue; }
      sadrzaj.split('\n').forEach((redak, i) => {
        if (STARI_IZVORI.test(redak)) nalazi.push(`${f}:${i + 1}`);
      });
    }
  }
  return nalazi;
}

/**
 * Nosi li `sadrzaj` iznos kao GOLI broj, a ne kao komad duljeg broja.
 *
 * Granica se gleda rucno, po susjednom znaku, isto kao u `tests/design-tokens.test.ts`: regex
 * gradjen iz niza je u ovom repozitoriju poznat razred kvara (escape se kroz alat zna izgubiti,
 * vidi gard nad `git commit` i kontrolni bajt u regexu).
 *
 * Bez te granice gard je LAZNO CRVEN: izmjereno pri uvodjenju, obicni `includes` prijavio je dvije
 * arhivirane snimke fakultetskih stranica (`data/sources/**`), a svih 30 pogodaka bile su
 * koordinate u SVG putanjama (`5.998`, `19.9975`, `9.99318`). Nijedna nije tvrdila cijenu.
 */
function nosiGoliIznos(sadrzaj: string, iznos: string): boolean {
  // Samo ZNAMENKA je granica. Zarez i tocka to NISU: u samom cjeniku iznos stoji kao
  // `priceEur: 3.99,` pa bi sira granica ispustila jedini izvor i gard bi prolazio vakuumski.
  const znamenka = (z: string): boolean => /[0-9]/.test(z);
  let od = sadrzaj.indexOf(iznos);
  while (od !== -1) {
    const prije = od === 0 ? '' : sadrzaj[od - 1];
    const poslije = sadrzaj[od + iznos.length] ?? '';
    if (!znamenka(prije) && !znamenka(poslije)) return true;
    od = sadrzaj.indexOf(iznos, od + 1);
  }
  return false;
}

/**
 * Datoteke koje nose IZNOS neke naplatne vrste rada. Vrijednosti se izvode iz `WORK_TYPE_TIERS`,
 * pa gard ne moze zaostati za cjenikom.
 */
function nositeljiIznosa(citac: (f: string) => string): string[] {
  const iznosi = WORK_TYPE_ORDER.flatMap((w) => {
    const tocka = WORK_TYPE_TIERS[w].priceEur.toFixed(2);
    return [tocka, tocka.replace('.', ',')];
  });
  const nositelji: string[] = [];
  for (const podrucje of PODRUCJA) {
    for (const f of datoteke(podrucje)) {
      let sadrzaj: string;
      try { sadrzaj = citac(f); } catch { continue; }
      if (iznosi.some((i) => nosiGoliIznos(sadrzaj, i))) nositelji.push(f);
    }
  }
  return nositelji;
}

describe('gard: cijena ima tocno jedan izvor', () => {
  it.each(MODULI_PRIKAZA)('%s ne nosi nijedan iznos kao literal', (modul) => {
    // BASELINE: nemutiran ulaz mora biti cist, inace "prolazi" i gard koji vristi na sve.
    expect(literalniIznosi(read(modul))).toEqual([]);
  });

  it('MUTACIJA: podmetnut literal 9,99 u modulu prikaza pada gard', () => {
    const mutirano = `${read('src/shared/pricing-receipt.ts')}\nconst cijena = '9,99 €';\n`;
    expect(literalniIznosi(mutirano)).toContain('9,99');
  });

  it('nijedan stari izvor cijene nije ostao u src, data, saznaj-vise ni index.html', () => {
    expect(starePojave(read)).toEqual([]);
  });

  it('MUTACIJA: vraceni stari popis tierova pada gard', () => {
    // Citac se podmece, pa gard mjeri SVOJ vokabular a ne stanje diska. Bez ovoga bi mutacija
    // trazila stvarno vracanje obrisane datoteke, i gard bi s nulom pojava prolazio vakuumski.
    const mutirano = (f: string): string =>
      f === 'src/routes/learn-more/main.ts'
        ? "import { PRICING_TIERS } from '../../config/pricing-tiers';"
        : read(f);
    expect(starePojave(mutirano)).toEqual(['src/routes/learn-more/main.ts:1']);
  });

  it('MUTACIJA: vracen PACKAGES popis u NUMERICKOM obliku (bez €) pada gard', () => {
    // Doslovno ono sto bi izgledalo kao vraceni PACKAGES: JS objekt s `price: 39` bez znaka €,
    // koji stari (predznakovni) oblik STARI_IZVORI ne bi uhvatio.
    const mutirano = (f: string): string =>
      f === 'src/ui/app.ts'
        ? "const PACKAGES=[{id:'format',name:'Formatiranje rada',price: 39,desc:'x'}];"
        : read(f);
    expect(starePojave(mutirano)).toEqual(['src/ui/app.ts:1']);
  });

  it('pricing.ts je JEDINI nositelj iznosa po vrsti rada', () => {
    // BASELINE. Gard mjeri STVARNE iznose, ne ime simbola: prva izvedba je trazila
    // `priceEur\s*[:=]\s*\d` i prijavila TRI lazna nalaza, jer taj obrazac pogadja i tipsku
    // deklaraciju (`priceEur: number`), i izracun (`priceEur: 0`), i tercijarni izraz
    // (`priceEur : 0`). Nijedan od njih ne tvrdi cijenu. Iznos je tvrdnja; ime polja nije.
    expect(nositeljiIznosa(read)).toEqual(['src/report/pricing.ts']);
  });

  it('MUTACIJA: iznos prepisan u drugu datoteku pada gard', () => {
    const mutirano = (f: string): string =>
      f === 'src/shared/pricing-receipt.ts' ? "const cijena = 9.99;" : read(f);
    expect(nositeljiIznosa(mutirano)).toEqual([
      'src/report/pricing.ts',
      'src/shared/pricing-receipt.ts',
    ]);
  });
});
