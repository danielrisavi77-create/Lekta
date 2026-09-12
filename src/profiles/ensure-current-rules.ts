/**
 * UTRKA ODABIRA pri dohvatu pravila profila.
 *
 * Zateceni obrazac na svim pozivnim mjestima glasi:
 *
 *     await ensureProfileRules(currentDefinitionId());
 *     const {id,p} = currentProfile();
 *
 * Izgleda ispravno i nije. `currentDefinitionId()` se izracuna PRIJE awaita, a `currentProfile()`
 * poslije njega PONOVNO cita DOM. Ako korisnik promijeni studij ili vrstu rada dok dohvat traje,
 * ucitana su pravila profila A, a razrjesava se profil B. `currentProfile` tada baca, jer neucitano
 * stanje smatra programerskom greskom.
 *
 * Posljedica nije poruka o gresci nego TISINA: na svim pozivnim mjestima taj poziv stoji IZVAN
 * `try` bloka, pa iznimka napusti `runAnalysis` odnosno `submitOrder` kao neuhvacen rejection.
 * Analiza se izgubi, a korisnik vidi samo da se nista nije dogodilo.
 *
 * Zasto je uopce dosezno: dohvat pravila je mrezni poziv, a promjena odabira je klik. Prozor je
 * onoliko dug koliko traje dohvat.
 *
 * UGOVOR: kad ova funkcija zavrsi, za vraceni `id` je `ensure` POZVAN. Petlja ponavlja citanje dok
 * se ne slegne, a i kad se ne slegne, zadnji procitani id se osigura prije povratka. Zato pozivatelj
 * ne mora nista provjeravati da bi izbjegao bacanje; `stable` je tu za odluku o NASTAVKU (npr.
 * prekid analize koju je korisnik odabirom vec napustio) i za dijagnostiku.
 *
 * Zasto je slijeganje pouzdano: razmak izmedju posljednjeg `await ensure(id)` i citanja u
 * `currentProfile()` je mikrozadatak, a promjena odabira dolazi iz korisnickog dogadjaja, dakle
 * makrozadatka. U taj razmak se ne moze ubaciti.
 *
 * DRUGI OBLIK ISTE UTRKE: IZVOR ISTINE NESTANE, a ne samo da se promijeni.
 *
 * `readId` u aplikaciji cita DOM. `disposeAnalyzerApp` u prozoru dohvata odmontira analizator, pa
 * `runtimeDocument()` padne natrag na globalni `document` bez kontrola profila i SLJEDECI `readId()`
 * BACA (`$('#institutionSelect').value` nad `null`). Pozivatelj koji se ne ceka (`updateProfile` je
 * `async`, a svih sest poziva su fire-and-forget) tu iznimku nema kome predati, pa ona ispliva kao
 * NENADZIRANA REJEKCIJA, izvan posla koji ju je izazvao.
 *
 * Izmjereno 2026-09-12: cetiri puna gatea zaredom bila su cista, a peti, koji je trajao 1783 s
 * umjesto uobicajenih ~1200 s, dao je 16 takvih rejekcija. Nijedan test nije pao, svih 5900 je
 * proslo, a vitest je svejedno izasao s 1. Kvar je time izgledao kao opterecenje stroja, a nije.
 *
 * `isLive` je zato IZRICIT i NEOBAVEZAN: bez njega se ponasanje ne mijenja ni za jedan bajt. Kad je
 * predan i vrati `false`, `readId` se vise NE ZOVE i posao se napusta uz `abandoned: true`. Presuda
 * je time USPOREDBA KONTEKSTA, ne hvatanje iznimke: cvor koji fali uz ZIVU montazu ostaje
 * programerska greska i mora ostati glasan (brana u `currentProfile` postoji upravo zato).
 */

export interface EnsuredSelection {
  /** Id za koji je `ensure` sigurno pozvan. `null` znaci da profil nije odabran. */
  id: string | null;
  /** Je li se odabir slegao unutar dopustenog broja pokusaja. */
  stable: boolean;
  /** Koliko je puta `ensure` pozvan; korisno u dijagnostici, jer utrka je inace nevidljiva. */
  rounds: number;
  /**
   * Je li posao napusten jer je izvor istine nestao pod nogama (`isLive` vratio `false`).
   * Bez predanog `isLive` uvijek `false`, pa zateceni pozivatelji ne vide razliku.
   */
  abandoned: boolean;
}

/**
 * @param readId    cita trenutni id iz izvora istine (u aplikaciji: DOM)
 * @param ensure    dohvaca pravila za dani id
 * @param attempts  koliko puta se smije ponoviti prije nego se odabir proglasi nesmirenim
 * @param isLive    NEOBAVEZNO: je li izvor istine jos ziv. Provjerava se POSLIJE svakog awaita,
 *                  prije nego `readId` uopce bude pozvan. Vidi "DRUGI OBLIK ISTE UTRKE" gore.
 */
export async function ensureRulesForCurrentSelection(
  readId: () => string | null,
  ensure: (id: string | null) => Promise<void>,
  attempts = 3,
  isLive?: () => boolean,
): Promise<EnsuredSelection> {
  // Nula ili manje pokusaja nema smisla: bez ijednog poziva `ensure` ugovor ne bi vrijedio.
  const limit = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 1;
  // Bez predanog `isLive` izvor se smatra zivim, pa je ponasanje bajt-identicno zatecenom.
  const ziv = () => (isLive ? isLive() : true);
  let id = readId();
  for (let round = 1; round <= limit; round += 1) {
    await ensure(id);
    if (!ziv()) return { id, stable: false, rounds: round, abandoned: true };
    const after = readId();
    if (after === id) return { id, stable: true, rounds: round, abandoned: false };
    id = after;
  }
  // Odabir se nije slegao. Ugovor ipak vrijedi: zadnji procitani id se osigura, pa pozivatelj
  // koji svejedno nastavi ne moze naletjeti na neucitana pravila.
  await ensure(id);
  return { id, stable: false, rounds: limit + 1, abandoned: !ziv() };
}
