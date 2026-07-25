import type { Check, Issue } from '../scoring/checks';
import type { Fixability, TriageFinding, TriageModel } from '../analysis/triage';
import { collectFootnoteAnchors, collectIssueAnchors } from '../preview/preview-anchors';
import { safeHref } from '../utils/helpers';

export type FindingSeverity = 'error' | 'warning' | 'info';
export type FindingStatus = 'open' | 'confirmed' | 'ignored';
export type FindingKind = 'document' | 'limitation';

export type FindingScope =
  | { kind: 'anchor'; paragraphIndex: number; footnoteId?: number }
  | { kind: 'document' }
  | { kind: 'unavailable'; reason: string };

export interface FindingSource {
  title: string;
  url: string;
  date?: string;
  /** false znaci da je izvor kontekst profila, ne dokaz veze s pojedinim pravilom. */
  exact: boolean;
}

export interface FindingSessionState {
  status: FindingStatus;
  ignoredReason?: string;
}

export interface FindingViewModel {
  id: string;
  originalIndex: number;
  category: string;
  severity: FindingSeverity;
  /** Je li riječ o odstupanju dokumenta ili o granici automatske provjere. */
  kind: FindingKind;
  title: string;
  explanation: string;
  measured?: string;
  expected?: string;
  source?: FindingSource;
  scope: FindingScope;
  fixability: Fixability;
  autoRepairable: boolean;
  status: FindingStatus;
  ignoredReason?: string;
  priorityRank: number;
}

/**
 * Ove poruke nastaju iz profila ili mogućnosti alata, ne iz sadržaja učitanog
 * rada. Držimo ih vidljivima, ali ih ne brojimo kao problem dokumenta.
 */
function findingKind(issue: Issue): FindingKind {
  const title = String(issue.title || '');
  const where = String(issue.where || '');
  if (
    /^Profil /i.test(title)
    || /^Ručna završna provjera/i.test(title)
    || /^Odabrani citatni stil nije u potpunosti automatiziran/i.test(title)
    || /^Metodološku varijantu nije moguće pouzdano prepoznati/i.test(title)
    || /^(Odabrani profil|Terenska verifikacija|Citatni profil|Profil provjere|Službene upute)$/i.test(where)
  ) return 'limitation';
  return 'document';
}

