/**
 * FAKULTET POTVRDJEN NA ULAZU, BEZ STUDIJA (Z32 popravak, odluka vlasnika 2026-09-27).
 *
 * Student na `/` smije potvrditi fakultet koji mu je ponudjen (zapamcene postavke ili `?unit=`
 * link), a da studij nije potvrdio. `/rad/` tada fakultet postavi i NE PITA PONOVO: detekcija iz
 * dokumenta (`applyDetectedContext` u `app.ts`) ga ne smije promijeniti. Studij i dalje prepoznaje
 * ona, jer ga student nije potvrdio; kad dokument pokazuje drugi fakultet, studij se ne pogadja
 * nego znacka to kaze, a kartica profila ostaje nesigurna (`renderAnalyzeSummary`).
 *
 * ZASTO ZASEBAN MODUL: `app.ts` ima ratchet velicine (`tests/ui-module-budget.test.ts`), pa u
 * njemu ostaju samo dvije kuke; stanje, vezanje za dokument i tekst znacke zive ovdje.
 *
 * VRIJEDI ZA PRVI PRIHVACENI DOKUMENT SESIJE, istim pravilom kao potvrdjen profil sesije (C4,
 * `profile-confirmed-events.ts`): drugi dokument u istoj kartici je drugi rad, pa brava pada.
 */
import { subscribeAnalyzerDocumentSettled } from './analyzer-document-events';

let jedinica: string | null = null;
let datoteka: File | null = null;

/** Tekst znacke kad dokument pokazuje drugi fakultet od potvrdjenog. */
export const NAPOMENA_POTVRDJEN_FAKULTET = 'Fakultet potvrđen na ulazu ostaje. Studij iz dokumenta nisam prepoznao, provjeri ga.';

/**
 * Zakljucava fakultet `trazeno` ako ga je obrazac stvarno prihvatio (`uObrascu`). Vraca je li
 * zakljucan; obrazac koji tu jedinicu ne zna prikazati ne ostavlja bravu.
 */
export function zakljucajFakultet(trazeno: string | undefined, uObrascu: string | undefined): boolean {
  jedinica = trazeno && trazeno === uObrascu ? trazeno : null;
  datoteka = null;
  return jedinica !== null;
}

/** Zakljucan fakultet ili `null`. */
export function potvrdjenFakultet(): string | null {
  return jedinica;
}

/**
 * Smije li detekcija iz dokumenta primijeniti prepoznati fakultet. Kad ne smije (fakultet je
 * potvrdjen, a dokument pokazuje drugi), to kaze na znacki detekcije i vraca `false`.
 */
export function detekcijaSmije(prepoznato: string, doc: Document = document): boolean {
  if (jedinica === null || prepoznato === jedinica) return true;
  const znacka = doc.getElementById('detectBadge');
  if (znacka) {
    const ikona = doc.createElement('i');
    ikona.setAttribute('data-lucide', 'info');
    znacka.replaceChildren(ikona, ` ${NAPOMENA_POTVRDJEN_FAKULTET}`);
    znacka.classList.remove('hidden');
    doc.defaultView?.__lektaIcons?.();
  }
  return false;
}

subscribeAnalyzerDocumentSettled((e) => {
  if (jedinica === null) return;
  if (e.kind !== 'accepted') { if (!datoteka) jedinica = null; return; }
  if (!datoteka) datoteka = e.file;
  else if (e.file !== datoteka) jedinica = null;
});
