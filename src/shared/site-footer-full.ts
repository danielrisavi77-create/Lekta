/**
 * PUNO PODNOZJE (ALIGNMENT Z15, DRUGI KRUG): "Stanje stola" i potpis koji se puni tintom.
 *
 * LIJEN MODUL. Uvozi ga SAMO `site-chrome.ts`, dinamickim `import()`, i to samo kad stranica nosi
 * `[data-site-footer="full"]` (`/saznaj-vise/`, `/alati.html`). Traka je na svakoj stranici i ima
 * proracun od 8 KB gzip (`tests/route-shell-budget.test.ts`); ovaj kod i pecene brojke iz
 * `site-stats.json` idu u vlastiti komad koji ostale stranice nikad ne skinu.
 *
 * MARKUP JE STATICAN (isti razlog kao traka, vidi zaglavlje `site-chrome.ts`): kolofon, stupci i
 * poveznice su u HTML-u i rade bez JavaScripta. Ovaj modul samo:
 *
 *   1. upisuje "Stanje stola" iz IZVORA: zadnji rad i ocjena iz lokalne povijesti provjera
 *      (`lekta.history.v2`, kroz `safeStorageGet`, bez novog pristupa pohrani), verzija pravila,
 *      broj profila i datum provjere izvora iz PECENOG `data/coverage/site-stats.json`. Nijedna
 *      brojka nije prepisana u kod ni u markup; bez JavaScripta blok ostaje skriven, jer tvrdnju
 *      koju stranica ne moze procitati ne smije ni ispisati;
 *   2. puni potpis "Lekta" crvenom tintom kad pola potpisa udje u vidno polje
 *      (`IntersectionObserver`, prag .5). Animira se SAMO `background-position` (Z31), a potpis
 *      dobiva `.motion-offscreen` dok je izvan pogleda, pa animacija tada stoji;
 *   3. pise redak lampe ("Radna lampa upaljena" / "Danje svjetlo") prema STVARNOJ temi na ekranu.
 */
import { profiles as PROFILA, rulesVersion as VERZIJA_PRAVILA, sourcesCheckedAt as IZVORI_PROVJERENI } from '../../data/coverage/site-stats.json';
import { STORAGE_KEYS, safeStorageGet } from './browser-storage';
import { hrPlural } from '../routes/shared/site-stats-strip';
import { pokretPrigusen, tamnoNaEkranu } from './display-prefs';

/** Pecene vrijednosti koje "Stanje stola" cita; test ih smije podmetnuti. */
export interface DeskStats {
  readonly profiles: number;
  readonly rulesVersion: string | null;
  readonly sourcesCheckedAt: string | null;
}

/** Stvarne pecene vrijednosti iz `site-stats.json` (isti uvoz kojim ih cita modul). */
export const SITE_STATS_DESK: DeskStats = {
  profiles: PROFILA,
  rulesVersion: VERZIJA_PRAVILA,
  sourcesCheckedAt: IZVORI_PROVJERENI,
};

/** Redak kad preglednik nema zapamcen rad; istinit, bez izmisljenog primjera. */
export const DESK_NO_WORK = 'nijedan u ovom pregledniku';

/**
 * ZADNJI RAD I OCJENA iz zapisa povijesti. Povijest je polje, NAJNOVIJI zapis prvi
 * (`saveAnalysisHistory` u `src/ui/app.ts` dodaje na pocetak). Sve sto nije zapis s imenom
 * datoteke daje zamjenski redak, ne prazninu i ne pogodjenu vrijednost; ocjena bez broja izostaje.
 */
export function deskLastWork(zapis: unknown): string {
  if (!Array.isArray(zapis) || zapis.length === 0) return DESK_NO_WORK;
  const prvi: unknown = zapis[0];
  if (typeof prvi !== 'object' || prvi === null) return DESK_NO_WORK;
  const { fileName, score } = prvi as { fileName?: unknown; score?: unknown };
  if (typeof fileName !== 'string' || fileName.trim() === '') return DESK_NO_WORK;
  return typeof score === 'number' && Number.isFinite(score) ? `${fileName} · ${Math.round(score)}` : fileName;
}