export interface FindingResultInput {
  issues?: Issue[];
  checks?: Check[];
  details?: {
    triage?: TriageModel;
    sources?: Array<{ title?: string; url?: string }>;
    documentDate?: string;
    verifiedAt?: string;
  };
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function severity(value: string): FindingSeverity {
  return value === 'error' || value === 'warning' ? value : 'info';
}

function matchingCheck(issue: Issue, checks: Check[]): Check | undefined {
  return checks.find((check) => check.issue === issue || check.issue?.title === issue.title || check.title === issue.title);
}

function matchingTriage(issue: Issue, check: Check | undefined, triage: TriageModel | undefined): TriageFinding | undefined {
  return triage?.findings?.find((finding) =>
    finding.category === issue.category && (finding.title === check?.title || finding.title === issue.title),
  );
}

function scopeFor(issue: Issue, triage: TriageFinding | undefined): FindingScope {
  const location = triage?.locations?.[0];
  if (location) {
    return location.footnoteId != null
      ? { kind: 'anchor', paragraphIndex: 0, footnoteId: location.footnoteId }
      : { kind: 'anchor', paragraphIndex: location.paragraphIndex };
  }

  const flags = [...collectIssueAnchors([issue]), ...collectFootnoteAnchors([issue])];
  const flag = flags[0];
  if (flag) {
    return flag.footnoteId != null
      ? { kind: 'anchor', paragraphIndex: 0, footnoteId: flag.footnoteId }
      : { kind: 'anchor', paragraphIndex: flag.paragraphIndex };
  }

  const where = String(issue.where || '').trim();
  if (/cijeli dokument|postavke stranice|zaglavlje|podnožje|dokument u cjelini/i.test(where)) {
    return { kind: 'document' };
  }
  return {
    kind: 'unavailable',
    reason: where
      ? `Lokacija nije pouzdano dostupna. Nalaz je opisan kao: ${where}.`
      : 'Lokacija se za ovaj nalaz ne može pouzdano odrediti.',
  };
}

function priorityRank(issue: Issue, fixability: Fixability): number {
  const blocksSubmission = issue.category === 'submission' || /blokira|predajni paket|nije sprem/i.test(`${issue.title} ${issue.detail}`);
  if (blocksSubmission && issue.severity === 'error') return 0;
  if (issue.severity === 'error') return 1;
  if (issue.severity === 'warning' && fixability !== 'manual') return 2;
  if (issue.severity === 'warning') return 3;
  return 4;
}

/**
 * UI projekcija postojećeg rezultata. Ne mijenja engine niti javni rezultat analize.
 * Izvor profila je namjerno oznacen kao neizravan kontekst, ne kao izvor pojedinog nalaza.
 */
export function buildFindingViewModels(
  result: FindingResultInput,
  states: ReadonlyMap<string, FindingSessionState> = new Map(),
): FindingViewModel[] {
  const issues = Array.isArray(result.issues) ? result.issues : [];
  const checks = Array.isArray(result.checks) ? result.checks : [];
  const sourceRaw = result.details?.sources?.find((source) => source?.title && source?.url);
  const source = sourceRaw
    ? {
        title: String(sourceRaw.title),
        url: String(sourceRaw.url),
        date: result.details?.documentDate || result.details?.verifiedAt || undefined,
        exact: false,
      }
    : undefined;
  const used = new Map<string, number>();

  return issues.map((issue, originalIndex) => {
    const check = matchingCheck(issue, checks);
    const triage = matchingTriage(issue, check, result.details?.triage);
    const fixability = triage?.fixability || 'manual';
    const base = `finding:${slug(issue.category)}:${slug(issue.title)}`;
    const duplicate = used.get(base) || 0;
    used.set(base, duplicate + 1);
    const id = duplicate ? `${base}:${duplicate + 1}` : base;
    const state = states.get(id) || { status: 'open' as const };
    return {
      id,
      originalIndex,
      category: issue.category,
      severity: severity(issue.severity),
      kind: findingKind(issue),
      title: issue.title,
      explanation: issue.detail,
      ...(check?.detail ? { measured: check.detail } : {}),
      ...(source ? { source } : {}),
      scope: scopeFor(issue, triage),
      fixability,
      autoRepairable: !!triage?.fixId,
      status: state.status,
      ...(state.ignoredReason ? { ignoredReason: state.ignoredReason } : {}),
      priorityRank: priorityRank(issue, fixability),
    };
  });
}

export function topFindings(findings: FindingViewModel[], limit = 3): FindingViewModel[] {
  return [...findings]
    // Rucna potvrda znaci samo da je korisnik pogledao nalaz. Ne smije sakriti
    // blokator niti se smije predstavljati kao dokaz da je dokument popravljen.
    .filter((finding) => finding.status !== 'ignored')
    .sort((a, b) => a.priorityRank - b.priorityRank || a.originalIndex - b.originalIndex)
    .slice(0, limit);
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
}

function scopeHtml(scope: FindingScope): string {
  if (scope.kind === 'anchor') {
    const label = scope.footnoteId != null ? `bilješka ${scope.footnoteId}` : `odlomak ${scope.paragraphIndex}`;
    return `<button class="finding-scope finding-scope--jump" type="button" data-finding-jump>${esc(label)} <span aria-hidden="true">→</span></button>`;
  }
  if (scope.kind === 'document') return '<span class="finding-scope">Odnosi se na cijeli dokument.</span>';
  return `<span class="finding-scope finding-scope--muted">${esc(scope.reason)}</span>`;
}

export function findingCardHtml(finding: FindingViewModel, repairAvailable: boolean): string {
  const statusLabel = finding.status === 'confirmed' ? 'Ručno provjereno' : finding.status === 'ignored' ? 'Zanemareno' : 'Otvoreno';
  // Profilni kontekst nije dokaz pojedinog pravila. Link se ovdje prikazuje samo
  // kad buduci model stvarno donese izravno povezani izvor.
  const source = finding.source?.exact
    ? `<div class="finding-source"><span>Izvor pravila:</span> <a href="${esc(safeHref(finding.source.url))}" target="_blank" rel="noopener">${esc(finding.source.title)}</a>${finding.source.date ? ` <small>(${esc(finding.source.date)})</small>` : ''}</div>`
    : '';
  const measured = finding.measured ? `<div class="finding-evidence"><span>Izmjereno</span><p>${esc(finding.measured)}</p></div>` : '';
  const auto = repairAvailable && finding.autoRepairable
    ? '<button type="button" class="btn btn-primary btn-sm" data-finding-repair>Otvori mogućnost popravka</button>'
    : '';
  const decision = finding.fixability !== 'manual' ? '' : finding.status === 'open'
    ? '<button type="button" class="btn btn-ghost btn-sm" data-finding-confirm>Označi ručno provjereno</button><button type="button" class="btn btn-ghost btn-sm" data-finding-ignore>Zanemari uz razlog</button>'
    : finding.status === 'confirmed'
      ? '<button type="button" class="btn btn-ghost btn-sm" data-finding-reopen>Poništi ručnu potvrdu</button>'
      : '<button type="button" class="btn btn-ghost btn-sm" data-finding-reopen>Vrati u otvorene nalaze</button>';
  const reason = finding.ignoredReason ? `<p class="finding-ignored-reason">Razlog: ${esc(finding.ignoredReason)}</p>` : '';
  const confirmation = finding.status === 'confirmed'
    ? '<p class="finding-status-note">Ručna potvrda ne mijenja automatsku ocjenu. Ponovno analiziraj dokument nakon izmjene.</p>'
    : '';
  return `<article class="finding-card finding-card--${finding.severity} finding-card--${finding.status}" data-finding-id="${esc(finding.id)}"><header><span class="finding-priority">${finding.severity === 'error' ? 'Kritično' : finding.severity === 'warning' ? 'Važno' : 'Provjeri'}</span><span class="finding-status">${statusLabel}</span></header><h4>${esc(finding.title)}</h4><p>${esc(finding.explanation)}</p>${measured}<div class="finding-location">${scopeHtml(finding.scope)}</div>${source}${reason}${confirmation}<div class="finding-actions">${auto}${decision}</div><div class="finding-ignore-form hidden"><label>Zašto zanemaruješ ovaj nalaz?<input type="text" maxlength="240" data-finding-ignore-reason><small>Zanemareni nalaz možeš kasnije vratiti u otvorene nalaze.</small></label><div class="finding-ignore-buttons"><button type="button" class="btn btn-secondary btn-sm" data-finding-ignore-save>Spremi razlog</button><button type="button" class="btn btn-ghost btn-sm" data-finding-ignore-cancel>Odustani</button></div></div></article>`;
}
