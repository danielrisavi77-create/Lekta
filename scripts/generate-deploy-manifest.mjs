// scripts/generate-deploy-manifest.mjs
//
// `supabase/deploy-manifest.json`: jedan redak po Edge funkciji, IZVEDEN iz koda, ne prepisan.
//
// ZASTO POSTOJI. Izvjestaj o driftu (`npm run deploy-drift`) usporedjuje repozitorij s onim sto
// Supabase vrti, ali nema s cim usporediti OCEKIVANJE: ne postoji zapis o tome koja funkcija
// SMIJE biti nedeployana, tko je za nju odgovoran i koje tajne treba. Bez toga "produkcija ima 18
// od 22" ne razlikuje namjeru od propusta.
//
// STO SE IZVODI, a sto ostaje covjeku. Izvedeno je sve sto kod jednoznacno kaze: ime funkcije,
// `verify_jwt` iz `supabase/config.toml`, i tajne koje funkcija stvarno cita (`Deno.env.get`).
// NIJE izvedeno, i namjerno stoji prazno: vlasnik (`owner`), je li izostanak s nekog okruzenja
// namjeran (`intentionalExclusion`) i razlog. Ta tri polja su odluka, ne cinjenica, pa se ne
// izmisljaju; prazna vrijednost je istinit zapis da odluka jos nije donesena.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNKCIJE = path.join(ROOT, 'supabase', 'functions');
const IZLAZ = path.join(ROOT, 'supabase', 'deploy-manifest.json');

function tajneU(dir) {
  const nadjene = new Set();
  const hodaj = (p) => {
    for (const d of fs.readdirSync(p, { withFileTypes: true })) {
      const puna = path.join(p, d.name);
      if (d.isDirectory()) { hodaj(puna); continue; }
      if (!/\.(ts|js|mjs)$/.test(d.name)) continue;
      const t = fs.readFileSync(puna, 'utf8');
      for (const m of t.matchAll(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g)) nadjene.add(m[1]);
    }
  };
  hodaj(dir);
  return [...nadjene].sort();
}

export function izracunajManifest() {
  const toml = fs.readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  const jwtPoFunkciji = new Map();
  for (const m of toml.matchAll(/\[functions\.([a-z0-9-]+)\]([^[]*)/g)) {
    const v = /verify_jwt\s*=\s*(true|false)/.exec(m[2]);
    jwtPoFunkciji.set(m[1], v ? v[1] === 'true' : null);
  }

  const imena = fs.readdirSync(FUNKCIJE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .filter((n) => fs.existsSync(path.join(FUNKCIJE, n, 'index.ts')))
    .sort();

  return {
    schemaVersion: 1,
    functions: imena.map((ime) => ({
      function: ime,
      verifyJwt: jwtPoFunkciji.has(ime) ? jwtPoFunkciji.get(ime) : null,
      declaredInConfig: jwtPoFunkciji.has(ime),
      requiredSecrets: tajneU(path.join(FUNKCIJE, ime)),
      // Odluka, ne cinjenica. Prazno znaci "jos nije odluceno", i to je istinit zapis.
      owner: null,
      intentionalExclusion: null,
      reason: null,
    })),
  };
}

function commit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { return null; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const m = izracunajManifest();
  fs.writeFileSync(IZLAZ, `${JSON.stringify({ ...m, generatedAt: new Date().toISOString(), generatedFromCommit: commit(), generator: 'npm run deploy-manifest' }, null, 2)}\n`);
  const bezJwt = m.functions.filter((f) => f.verifyJwt === null).length;
  const bezVlasnika = m.functions.filter((f) => f.owner === null).length;
  console.log(`[deploy-manifest] ${IZLAZ}`);
  console.log(`  funkcija: ${m.functions.length} | bez verify_jwt deklaracije: ${bezJwt} | bez vlasnika: ${bezVlasnika}`);
}
