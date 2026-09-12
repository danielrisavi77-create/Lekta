/**
 * STROJ STANJA CAROBNJAKA (T16, korak B2). Cist modul: nema uvoza, ne dira DOM, ne cita globalno
 * stanje. Zato se moze pozvati i iz testa i iz `gate-mutations`, koji je sinkron.
 *
 * ZASTO POSTOJI. `app.ts` danas nema stroj: `setWizardStep(n)` pise IZRAVNO u `dataset.step`, a
 * vidljivost triju prikaza prebacuje se odvojeno, s 97 rucnih dodira `hidden`. Nista ne tvrdi koji
 * je prijelaz dopusten, pa nedopusten prijelaz nije greska nego samo jos jedan upis.
 *
 * KOLIKO STANJA. Plan je govorio o deset; izmjereno ih je PET, i to je ono sto se moze dokazati.
 * `setWizardStep` ima tri koraka unutar `wizardView`, a uz njih stoje jos dva prikaza
 * (`progressView`, `resultView`) koji se pale i gase zasebno. Ostalo su podstanja unutar rezultata
 * (kokpit, nalazi, paneli), koja ne mijenjaju ni korak ni vidljivi prikaz, pa u ovaj stroj ne
 * spadaju; kad se poklopi da spadaju, dodaju se uz mjeru, ne uz pretpostavku.
 *
 * TABLICA, NE `switch`. `switch` koji za nepoznat par vrati zateceno stanje propusta sve i onda
 * gard nad njim ne tvrdi nista. Ovdje nedopusten par vraca `null`, sto pozivatelj mora obraditi.
 */

export type WizardState = 'dokument' | 'profil' | 'provjera' | 'analiza' | 'rezultat';

export type WizardEvent =
  | 'na-profil'
  | 'na-provjeru'
  | 'natrag-na-profil'
  | 'natrag-na-dokument'
  | 'pokreni-analizu'
  | 'analiza-gotova'
  | 'analiza-prekinuta'
  | 'nova-analiza';

/** Jedini vidljivi prikaz za dano stanje. Nikad dva, i to je invarijanta koju test tvrdi. */
export type WizardView = 'wizardView' | 'progressView' | 'resultView';

const TABLICA: Readonly<Record<WizardState, Readonly<Partial<Record<WizardEvent, WizardState>>>>> = {
  dokument: { 'na-profil': 'profil' },
  profil: { 'na-provjeru': 'provjera', 'natrag-na-dokument': 'dokument' },
  provjera: {
    'pokreni-analizu': 'analiza',
    'natrag-na-profil': 'profil',
    'natrag-na-dokument': 'dokument',
  },
  analiza: { 'analiza-gotova': 'rezultat', 'analiza-prekinuta': 'provjera' },
  rezultat: { 'nova-analiza': 'dokument' },
};

/** Novo stanje, ili `null` ako prijelaz nije dopusten. `null` je odgovor, ne greska. */
export function transition(stanje: WizardState, dogadaj: WizardEvent): WizardState | null {
  return TABLICA[stanje][dogadaj] ?? null;
}

/**
 * JEDINI izvor istine za ono sto DOM treba pokazati. `korak` je `null` kad `wizardView` nije
 * vidljiv, jer tada `data-step` nikoga ne zanima i ne smije se tumaciti.
 */
export function viewFor(stanje: WizardState): { prikaz: WizardView; korak: '1' | '2' | '3' | null } {
  switch (stanje) {
    case 'dokument': return { prikaz: 'wizardView', korak: '1' };
    case 'profil': return { prikaz: 'wizardView', korak: '2' };
    case 'provjera': return { prikaz: 'wizardView', korak: '3' };
    case 'analiza': return { prikaz: 'progressView', korak: null };
    case 'rezultat': return { prikaz: 'resultView', korak: null };
  }
}

/**
 * KORISNICKA FAZA, projekcija stanja (korak B1, 2026-09-10).
 *
 * Korisnik ne barata s pet stanja nego s tri faze: sto radi s dokumentom, sto mu provjera kaze,
 * i sto popravlja. Faza je zato IZVEDENA iz stanja, a ne cetvrti podatak koji netko odrzava
 * usporedno. Kopija bi se mogla razici sa strojem; izvod ne moze.
 *
 * PAZI NA SUDAR IMENA, jer je zamka a ne previd: stanje `provjera` pripada fazi `dokument`.
 * Stanje `provjera` je TRECI KORAK CAROBNJAKA, ekran s naprednim postavkama i gumbom koji analizu
 * tek POKRECE, dakle jos uvijek priprema. Faza `provjera` pocinje kad analiza krene.
 *
 * OVO MIJENJA ZATECENO PONASANJE TRAKE, svjesno. Do danas je CSS palio cetvrti korak ("Popravci")
 * cim je nalaz na ekranu (`page-app.css`: "Cetvrti je aktivan dok je nalaz na ekranu, jer se
 * popravci biraju ondje"). Time je traka tvrdila da korisnik popravlja dok on jos samo cita nalaz.
 * Prema specifikaciji vlasnika nalaz pripada fazi Provjera, a Popravak pocinje odabirom zahvata.
 */
export type WizardPhase = 'dokument' | 'provjera' | 'popravak';

const FAZA_ZA_STANJE: Readonly<Record<WizardState, WizardPhase>> = {
  dokument: 'dokument',
  profil: 'dokument',
  provjera: 'dokument',
  analiza: 'provjera',
  rezultat: 'provjera',
};

/** Faza kojoj stanje pripada. Totalna funkcija: svako stanje ima tocno jednu fazu. */
export function phaseFor(stanje: WizardState): WizardPhase {
  return FAZA_ZA_STANJE[stanje];
}

/** Redom kojim ih korisnik prolazi. Traka crta ovaj niz, pa poredak nije stvar stila. */
export const SVE_FAZE: readonly WizardPhase[] = ['dokument', 'provjera', 'popravak'];

/** Natpisi zive uz fazu, ne uz markup, da se traka i stroj ne mogu razici. */
export const FAZA_NATPIS: Readonly<Record<WizardPhase, string>> = {
  dokument: 'Dokument',
  provjera: 'Provjera',
  popravak: 'Popravak',
};

/** Sva stanja i svi dogadaji, da ih test moze prosetati bez rucnog popisa koji zna odlutati. */
export const SVA_STANJA: readonly WizardState[] = Object.keys(TABLICA) as WizardState[];
export const SVI_DOGADAJI: readonly WizardEvent[] = [
  'na-profil', 'na-provjeru', 'natrag-na-profil', 'natrag-na-dokument',
  'pokreni-analizu', 'analiza-gotova', 'analiza-prekinuta', 'nova-analiza',
];
