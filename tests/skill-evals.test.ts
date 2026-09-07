/**
 * GARD NAD EVAL SLUCAJEVIMA ZA `katedra-lite` (`docs/generated/skill-evals.json`).
 *
 * Tri stvari koje se ovdje cuvaju:
 *
 * OBLIK koji ciljani `evals.json` cita (`id`, `prompt`, `files`, `expected_output`, `expectations`).
 * Fragment koji se ne da spojiti jednak je fragmentu kojega nema, a spajanje se radi na drugoj strani
 * gdje ga nas gate ne vidi.
 *
 * VEZA UZ KVAR. Eval koji nadzivi kvar koji cuva i dalje prolazi, pa izgleda kao pokrice a ne cuva
 * nista. Zato svaki slucaj mora imati kvar u katalogu, i taj kvar mora biti potkrijepljen mjerenjem.
 *
 * GRANICA. Dokumenti se SMIJU slati (odluka vlasnika 2026-09-07), ali sam JSON i dalje ne smije
 * nositi tekst rada: upit i ocekivanja pisu se o ponasanju modela, ne prepisuju iz dokumenta.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../src/repair/zip-codec';
import { EVALI } from '../src/corpus/eval-catalog';
import { KVAROVI } from '../src/corpus/defect-catalog';
import { evalFilePath, renderEvalCases, type EvalCase } from '../src/corpus/tool-evals';
import type { ComparisonRow } from '../src/corpus/tool-comparison';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRAGMENT = join(ROOT, 'docs', 'generated', 'skill-evals.json');
const USPOREDBA = join(ROOT, 'docs', 'generated', 'skill-compare.json');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'docx-authored');

interface Fragment {
  schemaVersion: number;
  skill_name: string;
  continuesFrom: number;
  evals: EvalCase[];
  files: string[];
  generatedFromCommit?: string;
}

const f = JSON.parse(readFileSync(FRAGMENT, 'utf8')) as Fragment;
const redci = (JSON.parse(readFileSync(USPOREDBA, 'utf8')) as { rows: ComparisonRow[] }).rows;

describe('eval slucajevi: oblik koji druga strana cita', () => {
  it('fragment nosi ime skilla, verziju i provenijenciju', () => {
    expect(f.skill_name).toBe('katedra-lite');
    expect(f.schemaVersion).toBe(1);
    expect(f.generatedFromCommit).toBeTruthy();
  });

  it('svaki slucaj ima sva obavezna polja i neprazna ocekivanja', () => {
    expect(f.evals.length).toBeGreaterThan(0);
    for (const c of f.evals) {
      expect(Number.isInteger(c.id), String(c.id)).toBe(true);
      expect(c.prompt.trim().length, String(c.id)).toBeGreaterThan(20);
      expect(c.expected_output.trim().length, String(c.id)).toBeGreaterThan(40);
      expect(c.expectations.length, String(c.id)).toBeGreaterThanOrEqual(2);
      for (const e of c.expectations) expect(e.trim().length).toBeGreaterThan(10);
    }
  });

  it('id-jevi su jedinstveni i nastavljaju se na zauzeti raspon', () => {
    const ids = f.evals.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBe(f.continuesFrom + 1);
    for (let i = 1; i < ids.length; i += 1) expect(ids[i]).toBe(ids[i - 1] + 1);
  });

  /**
   * Slucaj bez dokumenta nije eval nego tvrdnja. Provjerava se i da staza ima oblik koji ciljani
   * skill razrjesava od SVOG korijena, jer kriva staza pada tek ondje, gdje nas gate ne gleda.
   */
  it('svaki imenovan dokument postoji kao commitana fixtura', () => {
    const postoje = new Set(readdirSync(FIXTURES));
    expect(f.files.length).toBeGreaterThan(0);
    for (const staza of f.files) {
      expect(staza).toMatch(/^evals\/files\/[^/]+\.docx$/);
      expect(postoje.has(staza.replace('evals/files/', '')), staza).toBe(true);
    }
    for (const c of f.evals) for (const staza of c.files ?? []) expect(f.files).toContain(staza);
  });

  it('staza se racuna, ne prepisuje', () => {
    expect(evalFilePath('a.docx')).toBe('evals/files/a.docx');
  });
});

