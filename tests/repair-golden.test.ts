/**
 * Golden harness za Repair Engine (pipeline korak K2; CLAUDE.md "Parser: ne diraj
 * bez golden testa"). Repair engine je do sada imao samo jedinicne testove; ovaj
 * harness snima BASELINE ponasanja svih fixera nad realnim i sintetickim .docx
 * dokumentima, pa je OBAVEZAN GATE prije svakog novog fixera (K4-K6) i svake
 * izmjene postojecih: ako se ponasanje bilo kojeg fixera promijeni, snapshot pada.
 *
 * Sto snima (deterministicki, stabilno, NE sirovi bajtovi):
 *   - params izvedeni IZ PROFILA (realni fixturi) ili fiksni (sinteticki),
 *   - applied / changelog (before -> after labeli) / skipped,
 *   - noOpBitIdentican: je li rezultat === ulaz (referencijalno; jamstvo koje
 *     applyFixers daje kad nijedan popravak nije primijenjen),
 *   - markeri izvuceni iz IZLAZNOG document.xml i styles.xml (docDefaults, Normal,
 *     sve sectPr sekcije, brojaci izravnog formatiranja) da se uhvate XML regresije
 *     koje se ne vide u changelog labelima.
 *
 * Tvrdi invarijanti (osim snapshota):
 *   - idempotencija: ponovna primjena istog popravka na vlastiti izlaz je no-op
 *     (bit-identicna), jer patchTagAttributes ne mijenja vec postignutu vrijednost.
 *   - bit-identican no-op: popravak koji nema sto promijeniti vraca ULAZNE bajtove.
 *
 * Kako snimiti/obnoviti baseline (vidi docs/GOLDEN.md): npm test -- -u
 *   (snapshot se smije mijenjati SAMO uz svjesnu, recenziranu promjenu ponasanja).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyFixers, FIXER_IDS, type FixerId, type FixerRequest } from '../src/repair/apply-fixers';
import { readZip } from '../src/repair/zip-codec';
import { paramsForCheck } from '../src/ui/repair-items';
import { resolveProfile } from '../src/analysis/golden-entry';
import { singleSectionDocx, multiSectionDocx } from './helpers/synthetic-docx';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'fixtures', 'docx');

const DEEP_CAPABLE: ReadonlySet<FixerId> = new Set<FixerId>([
  'font-fixer',
  'line-spacing-fixer',
  'alignment-fixer',
]);

// Fiksni ciljevi za sinteticke dokumente (bez profila). Namjerno se razlikuju od
// polaznih vrijednosti u synthetic-docx.ts da svaki fixer STVARNO primijeni izmjenu
// (osim gdje testiramo no-op putanju eksplicitno).
const SYNTHETIC_PARAMS: Record<FixerId, Record<string, unknown>> = {
  'margins-fixer': { top: 3.0, right: 3.0, bottom: 3.0, left: 3.0 },
  'paper-size-fixer': { w: 21.0, h: 29.7 },
  'font-fixer': { fontName: 'Times New Roman', fontSizePt: 12 },
  'line-spacing-fixer': { multiplier: 1.5 },
  'alignment-fixer': { val: 'both' },
};

/** Ciljani params po fixeru IZ PROFILA (isti izvor kao zivi repair-items.ts). */
function paramsForFixer(fixerId: FixerId, profile: unknown): Record<string, unknown> | null {
  switch (fixerId) {
    case 'margins-fixer':
      return paramsForCheck('margins', profile);
    case 'paper-size-fixer':
      return paramsForCheck('paper-size', profile);
    case 'font-fixer': {
      const f = paramsForCheck('font', profile);
      const s = paramsForCheck('font-size', profile);
      return f || s ? { ...(f || {}), ...(s || {}) } : null;
    }
    case 'line-spacing-fixer':
      return paramsForCheck('line-spacing', profile);
    case 'alignment-fixer':
      return paramsForCheck('justify', profile);
    default:
      return null;
  }
}

/** params + deep zastavica za deep-capable fixere (kao repair-panel.ts). */
function withDeep(fixerId: FixerId, params: Record<string, unknown>, deep: boolean): Record<string, unknown> {
  return deep && DEEP_CAPABLE.has(fixerId) ? { ...params, deep: true } : params;
}

// === Izvlacenje stabilnih markera iz izlaznog docx-a ===

