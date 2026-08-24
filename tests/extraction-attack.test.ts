/**
 * Extraction test, staticki dio (faza A): simulacija napadaca koji ima SAMO javno
 * izgradene artefakte (dist/ + dist-packs/) i pokusava rekonstruirati bazu pravila.
 *
 * POSTENI KRITERIJI (dokumentirano i u planu): test tvrdi TOCNO troje i nista vise.
 *  1. Provenijencija i evidence (verifiedHash, potpisi, publicSources...) nisu ni u
 *     jednom emitiranom artefaktu: never-markeri + kanarinci = 0 pogodaka.
 *  2. Bulk artefakti (heavy profili, repair-map) postoje tocno onako kako manifest
 *     kaze: do faze B3 kao LIJENI zasebni chunkovi, nakon flipa na forbidden NIKAKO.
 *  3. Privatni izvori se ne kopiraju medju artefakte ni pod svojim imenom.
 * Test NE tvrdi da su VRIJEDNOSTI pravila tajne: one su namjerno javne na SEO
 * stranicama (odluka vlasnika 2026-08-23) i moat nisu vrijednosti nego evidence.
 *
 * Suite se preskace bez dist/ (isti obrazac kao golden bez fixtura): u `npm run check`
 * vitest ide PRIJE vite builda pa bi sirovi fail na nepostojecem distu bio sum.
 * Autoritativni post-build sken je zato u scripts/verify-dist-classification.mjs
 * (CI korak nakon checka + netlify lanac); ovaj test je lokalna preslika nad
 * POSTOJECIM distom. Ako padne nad starim distom, prvo `npx vite build` pa ponovi.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore .mjs moduli bez deklaracija; tsconfig include je samo src
import { loadManifest, classifyPath } from '../scripts/security/classification.mjs';
// @ts-ignore isto
import { runClassificationScan } from '../scripts/verify-dist-classification.mjs';

// __dirname preko vitest CJS shima; happy-dom okolina kvari new URL(import.meta.url)
const ROOT = resolve(__dirname, '..');
const ASSETS = resolve(ROOT, 'dist', 'assets');
const hasDist = existsSync(ASSETS);

describe.skipIf(!hasDist)('extraction attack nad izgradenim artefaktima', () => {
  const manifest = loadManifest(ROOT);

  it('bulk artefakti prate manifest (lazy chunk dok je allowed, nikako kad je forbidden)', () => {
    const assets = readdirSync(ASSETS);
    const cases: Array<[string, RegExp]> = [
      ['data/profiles/verified-profiles-heavy.json', /^verified-profiles-heavy-.*\.js$/],
      ['data/profiles/repair-map.json', /^repair-map-.*\.js$/],
    ];
    for (const [source, chunkPattern] of cases) {
      const rule = classifyPath(source, manifest.rules);
      const present = assets.some((name) => chunkPattern.test(name));
      if (rule?.bundle === 'allowed') {
        // do faze B3: mora postojati kao ZASEBAN (lijeni) chunk; da je uvucen u entry,
        // bundleSizeGuard bi vec srusio build
        expect(present, `${source}: ocekivan zaseban lijeni chunk (${chunkPattern})`).toBe(true);
      } else {
        expect(present, `${source}: manifest kaze ${rule?.bundle}, a chunk jos postoji u distu`).toBe(false);
      }
    }
  });

  it('nula evidencea u artefaktima: never-markeri, kanarinci i privatna imena datoteka', () => {
    const violations = runClassificationScan({ rootDir: ROOT }) as string[];
    expect(
      violations,
      'prekrsaji u dist/ ili dist-packs/ (ako je dist star, prvo `npx vite build` pa ponovi)',
    ).toEqual([]);
  });
});
