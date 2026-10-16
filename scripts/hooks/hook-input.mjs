import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/**
 * Zajednicki ulaz hookova iz `scripts/hooks/`: cijeli stdin kao JSON. Vraca `null` kad ulaz nije
 * valjan JSON i to javi na stderr, a pozivatelj tada propusta (FAIL-OPEN, kao tool-guard).
 * @param {string} ime ime hooka za poruku
 * @returns {Promise<Record<string, any> | null>}
 */
export async function readHookInput(ime) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (err) {
    process.stderr.write(`${ime}: ulaz nije valjan JSON, propustam (fail-open). ${String(err)}\n`);
    return null;
  }
}

/** Korijen repozitorija (direktorij s `docs/agents/tasks.json`) iznad `start`; null izvan repozitorija. */
export function findRepoRoot(start) {
  let current = resolve(start || process.cwd());
  while (true) {
    if (existsSync(join(current, 'docs', 'agents', 'tasks.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Putanja iz `tool_input.file_path` hook ulaza: apsolutna, korijen repozitorija i putanja relativna na
 * njega s `/` (`rel` je null izvan repozitorija). Null kad ulaz nema putanju.
 * @param {Record<string, any>} payload
 * @returns {{ absolute: string, root: string | null, rel: string | null } | null}
 */
export function hookFilePath(payload) {
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== 'string' || !filePath.trim()) return null;
  const cwd = payload?.cwd || process.cwd();
  const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath);
  const root = findRepoRoot(dirname(absolute));
  let rel = root ? relative(root, absolute).replace(/\\/g, '/') : null;
  if (rel && (rel.startsWith('../') || isAbsolute(rel))) rel = null;
  return { absolute, root, rel };
}
