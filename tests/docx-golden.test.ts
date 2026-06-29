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

/**
 * Stabilan projekt rezultata za snapshot. Izbacuje promjenjiva polja
 * (generatedAt, id-evi iz Date.now()/Math.random(), velicina datoteke), zadrzava
 * deterministicke ishode audita. Prilagodi popis kad postoje pravi rezultati.
 */
function normalizeResult(r: any): unknown {
  if (!r || typeof r !== 'object') return r;
  const round = (n: unknown) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);
  return {
    score: r.score ?? null,
    profile: r.profile ?? null,
    profileStatus: r.profileStatus ?? null,
    profileFingerprint: r.details?.profileFingerprint ?? r.profileFingerprint ?? null,
    stats: r.stats ?? null,
    checks: (r.checks ?? []).map((c: any) => ({
      category: c.category ?? null,
      title: c.title ?? null,
      status: c.status ?? null,
      earned: round(c.earned),
      max: c.max ?? null,
      detail: c.detail ?? null,
    })),
    issues: (r.issues ?? []).map((i: any) => ({
      severity: i.severity ?? null,
      category: i.category ?? null,
      title: i.title ?? null,
      where: i.where ?? null,
      detail: i.detail ?? null,
    })),
  };
}

const fixtures = discoverFixtures();
const suite = fixtures.length ? describe : describe.skip;

suite('DOCX golden snapshots', () => {
  for (const fileName of fixtures) {
    it(`stabilan rezultat: ${fileName}`, async () => {
      const analyzeFixture = await loadEntry();
      const bytes = readFileSync(join(FIXTURE_DIR, fileName));
      const file = new File([bytes], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = await analyzeFixture(file, { profileId: fixtureProfileId(fileName) });
      expect(normalizeResult(result)).toMatchSnapshot();
    });
  }
});
