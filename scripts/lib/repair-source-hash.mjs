// scripts/lib/repair-source-hash.mjs
//
// OTISAK KODA POPRAVKA: jedan SHA-256 nad produkcijskim TypeScriptom u `src/repair`.
//
// ZASTO POSTOJI. Mjerenje popravka (ovjera realnog korpusa, closed-loop manifesti) vrijedi samo za
// kod koji ga je proizveo. Bez otiska se ne da reci je li mjerenje staro ili je kod nov (T73, T74).
//
// ZASTO SAMO PRODUKCIJSKI .ts. Prva izvedba (zatvorena grana wf/ai-evidence-audit) hashirala je SVAKU
// datoteku u `src/repair`, ukljucujuci `CLAUDE.md` i `*.test.ts`. Izmjereno u T73 (odjeljak 3b):
// jedna dodana linija komentara u `src/repair/CLAUDE.md` zastarjela je sve manifeste i srusila 10
// testova, a generator pravila vise nije mogao proizvesti artefakt. Otisak mora pratiti ono sto
// mijenja ponasanje popravka, i nista drugo.
//
// ZASTO NIKAD NE BACA. `repairSourceFreshness` vraca stanje (`fresh`, `stale`, `missing`), a
// potrosac odlucuje. Zastarjelo mjerenje se otvoreno degradira (oznaci kao zastarjelo, izostavi iz
// dokaza), ne rusi cijeli generator. Potrosac u ovjeri realnog korpusa uvodi T75, zajedno sa
// svjezom ovjerom, da master nijednog trenutka nema A = 0.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const REPAIR_SOURCE_DIR = 'src/repair';

/**
 * Pripada li relativna (posix) putanja produkcijskom kodu popravka.
 * Da: `src/repair/**.ts`. Ne: testovi (`.test.ts`, `.spec.ts`), deklaracije (`.d.ts`), fixture
 * mape i sve sto nije `.ts` (npr. `CLAUDE.md`).
 */
export function isRepairProductionSource(relPath) {
  const p = String(relPath).replace(/\\/g, '/');
  if (!p.startsWith(`${REPAIR_SOURCE_DIR}/`)) return false;
  if (!p.endsWith('.ts')) return false;
  if (/\.(test|spec)\.ts$/.test(p) || p.endsWith('.d.ts')) return false;
  if (/\/(__fixtures__|fixtures|__mocks__)\//.test(p)) return false;
  return true;
}

/**
 * Cisti izracun otiska nad danim datotekama `{ path, content }`. Deterministican: putanje se
 * normaliziraju na `/` i sortiraju, sadrzaj na LF, a putanja ulazi u otisak (preimenovanje je
 * promjena). `include` postoji samo za mutacijski test; produkcija koristi zadani filtar.
 */
export function repairSourceHashFromFiles(files, include = isRepairProductionSource) {
  const chosen = files
    .map((f) => ({ path: String(f.path).replace(/\\/g, '/'), content: String(f.content) }))
    .filter((f) => include(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const f of chosen) {
    hash.update(f.path, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(f.content.replace(/\r\n?/g, '\n'), 'utf8');
    hash.update('\0', 'utf8');
  }
  return { hash: hash.digest('hex'), files: chosen.map((f) => f.path) };
}

/** Otisak `src/repair` s diska, relativno na korijen repozitorija (zadano: ovaj checkout). */
export function repairSourceHash(root = ROOT) {
  const files = [];
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile() && isRepairProductionSource(childRel)) {
        files.push({ path: childRel, content: readFileSync(path.join(root, childRel), 'utf8') });
      }
    }
  };
  walk(REPAIR_SOURCE_DIR);
  return repairSourceHashFromFiles(files);
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Je li mjerenje s otiskom `recorded` jos svjeze prema otisku `current`. Nikad ne baca:
 * `missing` kad mjerenje nema valjan otisak, `stale` kad se kod promijenio, `fresh` kad je isti.
 */
export function repairSourceFreshness(recorded, current) {
  if (typeof current !== 'string' || !HEX64.test(current)) {
    return { status: 'missing', reason: 'trenutni otisak koda popravka nije valjan' };
  }
  if (typeof recorded !== 'string' || !HEX64.test(recorded)) {
    return { status: 'missing', reason: 'mjerenje nema valjan otisak koda popravka' };
  }
  if (recorded !== current) {
    return { status: 'stale', reason: 'kod popravka promijenjen nakon mjerenja' };
  }
  return { status: 'fresh', reason: 'otisak mjerenja jednak trenutnom kodu popravka' };
}

// `node scripts/lib/repair-source-hash.mjs` ispisuje otisak i broj datoteka.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { hash, files } = repairSourceHash();
  console.log(`${hash}  (${files.length} produkcijskih .ts u ${REPAIR_SOURCE_DIR})`);
}