function attr(tag: string | undefined, name: string): string | null {
  if (!tag) return null;
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function firstTag(xml: string, tagName: string): string | undefined {
  return xml.match(new RegExp(`<${tagName}\\b[^>]*/?>`))?.[0];
}

function docDefaultsMarkers(stylesXml: string) {
  const dd = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)?.[0] ?? '';
  const rFonts = firstTag(dd, 'w:rFonts');
  const sz = firstTag(dd, 'w:sz');
  return { ascii: attr(rFonts, 'w:ascii'), hAnsi: attr(rFonts, 'w:hAnsi'), sz: attr(sz, 'w:val') };
}

function normalStyleMarkers(stylesXml: string) {
  const normal = stylesXml.match(/<w:style\b[^>]*w:styleId="Normal"[^>]*>[\s\S]*?<\/w:style>/)?.[0] ?? '';
  const pPr = normal.replace(/<w:rPr\b[\s\S]*?<\/w:rPr>/, '');
  const spacing = firstTag(pPr, 'w:spacing');
  const jc = firstTag(pPr, 'w:jc');
  return { line: attr(spacing, 'w:line'), lineRule: attr(spacing, 'w:lineRule'), jc: attr(jc, 'w:val') };
}

function sectPrMarkers(documentXml: string) {
  const sects = documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) ?? [];
  return sects.map((s) => {
    const pgSz = firstTag(s, 'w:pgSz');
    const pgMar = firstTag(s, 'w:pgMar');
    const pgNum = firstTag(s, 'w:pgNumType');
    return {
      pgSz: pgSz ? { w: attr(pgSz, 'w:w'), h: attr(pgSz, 'w:h') } : null,
      pgMar: pgMar
        ? {
            top: attr(pgMar, 'w:top'),
            right: attr(pgMar, 'w:right'),
            bottom: attr(pgMar, 'w:bottom'),
            left: attr(pgMar, 'w:left'),
          }
        : null,
      pgNumType: pgNum ? { fmt: attr(pgNum, 'w:fmt'), start: attr(pgNum, 'w:start') } : null,
    };
  });
}

/** Brojaci IZRAVNOG formatiranja u tijelu (mjeri ucinak deep ciscenja). */
function directFormattingCounts(documentXml: string) {
  const body = documentXml.match(/<w:body>[\s\S]*<\/w:body>/)?.[0] ?? documentXml;
  return {
    runFonts: (body.match(/<w:rFonts\b[^>]*w:ascii=/g) ?? []).length,
    runSz: (body.match(/<w:sz\b[^>]*w:val=/g) ?? []).length,
    directLine: (body.match(/<w:spacing\b[^>]*w:line=/g) ?? []).length,
    directLeftJc: (body.match(/<w:jc\b[^>]*w:val="(left|start)"/g) ?? []).length,
  };
}

async function extractMarkers(bytes: Uint8Array) {
  const entries = await readZip(bytes);
  const dec = new TextDecoder();
  const doc = entries.find((e) => e.name === 'word/document.xml');
  const styles = entries.find((e) => e.name === 'word/styles.xml');
  const documentXml = doc ? dec.decode(doc.data) : '';
  const stylesXml = styles ? dec.decode(styles.data) : '';
  return {
    docDefaults: docDefaultsMarkers(stylesXml),
    normal: normalStyleMarkers(stylesXml),
    sectPr: sectPrMarkers(documentXml),
    directFormatting: directFormattingCounts(documentXml),
  };
}

// === Fixture izvori ===

function discoverRealFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((n) => n.toLowerCase().endsWith('.docx'))
    .sort();
}

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

interface Case {
  name: string;
  bytes: Uint8Array;
  paramsFor: (fixerId: FixerId) => Record<string, unknown> | null;
}

async function buildCases(): Promise<Case[]> {
  const cases: Case[] = [];
  for (const fileName of discoverRealFixtures()) {
    const profileId = fixtureProfileId(fileName);
    if (!profileId) continue;
    const profile = resolveProfile(profileId);
    const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, fileName)));
    cases.push({ name: fileName, bytes, paramsFor: (id) => paramsForFixer(id, profile) });
  }
  cases.push({ name: 'synthetic-single-section', bytes: await singleSectionDocx(), paramsFor: (id) => SYNTHETIC_PARAMS[id] });
  cases.push({ name: 'synthetic-multi-section', bytes: await multiSectionDocx(), paramsFor: (id) => SYNTHETIC_PARAMS[id] });
  return cases;
}

