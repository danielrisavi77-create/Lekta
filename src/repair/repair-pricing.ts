// src/repair/repair-pricing.ts
//
// Slider "koliko platis, toliko popravaka" (PWYW repair, vidi plan u razgovoru s vlasnikom):
// cijena po stavci se NE zadaje kao apsolutan iznos (broj ponudjenih stavki varira dokument
// od dokumenta), nego kao RELATIVNA tezina koja se normalizira nad stvarno ponudjenim stavkama
// za KONKRETAN dokument. Posljedica: "odaberi sve" uvijek daje TOCNO postojecu stropnu cijenu
// (WORK_TYPE_TIERS, src/report/pricing.ts), pa se nista ne mijenja za korisnika koji ne dira
// slider - stropne cijene ostaju izvor istine, ovo je samo raspodjela ISPOD stropa.
//
// Server je i dalje jedini izvor istine za NAPLATU (create-checkout mora racunati identicnu
// cijenu iz istog popisa fixerId-eva, nikad vjerovati klijentskom iznosu); ovaj modul je cist i
// bez DOM-a bas zato da ga server (Edge Function, Deno) moze uvesti bez izmjene.

import type { FixerId } from './apply-fixers';

/**
 * Relativna vaznost popravka (proizvoljne jedinice, veci broj = vazniji). Redoslijed auto-punjenja
 * slidera ide od najvece prema najmanjoj tezini. `footer-page-fixer` nikad nije samostalna stavka
 * (uvijek se primjenjuje skriveno uz numeriranje stranica, vidi src/ui/repair-items.ts), pa mu
 * tezina ne utjece ni na sto; drzimo je na 0 radi cjelovitosti tipa (Record pokriva sve FixerId).
 */
export const FIXER_WEIGHT: Record<FixerId, number> = {
  'section-insert-fixer': 8,
  'font-fixer': 5,
  'margins-fixer': 5,
  'heading-format-fixer': 5,
  'heading-style-fixer': 6,
  'title-page-fixer': 8,
  'element-caption-fixer': 8,
  'bibliography-repair-fixer': 9,
  'citation-bibliography-sync-fixer': 10,
  'legal-footnote-repair-fixer': 12,
  'final-document-inspector-fixer': 10,
  'table-figure-rescue-fixer': 9,
  'section-surgery-fixer': 12,
  'field-integrity-fixer': 9,
  'croatian-typography-fixer': 4,
  'consistency-fixer': 8,
  'required-section-fixer': 8,
  'link-doi-fixer': 6,
  'submission-metadata-fixer': 4,
  'line-spacing-fixer': 4,
  'page-numbering-fixer': 4,
  'toc-field-fixer': 4,
  'paper-size-fixer': 3,
  'alignment-fixer': 3,
  'paragraph-spacing-fixer': 3,
  'heading-case-fixer': 3,
  'footnote-spacing-fixer': 2,
  'page-number-alignment-fixer': 2,
  'footnote-typography-fixer': 2,
  'empty-paragraph-fixer': 1,
  'footer-page-fixer': 0,
};

function weightOf(fixerId: FixerId): number {
  return FIXER_WEIGHT[fixerId] ?? 1;
}

function roundCents(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface PricedItem<T> {
  item: T;
  weight: number;
  priceEur: number;
}

/**
 * Raspodijeli stropnu cijenu (postojeca cijena za ovu vrstu rada) na ponudjene stavke, razmjerno
 * njihovoj relativnoj tezini. Suma svih `priceEur` je stropna cijena (do zaokruzivanja na centu);
 * manji odabir kosta razmjerno manje. Prazan popis ili nulta ukupna tezina daje 0 € po stavci.
 */
export function priceRepairItems<T extends { fixerId: FixerId }>(
  items: T[],
  ceilingPriceEur: number,
): PricedItem<T>[] {
  const totalWeight = items.reduce((sum, i) => sum + weightOf(i.fixerId), 0);
  if (totalWeight <= 0 || items.length === 0) {
    return items.map((item) => ({ item, weight: 0, priceEur: 0 }));
  }
  return items.map((item) => {
    const weight = weightOf(item.fixerId);
    return { item, weight, priceEur: roundCents((weight / totalWeight) * ceilingPriceEur) };
  });
}

/**
 * Prioritetni redoslijed auto-punjenja slidera: najveca tezina prva. Stabilan poredak (izvorni
 * indeks kao tie-breaker) da isti dokument uvijek daje isti redoslijed popunjavanja.
 */
export function priorityOrder<T extends { fixerId: FixerId }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => weightOf(b.item.fixerId) - weightOf(a.item.fixerId) || a.index - b.index)
    .map((x) => x.item);
}

/**
 * Za zadani udio budzeta (0..1) vrati skup stavki koje slider ukljucuje: puni prioritetni
 * redoslijed, popunjava se dok kumulativna tezina ne dosegne trazeni udio ukupne tezine.
 * Namjerno "zaokruzuje prema gore" (uvijek doda cijelu sljedecu stavku umjesto da stane
 * nasred nje), pa korisnik nikad ne dobije MANJE nego sto slider pokazuje. fraction=1 vraca
 * sve stavke (identicno danasnjem "sve odabrano" ponasanju).
 *
 * `minCount` je POD: slider nikad ne ide ispod tog broja stavki (najvaznije po prioritetu),
 * cak ni na fraction=0. Ovo je UX pod (izbjegava "platio si, dobio 0 popravaka"), ne ista stvar
 * kao serverski floor cijene; default 0 zadrzava staro ponasanje (fraction<=0 -> prazan popis).
 */
export function itemsForBudgetFraction<T extends { fixerId: FixerId }>(
  items: T[],
  fraction: number,
  minCount = 0,
): T[] {
  const clamped = Math.max(0, Math.min(1, fraction));
  const ordered = priorityOrder(items);
  const floor = Math.min(Math.max(0, minCount), ordered.length);
  if (clamped >= 1) return [...items];
  const totalWeight = ordered.reduce((s, i) => s + weightOf(i.fixerId), 0);
  if (totalWeight <= 0) return ordered.slice(0, floor);
  const targetWeight = clamped * totalWeight;
  const picked: T[] = [];
  let cumulative = 0;
  for (const item of ordered) {
    if (cumulative >= targetWeight && picked.length >= floor) break;
    picked.push(item);
    cumulative += weightOf(item.fixerId);
  }
  return picked;
}

/**
 * Udio budzeta (0..1) koji odgovara TRENUTNO odabranom skupu stavki, za sinkronizaciju slidera
 * kad korisnik rucno (de)oznaci checkbox. 1 kad nema stavki (nema se sto dijeliti).
 */
export function fractionForItems<T extends { fixerId: FixerId }>(allItems: T[], selected: T[]): number {
  const totalWeight = allItems.reduce((s, i) => s + weightOf(i.fixerId), 0);
  if (totalWeight <= 0) return 1;
  const selectedWeight = selected.reduce((s, i) => s + weightOf(i.fixerId), 0);
  return Math.max(0, Math.min(1, selectedWeight / totalWeight));
}
