/**
 * Nazivi i oznake provjera gramatike i stila (kind), odvojeni od same provjere u `grammar-hr.ts`.
 *
 * Zasto zasebna datoteka (2026-10-10): analizator (`src/ui/app.ts`) i pregled (`preview-anchors.ts`)
 * trebaju samo tablicu oznaka, a staticki uvoz iz `grammar-hr.ts` vukao je cijeli skup pravila u
 * pocetni graf ulaza `rad` i probio budzet od 960 KB (release run 38042119178). Sama provjera
 * radi u workeru analize, pa pravila ne trebaju prvom paintu. `grammar-hr.ts` ovo re-eksportira,
 * postojeci uvozi ostaju valjani.
 */

// Nazivi provjera (kind): stabilni hrvatski identifikatori.
export const KIND_NE_SPOJENO = 'ne-spojeno';
export const KIND_KONDICIONAL = 'kondicional';
export const KIND_DA_PREZENT = 'da-prezent';
export const KIND_VEZNIK = 'veznik';
export const KIND_JE_LI = 'je-li';
export const KIND_S_SA = 's-sa';
export const KIND_SRBIZAM = 'srbizam';
export const KIND_PLEONAZAM = 'pleonazam';
export const KIND_ADMINISTRATIVIZAM = 'administrativizam';
export const KIND_IJE_JE = 'ije-je';
export const KIND_ZAREZ = 'zarez';
export const KIND_ANGLIZAM = 'anglizam';

export const GRAMMAR_KIND_LABELS: Record<string, string> = {
  [KIND_NE_SPOJENO]: 'Nijek „ne” (rastavljeno)',
  [KIND_KONDICIONAL]: 'Kondicional (bih/bi/bismo/biste)',
  [KIND_DA_PREZENT]: '„da” + prezent umjesto infinitiva',
  [KIND_VEZNIK]: 'Veznik/prijedlog (s obzirom, u vezi)',
  [KIND_JE_LI]: 'Upitna čestica „je li”',
  [KIND_S_SA]: 'Prijedlog s/sa',
  [KIND_SRBIZAM]: 'Nestandardni oblik',
  [KIND_PLEONAZAM]: 'Pleonazam/suvišnost',
  [KIND_ADMINISTRATIVIZAM]: 'Administrativni izraz / germanizam',
  [KIND_IJE_JE]: 'Pisanje ije/je',
  [KIND_ZAREZ]: 'Zarez (veznik „ali”)',
  [KIND_ANGLIZAM]: 'Anglizam / kalk',
};
