// scripts/check-edge-lock.mjs
//
// Zakljucava i PROVJERAVA tranzitivni graf Edge funkcija.
//
// ZASTO POSTOJI. Svih 25 funkcija uvozi `https://esm.sh/@supabase/supabase-js@2.110.2`, i taj je
// ULAZNI modul bio zakljucan otiskom u `deno.lock`. Ono sto esm.sh dalje posluzuje nije bilo:
// `deno.lock` je imao TOCNO JEDAN `remote` unos i nula npm paketa, dok stvarni graf ima 11 modula
// (cijelo stablo supabase klijenta plus `iceberg-js` i `tslib`). Tih deset nitko nije provjeravao.
//
// ZASTO NIJE DOVOLJNO SAMO POPUNITI LOCK. `scripts/check-edge.mjs` svakom pozivu Dena predaje
// `--no-lock`, dakle lockfile ondje ne sudjeluje. Izmjereno je i da `deno check --frozen` NE
// provjerava otiske izvodjenja: s namjerno pokvarenim otiskom vraca 0 i uz praznu predmemoriju.
// Provjeru radi tek `deno install --entrypoint --frozen --lock`, koji na istom podmetnutom otisku
// vraca 10 uz "Integrity check failed for remote specifier".
//
// ZASEBAN LOCK, ne korijenski. Korijenski `deno.lock` nosi i `workspace.packageJson` odjeljak
// (npm ovisnosti projekta). Kad se nad njim pozove `--frozen` bez tog konteksta, Deno javi
// "lockfile is out of date" i pokaze razliku u `workspace` dijelu, dakle gard bi padao na necemu
// sto ne provjerava. Jos gore, `deno install --entrypoint` nad korijenskim lockom taj odjeljak
// OBRISE. Zato Edge graf ima vlastiti lock i dvije stvari se ne sudaraju.
//
// SELFTEST (`--selftest`) je dokaz da gard grize: nad KOPIJOM locka pokvari jedan otisak i tvrdi
// da provjera padne. Bez njega bi ovo bio gard koji nitko nije vidio kako reagira.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(ROOT, "supabase", "functions", "deno.lock");
const FUNCTIONS_DIR = path.join(ROOT, 'supabase', 'functions');

const probe = execFileSync('deno', ['--version'], { encoding: 'utf8', stdio: 'pipe' }).trim();
if (!probe.startsWith('deno')) {
  console.error('[edge-lock] FAIL: `deno` nije dostupan u PATH-u.');
  process.exit(1);
}

const entries = fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(FUNCTIONS_DIR, d.name, 'index.ts'))
  .filter((p) => fs.existsSync(p));

if (entries.length === 0) {
  console.error('[edge-lock] FAIL: nijedna Edge funkcija nije pronadjena (prazan skup nije prolaz).');
  process.exit(1);
}

function provjeri(lockPath) {
  try {
    execFileSync('deno', ['install', '--entrypoint', '--frozen', `--lock=${lockPath}`, ...entries], {
      cwd: ROOT, stdio: 'pipe', encoding: 'utf8',
    });
    return { ok: true, izlaz: 0, poruka: '' };
  } catch (e) {
    return { ok: false, izlaz: e.status ?? -1, poruka: String(e.stderr || e.stdout || e.message) };
  }
}

if (process.argv.includes('--selftest')) {
  const kopija = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'edge-lock-')), 'deno.lock');
  const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  const kljucevi = Object.keys(lock.remote ?? {});
  if (kljucevi.length < 2) {
    console.error(`[edge-lock] FAIL selftest: lock ima ${kljucevi.length} remote unosa; mutacija nema sto pokvariti.`);
    process.exit(1);
  }
  lock.remote[kljucevi[0]] = '0'.repeat(64);
  fs.writeFileSync(kopija, JSON.stringify(lock, null, 2));
  const mutiran = provjeri(kopija);
  if (mutiran.ok) {
    console.error('[edge-lock] FAIL selftest: podmetnut krivi otisak NIJE prijavljen. Gard ne grize.');
    process.exit(1);
  }
  if (!/integrity check failed/i.test(mutiran.poruka)) {
    console.error('[edge-lock] FAIL selftest: provjera je pala, ali ne zbog otiska:\n' + mutiran.poruka.slice(0, 400));
    process.exit(1);
  }
  console.log(`[edge-lock] selftest OK: podmetnut otisak prijavljen (izlaz ${mutiran.izlaz}).`);
}

const stvarni = provjeri(LOCK);
if (!stvarni.ok) {
  console.error('[edge-lock] FAIL: tranzitivni graf se ne slaze s `deno.lock`.');
  console.error(stvarni.poruka.slice(0, 800));
  console.error('  Ako je promjena namjerna: `deno install --entrypoint supabase/functions/*/index.ts --lock=deno.lock` pa commitaj lock.');
  process.exit(1);
}

const broj = Object.keys(JSON.parse(fs.readFileSync(LOCK, 'utf8')).remote ?? {}).length;
console.log(`[edge-lock] OK: ${entries.length} ulaznih tocaka, ${broj} zakljucanih modula, otisci se slazu.`);
