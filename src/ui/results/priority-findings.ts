import type { FindingScope } from '../finding-view-model';
import type { VisualFindingModel } from './visual-result-model';
import { escapeHtml } from '../../utils/helpers';

function categoryLabel(category: string): string {
  return ({ formatting: 'Oblikovanje', structure: 'Struktura', citations: 'Citiranje', elements: 'Elementi', submission: 'Predaja', scope: 'Opseg' } as Record<string, string>)[category] ?? 'Provjera';
}
function severityLabel(severity: VisualFindingModel['severity']): string {
  if (severity === 'error') return 'Kriti\u010Dno';
  if (severity === 'warning') return 'Va\u017Eno';
  return 'Informativno';
}
function scopeLabel(scope: FindingScope): string {
  if (scope.kind === 'anchor') return scope.footnoteId != null ? 'Bilje\u0161ka ' + scope.footnoteId : 'Odlomak ' + scope.paragraphIndex;
  if (scope.kind === 'document') return 'Cijeli dokument';
  return scope.reason;
}
function recommendation(finding: VisualFindingModel, repairAvailable: boolean): string {
  if (repairAvailable && finding.capabilities.repair) return 'Pokrenite automatski popravak, zatim ponovno provjerite dokument.';
  if (finding.capabilities.preview) return 'Otvorite ozna\u010Deno mjesto i provjerite ga prema uputama.';
  return 'Provjerite ovaj dio rada prema uputama svojeg studija ili mentora.';
}
function findingAction(finding: VisualFindingModel, repairAvailable: boolean): { kind: string; label: string } {
  if (repairAvailable && finding.capabilities.repair) return { kind: 'repair', label: 'Popravi automatski' };
  if (finding.capabilities.preview) return { kind: 'preview', label: 'Otvori mjesto' };
  return { kind: 'advanced', label: 'Prika\u017Ei detalje' };
}
function locationHtml(finding: VisualFindingModel): string {
  if (finding.scope.kind === 'anchor') return '<button type="button" class="cockpit-finding__location" data-finding-jump>Gdje: ' + escapeHtml(scopeLabel(finding.scope)) + ' <span aria-hidden="true">&#8594;</span></button>';
  return '<p class="cockpit-finding__location">Gdje: ' + escapeHtml(scopeLabel(finding.scope)) + '</p>';
}
function decisionHtml(finding: VisualFindingModel): string {
  if (finding.status === 'open') return [
    '<button type="button" class="button button-quiet" data-finding-confirm>Ozna\u010Di kao provjereno</button>',
    '<button type="button" class="button button-quiet" data-finding-ignore>Zanemari uz razlog</button>',
    '<div class="cockpit-ignore-form" data-finding-ignore-form hidden><label>Za\u0161to zanemaruje\u0161 ovaj nalaz?<input type="text" maxlength="240" data-finding-ignore-reason></label>',
    '<button type="button" class="button button-secondary" data-finding-ignore-save>Spremi razlog</button><button type="button" class="button button-quiet" data-finding-ignore-cancel>Odustani</button></div>',
  ].join('');
  if (finding.status === 'confirmed') return '<button type="button" class="button button-quiet" data-finding-reopen>Poni\u0161ti ru\u010Dnu potvrdu</button>';
  return '<button type="button" class="button button-quiet" data-finding-reopen>Vrati u otvorene nalaze</button>';
}
/**
 * `ordinal` je REDOSLIJED U POPISU (1, 2, 3), ne `finding.priorityRank`. Rank je interna ljestvica
 * 0 do 4 pa je uz preskocene razine na ekranu ispisivao "02, 04, 04", sto se cita kao broj nalaza.
 */
export function priorityFindingHtml(finding: VisualFindingModel, repairAvailable: boolean, ordinal = 1): string {
  const action = findingAction(finding, repairAvailable);
  const measured = finding.measured ? '<div class="cockpit-finding__answer"><strong>Izmjereno</strong><p>' + escapeHtml(finding.measured) + '</p></div>' : '';
  const expected = finding.expected ? '<div class="cockpit-finding__answer"><strong>O\u010Dekivano</strong><p>' + escapeHtml(finding.expected) + '</p></div>' : '';
  const evidence = finding.exactEvidence ? '<details class="cockpit-finding__evidence"><summary>Dokaz iz izvora</summary><p>' + escapeHtml(finding.exactEvidence.quote) + '</p><small>' + escapeHtml(finding.exactEvidence.title) + (finding.exactEvidence.pageLabel ? ', ' + finding.exactEvidence.pageLabel : finding.exactEvidence.page != null ? ', str. ' + finding.exactEvidence.page : '') + '</small></details>' : '';
  const source = finding.source?.exact && finding.exactEvidence ? '<a class="cockpit-finding__source" href="' + escapeHtml(finding.exactEvidence.url) + '" target="_blank" rel="noopener">Otvori izvor</a>' : '';
  return [
    '<article class="cockpit-finding cockpit-finding--', escapeHtml(finding.severity), ' cockpit-finding--', escapeHtml(finding.status), '" data-cockpit-finding data-cockpit-priority-card data-finding-id="', escapeHtml(finding.id), '">',
    '<div class="cockpit-finding__index">', String(ordinal).padStart(2, '0'), '</div><div class="cockpit-finding__body">',
    '<div class="cockpit-finding__meta"><span>', severityLabel(finding.severity), '</span><span>', categoryLabel(finding.category), '</span></div><h3>', escapeHtml(finding.title), '</h3>',
    '<div class="cockpit-finding__answer"><strong>Za\u0161to</strong><p>', escapeHtml(finding.explanation), '</p></div>',
    '<div class="cockpit-finding__answer"><strong>\u0160to napraviti</strong><p>', recommendation(finding, repairAvailable), '</p></div>',
    measured, expected, locationHtml(finding), evidence, source,
    '<div class="cockpit-finding__actions"><button type="button" class="button button-secondary" data-finding-action="', action.kind, '" data-finding-id="', escapeHtml(finding.id), '">', action.label, '</button>',
    decisionHtml(finding), '</div></div></article>',
  ].join('');
}
export function priorityFindingsHtml(findings: readonly VisualFindingModel[], repairAvailable: boolean): string {
  if (!findings.length) return '<div class="cockpit-empty">Nema otvorenih nalaza za prikaz.</div>';
  // Kartice idu u VLASTITI omotac, ne izravno u sekciju: bez njega su one 2., 3. i 4. dijete
  // sekcije (prvo je naslov), pa nijedan `:nth-child(1..3)` selektor ne pogodi nista, a razmak
  // medju karticama nema na cemu zivjeti.
  return '<div class="cockpit-priority__list">'
    + findings.slice(0, 3).map((finding, index) => priorityFindingHtml(finding, repairAvailable, index + 1)).join('')
    + '</div>';
}
