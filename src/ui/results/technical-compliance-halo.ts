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
