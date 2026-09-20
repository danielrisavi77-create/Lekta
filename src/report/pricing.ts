/**
 * Cjenovni tierovi i prozori slota (MONETIZATION_AND_ANTI_ABUSE.md sekcije 2 i 5).
 *
 * work_type je dio identiteta slota: slot je vezan na (otisak, work_type). Cijenu i
 * dubinu kontrolira server; ovo je dijeljena konfiguracija koju citaju i klijent (paywall)
 * i Edge Function (window i validacija). Iznosi su u EUR (retail cijene s decimalama,
 * uskladene s landing/usporedba/citat stranicama; MoR provider preracunava po valuti).
 */

/** Naplatne vrste rada (cjenovni tierovi). Razliciti od profilskih WorkType oznaka. */
export type ReportWorkType = 'seminarski' | 'zavrsni' | 'diplomski' | 'doktorski';

export interface WorkTypeTier {
  workType: ReportWorkType;
  label: string;
  priceEur: number;
  /** Prozor slota u danima (koliko dugo re-check istog rada ostaje besplatan). */
  windowDays: number;
  /** Doktorski je cesto na upit i individualna pravila. */
  onRequest?: boolean;
}

export const WORK_TYPE_TIERS: Record<ReportWorkType, WorkTypeTier> = {
  seminarski: { workType: 'seminarski', label: 'Seminarski rad', priceEur: 3.99, windowDays: 7 },
  zavrsni: { workType: 'zavrsni', label: 'Završni rad', priceEur: 5.99, windowDays: 7 },
  diplomski: { workType: 'diplomski', label: 'Diplomski rad', priceEur: 9.99, windowDays: 14 },
  doktorski: { workType: 'doktorski', label: 'Doktorski rad', priceEur: 24.99, windowDays: 14 },
};

/** Vrste rada u redoslijedu cjenika (rastuca cijena); izbornik i testovi ih citaju odavde. */
export const WORK_TYPE_ORDER: readonly ReportWorkType[] = ['seminarski', 'zavrsni', 'diplomski', 'doktorski'];

export function isReportWorkType(value: unknown): value is ReportWorkType {
  return typeof value === 'string' && value in WORK_TYPE_TIERS;
}

/** Tier za naplatnu vrstu rada, ili undefined. */
export function tierFor(workType: string): WorkTypeTier | undefined {
  return isReportWorkType(workType) ? WORK_TYPE_TIERS[workType] : undefined;
}

/** Prozor slota u danima za vrstu rada (default 7 ako je nepoznata). */
export function windowDaysFor(workType: string): number {
  return tierFor(workType)?.windowDays ?? 7;
}

/* -------------------------------------------------------------------------------------------- *
 * NATPISI CJENIKA (Z11: jedan cjenik, jedan izvor).
 *
 * Iznosi i natpisi o iznosu zive OVDJE, a modul prikaza (`src/shared/pricing-receipt.ts`) ih samo
 * ispisuje. Razlog je izmjeren, ne stilski: do 2026-09-20 su postojala TRI neuskladjena izvora
 * cijene: marketinski popis koji je crtao `/saznaj-vise/`, stari popis paketa u `data/`, i ovaj
 * modul sa stvarnom naplatom. Stranica je tvrdila jedno a naplata radila drugo; prva dva izvora su
 * uklonjena u Z11. Prikaz koji nosi VLASTITI tekst o cijeni je treci takav izvor u nastajanju, pa ga
 * `tests/pricing-receipt.test.ts` izricito zabranjuje (nijedan iznos kao literal u modulu prikaza).
 * -------------------------------------------------------------------------------------------- */

/** Iznos kako se pise u hrvatskom cjeniku: decimalni zarez, uvijek dvije znamenke. */
export function formatEurAmount(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Iznos s valutom; za ukupno i za natpis gumba. */
export function formatEurPrice(value: number): string {
  return `${formatEurAmount(value)} €`;
}

/** Redak opsega: sto je ukljuceno u cijenu i u kojoj mjeri (bez cijene po komadu). */
export interface PricingScopeRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Natpisi racuna. Podatak, bez DOM-a: modul prikaza ne smije imati vlastite tekstove o cijeni.
 * Tekst je doslovno iz `design/templates/pricing/Pricing.dc.html`, uz jednu namjernu iznimku koja
 * je zabiljezena uz `besplatnaStavkaNapomena`.
 */
export const PRICING_COPY = {
  racunNaslov: 'Račun prije kupnje',
  /** Predmet racuna kad rad jos nije analiziran. */
  opciPredmet: 'bilo koji .docx',
  izbornikVrsteRada: 'Vrsta rada',

  besplatnaStavka: 'Lokalna provjera forme',
  /**
   * Predlozak ovdje pise "24 pravila · ocjena · popis nalaza". Broj pravila je NAMJERNO izostavljen:
   * nijedan izvor u repozitoriju ne tvrdi 24, a broj bodovanih provjera ovisi o profilu, pa bi ga
   * cjenik tvrdio jace nego sto ga proizvod moze potkrijepiti.
   */
  besplatnaStavkaNapomena: 'Ocjena i popis nalaza. Uvijek uključeno, bez prijave.',

  placenaStavka: 'Popravak forme i puni izvještaj',
  /** Iza oznake vrste rada; cijena je jedna, koliko god zahvata korisnik odabere. */
  placenaStavkaNapomena: 'jedna cijena, koliko god zahvata odabereš.',

  opsegNaslov: 'Opseg · uključeno u cijenu',
  /** Opseg kad rada jos nema: sto popravak pokriva, bez cijene po komadu. */
  opsegOpci: [
    { label: 'Margine, font, prored', value: 'zahvati' },
    { label: 'Numeracija i naslovi', value: 'zahvati' },
    { label: 'Format citata i literature', value: 'zahvati' },
  ] as readonly PricingScopeRow[],
  /** Mjera uz pojedinacni zahvat iz stvarnog plana popravka. */
  opsegZahvat: 'zahvat',
  opsegIzvjestaj: { label: 'Puni izvještaj s objašnjenjem svakog nalaza', value: 'PDF' } as PricingScopeRow,
  opsegPonovneProvjere: 'Ponovne provjere nakon ispravka',
  opsegDana: 'dana',

  ukupnoNaslov: 'Ukupno · po dokumentu',
  pecat: ['Ponovna provjera', 'prije preuzimanja'] as readonly string[],

  ctaPopravi: 'Popravi za',
  ctaBesplatno: 'Provjeri rad besplatno',
  ctaUskoro: 'Uskoro',
  ctaUskoroNapomena: 'Plaćeni sloj je u pripremi. Provjera radi već sad, besplatno.',

  sitniTekst: 'Bez pretplate · bez prijave za provjeru · dokument ide na server samo za popravak i briše se nakon preuzimanja · cijene s PDV-om',
} as const;
