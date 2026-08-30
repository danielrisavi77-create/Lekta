// scripts/orphan-scan.mjs
//
// Predcommit skener: trazi COMMITANOG OVISNIKA uz NECOMMITANU OVISNOST.
// Razlog, izmjereni primjeri i zasto `tsc` to ne vidi: `scripts/orphan-scan-core.mjs`.
//
// Pokretanje: `npm run orphan-scan`. Izlazni kod 1 kad ima nalaza, inace 0.
//
// NAMJERNO NIJE u `npm run check`: `check` u CI-u vrti nad CISTIM checkoutom, gdje izmijenjenih
// datoteka nema, pa bi ondje uvijek prolazio prazan. Gard koji u CI-u ne moze imati sto mjeriti ne
// smije se predstavljati kao CI gard; ovo je alat za dijeljeno radno stablo, gdje kvar i nastaje.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { findOrphans, formatReport, newlyExported } from './orphan-scan-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Izmijenjene (ne nove) datoteke koje uopce mogu nesto izvoziti. */
function changedSourceFiles() {
  return git('diff', '--name-only', '--diff-filter=M', '--', '*.ts', '*.mts', '*.mjs')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function committedSource(path) {
  try {
    return git('show', `HEAD:${path}`);
  } catch {
    return '';
  }
}

const repo = {
  /**
   * Commitane datoteke koje simbol spominju. `-w` trazi CIJELU rijec, inace bi `sortBy` pogodio
   * `sortByName`. Pretraga ide po `HEAD`, ne po radnom stablu: pitanje je sto vidi cist checkout.
   */
  referencesAtHead(symbol) {
    try {
      return git('grep', '-l', '-w', symbol, 'HEAD', '--', '*.ts', '*.mts', '*.mjs')
        .split('\n')
        .map((line) => line.replace(/^HEAD:/, '').trim())
        .filter(Boolean);
    } catch {
      // git grep vraca 1 kad nema pogodaka; to je uredan ishod, ne greska.
      return [];
    }
  },
};

const candidates = changedSourceFiles()
  .filter((path) => existsSync(join(ROOT, path)))
  .map((path) => ({
    file: path,
    symbols: newlyExported(readFileSync(join(ROOT, path), 'utf8'), committedSource(path)),
  }))
  .filter(({ symbols }) => symbols.length);

const nalazi = findOrphans(candidates, repo);
console.log(formatReport(nalazi));
process.exit(nalazi.length ? 1 : 0);
