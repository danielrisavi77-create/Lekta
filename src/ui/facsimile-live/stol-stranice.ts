/**
 * STOL Z8: LIJEVI PANO CRTA STRANICE Z35. Odluka vlasnika 2026-10-18 (F51 a, "Broj 2"): stari
 * faksimil Z9 ostaje samo iza `?resultRenderer=legacy`, pa ni ugradjeni dokument stola Z8 (presuda
 * bez blokatora, ili povratak kad Z34 nije stigao) vise nije Z9.
 *
 * Pano crta ISTE listove kao faksimil Z35 (`stranice`, `tekstHtml` iz `facsimile-live-list.ts`), samo
 * sve jedan ispod drugoga, jer stol pomice dokument do mjesta nalaza i klik na oznaceno mjesto
 * aktivira nalaz (`mountDesk`, ugovor `DeskDocument.flagTargets`). Oznaku nosi samo odlomak na koji
 * pokazuje nalaz stola, kao tocke Z35; zastavica bez nalaza dobiva metu, ali ne i oznaku. Fusnote,
 * slike i prazni odlomci se ne crtaju (namjerne razlike Z35 prema Z9,
 * `tests/facsimile-live-ekvivalencija.test.ts`); nalaz na takvom mjestu stol opisuje trakom
 * "Mjesto je poznato, ali nije označeno u ovom prikazu.", umjesto da izmisli oznaku.
 *
 * Puni faksimil (slojevi, biljeske, plan) otvara gumb "Otvori faksimil" ispod stola.
 */
import './facsimile-live.css';
import type { DeskDocument } from '../results/desk-mount';
import type { DeskFlag, DeskItem } from '../results/desk-model';
import { izgledSada, trakaStranica } from '../result-live/result-live-model';
import { mjeraLista, tekstHtml } from './facsimile-live-list';
import { natpisLista, stranice, type FxPreview } from './facsimile-live-model';

export interface StolStraniceOpcije {
  readonly preview: unknown;
  readonly storedPages: unknown;
  readonly items: readonly DeskItem[];
  readonly flags: readonly DeskFlag[];
  readonly esc: (v: string) => string;
}

/** `null` kad pregled nema nijedan odlomak s tekstom: stol tada kaze da prikaz nije dostupan. */
export function montirajStranice(host: HTMLElement, o: StolStraniceOpcije): DeskDocument | null {
  const preview = (typeof o.preview === 'object' && o.preview !== null ? o.preview : null) as FxPreview | null;
  const st = stranice(preview, trakaStranica(preview, o.storedPages, o.items));
  if (!st.stranice.length) return null;
  const mjera = mjeraLista(preview);
  const sada = izgledSada(preview);
  const tijelo = (f: DeskFlag | undefined): f is DeskFlag => !!f && f.footnoteId == null;
  const oznake = new Map<number, string>();
  for (const it of o.items) {
    const f = it.flagIndex === null ? undefined : o.flags[it.flagIndex];
    if (tijelo(f)) oznake.set(f.paragraphIndex, 'nalaz');
  }
  host.innerHTML = '<div class="fl-stol" data-fl-stol>'
    + st.stranice.map((s, k) => {
      const natpis = natpisLista(st, k);
      return `<section class="fl-stol__list"${natpis ? ` aria-label="${o.esc(natpis)}"` : ''}>`
        + (natpis ? `<span class="fl-stol__natpis">${o.esc(natpis)}</span>` : '')
        + `<div class="fl-page" style="aspect-ratio:${mjera.W} / ${mjera.H}">`
        + tekstHtml(s.odlomci, sada.margine, oznake, 'now', sada, mjera, o.esc)
        + '</div></section>';
    }).join('')
    + '</div>';
  const mete = new Map<number, HTMLElement>();
  o.flags.forEach((f, i) => {
    if (!tijelo(f)) return;
    const el = host.querySelector<HTMLElement>(`[data-fl-p="${f.paragraphIndex}"]`);
    if (el) mete.set(i, el);
  });
  return { flagTargets: mete };
}