describe('eval slucajevi: veza uz kvar koji cuvaju', () => {
  it('svaki slucaj ima kvar u katalogu', () => {
    const ids = new Set(KVAROVI.map((k) => k.id));
    for (const e of EVALI) expect(ids, e.defectId).toContain(e.defectId);
  });

  it('zapisano se poklapa s onim sto se izvede iz kataloga i mjerenja', () => {
    const svjeze = renderEvalCases(EVALI, KVAROVI, redci, f.continuesFrom);
    expect(svjeze.skipped).toEqual([]);
    expect(svjeze.cases).toEqual(f.evals);
    expect(svjeze.fixtures.map(evalFilePath)).toEqual(f.files);
  });

  /**
   * Eval ne smije nadzivjeti kvar koji cuva. Provjerava se OBA razloga ispadanja, jer je drugi
   * (mjerenje vise ne podupire) onaj koji se dogodi kad druga strana kvar popravi.
   */
  it('slucaj ispada kad kvara nema ili kad ga mjerenje vise ne podupire', () => {
    const bezKvara = renderEvalCases(EVALI, [], redci, 10);
    expect(bezKvara.cases).toEqual([]);
    expect(bezKvara.skipped).toHaveLength(EVALI.length);

    const bezRazilazenja = redci.map((r) => ({ ...r, ishod: 'nitko' as const }));
    const samoIzUsporedbe = KVAROVI.filter((k) => k.support.every((s) => s.kind === 'usporedba'));
    const cuvani = EVALI.filter((e) => samoIzUsporedbe.some((k) => k.id === e.defectId));
    expect(cuvani.length).toBeGreaterThan(0);
    const popravljeno = renderEvalCases(cuvani, samoIzUsporedbe, bezRazilazenja, 10);
    expect(popravljeno.cases).toEqual([]);
  });
});

describe('eval slucajevi: granica prema tekstu rada', () => {
  /**
   * Dokumenti se salju, ali JSON i dalje ne smije nositi njihove recenice. Isti gard kao kod izvoza
   * kvarova, uz istu negativnu kontrolu, jer tvrdnja bez nje ne razlikuje cist JSON od pokvarenog
   * citaca odlomaka.
   */
  async function odlomciKorpusa(): Promise<string[]> {
    const out: string[] = [];
    for (const ime of readdirSync(FIXTURES).filter((x) => x.toLowerCase().endsWith('.docx'))) {
      const zip = await readZip(new Uint8Array(readFileSync(join(FIXTURES, ime))));
      for (const dio of ['word/document.xml', 'word/footnotes.xml']) {
        const bytes = zip.find((e) => e.name === dio)?.data;
        if (!bytes) continue;
        const xml = new TextDecoder().decode(bytes);
        for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
          const t = (p.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g) ?? [])
            .map((x) => x.replace(/^<w:t\b[^>]*>/, '').replace(/<\/w:t>$/, ''))
            .join('')
            .trim();
          if (t.length >= 40) out.push(t);
        }
      }
    }
    return out;
  }

  it('nijedan odlomak nijedne fixture nije u fragmentu', async () => {
    const tekst = readFileSync(FRAGMENT, 'utf8');
    const odlomci = await odlomciKorpusa();
    expect(odlomci.length, 'nijedan odlomak nije procitan; gard bi bio vakuumski').toBeGreaterThan(200);
    expect(odlomci.filter((t) => tekst.includes(t)).slice(0, 3)).toEqual([]);
    // Negativna kontrola: podmetnut odlomak ista provjera mora naci.
    expect(odlomci.filter((t) => `${tekst}\n${odlomci[0]}`.includes(t)).length).toBeGreaterThan(0);
  });
});
