/**
 * DOKUMENT NA KOREKTORSKOM STOLU: montaza stranica Z35 u lijevi pano stola Z8.
 *
 * Do 2026-10-18 je ovdje stajao stari faksimil Z9 (`render-facsimile.ts` uz zoom "prilagodi
 * sirini"). Odluka vlasnika (F51 a, "Broj 2"): Z9 ostaje samo iza `?resultRenderer=legacy`, a stol
 * Z8 se crta samo na ruti kokpita, pa pano crta listove Z35 (`stol-stranice.ts`). Listovi su u `cqw`
 * jedinicama lista, pa prate sirinu panoa bez zooma i bez vodoravnog skrola.
 *
 * MODUL SE UCITAVA LIJENO. Stranice i njihov CSS nisu u grafu ekrana rezultata; dovlace se tek kad
 * je pano stvarno vidljiv, sto `mountDesk` provjerava prije poziva.
 */
import type { DeskDocument } from './desk-mount';
import type { StolStraniceOpcije } from '../facsimile-live/stol-stranice';

export async function montirajDokumentStola(
  host: HTMLElement,
  o: StolStraniceOpcije,
  signal?: AbortSignal,
): Promise<DeskDocument | null> {
  const { montirajStranice } = await import('../facsimile-live/stol-stranice');
  // Rezultat je mogao biti zamijenjen dok je modul stizao; tada se pano ne dira.
  if (signal?.aborted) return null;
  return montirajStranice(host, o);
}
