/**
 * Gard Popravka A (odluka vlasnika 2026-10-03): `netlify-cli` nije ovisnost projekta, a rucna objava ide
 * kroz TOCNO pinanu verziju (`npx --yes netlify-cli@X.Y.Z`), istu u release skripti i u
 * docs/deploy/RELEASE_PROOF_WORKFLOW.md. Baseline je u tests/netlify-cli-pin.test.ts, mutacije u
 * tests/gate-mutations.test.ts.
 */
export interface NetlifyPinSources {
  packageJson: string;
  packageLock: string;
  releaseScript: string;
  releaseDoc: string;
}

const PIN = /export const NETLIFY_CLI_PIN = '(netlify-cli@[^']*)';/;

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
  if (!/args: \['--yes', NETLIFY_CLI_PIN, \.\.\.args\]/.test(s.releaseScript)) out.push('release skripta: netlify ne ide kroz npx --yes s pinom');
  if (/node_modules['"], ['"]\.bin['"], ['"]netlify/.test(s.releaseScript)) out.push('release skripta: netlify se trazi u node_modules');
  for (const cmd of ['status --json', 'build', 'deploy --prod --dir dist --no-build']) {
    if (!s.releaseDoc.includes(`npx --yes ${pin} ${cmd}`)) out.push(`RELEASE_PROOF_WORKFLOW.md: nema "npx --yes ${pin} ${cmd}"`);
  }
  if (/netlify-cli@latest|npm i(nstall)? -g netlify-cli/.test(s.releaseDoc)) out.push('RELEASE_PROOF_WORKFLOW.md: nepinani netlify-cli');
  return out;
}
