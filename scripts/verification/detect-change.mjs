import { execFileSync } from 'node:child_process';

function gitDefault(args, options) {
  return execFileSync('git', args, { cwd: options.cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function normalizeRepoPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\\')) {
    throw new Error('Git je vratio praznu ili malformiranu putanju.');
  }
  if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) throw new Error(`Git je vratio apsolutnu putanju: ${value}`);
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Git je vratio putanju izvan repozitorija: ${value}`);
  }
  return segments.join('/');
}

function tokensFromZ(raw) {
  const tokens = String(raw).split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  return tokens;
}

export function parseNameStatusZ(raw, source) {
  const tokens = tokensFromZ(raw);
  const changes = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!/^(?:[ACDMRTUXB]|R\d{1,3}|C\d{1,3})$/.test(status)) throw new Error(`Nepoznat Git status: ${status}`);
    if (/^[RC]\d{1,3}$/.test(status)) {
      if (index + 1 >= tokens.length) throw new Error(`Nepotpun Git ${status} zapis.`);
      const from = normalizeRepoPath(tokens[index++]);
      const to = normalizeRepoPath(tokens[index++]);
      const prefix = status.startsWith('R') ? 'rename' : 'copy';
      changes.push({ path: from, sources: [`${prefix}_from`] });
      changes.push({ path: to, sources: [`${prefix}_to`] });
      continue;
    }
    if (index >= tokens.length) throw new Error(`Nepotpun Git ${status} zapis.`);
    changes.push({ path: normalizeRepoPath(tokens[index++]), sources: [source] });
  }
  return changes;
}

export function parseUntrackedZ(raw) {
  return tokensFromZ(raw).map((value) => ({ path: normalizeRepoPath(value), sources: ['untracked'] }));
}

export function mergeChanges(groups) {
  const byPath = new Map();
  for (const group of groups) {
    for (const change of group) {
      if (!byPath.has(change.path)) byPath.set(change.path, []);
      const sources = byPath.get(change.path);
      for (const source of change.sources) if (!sources.includes(source)) sources.push(source);
    }
  }
  return [...byPath.entries()]
    .map(([path, sources]) => ({ path, sources }))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

function runGit(git, repoRoot, args) {
  return String(git(args, { cwd: repoRoot })).trimEnd();
}

export function detectChanges({ repoRoot, base = 'origin/master', git = gitDefault }) {
  if (typeof repoRoot !== 'string' || repoRoot.length === 0) throw new Error('repoRoot je obvezan.');
  if (typeof base !== 'string' || base.length === 0 || base.includes('\0') || base.startsWith('-')) throw new Error('base ref je nevaljan.');

  const baseSha = runGit(git, repoRoot, ['rev-parse', '--verify', `${base}^{commit}`]);
  const headSha = runGit(git, repoRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const mergeBase = runGit(git, repoRoot, ['merge-base', baseSha, headSha]);
  if (!baseSha || !headSha || !mergeBase) throw new Error('Git nije razrijesio base, HEAD ili merge-base.');

  const committed = parseNameStatusZ(
    git(['diff', '--name-status', '-z', '--find-renames', mergeBase, headSha], { cwd: repoRoot }),
    'committed',
  );
  const working = parseNameStatusZ(
    git(['diff', '--name-status', '-z', '--find-renames', 'HEAD'], { cwd: repoRoot }),
    'staged_or_unstaged',
  );
  const untracked = parseUntrackedZ(git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repoRoot }));
  const changes = mergeChanges([committed, working, untracked]);

  return {
    baseRef: base,
    baseSha,
    headSha,
    mergeBase,
    dirtyWorkingTree: working.length > 0 || untracked.length > 0,
    changes,
  };
}
