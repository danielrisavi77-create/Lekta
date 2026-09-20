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

import { renderPricingReceipt, type PricingReceiptPlan } from '../src/shared/pricing-receipt';
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
    renderPricingReceipt(host, { workType, live: false });

    expect(tekst(host, 'repair-amount')).toBe(formatEurAmount(tier.priceEur));
    expect(tekst(host, 'total')).toBe(formatEurPrice(tier.priceEur));
    // Prozor ponovnih provjera je dio opsega, pa se cita iz opsega a ne iz zasebnog polja.
    expect(tekst(host, 'scope')).toContain(`${tier.windowDays} ${PRICING_COPY.opsegDana}`);
    expect(tekst(host, 'scope')).toContain(PRICING_COPY.opsegPonovneProvjere);
  });

  it('besplatna stavka je uvijek nula i uvijek prisutna', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: false });
    expect(tekst(host, 'free-amount')).toBe(formatEurAmount(0));
    expect(host.textContent).toContain(PRICING_COPY.besplatnaStavka);
  });

  it('opcenit racun nosi izbornik vrste rada, a racun iz analize ne nosi', () => {
    const opcenit = mount();
    renderPricingReceipt(opcenit, { workType: 'seminarski', live: false });
    expect(opcenit.querySelector('[data-pr="worktype"]')).toBeTruthy();
    expect(tekst(opcenit, 'subject')).toBe(PRICING_COPY.opciPredmet);

    const osoban = mount();
    renderPricingReceipt(osoban, {
      workType: 'diplomski',
      live: false,
      fileName: 'diplomski-rad-final-v3.docx',
      plan: planSa(2),
    });
    // Vrstu rada je ondje odredio profil; izbornik bi je dopustio promijeniti bez nove analize.
    expect(osoban.querySelector('[data-pr="worktype"]')).toBeNull();
    expect(tekst(osoban, 'subject')).toBe('diplomski-rad-final-v3.docx');
  });

  it('izbornik vrste rada prevede odabir u cijenu tog tiera', () => {
    const host = mount();
    const racun = renderPricingReceipt(host, { workType: 'seminarski', live: false });
    const izbornik = host.querySelector<HTMLSelectElement>('[data-pr="worktype"]')!;
    izbornik.value = 'doktorski';
    izbornik.dispatchEvent(new Event('change'));

    expect(racun.workType()).toBe('doktorski');
    expect(tekst(host, 'total')).toBe(formatEurPrice(WORK_TYPE_TIERS.doktorski.priceEur));
    expect(tekst(host, 'scope')).toContain(`${WORK_TYPE_TIERS.doktorski.windowDays} ${PRICING_COPY.opsegDana}`);
  });
});

/* ---------------------------------------------------------------------------------------------- *
 * 2. Preklopnik i neovisnost iznosa o broju zahvata
 * ---------------------------------------------------------------------------------------------- */

describe('preklopnik popravka', () => {
  it('iskljucen daje nulu, ukljucen daje cijenu tiera', () => {
    const host = mount();
    const racun = renderPricingReceipt(host, { workType: 'diplomski', live: false });
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
    renderPricingReceipt(host, { workType: 'diplomski', live: false });
    const opseg = host.querySelector<HTMLElement>('[data-pr="scope"]')!;
    expect(opseg.hidden).toBe(false);

    const preklopnik = host.querySelector<HTMLInputElement>('[data-pr="toggle"]')!;
    preklopnik.checked = false;
    preklopnik.dispatchEvent(new Event('change'));
    expect(host.querySelector<HTMLElement>('[data-pr="scope"]')!.hidden).toBe(true);
  });

  it('IZNOS NE OVISI O BROJU ZAHVATA: plan s 1 i plan s 9 daju isti iznos', () => {
    const jedan = mount();
    const a = renderPricingReceipt(jedan, {
      workType: 'diplomski', live: false, fileName: 'rad.docx', plan: planSa(1),
    });
    const iznosJedan = tekst(jedan, 'total');

    const devet = mount();
    const b = renderPricingReceipt(devet, {
      workType: 'diplomski', live: false, fileName: 'rad.docx', plan: planSa(9),
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
    renderPricingReceipt(host, { workType: 'diplomski', live: false });
    const gumb = host.querySelector<HTMLButtonElement>('[data-pr="cta"] button')!;

    expect(gumb.textContent).toBe(PRICING_COPY.ctaUskoro);
    expect(gumb.disabled).toBe(true);
    expect(gumb.getAttribute('aria-disabled')).toBe('true');
    expect(tekst(host, 'cta')).toContain('Provjera radi već sad, besplatno');
  });

  it('ziv placeni sloj mijenja rijec gumba po stanju preklopnika', () => {
    const host = mount();
    renderPricingReceipt(host, { workType: 'diplomski', live: true });
    const gumb = () => host.querySelector<HTMLButtonElement>('[data-pr="cta"] button')!;

    expect(gumb().disabled).toBe(false);
    expect(gumb().textContent).toBe(
      `${PRICING_COPY.ctaPopravi} ${formatEurPrice(WORK_TYPE_TIERS.diplomski.priceEur)}`,
    );

    const preklopnik = host.querySelector<HTMLInputElement>('[data-pr="toggle"]')!;
    preklopnik.checked = false;
    preklopnik.dispatchEvent(new Event('change'));
    expect(gumb().textContent).toBe(PRICING_COPY.ctaBesplatno);
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
 */
const STARI_IZVORI = /39 €|69 €|99 €|od 3,99|pricing-tiers|PRICING_TIERS/;

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
