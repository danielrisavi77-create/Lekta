import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOTS = ['analysis', 'scoring', 'profiles', 'docx', 'citations', 'utils', 'report'];
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.json'];
const IMPORT_PATH = /(?:\bfrom\s*|\bimport\s*\(|\bimport\s*|\brequire\s*\()\s*['"](\.[^'"]+)['"]/g;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path)
      : entry.isFile() && EXTENSIONS.some((extension) => path.endsWith(extension)) ? [path] : [];
  });
}

/** Fingerprint all check modules and their local source imports, independent of CRLF. */
export function hashAnalysisSourceTree(rootDir) {
  const sourceRoot = resolve(rootDir, 'src');
  const pending = ROOTS.flatMap((folder) => sourceFiles(resolve(sourceRoot, folder)));
  const files = new Map();
  while (pending.length) {
    const file = resolve(pending.pop());
    if (files.has(file)) continue;
    const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    files.set(file, source);
    for (const match of source.matchAll(IMPORT_PATH)) {
      const base = resolve(dirname(file), match[1]);
      const fromRoot = relative(sourceRoot, base);
      if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) continue;
      const candidates = [base, ...EXTENSIONS.map((extension) => `${base}${extension}`),
        ...EXTENSIONS.map((extension) => join(base, `index${extension}`))];
      const sourceBase = base.replace(/\.(?:mjs|cjs|js)$/, '');
      if (sourceBase !== base) {
        candidates.push(...['.ts', '.tsx', '.mts'].map((extension) => `${sourceBase}${extension}`));
      }
      const imported = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
      if (imported) pending.push(imported);
    }
  }
  if (!files.size) throw new Error(`Nema izvornog koda analize: ${sourceRoot}`);
  const hash = createHash('sha256');
  for (const file of [...files.keys()].sort((a, b) => {
    const left = relative(sourceRoot, a).split(sep).join('/');
    const right = relative(sourceRoot, b).split(sep).join('/');
    return left < right ? -1 : left > right ? 1 : 0;
  })) {
    hash.update(relative(sourceRoot, file).split(sep).join('/'), 'utf8');
    hash.update('\0');
    hash.update(files.get(file), 'utf8');
    hash.update('\0');
  }
  return hash.digest('hex');
}
