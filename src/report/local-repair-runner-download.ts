import type { LocalRepairLaunchV1 } from './repair-client.ts';

const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIM_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_RUNNER_BYTES = 128 * 1024 * 1024;
const EXE_MIME = 'application/vnd.microsoft.portable-executable';

export interface LocalRepairRunnerArtifactConfig {
  url: string;
  sha256: string;
}

export interface LocalRepairRunnerOfferDependencies {
  fetchImpl?: typeof fetch;
  download?: (bytes: Uint8Array, fileName: string) => void;
}

function validArtifactUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function validLaunch(launch: LocalRepairLaunchV1): boolean {
  return launch.version === 1
    && UUID.test(launch.jobId)
    && CLAIM_TOKEN.test(launch.claimToken)
    && Number.isFinite(Date.parse(launch.expiresAt));
}

export function localRepairRunnerFileName(launch: LocalRepairLaunchV1): string {
  if (!validLaunch(launch)) throw new TypeError('Neispravan local repair launch.');
  return `LektaRepair-${launch.jobId}-${launch.claimToken}.exe`;
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function browserDownload(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: EXE_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function fetchVerifiedRunner(
  artifactUrl: URL,
  expectedSha256: string,
  fetchImpl: typeof fetch,
): Promise<Uint8Array> {
  const response = await fetchImpl(artifactUrl.toString(), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Runner artefakt nije dostupan.');
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RUNNER_BYTES) {
    throw new Error('Runner artefakt je prevelik.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 2 || bytes.length > MAX_RUNNER_BYTES || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new Error('Runner artefakt nije valjana Windows izvršna datoteka.');
  }
  if (await digestHex(bytes) !== expectedSha256) {
    throw new Error('Runner artefakt nije prošao provjeru integriteta.');
  }
  return bytes;
}

export function renderLocalRepairRunnerOffer(
  mount: HTMLElement,
  launch: LocalRepairLaunchV1,
  config: LocalRepairRunnerArtifactConfig,
  dependencies: LocalRepairRunnerOfferDependencies = {},
): HTMLElement | null {
  const artifactUrl = validArtifactUrl(String(config?.url || '').trim());
  const expectedSha256 = String(config?.sha256 || '').trim().toLowerCase();
  if (!artifactUrl || !SHA256.test(expectedSha256) || !validLaunch(launch)) return null;
  if (artifactUrl.toString().includes(launch.jobId) || artifactUrl.toString().includes(launch.claimToken)) {
    return null;
  }

  const section = document.createElement('section');
  section.className = 'lekta-local-repair-offer';
  const title = document.createElement('strong');
  title.textContent = 'Popravi dokument i u Wordu na ovom računalu';
  const explanation = document.createElement('p');
  explanation.textContent = 'Za Windows 10/11 s instaliranim desktop Microsoft Wordom. Aktivna Word licenca nije potrebna: program izrađuje novu DOCX kopiju, a Word koristi samo za završnu provjeru i otvaranje. Program je portable i vrijedi samo za ovaj plaćeni popravak.';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary';
  button.dataset.localRepairRunnerDownload = '';
  button.textContent = 'Preuzmi Word popravak na računalu';
  const status = document.createElement('p');
  status.className = 'muted';
  section.append(title, explanation, button, status);
  mount.appendChild(section);

  button.onclick = async () => {
    button.disabled = true;
    button.textContent = 'Provjeravam program…';
    status.textContent = '';
    try {
      const bytes = await fetchVerifiedRunner(
        artifactUrl,
        expectedSha256,
        dependencies.fetchImpl || fetch,
      );
      (dependencies.download || browserDownload)(bytes, localRepairRunnerFileName(launch));
      button.textContent = 'Program je preuzet ✓';
      status.textContent = 'Pokreni preuzeti EXE. Odabrat ćeš izlazni folder, a izvorni dokument ostaje netaknut.';
    } catch {
      button.disabled = false;
      button.textContent = 'Pokušaj ponovno preuzeti Word popravak';
      status.textContent = 'Preuzimanje nije moguće ili program nije prošao sigurnosnu provjeru. Serverska verzija dokumenta ostaje dostupna.';
    }
  };
  return section;
}
