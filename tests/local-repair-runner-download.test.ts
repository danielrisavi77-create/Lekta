import { describe, expect, it, vi } from 'vitest';

import {
  renderLocalRepairRunnerOffer,
  type LocalRepairRunnerArtifactConfig,
} from '../src/report/local-repair-runner-download.ts';
import type { LocalRepairLaunchV1 } from '../src/report/repair-client.ts';

const launch: LocalRepairLaunchV1 = {
  version: 1,
  jobId: '33333333-3333-4333-8333-333333333333',
  claimToken: 'A'.repeat(43),
  expiresAt: '2026-08-31T10:00:00.000Z',
};

const runnerBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function config(): Promise<LocalRepairRunnerArtifactConfig> {
  return {
    url: 'https://lekta.hr/downloads/LektaRepair.exe',
    sha256: await sha256Hex(runnerBytes),
  };
}

describe('local WordReplica runner download', () => {
  it('jasno kaže da Word mora biti instaliran, ali aktivna licenca nije potrebna', async () => {
    const mount = document.createElement('div');

    const offer = renderLocalRepairRunnerOffer(mount, launch, await config());

    expect(offer).not.toBeNull();
    expect(mount.textContent).toMatch(/s instaliranim desktop Microsoft Wordom/i);
    expect(mount.textContent).toMatch(/aktivna Word licenca nije potrebna/i);
    expect(mount.textContent).toMatch(/završnu provjeru i otvaranje/i);
  });

  it('nudi potpisani portable EXE i claim tajnu stavlja samo u lokalni naziv datoteke', async () => {
    const mount = document.createElement('div');
    const requested: string[] = [];
    const downloaded: Array<{ bytes: Uint8Array; fileName: string }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requested.push(String(input));
      return new Response(runnerBytes, { status: 200 });
    }) as unknown as typeof fetch;

    const offer = renderLocalRepairRunnerOffer(mount, launch, await config(), {
      fetchImpl,
      download: (bytes, fileName) => downloaded.push({ bytes, fileName }),
    });

    expect(offer).not.toBeNull();
    const button = mount.querySelector<HTMLButtonElement>('[data-local-repair-runner-download]');
    expect(button?.textContent).toMatch(/Word|računalu/i);
    button?.click();
    await vi.waitFor(() => expect(downloaded).toHaveLength(1));

    expect(requested).toEqual(['https://lekta.hr/downloads/LektaRepair.exe']);
    expect(requested[0]).not.toContain(launch.jobId);
    expect(requested[0]).not.toContain(launch.claimToken);
    expect(downloaded[0]).toEqual({
      bytes: runnerBytes,
      fileName: `LektaRepair-${launch.jobId}-${launch.claimToken}.exe`,
    });
    expect(mount.textContent).toMatch(/pokreni preuzeti/i);
  });

  it('fail-closed odbija zamijenjeni ili ne-PE artefakt', async () => {
    const mount = document.createElement('div');
    const downloaded = vi.fn();
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as unknown as typeof fetch;

    renderLocalRepairRunnerOffer(mount, launch, await config(), { fetchImpl, download: downloaded });
    mount.querySelector<HTMLButtonElement>('[data-local-repair-runner-download]')?.click();
    await vi.waitFor(() => expect(mount.textContent).toMatch(/nije moguće|provjeru/i));

    expect(downloaded).not.toHaveBeenCalled();
  });

  it('ne prikazuje gumb bez HTTPS artefakta i prikovanog SHA-256 hasha', async () => {
    for (const bad of [
      { url: '', sha256: 'a'.repeat(64) },
      { url: 'http://lekta.hr/LektaRepair.exe', sha256: 'a'.repeat(64) },
      { url: 'https://lekta.hr/LektaRepair.exe', sha256: '' },
    ]) {
      const mount = document.createElement('div');
      expect(renderLocalRepairRunnerOffer(mount, launch, bad)).toBeNull();
      expect(mount.childElementCount).toBe(0);
    }
  });
});
