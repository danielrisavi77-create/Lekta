/**
 * K4: prikaz provjere izvora u hrvatskom korpusu, unutar PLACENOG rezultata popravka.
 *
 * Cista funkcija (string -> string): nema DOM-a, nema mreze, pa se cijelo ponasanje, ukljucujuci
 * postenje brojaca, dokazuje testom bez preglednika. app.ts samo ubaci vraceni HTML.
 *
 * TVRDO PRAVILO PRIKAZA: izostanak reference iz `found` NIJE dokaz da izvor ne postoji. Korpus
 * pokriva hrvatske repozitorije (Dabar, Hrcak), a ne knjige, strane casopise ni zbornike. Zato se
 * prikazuju SAMO pogoci, uz brojac koliko je referenci stiglo na red i izricit caveat o dosegu.
 * Bez toga bi djelomican rezultat izgledao kao potpun, a suti ostatak kao "izmisljeno".
 */
import { escapeHtml, safeHref } from '../utils/helpers';
import { CORPUS_BADGE } from '../citations/verify-badges';
import type { RepairSourceCheck } from '../report/repair-client';

/** Referenca kakvu analiza vec ima (details.references); koristi se samo za prikaz izvornog navoda. */
export interface SourceCheckRef {
  raw?: string | null;
}

/** Hrvatska sklonidba uz broj referenci. */
function plReferenca(n: number): string {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return `${n} reference`;
  return `${n} referenci`;
}

/**
 * Sazetak za aria-live najavu i za tekst iznad popisa. Namjerno uvijek imenuje i nazivnik
 * (`checked` od `total`), da se broj pogodaka nikad ne cita kao udio cijele literature.
 */
export function summarizeSourceCheck(sc: RepairSourceCheck): string {
  const potvrdjeno = sc.found.length;
  const dio = sc.checked < sc.total
    ? `Provjereno je ${sc.checked} od ${plReferenca(sc.total)} (ostatak nije stigao na red).`
    : `Provjereno je svih ${plReferenca(sc.total)}.`;
  const ishod = potvrdjeno
    ? `Pronađeno u hrvatskom korpusu: ${potvrdjeno}.`
    : 'Nijedan navedeni izvor nije prepoznat u hrvatskom korpusu.';
  return `${dio} ${ishod}`;
}

/**
 * Sastavi sekciju. Vraca prazan string kad provjere nije bilo (stari server, ugasena zastavica,
 * greska): sekcija tada uopce ne postoji, umjesto da se prikaze prazna i sugerira ishod.
 */
export function buildSourceCheckHtml(sc: RepairSourceCheck | null | undefined, refs: SourceCheckRef[] = []): string {
  if (!sc || !sc.total) return '';

  const redovi = sc.found.map((f) => {
    const badge = CORPUS_BADGE[f.verdict];
    const izvorni = String(refs[f.index]?.raw || '').trim();
    const navod = izvorni
      ? `<br><small>Tvoj navod: ${escapeHtml(izvorni.slice(0, 160))}${izvorni.length > 160 ? '…' : ''}</small>`
      : '';
    const veza = f.url
      ? ` · <a href="${escapeHtml(safeHref(f.url))}" target="_blank" rel="noopener">otvori zapis</a>`
      : '';
    return `<div class="legal-problem"><span style="color:${badge.color};font-weight:700">${escapeHtml(badge.text)}</span>`
      + `<br><small>„${escapeHtml(f.matchedTitle)}” · ${escapeHtml(f.where)}${veza}</small>${navod}</div>`;
  }).join('');

  const popis = redovi ? `<div class="legal-problem-list">${redovi}</div>` : '';
  const djelomicno = sc.truncated || sc.checked < sc.total
    ? '<div class="legal-engine-note"><strong>Rezultat je djelomičan.</strong> Provjera ima ograničeno vrijeme, '
      + 'pa dio referenci nije stigao na red. Neprovjerene reference nemaju nikakav ishod.</div>'
    : '';

  return `<section class="legal-engine"><div class="legal-engine-head"><div>`
    + `<h3>Provjera izvora u hrvatskom korpusu</h3>`
    + `<p>${escapeHtml(summarizeSourceCheck(sc))}</p></div>`
    + `<span class="legal-engine-badge">${sc.found.length} od ${sc.checked}</span></div>`
    + popis
    + djelomicno
    + `<div class="legal-engine-note">Korpus pokriva hrvatske repozitorije (Dabar, Hrčak). `
    + `Izostanak s popisa <strong>ne znači</strong> da izvor ne postoji: knjige, strani časopisi i zbornici `
    + `u njemu redovito nisu zabilježeni. Provjera je informativna i ne ulazi u ocjenu.</div></section>`;
}
