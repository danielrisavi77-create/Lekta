/**
 * Claude Code PreToolUse hook (Read): program stednje tokena P5 (docs/agents/STEDNJA_TOKENA.md).
 *
 * Zasto: citanje cijele velike datoteke ulazi u kontekst i zatim se placa na SVAKOM sljedecem potezu
 * kroz citanje kesa. Izmjereno 4. 10. 2026.: jedna sesija je 46 puta procitala cijele datoteke
 * (~328k tokena) umjesto trazenog odjeljka.
 *
 * Pravilo: Read BEZ `limit` nad tekstualnom datotekom duljom od PRAG_REDAKA redaka ili PRAG_BAJTOVA
 * bajtova se odbija s uputom (Grep za mjesto, pa Read s offset i limit). Read s izricitim `limit` uvijek
 * prolazi, pa i cijela datoteka ostaje dostupna kad stvarno treba (`limit` jednak broju redaka).
 * Slike, PDF i biljeznice nisu tekst za brojanje redaka i uvijek prolaze.
 *
 * Izlaz: 0 = dopusteno, 2 = odbijeno (poruka na stderr ide modelu). FAIL-OPEN kao ostali hookovi:
 * vlastita greska hooka, nepostojeca ili necitljiva datoteka nikad ne blokira rad.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { readHookInput } from './hook-input.mjs';

export const PRAG_REDAKA = 300;
export const PRAG_BAJTOVA = 40_000;
/** Datoteke koje Read prikazuje kao sliku ili stranice, ne kao retke teksta. */
const NETEKSTUALNE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.pdf', '.ipynb']);

/** @param {string} tekst */
export function brojRedaka(tekst) {
  if (!tekst) return 0;
  let n = 1;
  for (let i = 0; i < tekst.length; i += 1) if (tekst.charCodeAt(i) === 10) n += 1;
  return tekst.endsWith('\n') ? n - 1 : n;
}

/**
 * Cista presuda bez nuspojava.
 * @param {{ toolInput: Record<string, any>, ext: string, redaka: number | null, bajtova: number | null }} ulaz
 *   `redaka` i `bajtova` su null kad datoteka ne postoji ili nije citljiva.
 * @returns {{ allow: boolean, reason: string }}
 */
export function judgeRead({ toolInput, ext, redaka, bajtova }) {
  if (toolInput?.limit != null) return { allow: true, reason: '' };
  if (NETEKSTUALNE.has(String(ext).toLowerCase())) return { allow: true, reason: '' };
  if (redaka == null || bajtova == null) return { allow: true, reason: '' };
  if (redaka <= PRAG_REDAKA && bajtova <= PRAG_BAJTOVA) return { allow: true, reason: '' };
  return {
    allow: false,
    reason: `datoteka ima ${redaka} redaka (${Math.round(bajtova / 1000)} KB), a Read bez limit bi je cijelu unio u kontekst `
      + `(docs/agents/STEDNJA_TOKENA.md, P5). Nadji mjesto Grepom, pa Read s offset i limit do ${PRAG_REDAKA} redaka. `
      + `Ako stvarno trebas cijelu datoteku, ponovi Read s limit: ${redaka}.`,
  };
}

async function main() {
  const payload = await readHookInput('read-guard');
  if (!payload) process.exit(0);
  let verdict;
  try {
    const filePath = payload?.tool_input?.file_path;
    if (typeof filePath !== 'string' || !filePath.trim()) process.exit(0);
    const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(payload?.cwd || process.cwd(), filePath);
    let redaka = null;
    let bajtova = null;
    if (existsSync(absolute) && statSync(absolute).isFile()) {
      const ext = extname(absolute);
      if (!NETEKSTUALNE.has(ext.toLowerCase())) {
        const tekst = readFileSync(absolute, 'utf8');
        redaka = brojRedaka(tekst);
        bajtova = Buffer.byteLength(tekst, 'utf8');
      }
    }
    verdict = judgeRead({ toolInput: payload.tool_input ?? {}, ext: extname(absolute), redaka, bajtova });
  } catch (err) {
    process.stderr.write('read-guard: interna greska, propustam (fail-open). ' + String(err) + '\n');
    process.exit(0);
  }
  if (!verdict.allow) {
    process.stderr.write('read-guard: ' + verdict.reason + '\n');
    process.exit(2);
  }
  process.exit(0);
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/hooks/read-guard.mjs');
if (isMain) main();
