import { describe, it, expect } from 'vitest';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Gard nad jednim razredom kvara koji se NE VIDI u diffu ni u ispisu: literalan bajt 0x08
 * (backspace) ondje gdje je pisac mislio napisati granicu rijeci `\b`.
 *
 * Zasto zasluzuje vlastiti test: u Pythonovom raw-stringu (`r"..."`) `\b` ostaje granica rijeci, ali
 * ako u izvor upadne stvaran bajt 0x08, uzorak trazi doslovan backspace i vise NIKAD ne pogodi.
 * Funkcija tada tiho uvijek vraca "nema pogotka", sto je smjer PRESUCIVANJA: provjera koja nesto
 * treba diskvalificirati prestane diskvalificirati bilo sto.
 *
 * Izmjereno, ne pretpostavljeno. Kvar se 2026-08-23/24 pojavio CETIRI puta:
 *   - `LABEL_NUM` i razmaknuti broj u `scripts/audit_scored_quotes.py` (oba uhvacena pri pisanju),
 *   - `AXIS_VOCABULARY` u tudjem kodu (5 uzoraka, `text_layer_covers_axis` uvijek False),
 *   - `scripts/verify-draft-values.py` redak 208, gdje su ISTA dva uzorka 13 redaka iznad ispravna,
 *     pa je kvar nastao prepisivanjem. Ondje je grana glasila `and not says(...)`, dakle pokvarena
 *     je propustala vrijednost koju je trebala odbiti.
 *
 * Provjera je namjerno tupa (jedan bajt po cijelom stablu skripti), jer je i kvar tup.
 */

const ROOT = join(__dirname, '..');
const SCANNED_DIRS = ['scripts', 'tests'];
const SCANNED_EXT = /\.(py|mjs|mts|ts|js)$/;
const BACKSPACE = 0x08;

function collect(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    // `.tmp.` je podmetnuti ulaz negativne kontrole; da ga zaostao primjerak iz prekinutog runa ne
    // srusi kao stvaran nalaz.
    if (name === 'node_modules' || name === '__snapshots__' || name.startsWith('.')) continue;
    if (name.includes('.tmp.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (SCANNED_EXT.test(name)) out.push(full);
  }
  return out;
}

/** Vraca datoteke koje sadrze bajt 0x08, s brojem pojava. */
function withBackspace(files: string[]): Array<{ file: string; count: number }> {
  const hits: Array<{ file: string; count: number }> = [];
  for (const file of files) {
    const buf = readFileSync(file);
    let count = 0;
    for (const byte of buf) if (byte === BACKSPACE) count += 1;
    if (count) hits.push({ file: file.slice(ROOT.length + 1).replace(/\\/g, '/'), count });
  }
  return hits;
}

describe('higijena skripti: literalan backspace umjesto \\b', () => {
  const files = SCANNED_DIRS.flatMap((dir) => collect(join(ROOT, dir)));

  it('uopce ima sto skenirati (sentinel, da prazan popis ne prodje kao cisto)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('nijedna skripta ne sadrzi bajt 0x08', () => {
    expect(withBackspace(files)).toEqual([]);
  });

  it('NEGATIVNA KONTROLA: provjera prijavi datoteku koja bajt stvarno ima', () => {
    // Podmetnut ulaz umjesto vjere u kod: bez ovoga bi "prolazila" i provjera koja ne gleda nista.
    const planted = join(__dirname, 'fixtures', '__backspace-probe.tmp.py');
    mkdirSync(join(__dirname, 'fixtures'), { recursive: true });
    writeFileSync(planted, Buffer.from('PATTERN = r"apa\x08|harvard"\n', 'latin1'));
    try {
      const hits = withBackspace([planted]);
      expect(hits).toHaveLength(1);
      expect(hits[0].count).toBe(1);
    } finally {
      rmSync(planted, { force: true });
    }
  });
});
