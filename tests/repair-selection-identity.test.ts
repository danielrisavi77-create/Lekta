import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { installXmlDomParser } from '../src/docx/xml-dom-install';
import { ensureRepairMapHeavy, repairEntriesFor } from '../src/profiles/profile-runtime-maps';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';
import { repairSelectionKey } from '../src/ui/repair-selection';

/**
 * PITANJE 4 IZ PROJEKTA C6, ODGOVORENO MJERENJEM: je li par (fixerId, ruleId) jedinstven u
 * izlazu `buildAllRepairableItems`? O tome ovisi je li kljuc odabira `fixerId|ruleId` identitet
 * ili treba redni broj. Zasebna tvrdnja: broj golih `ruleId`-eva koji se pojave s razlicitim
 * fixerom, jer o TOJ pretpostavci vec danas visi `bindRepairWorkflow` (kljucuje samo `ruleId`-em).
 *
 * Populacija: sve golden fixture sa sidecarom `profileId`, oba stanja ponude (teaser i puna).
 * Kolizije se IMENUJU, ne broje. Druga, neovisna mjera (drugi alat, druga populacija) izvedena je
 * 2026-09-12 parsiranjem `data/profiles/repair-map.json` kao JSON-a: 368 profila, 1846 unosa,
 * nula ponovljenih parova, nula ruleId-eva s dva fixera.
 */

const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'docx');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fixtures(): Array<{ fileName: string; profileId: string }> {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.toLowerCase().endsWith('.docx'))
    .map((fileName) => {
      const sidecar = resolve(FIXTURE_DIR, fileName.replace(/\.docx$/i, '.json'));
      const profileId = existsSync(sidecar) ? (JSON.parse(readFileSync(sidecar, 'utf8')) as { profileId?: string }).profileId : undefined;
      return profileId ? { fileName, profileId } : null;
    })
    .filter((x): x is { fileName: string; profileId: string } => x !== null)
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

interface Measurement {
  label: string;
  itemCount: number;
  /** Kljucevi koji se ponavljaju, s brojem ponavljanja. */
  duplicateKeys: string[];
  /** Goli ruleId-evi koji se pojavljuju s vise od jednog fixera. */
  ruleIdsWithTwoFixers: string[];
}

function measure(label: string, items: Array<{ fixerId: string; ruleId: string }>): Measurement {
  const byKey = new Map<string, number>();
  const fixersByRule = new Map<string, Set<string>>();
  for (const it of items) {
    const key = repairSelectionKey(it);
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
    const s = fixersByRule.get(it.ruleId) ?? new Set<string>();
    s.add(it.fixerId);
    fixersByRule.set(it.ruleId, s);
  }
  return {
    label,
    itemCount: items.length,
    duplicateKeys: [...byKey].filter(([, n]) => n > 1).map(([k, n]) => `${label}: ${k} x${n}`),
    ruleIdsWithTwoFixers: [...fixersByRule].filter(([, s]) => s.size > 1).map(([r, s]) => `${label}: ${r} -> ${[...s].join(',')}`),
  };
}

describe('identitet stavke popravka: par (fixerId, ruleId) nad golden fixturama', () => {
  it('nema dva zahvata s istim kljucem, i nijedan ruleId nema dva fixera (popis je imenovan)', async () => {
    installXmlDomParser();
    await ensureRepairMapHeavy();
    const list = fixtures();
    const measurements: Measurement[] = [];
    for (const { fileName, profileId } of list) {
      const bytes = new Uint8Array(readFileSync(resolve(FIXTURE_DIR, fileName)));
      const result = await analyzeFixture(new File([bytes], fileName, { type: DOCX_MIME }), { profileId });
      const profile = resolveProfile(profileId);
      const entries = repairEntriesFor(profileId);
      for (const includeNonViolated of [false, true]) {
        const items = buildAllRepairableItems({ result, profile, entries, titleTemplate: null, includeNonViolated });
        measurements.push(measure(`${fileName}${includeNonViolated ? ' (puna)' : ' (teaser)'}`, items));
      }
    }
    // SENTINEL: nula izmjerenih skupova (nema fixtura, profil se nije ucitao) je PAD s porukom da
    // mjerenja nije bilo; prazna populacija nikad ne prolazi kao "nema kolizija".
    expect(measurements.length, 'mjerenja nije bilo: nijedna golden fixtura sa profileId sidecarom').toBeGreaterThan(0);
    const total = measurements.reduce((n, m) => n + m.itemCount, 0);
    // Izmjereno 2026-09-12: 21 fixtura sa sidecarom, 42 skupa, 354 stavke, nula kolizija.
    expect(total, 'sastavljac nije vratio nijednu stavku ni za jednu fixturu; mjerenje je prazno').toBeGreaterThan(0);

    const duplicates = measurements.flatMap((m) => m.duplicateKeys);
    const twoFixers = measurements.flatMap((m) => m.ruleIdsWithTwoFixers);
    expect(duplicates, 'kljuc fixerId|ruleId NIJE jedinstven; kljuc mora dobiti redni broj unutar para').toEqual([]);
    expect(twoFixers, 'isti ruleId s dva fixera: bindRepairWorkflow (kljucuje samo ruleId-em) ih ne razlikuje').toEqual([]);
  }, 600_000);

  /**
   * MUTACIJA: u izmjeren skup se podmetne klon postojece stavke s istim fixerId i ruleId; mjerac
   * mora imenovati TOCNO taj kljuc. Bez ovoga bi prazan popis kolizija mogao znaciti i da mjerac
   * nista ne prepoznaje.
   */
  it('mutacija: podmetnut klon se imenuje, a cist skup ostaje bez nalaza', () => {
    const cist = [
      { fixerId: 'font-fixer', ruleId: 'x--font' },
      { fixerId: 'margins-fixer', ruleId: 'x--margins' },
    ];
    expect(measure('cist', cist).duplicateKeys).toEqual([]);
    expect(measure('cist', cist).ruleIdsWithTwoFixers).toEqual([]);
    const m = measure('mut', [...cist, { fixerId: 'font-fixer', ruleId: 'x--font' }]);
    expect(m.duplicateKeys).toEqual(['mut: font-fixer|x--font x2']);
    const m2 = measure('mut2', [...cist, { fixerId: 'drugi-fixer', ruleId: 'x--font' }]);
    expect(m2.duplicateKeys).toEqual([]);
    expect(m2.ruleIdsWithTwoFixers).toEqual(['mut2: x--font -> font-fixer,drugi-fixer']);
  });
});
