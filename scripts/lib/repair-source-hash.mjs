import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export function hashRepairSourceTree(sourceRoot) {
  const root = resolve(sourceRoot);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  };
  visit(root);
  files.sort((a, b) => {
    const left = relative(root, a).split(sep).join('/');
    const right = relative(root, b).split(sep).join('/');
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (files.length === 0) throw new Error(`Nema datoteka za fingerprint popravka: ${root}`);

  const hash = createHash('sha256');
  for (const file of files) {
    const relativePath = relative(root, file).split(sep).join('/');
    hash.update(relativePath, 'utf8');
    hash.update('\0');
    hash.update(readFileSync(file).toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    hash.update('\0');
  }
  return hash.digest('hex');
}
