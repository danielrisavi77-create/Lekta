/**
 * EVAL SLUCAJEVI ZA `katedra-lite`: drugi izlaz iste povratne veze.
 *
 * Zapis kvara (`tool-feedback.ts`) kaze sto je pokvareno. Eval slucaj kaze kako se zna da je
 * OSTALO popravljeno. Ciljani skill mjeri PONASANJE MODELA, ne skripte: skripte ondje pokriva
 * vlastiti test skup, a `evals.json` pita slijedi li model svoj `SKILL.md` kad mu alat vrati krivo.
 *
 * ZATO SU OCEKIVANJA PISANA O MODELU, NE O ALATU. Kvar 141 se ne popravlja time da model prepozna
 * numericko citiranje, nego time da NE PRENESE dvadeset laznih nalaza kao istinu o radu. Alat se
 * popravlja zakrpom; eval cuva da se u medjuvremenu ne laze.
 *
 * GRANICA. Slucaj nosi upit, ocekivanje i IME dokumenta; dokument putuje kao datoteka, uz izricitu
 * napomenu da je sintetski testni ulaz i da iz njega NE SMIJU nastati fakultetska pravila. Smjer
 * istine o pravilima ostaje Lekta -> Katedra i ovim se ne mijenja: dokument je ulaz za mjerenje
 * ponasanja, nikad izvor propisa.
 */
import type { ComparisonRow } from './tool-comparison';
import { isSupported, type DefectClass } from './tool-feedback';

/** Oblik koji `katedra-lite/evals/evals.json` vec cita; nista se ne izmislja. */
export interface EvalCase {
  id: number;
  prompt: string;
  files?: string[];
  expected_output: string;
  expectations: string[];
}

export interface EvalClass {
  /** Veze slucaj uz kvar iz `KVAROVI`; bez postojeceg kvara slucaj ne izlazi. */
  defectId: string;
  prompt: string;
  expected_output: string;
  expectations: readonly string[];
  /** Imena commitanih fixtura koje slucaj treba, bez staze; staza se slaze pri izvozu. */
  fixtures: readonly string[];
}

export interface RenderedEvals {
  cases: EvalCase[];
  /** Slucajevi koji su ispali, i zasto: kvar ne postoji ili ga mjerenje vise ne podupire. */
  skipped: { defectId: string; why: string }[];
  /** Fixture koje treba isporuciti uz slucajeve, bez ponavljanja. */
  fixtures: string[];
}

/** Staza kakvu ciljani skill upisuje u `files`, racunata od korijena tog skilla. */
export function evalFilePath(fixture: string): string {
  return `evals/files/${fixture}`;
}

/**
 * Slucaj izlazi SAMO ako njegov kvar postoji u katalogu I ako ga mjerenje jos podupire.
 *
 * Time eval ne moze nadzivjeti kvar koji cuva. To nije kozmetika: eval koji testira popravljeno
 * ponasanje i dalje prolazi, pa izgleda kao pokrice, a zapravo vise ne cuva nista, i sljedeca
 * regresija prodje ispod njega.
 */
export function renderEvalCases(
  classes: readonly EvalClass[],
  defects: readonly DefectClass[],
  rows: readonly ComparisonRow[],
  startAfter: number,
): RenderedEvals {
  const cases: EvalCase[] = [];
  const skipped: RenderedEvals['skipped'] = [];
  const fixtures = new Set<string>();

  let id = startAfter;
  for (const c of classes) {
    const kvar = defects.find((d) => d.id === c.defectId);
    if (!kvar) {
      skipped.push({ defectId: c.defectId, why: 'kvar s tim identitetom ne postoji u katalogu' });
      continue;
    }
    if (!isSupported(kvar, rows)) {
      skipped.push({ defectId: c.defectId, why: 'mjerenje vise ne podupire kvar koji slucaj cuva' });
      continue;
    }
    id += 1;
    for (const f of c.fixtures) fixtures.add(f);
    cases.push({
      id,
      prompt: c.prompt,
      files: c.fixtures.map(evalFilePath),
      expected_output: c.expected_output,
      expectations: [...c.expectations],
    });
  }

  return { cases, skipped, fixtures: [...fixtures].sort() };
}
