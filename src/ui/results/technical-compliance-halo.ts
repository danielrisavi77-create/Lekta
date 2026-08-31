import type { VisualScoreModel } from './visual-result-model';
import { escapeHtml } from '../../utils/helpers';

/**
 * Hrvatski ima TRI oblika, ne dva: 1 blokator, 2 blokatora, 5 blokatora. Dvooblicna grana
 * (`n === 1 ? jednina : mnozina`) je na ovom ekranu davala "0 sigurne popravke" i
 * "5 sigurne popravke". Iznimka su 11 do 14, koje idu u treci oblik unatoc zavrsnoj znamenki
 * ("11 blokatora", ne "11 blokator").
 */
export function pluralHr(count: number, [one, few, many]: readonly [string, string, string]): string {
  const n = Math.abs(Math.trunc(count));
  const last = n % 10, lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function technicalComplianceHaloHtml(score: VisualScoreModel): string {
  if (score.kind === 'unscored') return [
    '<aside class="cockpit-score cockpit-score--unscored" data-cockpit-score="unscored"><div class="cockpit-score__line"><strong>?</strong><span>/ 100</span></div>',
    '<span class="cockpit-score__label">', escapeHtml(score.label), '</span><p class="cockpit-score__reason">', escapeHtml(score.reason), '</p></aside>',
  ].join('');
  const percentage = Math.round((score.value / score.max) * 100);
  return [
    '<aside class="cockpit-score" data-cockpit-score="', String(score.value), '"><div class="cockpit-score__line"><strong>', escapeHtml(score.value), '</strong><span>/ ', escapeHtml(score.max), '</span></div>',
    '<div class="cockpit-score__bar" role="progressbar" aria-label="Tehnička ocjena" aria-valuenow="', String(score.value), '" aria-valuemin="0" aria-valuemax="', String(score.max), '"><span style="width:', String(percentage), '%"></span></div>',
    '<span class="cockpit-score__label">Tehnička ocjena</span><p class="cockpit-score__reason">', escapeHtml(score.scoredChecks), ' automatskih provjera</p></aside>',
  ].join('');
}

export interface HaloSignals {
  blockers: number;
  warnings: number;
  manualReviews: number;
  automaticFixes: number;
  informationalChecks: number;
  totalChecks: number;
}

/** Geometrija SVG prstena. R je polumjer u viewBox jedinicama (0 0 200 200). */
const SCORE_R = 84;
const OPEN_R = 66;
const TAU = 2 * Math.PI;

interface Segment { layer: string; fraction: number; start: number }

/**
 * Unutarnji prsten je SASTAV OTVORENIH NALAZA, ne udio u svim provjerama.
 *
 * Razlog je citljivost bez laganja: 1 blokator na 19 provjera je luk od 5 stupnjeva, koji
 * korisnik ne vidi, pa bi prsten tvrdio "gotovo nista" tamo gdje postoji blokator. Udio
 * MEDU OTVORENIM NALAZIMA je jednako istinit podatak i odgovara na pitanje koje korisnik
 * stvarno ima: od onoga sto je ostalo, koliko me blokira.
 */
export function openFindingSegments(signals: HaloSignals): Segment[] {
  const parts: Array<{ layer: string; value: number }> = [
    { layer: 'blockers', value: Math.max(0, signals.blockers) },
    { layer: 'warnings', value: Math.max(0, signals.warnings) },
    { layer: 'informational', value: Math.max(0, signals.manualReviews) },
  ];
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  let cursor = 0;
  return parts.map((part) => {
    // Bez otvorenih nalaza prsten je prazan, a ne podijeljen na tri jednaka dijela:
    // prazno stanje mora izgledati kao prazno, nikad kao ravnomjerno rasporedjen problem.
    const fraction = total > 0 ? part.value / total : 0;
    const segment = { layer: part.layer, fraction, start: cursor };
    cursor += fraction;
    return segment;
  });
}

/**
 * Luk se NE ispisuje kao gotov `stroke-dasharray` nego kao tri broja u custom propertyjima,
 * a duljinu racuna CSS preko registriranog `--draw` (0 do 1). Razlog je iscrtavanje pri ulazu:
 * inline atribut ima vecu specificnost od CSS-a, pa se preko njega ne moze animirati, a
 * `@property --draw` daje pravi prijelaz duljine bez ijedne JS animacije po elementu.
 */
function arc(radius: number, fraction: number, start: number, layer: string): string {
  const c = TAU * radius;
  const raw = Math.max(0, Math.min(1, fraction)) * c;
  // Sitan razmak medju susjednim segmentima da se dva luka ne slijepe u jedan.
  const len = raw > 6 ? raw - 2 : raw;
  return `<circle class="halo__arc halo__arc--${layer}" data-halo-layer="${layer}" cx="100" cy="100" r="${radius}"`
    + ` style="--arc-len:${len.toFixed(2)};--arc-c:${c.toFixed(2)};--arc-off:${(-start * c).toFixed(2)}" />`;
}

/**
 * Mjerac spremnosti. SVG, ne conic-gradient: lukovi se mogu obojiti pojedinacno (crveno je
 * blokator, jantarno dorada), ostri su na svakoj velicini i mogu se ISCRTATI pri ulazu.
 *
 * Ton (`tone`) dolazi iz iste presude kao i naslov, pa vanjski prsten vise ne moze biti zelen
 * dok pise "Nije spremno": do 2026-08-30 je bio, jer je boja bila prikovana uz ocjenu.
 */
export function readinessHaloHtml(
  score: VisualScoreModel,
  signals: HaloSignals,
  statusLabel: string,
  tone = 'clear',
): string {
  const scoreFraction = score.kind === 'scored' ? Math.max(0, Math.min(1, score.value / score.max)) : 0;
  const segments = openFindingSegments(signals);
  const hasOpen = segments.some((segment) => segment.fraction > 0);

  const rings = [
    `<circle class="halo__track" cx="100" cy="100" r="${SCORE_R}" />`,
    `<circle class="halo__track halo__track--inner" cx="100" cy="100" r="${OPEN_R}" />`,
    arc(SCORE_R, scoreFraction, 0, 'scored'),
    ...segments.map((segment) => arc(OPEN_R, segment.fraction, segment.start, segment.layer)),
  ].join('');

  const core = score.kind === 'scored'
    ? `<strong class="halo__value">${escapeHtml(score.value)}</strong><span class="halo__max">/ ${escapeHtml(score.max)}</span>`
    : `<strong class="halo__value halo__value--none">${escapeHtml(signals.totalChecks)}</strong><span class="halo__max">${escapeHtml(pluralHr(signals.totalChecks, ['pravilo', 'pravila', 'pravila']))}</span>`;

  const metrics = ([
    ['blocked', signals.blockers, ['blokator', 'blokatora', 'blokatora']],
    ['warning', signals.warnings, ['upozorenje', 'upozorenja', 'upozorenja']],
    ['safe', signals.automaticFixes, ['sigurna popravka', 'sigurne popravke', 'sigurnih popravaka']],
    // Znamenka stoji SAMO gore; opis nosi imenicu. Ponovljen broj ("1" pa "1 blokator") citao
    // se kao dva razlicita podatka. Puna fraza ostaje za citace ekrana, jednom, u jednom dahu.
  ] as const).map(([kind, count, forms]) => {
    const noun = pluralHr(count, forms);
    return `<div class="cockpit-score__metric cockpit-score__metric--${kind}">`
      + `<strong aria-hidden="true">${escapeHtml(count)}</strong>`
      + `<span aria-hidden="true">${escapeHtml(noun)}</span>`
      + `<span class="cockpit-sr">${escapeHtml(`${count} ${noun}`)}</span></div>`;
  }).join('');

  // Jedna recenica, ne tri. Ranije su ovdje stajale "Tehnicka ocjena, N provjera", "Tehnicka
  // ocjena" i "Ocjena je pomocna informacija", sto je isto kazivalo tri puta.
  const caption = score.kind === 'scored'
    ? `Tehnička ocjena iz ${score.scoredChecks} ${pluralHr(score.scoredChecks, ['bodovane provjere', 'bodovane provjere', 'bodovanih provjera'])}. Spremnost ovisi o otvorenim nalazima, ne o ocjeni.`
    // Bez ocjene se NE izmislja broj nego se imenuje ono sto je stvarno izmjereno: koliko je
    // pravila provjereno. To je i jedini brojcani podatak koji jezgra u tom slucaju ima.
    : `Provjereno ${signals.totalChecks} ${pluralHr(signals.totalChecks, ['pravilo', 'pravila', 'pravila'])}. ${score.reason}`;

  return `<aside class="cockpit-score cockpit-score--halo${score.kind === 'unscored' ? ' cockpit-score--unscored' : ''}" data-cockpit-score="${score.kind === 'scored' ? score.value : 'unscored'}">`
    + `<div class="readiness-halo${score.kind === 'unscored' ? ' readiness-halo--unscored' : ''}" data-readiness-halo data-halo-tone="${escapeHtml(tone)}" data-halo-open="${hasOpen ? 'true' : 'false'}" data-readiness-status="${escapeHtml(statusLabel)}">`
    + `<svg class="halo__svg" viewBox="0 0 200 200" aria-hidden="true" focusable="false">${rings}</svg>`
    + `<span class="readiness-halo__core">${core}</span>`
    + `<span class="readiness-halo__status">${escapeHtml(statusLabel)}</span></div>`
    + `<div class="cockpit-score__metrics">${metrics}</div>`
    + `<p class="cockpit-score__reason">${escapeHtml(caption)}</p></aside>`;
}