/** "v8ce3bee · 407 profila"; bez verzije samo broj profila, bez izmisljene verzije. */
export function deskRules(stats: DeskStats): string {
  const profili = `${stats.profiles.toLocaleString('hr-HR')} ${hrPlural(stats.profiles, 'profil', 'profila', 'profila')}`;
  return stats.rulesVersion ? `v${stats.rulesVersion} · ${profili}` : profili;
}

/** "provjereni 24. 8. 2026." iz ISO datuma; nepoznat datum to i kaze. */
export function deskSources(stats: DeskStats): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stats.sourcesCheckedAt ?? '');
  if (!m) return 'datum provjere nije zabilježen';
  return `provjereni ${Number(m[3])}. ${Number(m[2])}. ${m[1]}.`;
}

/** Upise "Stanje stola" i otkrije blok; bez sva tri mjesta u markupu ne otkriva nista. */
export function fillDeskState(footer: HTMLElement, zapisPovijesti: unknown, stats: DeskStats = SITE_STATS_DESK): void {
  const blok = footer.querySelector<HTMLElement>('[data-site-footer-stanje]');
  const rad = footer.querySelector<HTMLElement>('[data-site-footer-stat="rad"]');
  const pravila = footer.querySelector<HTMLElement>('[data-site-footer-stat="pravila"]');
  const izvori = footer.querySelector<HTMLElement>('[data-site-footer-stat="izvori"]');
  if (!blok || !rad || !pravila || !izvori) return;
  rad.textContent = deskLastWork(zapisPovijesti);
  pravila.textContent = deskRules(stats);
  izvori.textContent = deskSources(stats);
  blok.hidden = false;
}

/** Redak lampe prema STVARNOJ temi (i "kao sustav"), ne prema atributu. */
export function lampLine(doc: Document): string {
  return tamnoNaEkranu(doc) ? 'Radna lampa upaljena' : 'Danje svjetlo';
}

/** Razred koji potpis puni tintom; ime je ugovor s `site-chrome.css`. */
export const INK_CLASS = 'site-footer__potpis--tinta';

/**
 * POTPIS SE PUNI TINTOM JEDNOM. Pod prigusenim pokretom (sustavnim ili rucnim, `pokretPrigusen`)
 * i bez `IntersectionObserver`-a je odmah popunjen: tinta je stanje, ne nagrada za skrolanje.
 * Dok potpis nije u pogledu nosi `.motion-offscreen` (Z31), pa zapoceta animacija staje kad ga
 * korisnik odskrola i nastavlja kad se vrati; kad zavrsi, promatrac se gasi.
 */
export function wireInkSignature(potpis: HTMLElement, signal: AbortSignal): void {
  const doc = potpis.ownerDocument;
  const view = doc.defaultView;
  if (pokretPrigusen(doc) || !view || typeof view.IntersectionObserver !== 'function') {
    potpis.classList.add(INK_CLASS);
    return;
  }
  const io = new view.IntersectionObserver((unosi) => {
    for (const unos of unosi) {
      const vidljiv = unos.isIntersecting && unos.intersectionRatio >= 0.5;
      potpis.classList.toggle('motion-offscreen', !unos.isIntersecting);
      if (vidljiv) potpis.classList.add(INK_CLASS);
    }
  }, { threshold: [0, 0.5] });
  io.observe(potpis);
  const ugasi = (): void => {
    io.disconnect();
    potpis.classList.remove('motion-offscreen');
  };
  potpis.addEventListener('animationend', ugasi, { once: true, signal });
  signal.addEventListener('abort', () => io.disconnect(), { once: true });
}

/** Montira ponasanje punog podnozja nad POSTOJECIM markupom. */
export function mountFullFooter(footer: HTMLElement, signal: AbortSignal): void {
  const doc = footer.ownerDocument;
  fillDeskState(footer, safeStorageGet(STORAGE_KEYS.history, null));

  const lampa = footer.querySelector<HTMLElement>('[data-site-footer-lampa]');
  const view = doc.defaultView;
  if (lampa) {
    const osvjezi = (): void => { lampa.textContent = lampLine(doc); };
    osvjezi();
    if (view && typeof view.MutationObserver === 'function') {
      const mo = new view.MutationObserver(osvjezi);
      mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      signal.addEventListener('abort', () => mo.disconnect(), { once: true });
    }
  }

  const potpis = footer.querySelector<HTMLElement>('[data-site-footer-potpis]');
  if (potpis) wireInkSignature(potpis, signal);
}
