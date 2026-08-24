/**
 * Klasifikacijski manifest (faza A plana zastite baze pravila): data/classification.json
 * je jedini izvor istine o tome sto smije u javni browser bundle. Ovaj test cuva:
 *  1. pokrivenost: svaka pracena datoteka u data/src/scripts/supabase/docs ima razred,
 *  2. mrtva pravila: pravilo koje ne pogadja nijednu datoteku je trulez i pada,
 *  3. kanarince: svaki kanarinac iz manifesta POSTOJI u svom izvoru (tiho izbrisan
 *     kanarinac bi post-build sken pretvorio u vakuumski prolaz),
 *  4. negativne kontrole: sigurnosno kriticne presude su prikovane (drafts forbidden,
 *     heavy zasad allowed...), pa gutanje manifesta ne moze proci neopazeno.
 * Enforcement nad bundleom radi scripts/security/classification-guard.mjs (vite plugin),
 * a nad emitiranim datotekama scripts/verify-dist-classification.mjs.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore .mjs modul bez deklaracija; tsconfig include je samo src pa tsc ovo ne gleda
import { loadManifest, classifyPath, compilePattern } from '../scripts/security/classification.mjs';

// __dirname preko vitest CJS shima; happy-dom okolina kvari new URL(import.meta.url)
const ROOT = resolve(__dirname, '..');
const COVERED_TOP_DIRS = ['data', 'src', 'scripts', 'supabase', 'docs', 'tests', 'public', 'prototype', 'reference'];
// korijenski *.html su Rollup entryji pa i oni moraju imati razred
const EXTRA_SCOPES = ['*.html'];

type Rule = { pattern: string; class: string; bundle: string; regex: RegExp };
const manifest = loadManifest(ROOT) as { rules: Rule[]; canaries: Array<{ value: string; mustExistIn: string; kind: string }> };

function trackedFiles(): string[] {
  // -co --exclude-standard: pracene I netracked datoteke (uz .gitignore), da
  // pokrivenost vrijedi i za tek dodane datoteke prije prvog commita
  const out = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard', '--', ...COVERED_TOP_DIRS, ...EXTRA_SCOPES], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

describe('klasifikacijski manifest', () => {
  const files = trackedFiles();

  it('svaki od pokrivenih top-level direktorija ima catch-all pravilo', () => {
    for (const dir of COVERED_TOP_DIRS) {
      expect(
        manifest.rules.some((r) => r.pattern === `${dir}/**`),
        `nedostaje catch-all pravilo za ${dir}/** (manifest je izgubio osnovni sloj)`,
      ).toBe(true);
    }
  });

  it('svaka pracena datoteka ima razred (nova staza bez razreda = svjesna odluka)', () => {
    const uncovered = files.filter((f) => classifyPath(f, manifest.rules) === null);
    expect(uncovered, `nepokrivene staze: ${uncovered.slice(0, 10).join(', ')}`).toEqual([]);
  });

  it('nema mrtvih pravila (pravilo koje nista ne pogadja je trulez manifesta)', () => {
    const dead = manifest.rules.filter((rule) => !files.some((f) => rule.regex.test(f)));
    expect(dead.map((r) => r.pattern)).toEqual([]);
  });

  it('svaki kanarinac postoji u svojoj izvornoj datoteci', () => {
    for (const canary of manifest.canaries) {
      const content = readFileSync(resolve(ROOT, canary.mustExistIn), 'utf8');
      expect(
        content.includes(canary.value),
        `kanarinac (${canary.kind}) izbrisan iz ${canary.mustExistIn}; vrati ga ili svjesno azuriraj manifest`,
      ).toBe(true);
    }
  });

  it('negativne kontrole: sigurnosno kriticne presude su prikovane', () => {
    const verdict = (path: string) => {
      const rule = classifyPath(path, manifest.rules);
      return rule ? `${rule.class}/${rule.bundle}` : null;
    };
    // privatni sloj nikad u bundle
    expect(verdict('data/profiles/fpzg/drafts/fpzg-drafts.json')).toBe('PROPRIETARY-DATA/forbidden');
    expect(verdict('data/verification/ledger.json')).toBe('PROPRIETARY-DATA/forbidden');
    expect(verdict('data/sources/source-registry.json')).toBe('PROPRIETARY-DATA/forbidden');
    expect(verdict('data/profiles/verified-profiles.json')).toBe('PROPRIETARY-DATA/derived');
    expect(verdict('data/generated/repair-params-by-profile.json')).toBe('SECURITY-SENSITIVE/forbidden');
    expect(verdict('src/profiles/drafts-runtime.ts')).toBe('PRIVATE-IP/forbidden');
    expect(verdict('src/verification/scored-value-binding.ts')).toBe('PRIVATE-IP/forbidden');
    expect(verdict('data/tools/citation-specs/extractions/bilo-sto.json')).toBe('PROPRIETARY-DATA/forbidden');
    // javne projekcije (trajne) i B3 flip bulk artefakata (2026-08-23)
    expect(verdict('data/profiles/verified-profiles-index.json')).toBe('PUBLIC/allowed');
    expect(verdict('data/profiles/verified-profiles-heavy.json')).toBe('PROPRIETARY-DATA/forbidden');
    expect(verdict('data/profiles/repair-map.json')).toBe('PROPRIETARY-DATA/forbidden');
    expect(verdict('src/ui/app.ts')).toBe('PUBLIC/allowed');
    expect(verdict('data/tools/citation-specs/verified/fpzg.json')).toBe('PUBLIC/allowed');
  });

  it('matcher semantika: ** preko segmenata, * unutar segmenta, zadnje pravilo vrijedi', () => {
    expect(compilePattern('data/profiles/*/drafts/**').test('data/profiles/efzg/drafts/efzg-doktorski.json')).toBe(true);
    expect(compilePattern('data/profiles/*/drafts/**').test('data/profiles/efzg/pod/drafts/x.json')).toBe(false);
    expect(compilePattern('src/**').test('src/ui/app.ts')).toBe(true);
    expect(compilePattern('data/**').test('src/ui/app.ts')).toBe(false);
  });
});
