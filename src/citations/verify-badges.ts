/**
 * Dijeljene oznake verdikta provjere postojanja reference (verify-existence.ts).
 * Jedan izvor istine za labele + boje, da citat alat (citat-page.ts, koristi `cls`
 * preko .verify-badge CSS-a u citat.html) i analizator (app.ts, koristi `color`
 * inline jer nema te CSS klase) NIKAD ne divergiraju u tekstu.
 * Nikad ne kaze "izmisljeno" (cuva se od laznih negativa).
 */
import type { ExistenceVerdict, RetractionInfo } from './verify-existence';

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
 * Znacke za povucen rad ili izraz zabrinutosti (T98, issue #219; tekst odobrio vlasnik 2026-10-04).
 * Postoje SAMO pozitivna stanja: odsutnost Crossref `updated-by` nije dokaz, pa "nije povuceno" ne
 * postoji. Isti znak upozorenja kao `VERDICT_BADGE.weak` (tekstni signal, ne nova ikona).
 */
export const RETRACTION_BADGE: Record<RetractionInfo['kind'], VerdictBadge> = {
  retracted: { text: '⚠ Rad je povučen (Crossref/Retraction Watch), provjeri prije citiranja', cls: 'verify-bad', color: 'var(--bad,#c0392b)' },
  partial: { text: '⚠ Dio rada je povučen (Crossref), provjeri obavijest prije citiranja', cls: 'verify-warn', color: 'var(--warn,#c9821f)' },
  concern: { text: '⚠ Izdavač je objavio izraz zabrinutosti', cls: 'verify-warn', color: 'var(--warn,#c9821f)' },
};

/**
 * Ukloni SVE `.verify-badge` elemente kartice (verdikt i oznaku povlacenja) prije nove provjere; vraca
 * koliko ih je uklonjeno. Uklanjanje samo prve ostavljalo bi staru oznaku povlacenja uz novi verdikt.
 */
export function clearVerifyBadges(card: ParentNode): number {
  const stare = Array.from(card.querySelectorAll('.verify-badge'));
  stare.forEach((b) => b.remove());
  return stare.length;
}

/** Poveznica na obavijest o povlacenju (doi.org), ili prazan niz kad DOI obavijesti nema. */
export function retractionNoticeUrl(info: RetractionInfo | undefined): string {
  const doi = String(info?.noticeDoi || '').trim();
  return doi ? `https://doi.org/${doi}` : '';
}

type ExistenceRow = { verdict: ExistenceVerdict; matchedTitle?: string; retraction?: RetractionInfo };

/**
 * HTML celije verdikta u analizatoru (app.ts): tekst verdikta, "podudara se s" za found/weak i, SAMO uz
 * found, oznaka povucenog rada s poveznicom na obavijest. `esc` je analizatorov escapeHtml.
 */
export function existenceCellHtml(res: ExistenceRow, esc: (s: string) => string): string {
  const meta = VERDICT_BADGE[res.verdict] || VERDICT_BADGE.unchecked;
  // Isti razmak, duga crtica i navodnici kao dosadasnji tekst u app.ts (zapisano escapeom, bez literala).
  const match = (res.verdict === 'found' || res.verdict === 'weak') && res.matchedTitle ? ` \u2014 podudara se s: \u201E${esc(String(res.matchedTitle))}\u201D` : '';
  const rb = res.verdict === 'found' && res.retraction ? RETRACTION_BADGE[res.retraction.kind] : null;
  if (!rb) return esc(meta.text) + match;
  const url = retractionNoticeUrl(res.retraction);
  return `${esc(meta.text)}${match}<br><span class="exist-retraction" style="color:${rb.color}">${esc(rb.text)}</span>${url ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">obavijest</a>` : ''}`;
}

/** Svojstva dogadjaja `references_existence_checked`; `retracted` je vlastiti brojac oznake povucenog rada. */
export function existenceEventProps(results: ExistenceRow[]): { total: number; found: number; missing: number; retracted: number } {
  return {
    total: results.length,
    found: results.filter((r) => r.verdict === 'found').length,
    missing: results.filter((r) => r.verdict === 'not-found').length,
    retracted: results.filter((r) => r.verdict === 'found' && r.retraction?.kind === 'retracted').length,
  };
}

/**
 * Sazetak provjere postojanja za aria-live najavu: broji SVIH pet verdikta i gradi poruku
 * SAMO iz ne-nultih kosara + ukupno. Cuva od lazne nule kad su svi izvori domaci (not-indexed)
 * ili slabi (weak) pa bi naivni "found/not-found/unchecked" prikaz najavio "0, 0, 0".
 * Kosara "povučenih" broji samo `retracted` uz `found`; nikad ne najavljuje "0 povučenih".
 */
export function summarizeVerification(results: Array<{ verdict: ExistenceVerdict; retraction?: RetractionInfo }>): string {
  const c: Record<ExistenceVerdict, number> = { found: 0, weak: 0, 'not-found': 0, 'not-indexed': 0, unchecked: 0 };
  for (const r of results) c[r.verdict] = (c[r.verdict] || 0) + 1;
  const povucenih = results.filter((r) => r.verdict === 'found' && r.retraction?.kind === 'retracted').length;
  const djelomicnih = results.filter((r) => r.verdict === 'found' && r.retraction?.kind === 'partial').length;
  const zabrinutosti = results.filter((r) => r.verdict === 'found' && r.retraction?.kind === 'concern').length;
  const parts: string[] = [];
  if (c.found) parts.push(`${c.found} pronađeno`);
  if (povucenih) parts.push(`${povucenih} ${povucenih === 1 ? 'povučen rad' : 'povučenih radova'}`);
  if (djelomicnih) parts.push(`${djelomicnih} ${djelomicnih === 1 ? 'djelomično povučen rad' : 'djelomično povučenih radova'}`);
  if (zabrinutosti) parts.push(`${zabrinutosti} ${zabrinutosti === 1 ? 'izraz zabrinutosti' : 'izraza zabrinutosti'}`);
  if (c.weak) parts.push(`${c.weak} slab pogodak`);
  if (c['not-found']) parts.push(`${c['not-found']} nije pronađeno`);
  if (c['not-indexed']) parts.push(`${c['not-indexed']} domaći izvor za ručnu provjeru`);
  if (c.unchecked) parts.push(`${c.unchecked} nije provjereno`);
  const n = results.length;
  return `Provjera gotova (${n} ${n === 1 ? 'referenca' : 'referenci'}): ${parts.join(', ') || 'nema rezultata'}. `
    + 'Ishod je okvirni; provjeri sporne unose ručno.';
}

/** Restore a disabled verification control only when focus was lost, never over another control. */
export function restoreVerificationFocus(button: HTMLButtonElement | null, wasFocused: boolean): void {
  if (!wasFocused || !button?.isConnected) return;
  const doc = button.ownerDocument;
  if (doc.activeElement === doc.body || doc.activeElement === doc.documentElement) button.focus({ preventScroll: true });
}
