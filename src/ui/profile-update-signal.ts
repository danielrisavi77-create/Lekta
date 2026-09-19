/**
 * SIGNAL "PROFIL JE AZURIRAN" (korak C7, 2026-09-13).
 *
 * `updateProfile` u `app.ts` je asinkron: ceka lijeno ucitavanje pravila profila pa crta karticu.
 * Nitko izvana nije mogao znati je li taj rep zavrsio, pa je `tests/confirmed-profile-restore.test.ts`
 * prije demontaze cekao FIKSNIH 400 ms. Pod opterecenjem je to jednom vec palo ("URL is not a
 * constructor": rep je stigao nakon rusenja happy-dom prozora), a i na zelenom gateu je ostavljalo
 * neobradjene poruke. Tajmer mjeri vrijeme, a trazi se DOGADJAJ.
 *
 * Ovdje zivi brojac repova u letu i obecanje koje se ispuni kad ih vise nema. `app.ts` samo omota
 * svoj poziv (`trackProfileUpdate`), a test ceka `profileUpdatesSettled()` umjesto sata. Modul je
 * izvan `app.ts` jer ratchet `tests/ui-module-budget.test.ts` tu datoteku gura prema dolje; ovdje
 * je objasnjenje, ondje jedan redak.
 *
 * Rep koji PADNE se isto broji kao zavrsen: cekatelj zeli znati da nista vise ne dira DOM, ne da je
 * sve uspjelo. Zato `then(done, done)`, bez ponovnog bacanja; izvorno obecanje se vraca netaknuto,
 * pa pozivatelj i dalje vidi svoju gresku.
 */
let uLetu = 0;
let cekatelji: Array<() => void> = [];

export function trackProfileUpdate<T>(update: Promise<T>): Promise<T> {
  uLetu += 1;
  const done = (): void => {
    uLetu -= 1;
    if (uLetu > 0) return;
    const c = cekatelji;
    cekatelji = [];
    for (const f of c) f();
  };
  update.then(done, done);
  return update;
}

/** Ispuni se kad NIJEDAN `updateProfile` nije u letu; odmah ako ih nema. */
export function profileUpdatesSettled(): Promise<void> {
  if (uLetu === 0) return Promise.resolve();
  return new Promise<void>((resolve) => { cekatelji.push(resolve); });
}

/** Brojac u letu; za tvrdnje da signal mjeri stvarne repove, ne prazninu. */
export function profileUpdatesInFlight(): number {
  return uLetu;
}
