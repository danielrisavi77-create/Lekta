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

/**
 * DOMENA I POSLJEDICA PADA, autorski upisano a NE izvedeno iz koda.
 *
 * Ovo je jedini dio manifesta koji nije mjeren, i zato stoji odvojeno, s izricitom oznakom
 * `authored`. Izveden je iz zaglavlja svake funkcije, ali je svrstavanje procjena, ne cinjenica;
 * tko ga mijenja, mijenja tudju prosudbu, ne mjerenje.
 *
 * `owner` je u ovom projektu jedna osoba, pa polje ne razlikuje ljude nego odgovara na pitanje
 * KOGA se tice kad padne: to je domena. Zato je vrijednost domene, a ne ime.
 */
const DOMENA = {
  'admin-stats': ['operacije', 'vlasnicki pregled ostaje bez brojki; korisnika ne dira'],
  'analytics-event': ['analitika', 'gubi se telemetrija; proizvod radi normalno'],
  'cleanup-orphan-repairs': ['popravak', 'osirotjeli blobovi se gomilaju; tiho, vidi se tek na racunu'],
  'client-error': ['operacije', 'greske u pregledniku prestaju stizati; kvarovi postaju nevidljivi'],
  'create-checkout': ['naplata', 'nitko ne moze platiti'],
  'delete-repair-job': ['popravak', 'korisnik ne moze obrisati svoj dokument; GDPR obveza'],
  'faculty-request': ['rast', 'gubi se lista cekanja za nepokrivene fakultete'],
  'field-render': ['popravak', 'polja i sadrzaj se ne osvjezavaju; popravak je nepotpun'],
  'file-guarantee-claim': ['naplata', 'jamstvo se ne moze ostvariti; obveza prema kupcu'],
  'generate-report': ['naplata', 'placeni izvjestaj se ne isporucuje'],
  'health': ['operacije', 'vanjski nadzor slijep; ne vidi se da je ista drugo palo'],
  'integrity-check': ['popravak', 'nema serverske provjere paketa prije isporuke'],
  'katedra-agent-worker': ['integracija', 'jednosmjerni izvoz prema Katedri staje'],
  'preflight-result': ['analiza', 'provjera prije predaje ne vraca rezultat'],
  'preflight-start': ['analiza', 'provjera prije predaje se ne moze pokrenuti'],
  'process-bonus-outbox': ['naplata', 'obveze nakon kupnje se ne izvrsavaju; kupac je platio a nije dobio'],
  'profile-rules': ['analiza', 'pravila profila se ne dohvacaju; analiza pada na opcu provjeru'],
  'record-completion-check': ['integracija', 'handoff prema Katedri ne biljezi ishod'],
  'redeem-referral-signup': ['rast', 'preporuke se ne priznaju'],
  'repair-docx': ['popravak', 'PLACENI popravak ne radi; glavni proizvod stoji'],
  'send-reminders': ['rokovi', 'podsjetnici na rokove se ne salju'],
  'source-check': ['analiza', 'provjera postojanja izvora ne radi; placeni dodatak'],
  'unsubscribe-reminder': ['rokovi', 'odjava s podsjetnika ne radi; pravna obveza'],
  'webhook-mor': ['naplata', 'placanja se ne knjize; kupac plati a ne dobije pravo'],
  'withdraw-corpus-contribution': ['popravak', 'korisnik ne moze povuci privolu za prilog korpusu; pravna obveza'],
};

/**
 * STANJE DEPLOYA NAMJERNO NIJE OVDJE.
 *
 * Prva izvedba ga je citala iz `docs/generated/DEPLOY_DRIFT.md` i time vezala manifest za artefakt
 * koji se mijenja neovisno o repozitoriju. Posljedica je bila izmjerena i kostala je crven CI: moja
 * commitana verzija bila je izvedena iz RADNE kopije tog izvjestaja (22 funkcije), a CI je imao
 * commitanu (21), pa se deep-equal razisao. Kad sam to popravio, palo je lokalno, jer je radna kopija
 * i dalje bila novija. Zrcalna slika iste greske.
 *
 * Manifest zato drzi ono sto repozitorij DEKLARIRA (koje funkcije postoje, kako su zasticene, koje
 * tajne trebaju, koga se tice kad padnu). Kakvo je okruzenje trenutacno je zaseban podatak i za njega
 * vec postoji `npm run deploy-drift`. Mijesanje to dvoje daje artefakt koji je crven ovisno o tome
 * tko ga gleda.
 */

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
      domain: (DOMENA[ime] ?? [null])[0],
      impactIfDown: (DOMENA[ime] ?? [null, null])[1],
      // Odluka, ne cinjenica. Prazno znaci "jos nije odluceno", i to je istinit zapis.
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
