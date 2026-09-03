/**
 * STROJ U SJENI (T16, korak B3).
 *
 * Stroj iz `wizard-machine.ts` ovdje se vozi USPOREDNO sa zatecenim kodom: slusa iste gumbe, vodi
 * vlastito stanje i usporedjuje sto bi `viewFor` pokazao s onim sto DOM stvarno pokazuje. NE pise
 * u DOM i ne mijenja ponasanje aplikacije ni u jednom retku.
 *
 * ZASTO SJENA, a ne odmah preokret. `app.ts` prebacuje prikaz sa 97 rucnih dodira `hidden` i pise
 * `dataset.step` izravno. Preokret bez dokaza da se stroj slaze sa stvarnoscu bio bi pogadjanje;
 * ovako se neslaganje VIDI prije nego itko dira pisca.
 *
 * Neslaganje se PRIJAVLJUJE, nikad ne baca. Iznimka iz dijagnostike koja ruси korisnicki tok bila
 * bi gora od kvara koji lovi.
 */
import { transition, viewFor, type WizardEvent, type WizardState } from './wizard-machine';

const VEZE: ReadonlyArray<readonly [string, WizardEvent]> = [
  ['stepToProfile', 'na-profil'],
  ['stepToAnalyze', 'na-provjeru'],
  ['stepBackProfile', 'natrag-na-profil'],
  ['stepBackDoc', 'natrag-na-dokument'],
];

const PRIKAZI = ['wizardView', 'progressView', 'resultView'] as const;

export interface Neslaganje {
  stanje: WizardState;
  ocekivanKorak: string | null;
  stvarniKorak: string | null;
  ocekivanPrikaz: string;
  stvarniPrikazi: string[];
}

let stanje: WizardState = 'dokument';
/**
 * Elementi na koje je sjena vec ozicena.
 *
 * IDEMPOTENCIJA NIJE UKRAS. Sjena ima JEDNO modulsko stanje, pa bi drugo ozicenje istog gumba
 * pomaknulo stanje DVA puta po kliku i svaki bi prijelaz izgledao kao neslaganje. Izmjereno
 * odmah pri ozicenju u `app.ts`: test koji je sam zvao `oziciSjenu` pao je cim ga je pozvao i
 * `app.ts`.
 */
const ozicani = new WeakSet<Element>();

/** Trenutacno stanje sjene; sluzi testu i dijagnostici, ne proizvodnom toku. */
export function stanjeSjene(): WizardState { return stanje; }

/** Vrati sjenu na pocetak. Postoji zbog testova koji dizu stranicu vise puta. */
export function resetirajSjenu(): void { stanje = 'dokument'; }

/**
 * Usporedi ono sto stroj tvrdi s onim sto DOM pokazuje. `null` znaci slaganje.
 *
 * Vidljivost se cita iz `hidden` klase, jer je to jedini nacin na koji `app.ts` danas prebacuje
 * prikaz. Kad `wizardView` nije vidljiv, `data-step` se NE usporedjuje: stroj tada tvrdi `null`,
 * a DOM zadrzava zadnju vrijednost, sto nije neslaganje nego mrtav podatak.
 */
export function usporediSDom(doc: Document = document): Neslaganje | null {
  const ocekivano = viewFor(stanje);
  const vidljivi = PRIKAZI.filter((id) => {
    const el = doc.getElementById(id);
    return !!el && !el.classList.contains('hidden');
  });
  const korak = doc.getElementById('wizardView')?.getAttribute('data-step') ?? null;

  const prikazSeSlaze = vidljivi.length === 1 && vidljivi[0] === ocekivano.prikaz;
  const korakSeSlaze = ocekivano.korak === null || korak === ocekivano.korak;
  if (prikazSeSlaze && korakSeSlaze) return null;

  return {
    stanje,
    ocekivanKorak: ocekivano.korak,
    stvarniKorak: korak,
    ocekivanPrikaz: ocekivano.prikaz,
    stvarniPrikazi: [...vidljivi],
  };
}

/**
 * Ozici sjenu na iste gumbe koje slusa i `app.ts`.
 *
 * Provjera ide kroz `setTimeout(0)`, jer zatecени rukovatelj pise u DOM u SVOM slusacu; bez
 * odgode bi se usporedjivalo stanje prije upisa i svaki bi prijelaz izgledao kao neslaganje.
 */
export function oziciSjenu(
  doc: Document = document,
  prijavi: (n: Neslaganje) => void = (n) => console.warn('[wizard-sjena] neslaganje', n),
): void {
  for (const [id, dogadaj] of VEZE) {
    const el = doc.getElementById(id);
    if (!el || ozicani.has(el)) continue;
    ozicani.add(el);
    el.addEventListener('click', () => {
      const novo = transition(stanje, dogadaj);
      if (novo === null) {
        prijavi({
          stanje,
          ocekivanKorak: null,
          stvarniKorak: doc.getElementById('wizardView')?.getAttribute('data-step') ?? null,
          ocekivanPrikaz: `(nedopusten prijelaz: ${dogadaj})`,
          stvarniPrikazi: [],
        });
        return;
      }
      stanje = novo;
      setTimeout(() => {
        const n = usporediSDom(doc);
        if (n) prijavi(n);
      }, 0);
    });
  }
}
