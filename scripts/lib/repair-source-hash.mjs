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
// GRANICA: STO OTISAK NE POKRIVA. Otisak je identitet produkcijskog `.ts` UNUTAR `src/repair`, ne
// identitet cijelog izvrsnog popravka. Popravak uvozi i kod i podatke izvan te mape, npr.
// `src/analysis/element-structure.ts` (`anchorFingerprintForXml` u table-figure-rescue-fixeru) i
// `data/generated/repair-params-by-profile.json` (param-authority). Njihova izmjena NE mijenja otisak,
// pa `fresh` znaci "src/repair nepromijenjen", ne "ponasanje nepromijenjeno". T75 zato ovjeru veze i
// uz identitet sireg mjerenog stabla. BOM se ne uklanja: datoteka s BOM-om i bez njega daje razlicit
// otisak (Git ga cuva kao dio sadrzaja, pa je to stvarna razlika u izvoru).
//
// ZAPIS JE JEDNOZNACAN I VERZIONIRAN. Svaka datoteka ulazi kao duljina putanje, putanja, duljina
// sadrzaja i sadrzaj (duljine u UTF-8 bajtovima), a cijeli ulaz pocinje oznakom verzije. Prva izvedba
// je dijelila polja znakom NUL, pa su jedna datoteka sa sadrzajem `x\0src/repair/b.ts\0y` i dvije
// datoteke `a.ts = x`, `b.ts = y` davale isti otisak (Codex pregled #176, F2). Promjena zapisa mijenja
// `REPAIR_SOURCE_HASH_VERSION`, pa se otisci razlicitih verzija nikad ne usporeduju kao isti.
//
// ZASTO SVJEZINA NIKAD NE BACA. `repairSourceFreshness` vraca stanje (`fresh`, `stale`, `missing`), a
// potrosac odlucuje. Zastarjelo mjerenje se otvoreno degradira (oznaci kao zastarjelo, izostavi iz
// dokaza), ne rusi cijeli generator. Potrosac u ovjeri realnog korpusa uvodi T75, zajedno sa
// svjezom ovjerom, da master nijednog trenutka nema A = 0. Racunanje otiska s diska, naprotiv, BACA
// kad izvor nije pouzdan (prazan skup, simbolicka veza): otisak koji ne pokriva stvarni kod ne smije
// postojati ni kao `missing` ulaz u usporedbu.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const REPAIR_SOURCE_DIR = 'src/repair';
export const REPAIR_SOURCE_HASH_VERSION = 1;

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
 * promjena). Prazan skup nema otisak (`hash: null`), jer otisak niceg ne dokazuje nista.
 * `include` postoji samo za mutacijski test; produkcija koristi zadani filtar.
 */
export function repairSourceHashFromFiles(files, include = isRepairProductionSource) {
  const chosen = files
    .map((f) => ({ path: String(f.path).replace(/\\/g, '/'), content: String(f.content) }))
    .filter((f) => include(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (chosen.length === 0) return { version: REPAIR_SOURCE_HASH_VERSION, hash: null, files: [] };
  const hash = createHash('sha256');
  hash.update(`lekta-repair-source-hash/v${REPAIR_SOURCE_HASH_VERSION}\n`, 'utf8');
  for (const f of chosen) {
    const content = f.content.replace(/\r\n?/g, '\n');
    hash.update(`${Buffer.byteLength(f.path, 'utf8')}:${f.path}`, 'utf8');
    hash.update(`${Buffer.byteLength(content, 'utf8')}:${content}`, 'utf8');
  }
  return { version: REPAIR_SOURCE_HASH_VERSION, hash: hash.digest('hex'), files: chosen.map((f) => f.path) };
}

/**
 * Otisak `src/repair` s diska, relativno na korijen repozitorija (zadano: ovaj checkout).
 * Baca na simbolicku vezu (otisak bi tiho preskocio kod na koji ona upucuje) i na prazan skup.
 */
export function repairSourceHash(root = ROOT) {
  const files = [];
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const childRel = `${rel}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new Error(`Otisak koda popravka: simbolicka veza ${childRel} nije dopustena u ${REPAIR_SOURCE_DIR}.`);
      }
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile() && isRepairProductionSource(childRel)) {
        files.push({ path: childRel, content: readFileSync(path.join(root, childRel), 'utf8') });
      }
    }
  };
  walk(REPAIR_SOURCE_DIR);
  const result = repairSourceHashFromFiles(files);
  if (result.hash === null) {
    throw new Error(`Otisak koda popravka: ${REPAIR_SOURCE_DIR} nema nijednu produkcijsku .ts datoteku.`);
  }
  return result;
}

/**
 * Otisak `src/repair` IZ GIT STABLA zadanog commita, ne s diska (T75). Ovjera realnog korpusa nastaje
 * u commitu koji dolazi POSLIJE mjerenja, pa HEAD nikad nije commit mjerenja; otisak zato mora opisati
 * kod nad kojim je mjereno, procitan iz objekata tog commita. Isti filtar, isti zapis kao s diska.
 * Baca kad ulaz nije commit (i tree ili blob OID se odbija, Codex T75 F3), kad je u `src/repair`
 * simbolicka veza (mod 120000) ili podmodul (gitlink, mod 160000, Codex T75 F2), ili kad je skup prazan.
 */
export function repairSourceHashAtCommit(commit, root = ROOT) {
  if (!/^[0-9a-f]{7,40}$/.test(String(commit))) {
    throw new Error(`Otisak koda popravka: '${commit}' nije commit.`);
  }
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // `git ls-tree` prihvaca i tree objekt, pa bi OID stabla dao otisak bez ikakvog commita mjerenja.
  const vrsta = git(['cat-file', '-t', commit]).trim();
  if (vrsta !== 'commit') {
    throw new Error(`Otisak koda popravka: '${commit}' je ${vrsta}, a ne commit.`);
  }
  const tree = git(['ls-tree', '-r', '-z', commit, '--', `${REPAIR_SOURCE_DIR}/`]);
  const files = [];
  for (const line of tree.split('\0').filter(Boolean)) {
    const tab = line.indexOf('\t');
    const [mode, type, sha] = line.slice(0, tab).split(' ');
    const relPath = line.slice(tab + 1);
    if (mode === '120000') {
      throw new Error(`Otisak koda popravka: simbolicka veza ${relPath} nije dopustena u ${REPAIR_SOURCE_DIR}.`);
    }
    // Podmodul se u git stablu vidi kao gitlink (tip commit), a obilazak diska bi usao u njegov sadrzaj:
    // dva izracuna bi tiho opisivala razlicit kod. Zato se odbija kao i simbolicka veza.
    if (mode === '160000' || type === 'commit') {
      throw new Error(`Otisak koda popravka: podmodul ${relPath} nije dopusten u ${REPAIR_SOURCE_DIR}.`);
    }
    if (type !== 'blob' || !isRepairProductionSource(relPath)) continue;
    files.push({ path: relPath, content: git(['cat-file', 'blob', sha]) });
  }
  const result = repairSourceHashFromFiles(files);
  if (result.hash === null) {
    throw new Error(`Otisak koda popravka: ${REPAIR_SOURCE_DIR} u ${commit} nema nijednu produkcijsku .ts datoteku.`);
  }
  return result;
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

// `node scripts/lib/repair-source-hash.mjs` ispisuje otisak, verziju i broj datoteka.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { hash, files, version } = repairSourceHash();
  console.log(`${hash}  (v${version}, ${files.length} produkcijskih .ts u ${REPAIR_SOURCE_DIR})`);
}
