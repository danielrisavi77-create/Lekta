/**
 * Vrpca "Put do tehnickih 100": current -> +automatski -> +do uz potvrdu -> rucni ostatak.
 *
 * Cisti model + HTML string (bez zicanja; klikove zica app.ts). Ugovori:
 *  - brojke dolaze iz repairPath nad STVARNO PONUDJENIM stavkama (offered), nikad iz ciste
 *    klasifikacije: vrpca ne smije obecati popravak koji panel ne nudi;
 *  - prikazno "sada" je result.score (A0: projekcija nad checks zna biti niza), a slojevi se
 *    klampaju monotono na prikaznim brojevima;
 *  - copy je "procjena"/"do"; zadnji segment NIKAD ne ispisuje "100" kao odrediste (ocjena
 *    mjeri sto heuristika prepozna, ne istinu o radu);
 *  - bez ijednog dobitka i bez rucnog jaza vrpca se ne prikazuje (nema praznog obecanja).
 */
import type { Check } from '../scoring/checks';
import { repairPath, type SelectedRepairLike } from '../scoring/score-projection';

export interface ScorePathModel {
  /** Prikazno "sada" (result.score). */
  current: number;
  /** Prikazno nakon sigurnih automatskih popravaka (klampano >= current). */
  afterAuto: number;
  /** Prikazno "do" nakon i popravaka uz potvrdu (klampano >= afterAuto). */
  afterAssisted: number;
  autoGain: number;
  assistedGain: number;
  /** Bodovi koje rucne (sadrzajne) provjere drze otvorenima. */
  manualLost: number;
  manualCount: number;
  /** Rucne provjere bez izgubljenih bodova (savjet, ne bodovni jaz). */
  advisoryCount: number;
  /** Bodovi auto/assisted klase za koje NEMA ponudjene stavke u ovom profilu. */
  uncoveredLost: number;
  /** Nazivnik bodovanja (za pretvorbu bodova u postotke trake). */
  maxRaw: number;
  /** manualLost / uncoveredLost kao postotak ocjene (sirina segmenta na traci 0-100). */
  manualPct: number;
  uncoveredPct: number;
}

export function buildScorePathModel(
  checks: readonly Check[],
  offered: readonly SelectedRepairLike[],
  displayScore: number | null | undefined,
): ScorePathModel | null {
  if (displayScore == null || !Array.isArray(checks) || !checks.length) return null;
  const path = repairPath(checks, offered);
  const afterAuto = Math.max(displayScore, path.afterAuto.score ?? displayScore);
  const afterAssisted = Math.max(afterAuto, path.afterAssisted.score ?? afterAuto);
  const maxRaw = path.current.maxRaw;
  const manualLostRaw = path.manualItems.reduce((s, m) => s + m.lostPoints, 0);
  const uncoveredLostRaw = path.uncoveredItems.reduce((s, u) => s + u.lostPoints, 0);
  const pct = (pts: number) => (maxRaw > 0 ? Math.round((pts / maxRaw) * 100) : 0);
  return {
    current: displayScore,
    afterAuto,
    afterAssisted,
    autoGain: afterAuto - displayScore,
    assistedGain: afterAssisted - afterAuto,
    // Bodovi provjera znaju biti razlomacki (npr. 2.2/3); vrpca ih zaokruzuje jer "15.8 bodova"
    // glumi preciznost koju heuristika nema (izmjereno na fer-diplomski-prazni-odlomci fixturu).
    manualLost: Math.round(manualLostRaw),
    manualCount: path.manualItems.length,
    advisoryCount: path.manualAdvisories.length,
    uncoveredLost: Math.round(uncoveredLostRaw),
    maxRaw,
    manualPct: pct(manualLostRaw),
    uncoveredPct: pct(uncoveredLostRaw),
  };
}

