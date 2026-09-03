/**
 * DOGADJAJI O ISHODU PRIJEMA DOKUMENTA.
 *
 * Izdvojeno iz `app.ts` jer je CISTO: nema DOM-a, nema modulskog stanja analizatora, samo skup
 * pretplatnika i objava. `app.ts` je pod ratchetom koji trazi da se smanjuje, a ovo je bio jedini
 * dio prijema koji ondje nije morao stajati.
 */

/**
 * ISHOD PRIJEMA DOKUMENTA. Ruta radne povrsine mora znati KADA je dokument stvarno prihvacen, da
 * bi ga tada zapisala u lokalnu sesiju. Bez toga bi zapis morao pogadjati trenutak, a pogodjen
 * prerano znaci sesiju s dokumentom koji je intake gate poslije odbio.
 *
 * TRI ISHODA, jer dva ne bi bila istinita: `superseded` nije ni prihvacanje ni odbijanje nego
 * "korisnik je u medjuvremenu odabrao drugu datoteku". Bez njega bi `loadAnalyzerDocument` na
 * zamijenjenoj datoteci visio zauvijek, jer terminalni dogadjaj nikad ne bi stigao.
 */
export type AnalyzerDocumentSettled =
  | { kind: 'accepted'; file: File; verdict: unknown }
  | { kind: 'rejected'; file: File; message: string }
  | { kind: 'superseded'; file: File };

type SettledListener = (event: AnalyzerDocumentSettled) => void;
const _documentSettledListeners = new Set<SettledListener>();

/** Vraca funkciju za odjavu. Dvostruka odjava je bezopasna. */
export function subscribeAnalyzerDocumentSettled(listener: SettledListener): () => void {
  _documentSettledListeners.add(listener);
  return () => { _documentSettledListeners.delete(listener); };
}

/** Uze sucelje za pozivatelje koje zanima samo prihvacanje (npr. zapis sesije). */
export function subscribeAnalyzerDocumentAccepted(
  listener: (event: { file: File; verdict: unknown }) => void,
): () => void {
  return subscribeAnalyzerDocumentSettled((event) => {
    if (event.kind === 'accepted') listener({ file: event.file, verdict: event.verdict });
  });
}

export function emitAnalyzerDocumentSettled(event: AnalyzerDocumentSettled): void {
  // Kopija skupa. NE zato sto bi odjava tijekom obavijesti preskocila one iza: JS `Set` to
  // podnosi. Kopija cuva od suprotnog: pretplatnik DODAN tijekom obavijesti inace dobiva
  // TAJ ISTI dogadjaj, pa bi zapis sesije koji se pretplati kao reakcija na prijem odmah
  // vidio dogadjaj koji je prethodio njegovoj pretplati.
  for (const listener of [..._documentSettledListeners]) {
    // Greska pretplatnika NE smije srusiti prijem dokumenta: korisnikov rad je vazniji od
    // nase telemetrije ili zapisa sesije.
    try { listener(event); } catch (error) { console.warn('Pretplatnik na ishod prijema je pukao:', error); }
  }
}
