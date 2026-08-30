/**
 * Drift gard za verifikacijske dosjee citatnih specova (data/verification/citation-dossiers/**).
 *
 * Zasto postoji: 70 od 71 commitanog dosjea razlikovalo se od svjeze regeneracije. Naslovi stilova
 * bili su zapisani bez dijakritike ("FER numericko navodenje") jer su dosjei generirani prije nego
 * su specovi dobili tocne oznake, pa je ljudski verifikator citao izvjestaj koji vise ne opisuje
 * spec koji potpisuje. Verificirani specovi sami imaju gard (tests/citation-specs.test.ts), dosjei
 * ga nisu imali.
 *
 * Kad padne: `npm run citation-dossiers` pa commitaj regenerirani izlaz.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { renderCitationDossiers, type DossierTarget } from '../src/verification/citation-dossier';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import type { CitationSpec } from '../src/citations/citation-spec';
import type { SourceEntry } from '../src/profiles/profile-schema';

const SPEC_ROOT = resolve(process.cwd(), 'data/tools/citation-specs');
const OUT_DIR = resolve(process.cwd(), 'data/verification/citation-dossiers');

const readSpecDir = (dir: string): DossierTarget[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({
          fac: f.replace(/\.json$/, ''),
          spec: JSON.parse(readFileSync(join(dir, f), 'utf8')) as CitationSpec,
        }))
    : [];

const extractDir = join(SPEC_ROOT, 'extractions');
const extractions: Record<string, string> = {};
if (existsSync(extractDir)) {
  for (const f of readdirSync(extractDir).filter((f) => f.endsWith('.txt'))) {
    extractions[f.replace(/\.txt$/, '')] = readFileSync(join(extractDir, f), 'utf8');
  }
}

const fresh = renderCitationDossiers({
  targets: [...readSpecDir(join(SPEC_ROOT, 'drafts')), ...readSpecDir(join(SPEC_ROOT, 'verified'))],
  sources: SOURCE_REGISTRY as SourceEntry[],
  extractions,
});

/** core.autocrlf=true pretvara ove .md u CRLF na checkoutu; gard cuva SADRZAJ, ne zavrsetke redaka. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('citatni dosjei su u koraku sa specovima', () => {
  it('svaka commitana datoteka je identicna svjezem izracunu (inace: npm run citation-dossiers)', () => {
    for (const [rel, content] of Object.entries(fresh.files)) {
      const onDisk = normalize(readFileSync(resolve(process.cwd(), rel), 'utf8'));
      expect(onDisk, `${rel} je ustajao`).toBe(content);
    }
  });

  it('nema orphan dosjea (spec obrisan, izvjestaj ostao)', () => {
    const expected = new Set(
      Object.keys(fresh.files).map((rel) => rel.slice(rel.lastIndexOf('/') + 1)),
    );
    const actual = readdirSync(OUT_DIR).filter((f) => f.endsWith('.md'));
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  /**
   * Dosje nije samo izvjestaj nego i gard nad motorom: ako `formatFromSpec` prestane reproducirati
   * primjer iz sluzbenih uputa, to je regresija citatnog motora, ne kozmetika.
   *
   * ZATECENO (2026-08-19): tocno jedan blokator, `pravo`, i to NIJE renderer nego provenijencija.
   * Dva doslovna citata (clanak i pravni izvor) ne postoje u snapshotiranoj ekstrakciji
   * `data/tools/citation-specs/extractions/pravo.txt` - ni "Koske" ni "Regulatory Management" nema
   * u njoj, pa su prepisani iz drugog dokumenta ili iz dijela koji ekstrakcija ne pokriva. Spec je
   * pritom `verified`, sto znaci da je covjek potpisao citat koji se ne moze naci na lokatoru.
   *
   * ZATVORENO (2026-08-31): blokatora je NULA, pa je popis prazan. `pravo` je rijesen, i to ne
   * prepisivanjem citata nego popravkom EKSTRAKCIJE: citat je cijelo vrijeme bio u izvoru, ali ga
   * isjecak nije sadrzavao. Tri su kvara to zajedno uzrokovala:
   *   - `pdftotext` bez `-enc UTF-8` brisao je hrvatska slova, pa se citat nije mogao upariti;
   *   - kapa je radila `break` na prvom prevelikom bloku i odbacivala SVE preostale;
   *   - prvenstvo nije poznavalo U+2212 (MINUS SIGN), kojim izvori pisu natuknice, pa ulomak koji
   *     NOSI citat nije dobivao prednost i kapa ga je odrezala (pfri ima 60.844 znaka ulomaka na
   *     kapu od 20.000, dakle prolazi tek trecina).
   *
   * Prazan popis je sada NAJSTROZI moguci: svaki blokator, i stari i nov, rusi test. Ako se ikad
   * mora vratiti imenovani izuzetak, uz njega ide i razlog, kao sto je ovdje stajao za `pravo`.
   */
  it('nema NIJEDNOG blokatora', () => {
    expect(fresh.blockers).toEqual([]);
  });

  it('pokriva sve specove i nije prazan (sanity)', () => {
    expect(fresh.rows.length).toBeGreaterThan(60);
    expect(fresh.rows.filter((r) => r.status === 'verified').length).toBeGreaterThan(60);
  });
});