/** Ima li vrpca ista za reci (inace se uopce ne prikazuje). */
export function scorePathHasContent(model: ScorePathModel | null): boolean {
  return !!model && (model.autoGain > 0 || model.assistedGain > 0 || model.manualLost > 0);
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bodova(n: number): string {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return 'bod';
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return 'boda';
  return 'bodova';
}

/**
 * HTML vrpce. Segmenti s akcijom nose data-path-segment="auto|assisted|manual" (zica ih app.ts).
 * Prazan string kad nema sadrzaja.
 */
/**
 * Traka 0-100: jedan pogled na "gdje si, sto mozemo, sto ostaje". Segmenti u postocima ocjene:
 * sada / +automatski / +uz potvrdu / bez ponudjenog popravka / rucno; ostatak do 100 je prazan.
 * Zbroj se klampa na 100 (A0 klamp i zaokruzivanja znaju dati 101).
 */
function barHtml(model: ScorePathModel): string {
  const parts: Array<{ kind: string; w: number }> = [
    { kind: 'now', w: model.current },
    { kind: 'auto', w: model.autoGain },
    { kind: 'assisted', w: model.assistedGain },
    { kind: 'uncovered', w: model.uncoveredPct },
    { kind: 'manual', w: model.manualPct },
  ].filter((p) => p.w > 0);
  const total = parts.reduce((s, p) => s + p.w, 0);
  const scale = total > 100 ? 100 / total : 1;
  const segs = parts.map((p) => `<i class="score-path__bar-seg score-path__bar-seg--${p.kind}" style="width:${(p.w * scale).toFixed(1)}%"></i>`).join('');
  const aria = [
    `Sada ${model.current} od 100`,
    model.autoGain > 0 ? `automatski do ${model.afterAuto}` : '',
    model.assistedGain > 0 ? `uz potvrdu do ${model.afterAssisted}` : '',
    model.uncoveredLost > 0 ? `${model.uncoveredLost} ${bodova(model.uncoveredLost)} bez ponuđenog popravka` : '',
    model.manualLost > 0 ? `${model.manualLost} ${bodova(model.manualLost)} traži ručnu provjeru` : '',
  ].filter(Boolean).join('; ');
  return `<div class="score-path__bar" role="img" aria-label="${esc(aria)}">${segs}</div><div class="score-path__scale" aria-hidden="true"><span>0</span><span>100</span></div>`;
}

/**
 * HTML kartice. Redoslijed: traka 0-100, pa legenda-koraci [sada] -> [+auto] -> [+do uz potvrdu]
 * -> "do N" ODREDISTE, pa rucni ostatak kao ZASEBAN blok iza separatora (nije korak prema N nego
 * ono sto ostaje), pa slot za CTA popravka (app.ts u njega SELI #repairEntry), pa napomene.
 * Segmenti s akcijom nose data-path-segment="auto|assisted|manual" (zica ih app.ts).
 * Prazan string kad nema sadrzaja.
 */
export function scorePathHtml(model: ScorePathModel | null): string {
  if (!scorePathHasContent(model) || !model) return '';
  const steps: string[] = [];
  steps.push(`<span class="score-path__seg score-path__seg--now"><b>${model.current}</b><small>sada</small></span>`);
  if (model.autoGain > 0) {
    steps.push(`<button type="button" class="score-path__seg score-path__seg--auto" data-path-segment="auto"><b>+${model.autoGain}</b><small>automatski (procjena)</small></button>`);
  }
  if (model.assistedGain > 0) {
    steps.push(`<button type="button" class="score-path__seg score-path__seg--assisted" data-path-segment="assisted"><b>+do ${model.assistedGain}</b><small>uz tvoju potvrdu</small></button>`);
  }
  const target = model.assistedGain > 0
    ? `<span class="score-path__to">→ do <b>${model.afterAssisted}</b> (procjena)</span>`
    : model.autoGain > 0
      ? `<span class="score-path__to">→ do <b>${model.afterAuto}</b> (procjena)</span>`
      : '';
  const manual = model.manualLost > 0
    ? `<span class="score-path__rest" aria-hidden="true">·</span><button type="button" class="score-path__seg score-path__seg--manual" data-path-segment="manual"><b>${model.manualLost} ${esc(bodova(model.manualLost))}</b><small>traži tvoju provjeru</small></button>`
    : '';
  const uncovered = model.uncoveredLost > 0
    ? `<p class="score-path__note">Za ${model.uncoveredLost} ${esc(bodova(model.uncoveredLost))} nema ponuđenog popravka u ovom profilu.</p>`
    : '';
  return `${barHtml(model)}<div class="score-path__row">${steps.join('<span class="score-path__arrow" aria-hidden="true">→</span>')}${target}${manual}</div><div class="score-path__cta" data-path-cta></div>${uncovered}<div class="score-path__links" data-path-links></div><p class="score-path__foot">Procjena; konačnu ocjenu potvrđuje ponovna provjera. Ocjena mjeri samo automatski provjerljiva pravila.</p>`;
}
