/**
 * ISHOD POPRAVKA: sto je stvarno napravljeno, prije nego sto je ocjena.
 *
 * Deveta tocka vlasnikova pregleda: "POPRAVAK ZAVRSEN / 3 / 3 zahvata primijenjena / 0 novih
 * problema", pa tablica prije/poslije, pa dvije jednakovrijedne radnje.
 *
 * ZATECENO JE VODILO OCJENOM ("Spremnost: 82 -> 88"), a to je ista zamjena koju je peta tocka vec
 * ispravila na ekranu rezultata: broj je posljedica, a djelo je ono sto je korisnik platio. Zato
 * ovaj blok stoji ISPRED retka s ocjenom, i zato ponovna provjera nove verzije vise nije `btn-sm`
 * sporedna radnja: preuzimanje je inace izgledalo kao jedini kraj puta, a korisnik bi zakljucio
 * "nista se nije dogodilo" jer ocjena u glavnom izvjestaju ostaje stara (RE-37).
 *
 * "0 NOVIH PROBLEMA" I "NE ZNAM" NISU ISTO, i to je jedina tvrdnja ovog modula koju je lako
 * izgubiti. Kad ponovna analiza padne (a pada, npr. na uredaju bez memorije), broj regresija nije
 * nula nego NEPOZNAT. Nula bi ondje bila izmisljena umirujuca tvrdnja o dokumentu koji nitko nije
 * pogledao. Ugovor i mutacije: `tests/repair-done.test.ts`.
 */
import { pluralHr } from './plural-hr';

export interface DoneRedak {
  readonly naziv: string;
  readonly prije: string;
  readonly poslije: string;
}

export interface RepairDone {
  /** Koliko je CILJANIH provjera stvarno razrijeseno, i koliko ih je bilo. */
  readonly primijenjeno: number;
  readonly ciljano: number;
  /** `null` znaci NEPOZNATO (ponovna provjera nije uspjela), nikad "nula". */
  readonly novihProblema: number | null;
  readonly redci: readonly DoneRedak[];
  readonly potpun: boolean;
}

export interface DoneUlaz {
  /** Ishod iz `summarizeRepairOutcome`; `null` kad se nije imalo sto mjeriti. */
  readonly outcome: { readonly targeted: readonly string[]; readonly resolved: readonly string[] } | null;
  /** Regresije NAKON `dropStaleFieldRegressions`; `null` kad ponovna analiza nije uspjela. */
  readonly regresije: readonly unknown[] | null;
  readonly changelog: readonly { readonly ruleId: string; readonly beforeLabel: string; readonly afterLabel: string }[];
}

export function repairDoneModel(u: DoneUlaz): RepairDone {
  const ciljano = u.outcome?.targeted.length ?? 0;
  const primijenjeno = u.outcome?.resolved.length ?? 0;
  const redci = u.changelog
    // Prazan `afterLabel` nema sto reci u stupcu "poslije", a redak sa strelicom u prazno tvrdi
    // promjenu koju ne moze pokazati. Isti izbor koji vec radi `repair-diff.ts`.
    .filter((c) => !!c.afterLabel)
    .map((c) => ({ naziv: c.ruleId, prije: c.beforeLabel || c.ruleId, poslije: c.afterLabel }));
  return {
    primijenjeno,
    ciljano,
    novihProblema: u.regresije === null ? null : u.regresije.length,
    redci,
    potpun: ciljano > 0 && primijenjeno === ciljano,
  };
}

function novoStanjeHtml(n: number | null): string {
  if (n === null) {
    // NE ZNAM se pise kao ne znam. Sutnja bi se procitala kao "nema novih problema".
    return '<p class="rd__novi rd__novi--nepoznato">Novu verziju nije bilo moguće provjeriti na ovom '
      + 'uređaju, pa ne možemo tvrditi da nema novih problema.</p>';
  }
  if (n === 0) return '<p class="rd__novi rd__novi--cisto">0 novih problema</p>';
  return `<p class="rd__novi rd__novi--pozor">${n} ${pluralHr(n, ['nov problem', 'nova problema', 'novih problema'])}</p>`;
}

export function repairDoneHtml(m: RepairDone, esc: (v: string) => string): string {
  // TRI NASLOVA, ne dva: bez ijedne ciljane provjere se nema sto zvati ni zavrsenim ni
  // djelomicnim, pa bi oba bila tvrdnja o mjerenju koje se nije dogodilo.
  const naslov = m.ciljano === 0
    ? 'Popravak primijenjen'
    : m.potpun ? 'Popravak završen' : 'Popravak primijenjen djelomično';
  const brojka = m.ciljano > 0
    ? `<p class="rd__brojka"><strong>${m.primijenjeno} / ${m.ciljano}</strong> `
      + `${pluralHr(m.primijenjeno, ['zahvat primijenjen', 'zahvata primijenjena', 'zahvata primijenjeno'])}</p>`
    : '';
  const tablica = m.redci.length
    ? '<table class="rd__tablica"><thead><tr><th scope="col">Prije</th><th scope="col">Poslije</th></tr></thead><tbody>'
      + m.redci.map((r) => `<tr><td class="rd__prije">${esc(r.prije)}</td>`
        + `<td class="rd__poslije">${esc(r.poslije)}</td></tr>`).join('')
      + '</tbody></table>'
    : '';
  return `<section class="rd" data-repair-done><p class="rd__oznaka">${esc(naslov)}</p>`
    + brojka + novoStanjeHtml(m.novihProblema) + tablica + '</section>';
}
