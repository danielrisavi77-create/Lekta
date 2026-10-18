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
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
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
 * @param {{ toolInput: Record<string, any>, ext: string, redaka: number | null, bajtova: number | null, binarna?: boolean }} ulaz
 *   `bajtova` je velicina iz stat (null kad datoteka ne postoji ili nije citljiva); `redaka` se broji samo
 *   za datoteke do PRAG_BAJTOVA, inace je null; `binarna` je uzorak s NUL bajtom.
 * @returns {{ allow: boolean, reason: string }}
 */
export function judgeRead({ toolInput, ext, redaka, bajtova, binarna = false }) {
  if (toolInput?.limit != null) return { allow: true, reason: '' };
  if (NETEKSTUALNE.has(String(ext).toLowerCase())) return { allow: true, reason: '' };
  if (bajtova == null || binarna) return { allow: true, reason: '' };
  const prevelikaBajtovima = bajtova > PRAG_BAJTOVA;
  const prevelikaRedcima = redaka != null && redaka > PRAG_REDAKA;
  if (!prevelikaBajtovima && !prevelikaRedcima) return { allow: true, reason: '' };
  const opis = redaka != null ? `${redaka} redaka (${Math.round(bajtova / 1000)} KB)` : `${Math.round(bajtova / 1000)} KB`;
  return {
    allow: false,
    reason: `datoteka ima ${opis}, a Read bez limit bi je cijelu unio u kontekst `
      + `(docs/agents/STEDNJA_TOKENA.md, P5). Nadji mjesto Grepom, pa Read s offset i limit do ${PRAG_REDAKA} redaka. `
      + `Ako stvarno trebas cijelu datoteku, ponovi Read s izricitim limit (npr. limit: ${redaka ?? 2000}).`,
  };
}

/** Velicina uzorka za prepoznavanje binarne datoteke (NUL bajt), da se nikad ne cita cijela datoteka. */
const UZORAK_BAJTOVA = 8192;

async function main() {
  const payload = await readHookInput('read-guard');
  if (!payload) process.exit(0);
  let verdict;
  try {
    const filePath = payload?.tool_input?.file_path;
    if (typeof filePath !== 'string' || !filePath.trim()) process.exit(0);
    // Izricit limit prolazi prije ikakvog pristupa disku (Codex nalaz R1 na #378: citanje cijele datoteke
    // od stotine MB u hooku moze zavrsiti OOM-om koji catch ne hvata).
    if (payload?.tool_input?.limit != null) process.exit(0);
    const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(payload?.cwd || process.cwd(), filePath);
    const ext = extname(absolute);
    let redaka = null;
    let bajtova = null;
    let binarna = false;
    if (!NETEKSTUALNE.has(ext.toLowerCase()) && existsSync(absolute)) {
      const st = statSync(absolute);
      if (st.isFile()) {
        bajtova = st.size;
        // Najvise UZORAK_BAJTOVA za binarnost; cijela datoteka samo do PRAG_BAJTOVA, i tad samo za retke.
        const fd = openSync(absolute, 'r');
        try {
          const buf = Buffer.alloc(Math.min(st.size, Math.max(UZORAK_BAJTOVA, st.size <= PRAG_BAJTOVA ? st.size : 0)));
          const procitano = readSync(fd, buf, 0, buf.length, 0);
          const dio = buf.subarray(0, procitano);
          binarna = dio.subarray(0, UZORAK_BAJTOVA).includes(0);
          if (!binarna && st.size <= PRAG_BAJTOVA) redaka = brojRedaka(dio.toString('utf8'));
        } finally {
          closeSync(fd);
        }
      }
    }
    verdict = judgeRead({ toolInput: payload.tool_input ?? {}, ext, redaka, bajtova, binarna });
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
