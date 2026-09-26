import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('local WordReplica runner download', () => {
  it('istinito opisuje Pure-DOCX runtime, sigurnost izvornika i ograničeno čišćenje', async () => {
    const mount = document.createElement('div');

    const offer = renderLocalRepairRunnerOffer(mount, launch, await config());

    expect(offer).not.toBeNull();
    expect(mount.textContent).toMatch(/Windows 10\/11/i);
    expect(mount.textContent).toMatch(/interni WordReplica motor/i);
    expect(mount.textContent).toMatch(/lokalno izrađuje novi DOCX/i);
    expect(mount.textContent).toMatch(/bez prepisivanja izvornika/i);
    expect(mount.textContent).toMatch(/Microsoft Word nije potreban/i);
    expect(mount.textContent).toMatch(/ne provjerava svaki korisnički run/i);
    expect(mount.textContent).toMatch(/ponovno pokreni isti EXE/i);
    expect(mount.textContent).toMatch(/uklanja osjetljive datoteke koje je sam stvorio/i);
    expect(mount.textContent).toMatch(/Windows ili preglednik mogu zadržati vlastite tragove/i);
    expect(mount.textContent).not.toMatch(/aktivna Word licenca nije potrebna/i);
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

  /**
   * Lansiranje ide BEZ lokalnog popravka: u buildu nema `.env`, pa su
   * VITE_LEKTA_LOCAL_REPAIR_RUNNER_URL i _SHA256 prazni. Gornji slucajevi to vjezbaju nad RUCNO
   * sastavljenim configom, sto ne dokazuje da isti put daje i stvarna `localRepairRunnerConfig()`.
   * Ovaj test ide kroz nju, dakle kroz DEPLOYMENT_CONFIG.
   *
   * Varijable se POSTAVLJAJU na prazno (`vi.stubEnv`), ne cita se zatecena okolina. Prva verzija je
   * tvrdila da okolina nije konfigurirana, pa bi gate puknuo cim vlasnik po docs/LOCAL_REPAIR_RELEASE.md
   * postavi te dvije varijable, dakle bas na putu "spremna za ukljucivanje" i bez ijednog kvara.
   * `DEPLOYMENT_CONFIG` se racuna pri ucitavanju modula, zato `vi.resetModules()` prije uvoza.
   */
  it('uz prazne VITE_LEKTA_LOCAL_REPAIR_RUNNER_* varijable config je prazan i ponude nema', async () => {
    vi.stubEnv('VITE_LEKTA_LOCAL_REPAIR_RUNNER_URL', '');
    vi.stubEnv('VITE_LEKTA_LOCAL_REPAIR_RUNNER_SHA256', '');
    vi.resetModules();
    const fresh = await import('../src/report/local-repair-runner-download.ts');

    const live = fresh.localRepairRunnerConfig();
    expect(live).toEqual({ url: '', sha256: '' });

    const mount = document.createElement('div');
    expect(fresh.renderLocalRepairRunnerOffer(mount, launch, live)).toBeNull();
    expect(mount.childElementCount).toBe(0);
    expect(mount.textContent).toBe('');
  });

  /**
   * Druga strana iste tvrdnje: kad se runner jednom objavi i varijable se postave, ista funkcija
   * ih PROSLIJEDI i ponuda nastane. Bez ovoga bi gornji test bio zadovoljen i funkcijom koja uvijek
   * vraca prazno, a zadatak trazi nula promjena ponasanja kad se tok ukljuci.
   */
  it('uz postavljene VITE_LEKTA_LOCAL_REPAIR_RUNNER_* varijable config ih prenosi i ponuda nastane', async () => {
    const pinned = await sha256Hex(runnerBytes);
    vi.stubEnv('VITE_LEKTA_LOCAL_REPAIR_RUNNER_URL', 'https://lektahr.netlify.app/downloads/LektaRepair.exe');
    vi.stubEnv('VITE_LEKTA_LOCAL_REPAIR_RUNNER_SHA256', pinned.toUpperCase());
    vi.resetModules();
    const fresh = await import('../src/report/local-repair-runner-download.ts');

    const live = fresh.localRepairRunnerConfig();
    // Hash se normalizira na mala slova, URL ostaje kakav jest.
    expect(live).toEqual({ url: 'https://lektahr.netlify.app/downloads/LektaRepair.exe', sha256: pinned });

    const mount = document.createElement('div');
    expect(fresh.renderLocalRepairRunnerOffer(mount, launch, live)).not.toBeNull();
    expect(mount.querySelector('[data-local-repair-runner-download]')).not.toBeNull();
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
