/**
 * Gard Popravka A (odluka vlasnika 2026-10-03): `netlify-cli` nije ovisnost projekta, a rucna objava ide
 * kroz TOCNO pinanu verziju (`npx --yes netlify-cli@X.Y.Z`), istu u release skripti i u
 * docs/deploy/RELEASE_PROOF_WORKFLOW.md. Baseline je u tests/netlify-cli-pin.test.ts, mutacije u
 * tests/gate-mutations.test.ts.
 *
 * Codex F2 na #283: prisutnost pinanog niza nije dovoljna. Svaki POZIV Netlify CLI-ja u pregledanim
 * datotekama (`npx`/`npm exec`/`pnpm dlx`/`yarn dlx`/`bunx` uz `netlify-cli`, ili gola naredba
 * `netlify <podnaredba>`) mora biti pinani poziv s istom verzijom. Komentar s pinom ne pokriva aktivan
 * nepinani poziv u istoj datoteci, jer se svaki poziv provjerava zasebno.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface NetlifyPinSources {
  packageJson: string;
  packageLock: string;
  releaseScript: string;
  releaseDoc: string;
  /** Ostale pregledane datoteke (workflowi, deploy dokumenti, skripte, netlify.toml), putanja i tekst. */
  files?: { path: string; text: string }[];
}

const PIN = /export const NETLIFY_CLI_PIN = '(netlify-cli@[^']*)';/;
const RUNNER_CALL = /\b(?:npx|npm\s+exec|pnpm\s+dlx|yarn\s+dlx|bunx)\b[^\n]*?\bnetlify-cli(@[^\s'"`)]*)?/g;
const BARE_CALL = /(?:^|[\s;&|`'"(])netlify\s+(?:deploy|build|status|dev|link|unlink|init|login|logout|open|watch|serve|api|env|sites|functions|blobs|switch|recipes)\b/gm;

/** Pozivi Netlify CLI-ja koji ne koriste tocno `pin`; svaki poziv se provjerava zasebno. */
export function netlifyCallProblems(path: string, text: string, pin: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(RUNNER_CALL)) {
    if (`netlify-cli${m[1] ?? ''}` !== pin) out.push(`${path}: nepinani Netlify CLI poziv "${m[0].trim()}"`);
  }
  for (const m of text.matchAll(BARE_CALL)) out.push(`${path}: gola netlify naredba "${m[0].trim()}"`);
  return out;
}

export function netlifyPinProblems(s: NetlifyPinSources): string[] {
  const out: string[] = [];
  const pkg = JSON.parse(s.packageJson) as Record<string, Record<string, string> | undefined>;
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (pkg[field] && Object.prototype.hasOwnProperty.call(pkg[field], 'netlify-cli')) out.push(`package.json: netlify-cli je u ${field}`);
  }
  const lock = JSON.parse(s.packageLock) as { packages?: Record<string, unknown> };
  if (Object.keys(lock.packages ?? {}).some((k) => k === 'node_modules/netlify-cli' || k.endsWith('/node_modules/netlify-cli'))) {
    out.push('package-lock.json: netlify-cli je u grafu');
  }
  const m = PIN.exec(s.releaseScript);
  if (!m) return [...out, 'release skripta: nema NETLIFY_CLI_PIN'];
  const pin = m[1];
  if (!/^netlify-cli@\d+\.\d+\.\d+$/.test(pin)) out.push(`release skripta: pin nije tocna verzija (${pin})`);
  if (!/args: \[npxCli\(\), '--yes', NETLIFY_CLI_PIN, \.\.\.args\]/.test(s.releaseScript)) out.push('release skripta: netlify ne ide kroz npx --yes s pinom');
  if (/node_modules['"], ['"]\.bin['"], ['"]netlify/.test(s.releaseScript)) out.push('release skripta: netlify se trazi u node_modules');
  if (/['"]npx(\.cmd)?['"]/.test(s.releaseScript)) out.push('release skripta: npx se pokrece s PATH-a ili kao .cmd umjesto kroz process.execPath');
  for (const x of s.releaseScript.matchAll(/['"](netlify-cli[^'"]*)['"]/g)) {
    if (x[1] !== pin) out.push(`release skripta: drugi netlify-cli niz "${x[1]}"`);
  }
  for (const cmd of ['status --json', 'build', 'deploy --prod --dir dist --no-build']) {
    if (!s.releaseDoc.includes(`npx --yes ${pin} ${cmd}`)) out.push(`RELEASE_PROOF_WORKFLOW.md: nema "npx --yes ${pin} ${cmd}"`);
  }
  if (/npm i(nstall)? -g netlify-cli/.test(s.releaseDoc)) out.push('RELEASE_PROOF_WORKFLOW.md: globalna instalacija netlify-cli');
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  for (const [name, cmd] of Object.entries(scripts)) out.push(...netlifyCallProblems(`package.json scripts.${name}`, cmd, pin));
  out.push(...netlifyCallProblems('RELEASE_PROOF_WORKFLOW.md', s.releaseDoc, pin));
  for (const f of s.files ?? []) out.push(...netlifyCallProblems(f.path, f.text, pin));
  return out;
}

/**
 * Stvarne datoteke za baseline i mutacije: package.json, lock, release skripta i dokument, te svi
 * workflowi, lokalne akcije, deploy dokumenti, skripte i netlify.toml.
 */
export function netlifyPinRealSources(root: string = process.cwd()): NetlifyPinSources {
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n?/g, '\n');
  const walk = (dir: string, keep: RegExp): string[] => {
    if (!existsSync(join(root, dir))) return [];
    return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel, keep);
      return keep.test(e.name) ? [rel] : [];
    });
  };
  const paths = [
    ...walk('.github', /\.ya?ml$/),
    ...walk('docs/deploy', /\.md$/),
    ...walk('scripts', /\.(?:m?[jt]s|mts|cjs|sh|ps1|cmd|bat)$/),
    'netlify.toml',
  ].filter((p) => p !== 'scripts/run-local-repair-release.mts' && p !== 'docs/deploy/RELEASE_PROOF_WORKFLOW.md' && existsSync(join(root, p)));
  return {
    packageJson: read('package.json'),
    packageLock: read('package-lock.json'),
    releaseScript: read('scripts/run-local-repair-release.mts'),
    releaseDoc: read('docs/deploy/RELEASE_PROOF_WORKFLOW.md'),
    files: paths.sort().map((path) => ({ path, text: read(path) })),
  };
}
