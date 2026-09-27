/**
 * Pracene `mkdtemp` mape u os.tmpdir() (stavka G, odluka vlasnika 2026-09-26).
 *
 * Izmjereno 2026-09-27: testovi release gatea, runner publisha i secret staginga ostavili su u
 * %TEMP% preko 1400 `lekta-*` mapa, jer su ih stvarali bez ikakvog brisanja. Test koji stvara mapu
 * kroz `trackedTempDir` i u datoteci registrira `afterEach(removeTrackedTempDirs)` ne ostavlja
 * nista, ni kad tvrdnja padne (afterEach se izvrsava i nakon pada).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tracked = new Set<string>();

/** `mkdtemp(join(tmpdir(), prefix))` cija se mapa pamti za `removeTrackedTempDirs`. */
export function trackedTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tracked.add(dir);
  return dir;
}

/** Pamti mapu koju je stvorio netko drugi (npr. kod pod testom), da je `removeTrackedTempDirs` obrise. */
export function trackTempDir(dir: string): string {
  tracked.add(dir);
  return dir;
}

/** Brise svaku pracenu mapu (rekurzivno, `force`), pa prazni popis. */
export function removeTrackedTempDirs(): void {
  for (const dir of tracked) rmSync(dir, { recursive: true, force: true });
  tracked.clear();
}
