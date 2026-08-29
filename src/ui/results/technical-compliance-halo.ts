import type { VisualScoreModel } from './visual-result-model';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function technicalComplianceHaloHtml(score: VisualScoreModel): string {
  if (score.kind === 'unscored') return [
    '<aside class="cockpit-score cockpit-score--unscored" data-cockpit-score="unscored"><div class="cockpit-score__line"><strong>?</strong><span>/ 100</span></div>',
    '<span class="cockpit-score__label">', escapeHtml(score.label), '</span><p class="cockpit-score__reason">', escapeHtml(score.reason), '</p></aside>',
  ].join('');
  const percentage = Math.round((score.value / score.max) * 100);
  return [
    '<aside class="cockpit-score" data-cockpit-score="', String(score.value), '"><div class="cockpit-score__line"><strong>', escapeHtml(score.value), '</strong><span>/ ', escapeHtml(score.max), '</span></div>',
    '<div class="cockpit-score__bar" role="progressbar" aria-label="Tehni\u010Dka ocjena" aria-valuenow="', String(score.value), '" aria-valuemin="0" aria-valuemax="', String(score.max), '"><span style="width:', String(percentage), '%"></span></div>',
    '<span class="cockpit-score__label">Tehni\u010Dka ocjena</span><p class="cockpit-score__reason">', escapeHtml(score.scoredChecks), ' automatskih provjera</p></aside>',
  ].join('');
}

export function readinessHaloHtml(
  score: VisualScoreModel,
  signals: { blockers: number; warnings: number; automaticFixes: number; informationalChecks: number; totalChecks: number },
  statusLabel: string,
): string {
  const totalRules = Math.max(1, signals.totalChecks || (score.kind === 'scored' ? score.scoredChecks : 0));
  const blockerArc = Math.min(100, (signals.blockers / totalRules) * 100);
  const warningArc = Math.min(100, (signals.warnings / totalRules) * 100);
  const informationalArc = signals.informationalChecks > 0 ? 100 : 0;
  const metrics = [['blocked', signals.blockers, 'blokator', 'blokatora'], ['warning', signals.warnings, 'upozorenje', 'upozorenja'], ['safe', signals.automaticFixes, 'sigurna popravka', 'sigurne popravke']].map(([kind, count, one, many]) => `<div class="cockpit-score__metric cockpit-score__metric--${kind}"><strong>${escapeHtml(count)}</strong><span>${escapeHtml(`${count} ${Number(count) === 1 ? one : many}`)}</span></div>`).join('');
  const rings = `<span class="readiness-halo__ring readiness-halo__ring--scored" data-halo-layer="scored" aria-hidden="true"></span><span class="readiness-halo__ring readiness-halo__ring--blockers" data-halo-layer="blockers" aria-hidden="true"></span><span class="readiness-halo__ring readiness-halo__ring--warnings" data-halo-layer="warnings" aria-hidden="true"></span><span class="readiness-halo__ring readiness-halo__ring--informational" data-halo-layer="informational" aria-hidden="true"></span>`;
  const style = `--halo-score:${score.kind === 'scored' ? score.value : 0}%;--halo-blocker-arc:${blockerArc}%;--halo-warning-arc:${warningArc}%;--halo-info-arc:${informationalArc}%;`;
  const core = score.kind === 'scored' ? `<span class="readiness-halo__core"><strong>${escapeHtml(score.value)}</strong><span>/ ${escapeHtml(score.max)}</span></span>` : '<span class="readiness-halo__core"><strong>?</strong><span>bez ocjene</span></span>';
  const fact = score.kind === 'scored' ? `Tehni?ka ocjena ? ${score.scoredChecks} bodovanih provjera` : `Provjereno ${signals.totalChecks} ${signals.totalChecks === 1 ? 'pravilo' : 'pravila'}`;
  const reason = score.kind === 'scored' ? 'Ocjena je pomo?na informacija. Spremnost ovisi o otvorenim nalazima.' : score.reason;
  return `<aside class="cockpit-score cockpit-score--halo${score.kind === 'unscored' ? ' cockpit-score--unscored' : ''}" data-cockpit-score="${score.kind === 'scored' ? score.value : 'unscored'}"><div class="readiness-halo${score.kind === 'unscored' ? ' readiness-halo--unscored' : ''}" data-readiness-halo data-readiness-status="${escapeHtml(statusLabel)}" style="${style}">${rings}${core}<span class="readiness-halo__status">${escapeHtml(score.kind === 'scored' ? statusLabel : 'Provjeri rezultat')}</span></div><div class="cockpit-score__metrics">${metrics}</div><p class="cockpit-score__fact">${escapeHtml(fact)}</p><span class="cockpit-score__label">${escapeHtml(score.kind === 'scored' ? 'Tehni?ka ocjena' : score.label)}</span><p class="cockpit-score__reason">${escapeHtml(reason)}</p></aside>`;
}
