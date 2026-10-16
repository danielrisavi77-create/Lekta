#!/usr/bin/env node
// Mjerenje usmjeravanja skillova (odluka vlasnika 2026-10-13): za svaki realni upit iz
// `scripts/agents/skill-routing-upiti.json` biljezi koji skill model PRVI pozove, ako ijedan.
// Skill koji se ne okine kad treba nema vrijednost, a opis koji se okida kad ne treba je sum.
//
// Svaki upit ide kroz `claude -p` u cist privremeni projekt koji sadrzi samo kopije
// `.claude/skills/*` i `CLAUDE.md`: bez `settings.json`, pa bez hookova (worktree-gc, bootstrap),
// i bez ostatka repozitorija. Prati se prvi `tool_use` iz stream-json izlaza, a proces se ubija cim
// je poznat, pa se nijedan alat stvarno ne izvrsava.
//
// Placen je: svaki upit je jedan poziv modela. Nije u CI-ju ni u `npm run check`; vrti se rucno nakon
// promjene opisa skilla, staro prema novom, s `--ponavljanja 3` za stabilnost.
//
// Ciste funkcije (`korakToka`, `pogodak`, `sazetak`, `upitiProblemi`) testira
// `tests/skill-routing.test.ts`; mutacije su u `tests/gate-mutations-skill-routing.test.ts`.
//
// Uporaba: node scripts/agents/skill-routing.mjs [--upiti <json>] [--model <id>] [--ponavljanja N]
//            [--paralelno N] [--izlaz <json>] [--samo <id,id>] [--korijen <repo>]
// Izlaz: 0 = svi pogoci, 1 = barem jedan promasaj, 2 = greska mjerenja.
import { spawn } from 'node:child_process';
import { cpSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TIMEOUT_MS = 150_000;

/** Pocetno stanje parsera toka za jedan upit. */
export function pocetnoStanje() {
  return { alat: null, ulaz: '' };
}

/**
 * Jedan dogadjaj `claude -p --output-format stream-json --include-partial-messages`.
 * Vraca `{ stanje, ishod }`; `ishod` je null dok prvi poziv alata nije poznat, a zatim
 * `{ alat, skill }` (`alat` null kad model odgovori bez alata).
 * @param {{ alat: string | null, ulaz: string }} stanje
 * @param {Record<string, any>} ev
 */
export function korakToka(stanje, ev) {
  if (ev?.type === 'result') return { stanje, ishod: { alat: null, skill: null } };
  if (ev?.type !== 'stream_event') return { stanje, ishod: null };
  const se = ev.event ?? {};
  if (se.type === 'content_block_start' && se.content_block?.type === 'tool_use') {
    const alat = String(se.content_block.name ?? '');
    if (alat !== 'Skill') return { stanje, ishod: { alat, skill: null } };
    return { stanje: { alat, ulaz: '' }, ishod: null };
  }
  if (se.type === 'content_block_delta' && stanje.alat === 'Skill') {
    return { stanje: { ...stanje, ulaz: stanje.ulaz + String(se.delta?.partial_json ?? '') }, ishod: null };
  }
  if (se.type === 'content_block_stop' && stanje.alat === 'Skill') {
    let skill;
    try {
      skill = JSON.parse(stanje.ulaz).skill ?? null;
    } catch {
      skill = stanje.ulaz;
    }
    return { stanje, ishod: { alat: 'Skill', skill } };
  }
  if (se.type === 'message_stop' && stanje.alat === null) return { stanje, ishod: { alat: null, skill: null } };
  return { stanje, ishod: null };
}

/**
 * Je li dobiveni skill ocekivan. `ocekivano` je ime skilla, null (nijedan skill) ili popis
 * prihvatljivih vrijednosti (npr. osobni skill korisnika koji drugdje ne postoji, ili null).
 * @param {string | null | Array<string | null>} ocekivano
 * @param {string | null} skill
 */
export function pogodak(ocekivano, skill) {
  const prihvatljivo = Array.isArray(ocekivano) ? ocekivano : [ocekivano];
  return prihvatljivo.includes(skill ?? null);
}

/**
 * Sazetak po upitu: koliko prolaza je pogodilo i sto je dobiveno. Prekid (`TIMEOUT`, greska
 * procesa) je promasaj, ne preskok: djelomican pad mora oboriti mjerenje.
 * @param {Array<{ id: string, ocekivano: any, alat: string | null, skill: string | null }>} rezultati
 */
export function sazetak(rezultati) {
  const poUpitu = new Map();
  for (const r of rezultati) {
    const s = poUpitu.get(r.id) ?? { id: r.id, ocekivano: r.ocekivano, pogodaka: 0, prolaza: 0, dobiveno: [] };
    s.prolaza += 1;
    if (pogodak(r.ocekivano, r.skill)) s.pogodaka += 1;
    s.dobiveno.push(r.skill ?? (r.alat ? `(${r.alat})` : '(bez alata)'));
    poUpitu.set(r.id, s);
  }
  const upiti = [...poUpitu.values()];
  return {
    pogodaka: rezultati.filter((r) => pogodak(r.ocekivano, r.skill)).length,
    ukupno: rezultati.length,
    promasaji: upiti.filter((s) => s.pogodaka < s.prolaza),
    upiti,
  };
}

/** Najmanje negativnih kontrola (ocekivano: nijedan skill), da se vidi i lazno okidanje. */
export const MIN_NEGATIVNIH = 3;
/** Prefiks osobnih skillova korisnika; smiju biti samo jedna od prihvatljivih vrijednosti. */
const OSOBNI = 'anthropic-skills:';

/**
 * Gard skupa upita; prazan popis je cisto. Skup koji ne pokriva neki skill ne moze izmjeriti da se
 * taj skill ne okida, a ocekivanje koje imenuje nepostojeci skill nikad ne pogadja i izgleda kao kvar
 * opisa.
 * @param {Array<{ id: string, ocekivano: string | null | Array<string | null>, upit: string }>} upiti
 * @param {string[]} skillovi imena direktorija u `.claude/skills/`
 */
export function upitiProblemi(upiti, skillovi) {
  const problemi = [];
  const ids = new Set();
  const pokriveni = new Set();
  let negativnih = 0;
  for (const u of upiti) {
    if (ids.has(u.id)) problemi.push(`dupli id: ${u.id}`);
    ids.add(u.id);
    if (typeof u.upit !== 'string' || u.upit.trim() === '') problemi.push(`prazan upit: ${u.id}`);
    const lista = Array.isArray(u.ocekivano) ? u.ocekivano : [u.ocekivano];
    if (lista.length === 0) problemi.push(`prazan popis ocekivanog: ${u.id}`);
    if (lista.length === 1 && lista[0] === null) negativnih += 1;
    for (const o of lista) {
      if (o === null) continue;
      if (o.startsWith(OSOBNI)) {
        if (!Array.isArray(u.ocekivano)) problemi.push(`osobni skill kao jedino ocekivanje: ${u.id}`);
        continue;
      }
      if (!skillovi.includes(o)) problemi.push(`nepostojeci skill ${o}: ${u.id}`);
      else pokriveni.add(o);
    }
  }
  for (const s of skillovi) if (!pokriveni.has(s)) problemi.push(`skill bez pozitivnog upita: ${s}`);
  if (negativnih < MIN_NEGATIVNIH) problemi.push(`premalo negativnih kontrola: ${negativnih} < ${MIN_NEGATIVNIH}`);
  return problemi;
}

function privremeniProjekt(korijen) {
  const dir = mkdtempSync(join(tmpdir(), 'lekta-skill-routing-'));
  cpSync(join(korijen, '.claude', 'skills'), join(dir, '.claude', 'skills'), { recursive: true });
  copyFileSync(join(korijen, 'CLAUDE.md'), join(dir, 'CLAUDE.md'));
  return dir;
}

/** Jedan upit kroz `claude -p`; razrjesava se prvim pozivom alata. */
function prviAlat(upit, { korijen, model }) {
  const dir = privremeniProjekt(korijen);
  const args = ['-p', upit, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (model) args.push('--model', model);
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return new Promise((resolvePromise) => {
    const dijete = spawn('claude', args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'ignore'] });
    let stanje = pocetnoStanje();
    let ostatak = '';
    let gotovo = false;
    const zavrsi = (ishod) => {
      if (gotovo) return;
      gotovo = true;
      clearTimeout(sat);
      dijete.kill();
      rmSync(dir, { recursive: true, force: true });
      resolvePromise(ishod);
    };
    const sat = setTimeout(() => zavrsi({ alat: 'TIMEOUT', skill: null }), TIMEOUT_MS);
    dijete.on('error', (err) => zavrsi({ alat: `GRESKA ${err.message}`, skill: null }));
    dijete.on('close', () => zavrsi({ alat: 'PREKID', skill: null }));
    dijete.stdout.on('data', (chunk) => {
      ostatak += chunk.toString('utf8');
      let i;
      while ((i = ostatak.indexOf('\n')) >= 0) {
        const redak = ostatak.slice(0, i);
        ostatak = ostatak.slice(i + 1);
        let ev;
        try {
          ev = JSON.parse(redak);
        } catch {
          continue;
        }
        const korak = korakToka(stanje, ev);
        stanje = korak.stanje;
        if (korak.ishod) return zavrsi(korak.ishod);
      }
    });
  });
}

