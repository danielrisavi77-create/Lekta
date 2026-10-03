/**
 * Jedna otkrivena Python naredba za sve testove koji pokrecu Python skripte (Codex #229 nalaz 12).
 *
 * Do runde 3 je tests/pdf-corpus-harvest.test.ts trazio `python3` pa `python`, a mutacijski helper u
 * tests/gate-mutations.test.ts uvijek `python3`: na Windowsu s `python.exe`, a bez `python3`, suite je
 * prolazio, a baseline PDF mutacija je padao. Oba sada citaju istu vrijednost odavde.
 */
import { spawnSync } from 'node:child_process';

/** Kandidati redom; prvi koji je Python 3 pobjeduje. */
export const PYTHON_CANDIDATES = ['python3', 'python'] as const;

/** Prvi kandidat koji se pokrece i javlja glavnu verziju 3, ili null kad ga nema. */
export function discoverPython(candidates: readonly string[] = PYTHON_CANDIDATES): string | null {
  return (
    candidates.find((cmd) => {
      const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
      return r.status === 0 && r.stdout.trim() === '3';
    }) ?? null
  );
}

export const PYTHON = discoverPython();

/** Razlog preskakanja za naslov testa; prazan kad interpreter postoji. */
export const PYTHON_SKIP_REASON = PYTHON
  ? ''
  : ` [PRESKOCENO: ni ${PYTHON_CANDIDATES.join(' ni ')} nije Python 3 na PATH-u, Python skripta se ne moze pokrenuti]`;
