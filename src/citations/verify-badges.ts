/**
 * Dijeljene oznake verdikta provjere postojanja reference (verify-existence.ts).
 * Jedan izvor istine za labele + boje, da citat alat (citat-page.ts, koristi `cls`
 * preko .verify-badge CSS-a u citat.html) i analizator (app.ts, koristi `color`
 * inline jer nema te CSS klase) NIKAD ne divergiraju u tekstu.
 * Nikad ne kaze "izmisljeno" (cuva se od laznih negativa).
 */
import type { ExistenceVerdict } from './verify-existence';

export interface VerdictBadge {
  /** Prikazni tekst s emoji signalom. */
  text: string;
  /** CSS klasa (citat.html .verify-badge.verify-*). */
  cls: string;
  /** CSS boja (inline, za povrsine bez .verify-* klasa, npr. analizator). */
  color: string;
}

export const VERDICT_BADGE: Record<ExistenceVerdict, VerdictBadge> = {
  found: { text: '✓ Pronađeno u CrossRef', cls: 'verify-ok', color: 'var(--ok,#1a7f4b)' },
  weak: { text: '⚠ Slab pogodak, provjeri', cls: 'verify-warn', color: 'var(--warn,#c9821f)' },
  'not-found': { text: '✗ Nije pronađeno u CrossRef (provjeri ručno)', cls: 'verify-bad', color: 'var(--bad,#c0392b)' },
  'not-indexed': { text: 'ℹ Domaći izvor, provjeri u Dabru/Hrčku', cls: 'verify-info', color: 'var(--brand,#1d3fbf)' },
  // "Nije provjereno" pokriva i nedostatak podataka (referenca bez naslova/DOI) i mrezni pad;
  // ne pripisuje mrezi ono sto je zapravo neparsabilan unos (posteno, bez lazne atribucije).
  unchecked: { text: '– Nije provjereno', cls: 'verify-muted', color: 'var(--muted,#6b7280)' },
};

/**
 * Znacke za pogodak u HRVATSKOM KORPUSU (corpus-verify.ts, plaćeni repair). Namjerno ODVOJENE od
 * VERDICT_BADGE: tamosnji tekst imenuje CrossRef, a ovdje je izvor drugi (Dabar i Hrcak), pa bi
 * dijeljenje istog teksta korisniku reklo netocno gdje je rad nadjen.
 *
 * Postoje SAMO pozitivni verdikti. Korpus po konstrukciji ne moze reci "ne postoji" (pokriva
 * hrvatske repozitorije, ne knjige ni strane izvore), pa negativne znacke ovdje ne smiju postojati.
 */
export const CORPUS_BADGE: Record<'found' | 'weak', VerdictBadge> = {
  found: { text: '✓ Pronađeno u hrvatskom repozitoriju', cls: 'verify-ok', color: 'var(--ok,#1a7f4b)' },
  weak: { text: '≈ Vjerojatno isti rad, provjeri', cls: 'verify-warn', color: 'var(--warn,#c9821f)' },
};

/**
 * Sazetak provjere postojanja za aria-live najavu: broji SVIH pet verdikta i gradi poruku
 * SAMO iz ne-nultih kosara + ukupno. Cuva od lazne nule kad su svi izvori domaci (not-indexed)
 * ili slabi (weak) pa bi naivni "found/not-found/unchecked" prikaz najavio "0, 0, 0".
 */
export function summarizeVerification(results: Array<{ verdict: ExistenceVerdict }>): string {
  const c: Record<ExistenceVerdict, number> = { found: 0, weak: 0, 'not-found': 0, 'not-indexed': 0, unchecked: 0 };
  for (const r of results) c[r.verdict] = (c[r.verdict] || 0) + 1;
  const parts: string[] = [];
  if (c.found) parts.push(`${c.found} pronađeno`);
  if (c.weak) parts.push(`${c.weak} slab pogodak`);
  if (c['not-found']) parts.push(`${c['not-found']} nije pronađeno`);
  if (c['not-indexed']) parts.push(`${c['not-indexed']} domaći izvor za ručnu provjeru`);
  if (c.unchecked) parts.push(`${c.unchecked} nije provjereno`);
  const n = results.length;
  return `Provjera gotova (${n} ${n === 1 ? 'referenca' : 'referenci'}): ${parts.join(', ') || 'nema rezultata'}. `
    + 'Ishod je okvirni; provjeri sporne unose ručno.';
}
