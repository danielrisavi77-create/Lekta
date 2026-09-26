/**
 * SIGNAL SPREMNOSTI EKRANA REZULTATA (`#resultView[data-result-ready]`).
 *
 * ZASTO POSTOJI. `renderResult` je sinkron, ali ne zavrsava posao: iz njega se kroz
 * `renderSubmissionChecklist` pokrece `renderRepairSection`, koji CEKA (`ensureTemplatesHeavy`,
 * `ensureProfileRules`) i tek u svom `finally` bloku ponovno crta `#repairEntry` i cijeli
 * `#resultCockpit`. Ekran je dakle VIDLJIV prije nego je gotov, a cockpit se u tom prozoru
 * zamijeni novim cvorovima.
 *
 * IZMJERENO 2026-09-23 (chromium, dev posluzitelj, sonda s MutationObserverom nad `#resultCockpit`):
 *
 *     t=15317 ms  #resultView vidljiv + prvo crtanje cockpita
 *     t=15660 ms  DRUGO crtanje cockpita (+343 ms), zajedno s punjenjem #repairPanelMount
 *
 * Posljedica za mjerenje: tko krene Tabom kroz `#resultView` u tom prozoru, izgubi fokus cim
 * zamjena odnese element na kojem fokus stoji (`document.activeElement` padne na `<body>`), pa
 * prolaz stane na pola. Reproducirano istog dana ciljanim kasnjenjem `templates-heavy.json` za
 * 3 s: obilazak je stao na 12 odnosno 5 od 22 kontrole. Na CI-ju (`ux-gate`, run 35867005928,
 * master 45208425) isti se pad vidio kao `posjeceni = [0, 1]` uz 22 kandidata.
 *
 * ZASTO ATRIBUT, A NE DOGADJAJ: atribut je STANJE, pa ga promatrac koji je zakasnio i dalje
 * procita; dogadjaj bi se izgubio isto kao i sam prozor koji zatvaramo.
 *
 * ZASTO ZETON. Druga analiza smije poceti dok prva jos ceka svoj repair lanac. Zavrsetak
 * ZASTARJELOG crtanja tada ne smije objaviti spremnost, jer ekran vise ne pripada njemu.
 * `beginResultRender` zato vraca zeton, a `settleResultRender` objavljuje spremnost samo ako je
 * zeton jos uvijek zadnji izdani.
 */

/** Atribut na `#resultView`: `0` dok se rezultat crta, `1` kad je i zadnji korak gotov. */
export const RESULT_READY_ATTR = 'data-result-ready';

const RESULT_VIEW_ID = 'resultView';

let _zadnjiZeton = 0;

/**
 * Pocetak crtanja rezultata: signal se GASI i izdaje se nov zeton.
 * Zove se na ulazu u `renderResult`, prije nego `#resultView` postane vidljiv.
 */
export function beginResultRender(doc: Document): number {
  _zadnjiZeton += 1;
  doc.getElementById(RESULT_VIEW_ID)?.setAttribute(RESULT_READY_ATTR, '0');
  return _zadnjiZeton;
}

/**
 * Zadnji korak crtanja rezultata je gotov: signal se PALI, ali samo za zeton koji je jos aktualan.
 * Vraca je li spremnost stvarno objavljena, da pozivatelj ne moze tvrditi vise nego sto se dogodilo.
 */
export function settleResultRender(doc: Document, zeton: number): boolean {
  if (zeton <= 0 || zeton !== _zadnjiZeton) return false;
  const el = doc.getElementById(RESULT_VIEW_ID);
  if (!el) return false;
  el.setAttribute(RESULT_READY_ATTR, '1');
  return true;
}

/**
 * Objavljuje spremnost na KRAJU crtanja koje je aktualno U TRENUTKU POZIVA. Jedini pozivatelj je
 * kraj `renderSubmissionChecklist` u `app.ts`; logika i obrazlozenje zive ovdje da `app.ts` ne
 * raste (ratchet u `tests/ui-module-budget.test.ts`).
 *
 * OBA IZLAZA. `renderSubmissionChecklist` panel za isti rezultat ne gradi dvaput (ponovna gradnja
 * bi obrisala korisnikov odabir). I taj preskok je zavrsetak crtanja, pa se tada (`lanac === null`)
 * spremnost objavljuje odmah; objava samo na jednoj grani ostavila bi ekran trajno na "0".
 *
 * `.finally` NA OBECANJU CIJELOG LANCA, ne unutar `renderRepairSection`: tijelo te funkcije u svom
 * `finally` ponovno crta `#repairEntry` i cijeli `#resultCockpit`, pa bi signal postavljen iznutra
 * jos uvijek pao PRIJE zadnje izmjene DOM-a. Ovdje se ceka da cijeli lanac zavrsi.
 *
 * ZETON se uzima PRIJE pokretanja lanca, pa zastarjeli lanac (nova analiza je u medjuvremenu
 * pozvala `beginResultRender`) ne objavljuje spremnost novog crtanja.
 *
 * `dokument` je GETTER, ne dokument: cita se u trenutku objave, jednako kao `runtimeDocument()` koji
 * se prije izdvajanja zvao unutar `.finally`.
 *
 * Lanac mora sam obraditi svoju gresku (`app.ts` mu dodaje `.catch` s logom); `.finally` ne guta
 * odbijanje.
 */
export function settleResultRenderAfter(
  dokument: () => Document,
  lanac: (() => Promise<unknown>) | null,
): void {
  const zeton = _zadnjiZeton;
  if (!lanac) {
    settleResultRender(dokument(), zeton);
    return;
  }
  void lanac().finally(() => {
    settleResultRender(dokument(), zeton);
  });
}

/** Je li ekran rezultata trenutno objavljen kao spreman. */
export function resultRenderSettled(doc: Document): boolean {
  return doc.getElementById(RESULT_VIEW_ID)?.getAttribute(RESULT_READY_ATTR) === '1';
}