function opcije(argv) {
  const o = { upiti: join(ROOT, 'scripts', 'agents', 'skill-routing-upiti.json'), ponavljanja: 1, paralelno: 4, korijen: ROOT };
  for (let i = 0; i < argv.length; i += 2) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (v === undefined) throw new Error(`opcija ${k} nema vrijednost`);
    if (k === '--upiti') o.upiti = resolve(v);
    else if (k === '--model') o.model = v;
    else if (k === '--ponavljanja') o.ponavljanja = Number(v);
    else if (k === '--paralelno') o.paralelno = Number(v);
    else if (k === '--izlaz') o.izlaz = resolve(v);
    else if (k === '--samo') o.samo = new Set(v.split(','));
    else if (k === '--korijen') o.korijen = resolve(v);
    else throw new Error(`nepoznata opcija ${k}`);
  }
  if (!Number.isInteger(o.ponavljanja) || o.ponavljanja < 1) throw new Error('--ponavljanja mora biti cijeli broj >= 1');
  if (!Number.isInteger(o.paralelno) || o.paralelno < 1) throw new Error('--paralelno mora biti cijeli broj >= 1');
  return o;
}

async function glavni(argv) {
  const o = opcije(argv);
  const upiti = JSON.parse(readFileSync(o.upiti, 'utf8')).filter((u) => !o.samo || o.samo.has(u.id));
  if (upiti.length === 0) throw new Error('nijedan upit za mjerenje');
  const poslovi = upiti.flatMap((u) => Array.from({ length: o.ponavljanja }, () => u));
  const rezultati = [];
  let sljedeci = 0;
  const radnik = async () => {
    while (sljedeci < poslovi.length) {
      const u = poslovi[sljedeci++];
      rezultati.push({ id: u.id, ocekivano: u.ocekivano, ...(await prviAlat(u.upit, o)) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.paralelno, poslovi.length) }, radnik));
  const s = sazetak(rezultati);
  for (const u of s.upiti) {
    const oznaka = u.pogodaka === u.prolaza ? 'OK' : 'XX';
    console.log(`${oznaka} ${u.id} ${u.pogodaka}/${u.prolaza} | ocekivano: ${JSON.stringify(u.ocekivano)} | dobiveno: ${u.dobiveno.join(', ')}`);
  }
  console.log(`pogodaka ${s.pogodaka}/${s.ukupno}`);
  if (o.izlaz) writeFileSync(o.izlaz, JSON.stringify({ model: o.model ?? null, rezultati, sazetak: s }, null, 1) + '\n');
  return s.promasaji.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  glavni(process.argv.slice(2)).then(
    (kod) => { process.exitCode = kod; },
    (err) => {
      console.error(`skill-routing: ${err.message}`);
      process.exitCode = 2;
    },
  );
}
