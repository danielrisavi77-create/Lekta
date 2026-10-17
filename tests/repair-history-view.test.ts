// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderRepairHistoryView, type RepairHistoryViewDeps } from '../src/ui/repair-history-view';
import type { RepairJob } from '../src/report/repair-history';

const job: RepairJob = {
  id: 'job-1', workType: 'zavrsni', label: 'Moj rad', status: 'done',
  originalBytes: 1000, resultBytes: 900, changesCount: 1,
  resultPath: 'user/job-1/fixed.docx', createdAt: '2026-10-16T10:00:00.000Z', deleting: false,
};

describe('renderRepairHistoryView', () => {
  it('zadržava učitane poslove kad dodatni podaci korpusa zapnu', async () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement('div');
      let corpusSignal: AbortSignal | null = null;
      const deps: RepairHistoryViewDeps = {
        isCurrent: () => true,
        authConfigured: true,
        ensureAccessToken: async () => 'user-jwt',
        openAuth: async () => true,
        fetchJobs: async () => [job],
        includeCorpusContributions: true,
        fetchCorpusContributions: async (_token, signal) => {
          corpusSignal = signal;
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
          });
        },
        tierLabel: () => 'Završni rad',
        formatChanges: (count) => `${count} izmjena`,
        escape: (value) => value,
        refreshIcons: () => {},
      };

      const rendering = renderRepairHistoryView(el, deps);
      await vi.advanceTimersByTimeAsync(0);
      expect(corpusSignal).not.toBeNull();
      await vi.advanceTimersByTimeAsync(5_000);

      await expect(rendering).resolves.toBe(true);
      expect(el.textContent).toContain('Moj rad');
      expect(el.textContent).toContain('Preuzmi');
      expect(el.textContent).toContain('Obriši');
      expect(el.textContent).not.toContain('Učitavam');
    } finally {
      vi.useRealTimers();
    }
  });

  it('nastavlja istu provjeru nakon uspješne prijave', async () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement('div');
      let signedIn = false;
      let finishAuth!: (success: boolean) => void;
      const openAuth = vi.fn(() => new Promise<boolean>((resolve) => { finishAuth = resolve; }));
      const fetchJobs = vi.fn(async () => [job]);
      const deps: RepairHistoryViewDeps = {
        isCurrent: () => true,
        authConfigured: true,
        ensureAccessToken: async () => signedIn ? 'user-jwt' : null,
        openAuth,
        fetchJobs,
        includeCorpusContributions: false,
        fetchCorpusContributions: async () => [],
        tierLabel: () => 'Završni rad',
        formatChanges: (count) => `${count} izmjena`,
        escape: (value) => value,
        refreshIcons: () => {},
      };

      const rendering = renderRepairHistoryView(el, deps);
      await Promise.resolve();
      await Promise.resolve();
      expect(openAuth).toHaveBeenCalledOnce();
      expect(fetchJobs).not.toHaveBeenCalled();
      signedIn = true;
      finishAuth(true);

      await expect(rendering).resolves.toBe(true);
      expect(fetchJobs).toHaveBeenCalledOnce();
      expect(el.textContent).toContain('Moj rad');
    } finally {
      vi.useRealTimers();
    }
  });
});
