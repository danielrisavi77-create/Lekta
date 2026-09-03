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
 * TABLICA, NE `switch`. `switch` koji za nepoznat par vrati zatecено stanje propusta sve i onda
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

/** Sva stanja i svi dogadaji, da ih test moze prosetati bez rucnog popisa koji zna odlutati. */
export const SVA_STANJA: readonly WizardState[] = Object.keys(TABLICA) as WizardState[];
export const SVI_DOGADAJI: readonly WizardEvent[] = [
  'na-profil', 'na-provjeru', 'natrag-na-profil', 'natrag-na-dokument',
  'pokreni-analizu', 'analiza-gotova', 'analiza-prekinuta', 'nova-analiza',
];
