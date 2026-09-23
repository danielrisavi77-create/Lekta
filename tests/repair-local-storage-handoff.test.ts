import { describe, expect, it, vi } from 'vitest';
import { settleRepairStorageHandoff } from '../src/repair/local-runner/storage-handoff';

describe('repair-docx local storage handoff', () => {
  it('withholds local launch until all durable storage reports local-ready', async () => {
    let finishStorage!: (value: { jobId: string; localRepairReady: boolean }) => void;
    const storeTask = new Promise<{ jobId: string; localRepairReady: boolean }>((resolve) => {
      finishStorage = resolve;
    });
    const waitUntil = vi.fn();
    let settled = false;

    const handoffPromise = settleRepairStorageHandoff({
      storeTask,
      waitUntil,
      localLaunch: { jobId: 'job-1', claimToken: 'secret' },
    }).then((value) => {
      settled = true;
      return value;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(waitUntil).not.toHaveBeenCalled();

    finishStorage({ jobId: 'job-1', localRepairReady: true });
    await expect(handoffPromise).resolves.toEqual({
      storagePending: false,
      localRepair: { jobId: 'job-1', claimToken: 'secret' },
    });
  });

  it('keeps the server DOCX path available but suppresses launch when local persistence fails', async () => {
    await expect(settleRepairStorageHandoff({
      storeTask: Promise.resolve({ jobId: 'job-2', localRepairReady: false }),
      waitUntil: vi.fn(),
      localLaunch: { jobId: 'job-2', claimToken: 'secret' },
    })).resolves.toEqual({
      storagePending: false,
      localRepair: null,
    });
  });

  it('preserves fast background storage when no local launch was issued', async () => {
    let finishStorage!: (value: { jobId: string; localRepairReady: boolean }) => void;
    const storeTask = new Promise<{ jobId: string; localRepairReady: boolean }>((resolve) => {
      finishStorage = resolve;
    });
    const waitUntil = vi.fn();

    await expect(settleRepairStorageHandoff({
      storeTask,
      waitUntil,
      localLaunch: null,
    })).resolves.toEqual({
      storagePending: true,
      localRepair: null,
    });
    expect(waitUntil).toHaveBeenCalledWith(storeTask);

    finishStorage({ jobId: 'job-3', localRepairReady: false });
    await storeTask;
  });

  it('returns no launch and no pending storage when persistence was not attempted', async () => {
    await expect(settleRepairStorageHandoff({
      storeTask: null,
      waitUntil: vi.fn(),
      localLaunch: null,
    })).resolves.toEqual({ storagePending: false, localRepair: null });
  });
});
