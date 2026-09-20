/**
 * STANJE LOKALNOG ZAPISA RADA (korak C7, 2026-09-13). Cista jezgra bez DOM-a: tablica prijelaza i
 * natpisi, provjerljivi bez preglednika, po uzoru na `bootstrap.ts`.
 *
 * ZASTO POSTOJI KAO ZASEBNA FUNKCIJA. Do C7 su tri pisca (dokument u `bootstrap.ts`, profil u
 * `confirmed-profile.ts`, odabir u `repair-selection.ts`) i jedan izravni `store.update`
 * (`revisions.ts`) svaki za sebe vodili `claimedSaved` i slali vlastite jednokratne obavijesti.
 * Korisnik nije imao NIJEDNO mjesto koje kaze u kojem je stanju zapis SADA. Ovdje je jedina adresa
 * na kojoj se odlucuje smije li se reci "Spremljeno", pa ugovor ima jedno mjesto i jedan gard.
 *
 * UGOVORI (gard: `tests/workspace-save-state.test.ts`, s mutacijama):
 *  1. `saved` je dosezljivo ISKLJUCIVO iz `{kind:'outcome', outcome.kind:'written'}`. `queued` iz
 *     svakog stanja daje `saving`: stavljanje u red nije zapis, i to je tocno laz zbog koje korak
 *     postoji (optimisticni indikator koji kaze "spremljeno" cim korisnik klikne).
 *  2. `saved` se NE prenosi preko neuspjeha: svaki neuspjeli ishod iz `saved` daje svoje stanje.
 *  3. `off` je apsorbirajuce dok ne stigne `storage-on`: pohrana koje nema ne moze proizvesti zapis,
 *     pa ni tvrdnju o njemu.
 *  4. Nijedan natpis za `off`, `quota`, `expired` ni `failed` ne sadrzi korijen "sprem". Natpis je
 *     kratak i cita se u prolazu, a "Nije spremljeno" i "Spremljeno" razlikuje jedna rijec koju oko
 *     u prolazu preskoci. Jednokratne obavijesti (`NOTICE_*` u modulima proizvodjaca) su cijele
 *     recenice s negacijom i NAMJERNO nisu pod ovim sentinelom: "Revizija nije spremljena (...)" je
 *     posten iskaz, a preformuliranje cetiri postojece poruke radi jednog garda bi bilo pravilo
 *     koje mjeri oblik, ne istinitost.
 *
 * `conflict` SE STAPA U `failed` (odluka C7, prema unakrsnoj provjeri 5.4): pisac sesije vec spaja
 * po polju i pokusava jos jednom, pa je druga kolizija zaredom rijedak kvar mehanike, a korisnik u
 * oba slucaja vidi isto ("zapis nije uspio") i ima isti izlaz (ponoviti radnju). Dva stanja s istim
 * natpisom bila bi dva retka tablice bez razlike koju netko cita.
 *
 * KVOTA DOLAZI IZ STVARNE GRESKE (`outcome.kind === 'quota'`, koju `storeError` izvodi iz
 * `DOMException QuotaExceededError`), nikad iz predvidjanja preko procjene slobodnog prostora u
 * pregledniku. Ovaj modul ne smije spominjati taj API; gard to tvrdi nad izvorom.
 *
 * `storage-on` daje `idle` iz SVAKOG stanja, ne samo iz `off`: to je (ponovni) pocetak pohrane, a
 * indikator nakon njega nema sto tvrditi o zapisu. Time ugovor 1 vrijedi doslovno, bez iznimke za
 * "no-op iz saved".
 *
 * NEMA `saveStateAction`: `/moji-radovi/` nema kontrolu brisanja (samo nabraja i cisti istekle), pa
 * bi poveznica "oslobodi mjesto" obecavala ono sto ruta ne moze. Natpis za kvotu kaze sto jest.
 */
import type { SessionWriteOutcome } from '../../session/session-writer';

export type SaveState = 'off' | 'idle' | 'saving' | 'saved' | 'quota' | 'expired' | 'failed';

export type SaveEvent =
  | { kind: 'storage-off' }
  | { kind: 'storage-on' }
  | { kind: 'queued' }
  | { kind: 'outcome'; outcome: SessionWriteOutcome };

/** Sva stanja, imenovana (ne prebrojana): gard nad tablicom prijelaza petlja po ovom popisu. */
export const SAVE_STATES: readonly SaveState[] = ['off', 'idle', 'saving', 'saved', 'quota', 'expired', 'failed'];

/** Natpisi; `idle` nema natpis jer prazna radna povrsina ne tvrdi nista. */
export const SAVE_LABELS: Readonly<Record<SaveState, string | null>> = Object.freeze({
  off: 'Bez lokalne pohrane',
  idle: null,
  saving: 'Zapisujem',
  saved: 'Spremljeno',
  quota: 'Nema mjesta u lokalnoj pohrani',
  expired: 'Rad je istekao',
  failed: 'Zapis nije uspio',
});

/** Duzi opis za `title`, jer kratki natpis ne moze reci sto korisnik moze uciniti. */
export const SAVE_TITLES: Readonly<Record<SaveState, string | null>> = Object.freeze({
  off: 'Preglednik ne dopusta lokalnu pohranu; rad ostaje samo u ovoj kartici.',
  idle: null,
  saving: 'Promjena ceka upis u lokalnu pohranu.',
  saved: 'Zadnja promjena je potvrdjeno zapisana u lokalnu pohranu ovog preglednika.',
  quota: 'Lokalna pohrana je puna; zadnja promjena nije zapisana. Pogledaj svoje lokalne radove.',
  expired: 'Lokalni zapis ovog rada je istekao (24 sata); promjene se vise ne zapisuju. Ucitaj dokument ponovno.',
  failed: 'Lokalna pohrana je odbila zapis; zadnja promjena nije zapisana. Ponovi radnju.',
});

export function nextSaveState(state: SaveState, event: SaveEvent): SaveState {
  if (event.kind === 'storage-off') return 'off';
  if (event.kind === 'storage-on') return 'idle';
  // `off` je apsorbirajuce: bez pohrane ni red ni ishod ne znace nista.
  if (state === 'off') return 'off';
  if (event.kind === 'queued') return 'saving';
  switch (event.outcome.kind) {
    case 'written': return 'saved';
    case 'quota': return 'quota';
    case 'expired': return 'expired';
    case 'conflict':
    case 'failed':
      return 'failed';
  }
}

export function saveStateLabel(state: SaveState, at?: number): string | null {
  const label = SAVE_LABELS[state];
  if (label === null) return null;
  if (state === 'saved' && at !== undefined && Number.isFinite(at)) {
    const d = new Date(at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${label} ${hh}:${mm}`;
  }
  return label;
}

export type SaveTone = 'neutral' | 'work' | 'ok' | 'warn';

/** Boja je DODATAK tekstu, nikad jedini nosac razlike; zato ton postoji uz natpis, ne umjesto njega. */
export function saveStateTone(state: SaveState): SaveTone {
  switch (state) {
    case 'saving': return 'work';
    case 'saved': return 'ok';
    case 'quota':
    case 'expired':
    case 'failed':
      return 'warn';
    default: return 'neutral';
  }
}
