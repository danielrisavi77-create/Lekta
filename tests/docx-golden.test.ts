/**
 * Golden harness za DOCX pipeline (CLAUDE.md "Parser: ne diraj bez golden testa"
 * i backlog 1).
 *
 * Svrha: prije bilo kakvog diranja parsera, audita ili Legal Citation Enginea
 * snimi baseline ponasanja nad realnim .docx fixturama, pa refaktoriraj tako da
 * se snapshoti NE mijenjaju.
 *
 * Stanje:
 *   - Nema fixtura  -> suite se SAM PRESKACE (describe.skip), build ostaje zelen.
 *   - Ima fixtura   -> za svaku se pokrene pipeline i snima se normaliziran
 *                      (stabilan) projekt rezultata kao snapshot.
 *
 * Kako dodati fixture (vidi docs/GOLDEN.md):
 *   1. Stavi 5-10 realnih .docx u tests/fixtures/docx/ (po mogucnosti uz
 *      tests/fixtures/docx/<ime>.json koji navodi profileId; inace default).
 *   2. Izlozi pipeline kroz src/analysis/golden-entry.ts (analyzeFixture).
 *      To je prvi golden-zasticeni zahvat u src/main.ts (export analyzeDocx +
 *      guard na trailing init()). Snimi baseline ODMAH: npm test -- -u.
 *   3. Tek onda refaktoriraj; snapshoti se ne smiju mijenjati.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeResult } from './helpers/golden-normalize';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'fixtures', 'docx');
const ENTRY_PATH = join(here, '..', 'src', 'analysis', 'golden-entry.ts');

function discoverFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.toLowerCase().endsWith('.docx'))
    .sort();
}

/**
 * Ucitaj ulaznu tocku pipelinea. Namjerno NIJE staticki import: src/main.ts na
 * dnu poziva init() koji dira DOM, pa ga ne smijemo uvlaciti u test proces.
 * src/analysis/golden-entry.ts je tanak, DOM-free re-export (jos ne postoji dok
 * nema fixtura). Ako fixture postoje a entry nije spojen, jasno padni s uputom.
 */
async function loadEntry(): Promise<(file: File, opts?: { profileId?: string }) => Promise<unknown>> {
  if (!existsSync(ENTRY_PATH)) {
    throw new Error(
      'Golden fixture postoje, ali pipeline nije spojen.\n' +
        'Napravi src/analysis/golden-entry.ts s:\n' +
        '  export async function analyzeFixture(file, opts) { ... }\n' +
        'koji deterministicki odabere profil i pozove analyzeDocx iz src/main.ts\n' +
        '(prvo izvezi analyzeDocx i ogradi trailing init()). Vidi docs/GOLDEN.md.',
    );
  }
  // Runtime specifier + @vite-ignore: sprijecava staticko razrjesavanje u transform
  // fazi (modul ne postoji dok nije spojen), pa prazan repo ostaje zelen.
  const url = pathToFileURL(ENTRY_PATH).href;
  const mod: any = await import(/* @vite-ignore */ url);
  if (typeof mod.analyzeFixture !== 'function') {
    throw new Error('golden-entry.ts ne izvozi analyzeFixture(file, opts).');
  }
  return mod.analyzeFixture;
}

/** Ako uz <ime>.docx postoji <ime>.json, vrati njegov profileId. */
function fixtureProfileId(fileName: string): string | undefined {
  const sidecar = join(FIXTURE_DIR, fileName.replace(/\.docx$/i, '.json'));
  if (!existsSync(sidecar)) return undefined;
  try {
    const meta = JSON.parse(readFileSync(sidecar, 'utf8'));
    return typeof meta.profileId === 'string' ? meta.profileId : undefined;
  } catch {
    return undefined;
  }
}

const fixtures = discoverFixtures();
const suite = fixtures.length ? describe : describe.skip;

// Jedan snapshot cijele mape (fixture -> normaliziran rezultat), NE 6 zasebnih
// auto-brojanih snapshota. Auto-brojac (`... 1`, `... 2`) zna povremeno zapisati suvisni
// `... 2` kljuc kod async testova (setTimeout u analyzeDocx perturbira vitest brojac),
// sto je davalo kozmeticki "1 obsolete" u reporteru (bez pada, exit 0). Jedan imenovani
// snapshot uklanja brojac i time i taj sum; rezultati su deterministicki (dokazano).
suite('DOCX golden snapshots', () => {
  it('stabilni rezultati svih fixtura', async () => {
    const analyzeFixture = await loadEntry();
    const out: Record<string, unknown> = {};
    for (const fileName of fixtures) {
      const bytes = readFileSync(join(FIXTURE_DIR, fileName));
      const file = new File([bytes], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      out[fileName] = normalizeResult(await analyzeFixture(file, { profileId: fixtureProfileId(fileName) }));
    }
    expect(out).toMatchSnapshot();
  // Svih 6 fixtura + setTimeout(250) po analizi u JEDNOM testu, pa 5 s default ne dolazi u obzir.
  // Podignuto 2026-08-20 s 30 s: sam po sebi traje ~20 s, ali dok na istom stroju tece drugi
  // vitest prijedje 30 s. Tada se dogodi gore od obicnog pada, isto kao kod repair-goldena
  // (38a94d2): test bez rezultata vitest oznaci kao "1 obsolete snapshot", a uz `-u` snapshot
  // DATOTEKU obrise, pa izgleda kao da je golden nestao.
  }, 300000);
});
