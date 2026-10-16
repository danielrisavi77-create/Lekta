import { awaitAbortable } from '../shared/await-abortable';
import type { CorpusContributionRef } from '../report/corpus-contribution-client';
import type { RepairJob } from '../report/repair-history';

export interface RepairHistoryViewDeps {
  isCurrent: () => boolean;
  authConfigured: boolean;
  ensureAccessToken: (signal: AbortSignal) => Promise<string | null>;
  openAuth: (afterAuth: () => void) => void;
  reload: () => void;
  fetchJobs: (token: string, signal: AbortSignal) => Promise<RepairJob[]>;
  includeCorpusContributions: boolean;
  fetchCorpusContributions: (token: string, signal: AbortSignal) => Promise<CorpusContributionRef[]>;
  tierLabel: (workType: string) => string;
  formatChanges: (count: number) => string;
  escape: (value: string) => string;
  refreshIcons: () => void;
}

const HISTORY_TIMEOUT_MS = 30_000;
const CORPUS_TIMEOUT_MS = 5_000;

function repairDownloadName(job: RepairJob): string {
  const raw = String(job.label || '').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 60).trim();
  return (raw ? `${raw}-popravljeno` : 'popravljeno') + '.docx';
}

function jobsHtml(jobs: RepairJob[], corpusByJob: Map<string, string>, deps: RepairHistoryViewDeps): string {
  const esc = deps.escape;
  return jobs.map((job) => {
    const date = job.createdAt ? new Date(job.createdAt).toLocaleString('hr-HR') : '';
    const size = job.resultBytes ? `${(job.resultBytes / 1024 / 1024).toFixed(2)} MB` : '';
    const actions = job.deleting
      ? '<span class="muted">Brisanje u tijeku…</span>'
      : `<button class="btn btn-secondary btn-sm" data-repair-download="${esc(job.id)}" data-path="${esc(job.resultPath)}" data-name="${esc(repairDownloadName(job))}">Preuzmi</button><button class="btn btn-ghost btn-sm" data-repair-del="${esc(job.id)}">Obriši</button>${corpusByJob.has(job.id) ? `<button class="btn btn-ghost btn-sm" data-corpus-withdraw="${esc(corpusByJob.get(job.id) || '')}">Povuci prilog korpusu</button>` : ''}`;
    return `<article class="history-card"><div class="history-head"><div><h4>${esc(job.label || 'Popravljeni rad')}</h4><p>${esc(deps.tierLabel(job.workType))}</p></div></div><div class="history-meta"><span>${esc(date)}</span>${job.changesCount != null ? `<span>${esc(deps.formatChanges(job.changesCount))}</span>` : ''}${size ? `<span>${esc(size)}</span>` : ''}</div><div class="history-actions">${actions}</div></article>`;
  }).join('');
}

export async function renderRepairHistoryView(el: HTMLElement, deps: RepairHistoryViewDeps): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HISTORY_TIMEOUT_MS);
  el.innerHTML = '<div class="empty">Učitavam…</div>';
  try {
    const token = await awaitAbortable(deps.ensureAccessToken(controller.signal), controller.signal);
    if (!deps.isCurrent()) return false;
    if (deps.authConfigured && !token) {
      el.innerHTML = '<div class="empty">Za pregled popravaka potrebna je prijava.</div>';
      deps.openAuth(deps.reload);
      return false;
    }
    const jobs = await awaitAbortable(deps.fetchJobs(token || '', controller.signal), controller.signal);
    if (!deps.isCurrent()) return false;
    // Kanal A je dodatni metapodatak; njegov zastoj ne može ostaviti "Moji popravci" u vrtnji.
    const corpusByJob = new Map<string, string>();
    if (deps.includeCorpusContributions) {
      const corpusController = new AbortController();
      const corpusTimer = setTimeout(() => corpusController.abort(), CORPUS_TIMEOUT_MS);
      try {
        const contributions = await awaitAbortable(deps.fetchCorpusContributions(token || '', corpusController.signal), corpusController.signal);
        for (const contribution of contributions) if (contribution.repairJobId) corpusByJob.set(contribution.repairJobId, contribution.id);
      } catch {
        // Kanal A je samo dodatni metapodatak; njegovo kašnjenje ne smije sakriti učitane poslove.
      } finally {
        clearTimeout(corpusTimer);
      }
    }
    if (!deps.isCurrent()) return false;
    if (!jobs.length) {
      el.innerHTML = '<div class="empty">Još nemaš spremljenih popravaka. Pojave se ovdje nakon "Popravi sve".</div>';
      return true;
    }
    el.innerHTML = jobsHtml(jobs, corpusByJob, deps);
    deps.refreshIcons();
    return true;
  } catch {
    if (!deps.isCurrent()) return false;
    el.innerHTML = controller.signal.aborted
      ? '<div class="empty">Učitavanje je trajalo predugo. Provjeri vezu i ponovno otvori Moje popravke.</div>'
      : '<div class="empty">Popravke trenutačno nije moguće učitati.</div>';
    return false;
  } finally {
    clearTimeout(timer);
  }
}
