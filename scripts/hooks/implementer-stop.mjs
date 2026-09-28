#!/usr/bin/env node
/**
 * Claude Code Stop hook: implementatorska sesija ne zavrsava dok checklist nije zatvoren
 * (odluka vlasnika 2026-09-28).
 *
 * Aktivan SAMO kad je u okolini `LEKTA_ROLE=implementer` i `LEKTA_CHECKLIST=<putanja do .md>`.
 * Bez toga je no-op, pa koordinatorske, pregledne i obicne sesije ne osjete nista.
 *
 * Checklist je markdown sa stavkama `- [ ]` (otvoreno) i `- [x]` (gotovo). Ako ima otvorenih
 * stavki i datoteka nema redak koji pocinje s `BLOKIRANO:`, hook vraca odluku "block" s popisom
 * otvorenih stavki. Blokira najvise 2 puta po sesiji (brojac u `os.tmpdir()/lekta-stop-<session_id>`),
 * da sesija koja stvarno ne moze dalje ne zapne u petlji.
 *
 * Ugovor Stop hooka: stdin JSON (`session_id`, `stop_hook_active`, ...); odluka se vraca kao JSON na
 * stdout `{"decision":"block","reason":"..."}` uz exit 0, a bez ispisa sesija normalno zavrsava.
 * FAIL-OPEN: nepostojeca checklista, nevaljan stdin ili greska hooka nikad ne drze sesiju.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHookInput } from './hook-input.mjs';

export const MAX_BLOCKS = 2;
const OPEN_ITEM_RE = /^\s*[-*+]\s+\[ \]\s+(.+?)\s*$/;
const BLOCKED_RE = /^\s*BLOKIRANO:/m;

/** Otvorene stavke checkliste (tekst iza `- [ ]`), redoslijedom pojavljivanja. */
export function openItems(markdown) {
  return String(markdown)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => OPEN_ITEM_RE.exec(line))
    .filter(Boolean)
    .map((m) => m[1]);
}

/** Datoteka brojaca po sesiji; session_id se cisti da ne moze izaci iz tmpdira. */
export function counterPath(sessionId, dir = tmpdir()) {
  const safe = String(sessionId ?? 'nepoznata').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || 'nepoznata';
  return join(dir, `lekta-stop-${safe}`);
}

/**
 * Cista odluka. `readFile(put)` vraca sadrzaj ili baca; `blocksSoFar` je stanje brojaca.
 * @returns {{ block: boolean, reason?: string, note?: string }}
 */
export function decideStop({ env = {}, sessionId, blocksSoFar = 0, readFile, maxBlocks = MAX_BLOCKS }) {
  if (env.LEKTA_ROLE !== 'implementer') return { block: false, note: 'nije implementatorska sesija' };
  if (!env.LEKTA_CHECKLIST) return { block: false, note: 'LEKTA_CHECKLIST nije postavljen' };
  let markdown;
  try {
    markdown = readFile(env.LEKTA_CHECKLIST);
  } catch {
    return { block: false, note: `checklist ${env.LEKTA_CHECKLIST} se ne moze procitati (fail-open)` };
  }
  if (BLOCKED_RE.test(String(markdown).replace(/\r/g, ''))) return { block: false, note: 'BLOKIRANO zapisano' };
  const open = openItems(markdown);
  if (!open.length) return { block: false, note: 'checklist zatvoren' };
  if (blocksSoFar >= maxBlocks) return { block: false, note: `vec blokirano ${blocksSoFar} puta u sesiji ${sessionId}` };
  return {
    block: true,
    reason: `Otvoreno: ${open.join('; ')}. Nastavi; ako je blokirano, napisi BLOKIRANO: razlog.`,
  };
}

function readCounter(path) {
  try {
    const n = Number.parseInt(readFileSync(path, 'utf8'), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

async function main() {
  // Bez uloge se stdin ni ne cita: hook je tada no-op i ne smije nista kostati.
  if (process.env.LEKTA_ROLE !== 'implementer') process.exit(0);
  const payload = await readHookInput('implementer-stop');
  if (!payload) process.exit(0);
  try {
    const path = counterPath(payload?.session_id);
    const blocksSoFar = existsSync(path) ? readCounter(path) : 0;
    const decision = decideStop({
      env: process.env,
      sessionId: payload?.session_id,
      blocksSoFar,
      readFile: (p) => readFileSync(p, 'utf8'),
    });
    if (decision.block) {
      writeFileSync(path, String(blocksSoFar + 1));
      process.stdout.write(`${JSON.stringify({ decision: 'block', reason: decision.reason })}\n`);
    }
  } catch (err) {
    process.stderr.write(`implementer-stop: interna greska, propustam. ${String(err)}\n`);
  }
  process.exit(0);
}

const isMain = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/hooks/implementer-stop.mjs');
if (isMain) main();
