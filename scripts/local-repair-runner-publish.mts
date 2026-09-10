import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export const EXPECTED_NETLIFY_SITE_ID = '1e7526f5-7f0a-480e-8589-d79ee91ff7b0';
export const EXPECTED_NETLIFY_SITE_URL = 'https://lektahr.netlify.app';

export interface NetlifyReleaseSecretsEvidence {
  authTokenPresent: true;
  siteIdPresent: true;
  siteId: string;
  siteUrl: string;
}

export interface RunnerDeploymentEnvironment {
  VITE_LEKTA_LOCAL_REPAIR_RUNNER_URL: string;
  VITE_LEKTA_LOCAL_REPAIR_RUNNER_SHA256: string;
}

export function assertNetlifyReleaseSecrets(
  env: Record<string, string | undefined>,
): NetlifyReleaseSecretsEvidence {
  if (!env.NETLIFY_AUTH_TOKEN?.trim()) {
    throw new Error('Execute mode zahtijeva NETLIFY_AUTH_TOKEN.');
  }
  const siteId = env.NETLIFY_SITE_ID?.trim();
  if (!siteId) {
    throw new Error('Execute mode zahtijeva NETLIFY_SITE_ID.');
  }
  if (siteId !== EXPECTED_NETLIFY_SITE_ID) {
    throw new Error('NETLIFY_SITE_ID nije kanonski Lekta production site.');
  }
  return {
    authTokenPresent: true,
    siteIdPresent: true,
    siteId: EXPECTED_NETLIFY_SITE_ID,
    siteUrl: EXPECTED_NETLIFY_SITE_URL,
  };
}

export function assertNetlifyLinkedSiteStatus(status: unknown): {
  siteId: string;
  siteUrl: string;
} {
  if (!status || typeof status !== 'object') {
    throw new Error('Netlify status nije valjan.');
  }
  const siteData = (status as { siteData?: unknown }).siteData;
  if (!siteData || typeof siteData !== 'object') {
    throw new Error('Netlify worktree nije povezan sa siteom.');
  }
  const values = siteData as Record<string, unknown>;
  const siteId = String(values['site-id'] || '').trim();
  const siteUrl = String(values['site-url'] || '').trim().replace(/\/+$/, '');
  if (!siteId) throw new Error('Netlify povezani site nema site-id.');
  if (siteId !== EXPECTED_NETLIFY_SITE_ID) {
    throw new Error('Netlify povezani site-id nije kanonski Lekta production site.');
  }
  if (siteUrl !== EXPECTED_NETLIFY_SITE_URL) {
    throw new Error(`Netlify worktree nije povezan s ${EXPECTED_NETLIFY_SITE_URL}.`);
  }
  return { siteId: EXPECTED_NETLIFY_SITE_ID, siteUrl: EXPECTED_NETLIFY_SITE_URL };
}

export function selectNetlifyReleaseAuthorization(input: {
  env: Record<string, string | undefined>;
  linkedStatus?: unknown;
}): ({ mode: 'environment' } | { mode: 'linked-cli' }) & ReturnType<typeof assertNetlifyLinkedSiteStatus> {
  const hasToken = Boolean(input.env.NETLIFY_AUTH_TOKEN?.trim());
  const hasSiteId = Boolean(input.env.NETLIFY_SITE_ID?.trim());
  if (hasToken || hasSiteId) {
    const environment = assertNetlifyReleaseSecrets(input.env);
    const linked = assertNetlifyLinkedSiteStatus(input.linkedStatus);
    return { mode: 'environment', siteId: environment.siteId, siteUrl: linked.siteUrl };
  }
  const linked = assertNetlifyLinkedSiteStatus(input.linkedStatus);
  return { mode: 'linked-cli', ...linked };
}

export function buildRunnerDeploymentEnvironment(input: {
  publicUrl: string;
  sha256: string;
}): RunnerDeploymentEnvironment {
  let url: URL;
  try {
    url = new URL(input.publicUrl);
  } catch {
    throw new Error('Javni runner URL nije valjan.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Javni runner URL mora biti HTTPS bez credentialsa.');
  }
  if (url.search || url.hash || basename(url.pathname) !== 'LektaRepair.exe') {
    throw new Error('Javni runner URL mora zavrsavati s /LektaRepair.exe bez queryja ili fragmenta.');
  }
  const sha256 = input.sha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Runner SHA-256 nije valjan.');
  return {
    VITE_LEKTA_LOCAL_REPAIR_RUNNER_URL: url.toString(),
    VITE_LEKTA_LOCAL_REPAIR_RUNNER_SHA256: sha256,
  };
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function stageVerifiedRunnerArtifact(input: {
  artifactPath: string;
  distDirectory: string;
  sha256: string;
}): string {
  const expected = input.sha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Runner SHA-256 nije valjan.');
  const source = resolve(input.artifactPath);
  if (sha256File(source) !== expected) throw new Error('Izvorni runner ne odgovara verificiranom SHA-256.');
  const downloads = join(resolve(input.distDirectory), 'downloads');
  mkdirSync(downloads, { recursive: true });
  const destination = join(downloads, 'LektaRepair.exe');
  copyFileSync(source, destination);
  if (sha256File(destination) !== expected) throw new Error('Kopirani runner ne odgovara verificiranom SHA-256.');
  return destination;
}