/** Jedan popravak nad jednim dokumentom: strukturiran, deterministican rezultat. */
async function runOne(bytes: Uint8Array, request: FixerRequest) {
  const result = await applyFixers(bytes, request ? [request] : []);
  const applied = result.changelog.length > 0;
  return {
    request,
    result,
    snapshot: {
      applied,
      changelog: result.changelog.map((c) => ({ before: c.beforeLabel, after: c.afterLabel })),
      skipped: result.skipped,
      noOpBitIdentican: result.docxBytes === bytes,
      markers: applied ? await extractMarkers(result.docxBytes) : null,
    },
  };
}

describe('Repair golden harness', () => {
  it('baseline: svi fixeri x svi dokumenti (shallow + deep + kombinirano)', async () => {
    const cases = await buildCases();
    const out: Record<string, unknown> = {};

    for (const c of cases) {
      const perFixture: Record<string, unknown> = {};

      for (const fixerId of FIXER_IDS) {
        const params = c.paramsFor(fixerId);
        if (!params) {
          perFixture[fixerId] = { params: 'nema-cilja-u-profilu' };
          continue;
        }
        // Shallow
        const shallow = await runOne(c.bytes, { ruleId: `${fixerId}-rule`, fixerId, params: withDeep(fixerId, params, false) });
        perFixture[fixerId] = { params, ...shallow.snapshot };

        // Deep (samo deep-capable)
        if (DEEP_CAPABLE.has(fixerId)) {
          const deep = await runOne(c.bytes, { ruleId: `${fixerId}-rule`, fixerId, params: withDeep(fixerId, params, true) });
          perFixture[`${fixerId}(deep)`] = { params: withDeep(fixerId, params, true), ...deep.snapshot };
        }
      }

      // Kombinirani "uskladi sve" prolaz: svi fixeri s ciljem odjednom (deep za capable),
      // dokazuje da se document.xml (deep) i styles.xml (stilski patch) ne gaze medjusobno.
      const combinedRequests: FixerRequest[] = FIXER_IDS.map((fixerId) => {
        const params = c.paramsFor(fixerId);
        return params ? { ruleId: `${fixerId}-rule`, fixerId, params: withDeep(fixerId, params, true) } : null;
      }).filter((r): r is FixerRequest => r !== null);
      const combined = await applyFixers(c.bytes, combinedRequests);
      perFixture['__kombinirano'] = {
        applied: combined.changelog.length,
        changelog: combined.changelog.map((c2) => ({ before: c2.beforeLabel, after: c2.afterLabel })),
        skipped: combined.skipped,
        markers: combined.changelog.length > 0 ? await extractMarkers(combined.docxBytes) : null,
      };

      out[c.name] = perFixture;
    }

    expect(out).toMatchSnapshot();
  }, 60000);

  it('bit-identican no-op: popravak bez promjene vraca ULAZNE bajtove', async () => {
    const bytes = await singleSectionDocx();
    // Margine su vec 2,5 cm (1417 twips) u sintetickom dokumentu -> cilj 2,5 cm je no-op.
    const result = await applyFixers(bytes, [
      { ruleId: 'margins-rule', fixerId: 'margins-fixer', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } },
    ]);
    expect(result.changelog).toHaveLength(0);
    expect(result.docxBytes).toBe(bytes); // ista referenca, nista nije rekomprimirano
    expect(result.skipped).toEqual(['margins-rule']);
  });

  it('idempotencija: ponovna primjena istog popravka je bit-identican no-op', async () => {
    const bytes = await singleSectionDocx();
    for (const fixerId of FIXER_IDS) {
      const params = SYNTHETIC_PARAMS[fixerId];
      for (const deep of DEEP_CAPABLE.has(fixerId) ? [false, true] : [false]) {
        const req: FixerRequest = { ruleId: `${fixerId}-rule`, fixerId, params: withDeep(fixerId, params, deep) };
        const first = await applyFixers(bytes, [req]);
        if (first.changelog.length === 0) continue; // fixer nista nije promijenio na sintetickom, preskoci
        const second = await applyFixers(first.docxBytes, [req]);
        // Drugi prolaz nema sto promijeniti -> changelog prazan -> vraca prvi izlaz bit-identican.
        expect(second.changelog, `${fixerId} deep=${deep} mora biti idempotentan`).toHaveLength(0);
        expect(second.docxBytes).toBe(first.docxBytes);
      }
    }
  });
});
