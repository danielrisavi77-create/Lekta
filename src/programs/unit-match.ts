/**
 * Uparivanje sastavnica iz Upisnika s nasim jedinicama iz kataloga (P1-6 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Upisnik ima 131 pojedinacnog izvoditelja, katalog 134 jedinice, a imena se pisu razlicito
 * ("Sveuciliste u Rijeci, Tehnicki fakultet" naspram jedinice `riteh` = "Tehnicki fakultet").
 * Ovo je PRIJEDLOG, ne odluka: modul nikad nista ne upisuje u registar programa, nego svakom
 * izvoditelju pridruzuje najbolju jedinicu, razinu pouzdanosti, RAZLOG i alternative, pa covjek
 * potvrdjuje. Ista disciplina kao kod `ruleEntries`: stroj draftira, covjek verificira.
 *
 * DVIJE STRUKTURNE CINJENICE IZVORA koje se ovdje tumace (parser ih namjerno cuva sirove):
 *   1. `$` razdvaja VISE izvoditelja kod zdruzenih programa (44 od 1312 programa ih ima vise).
 *   2. Zarez u imenu NIJE pouzdana granica "ustanova, sastavnica": "Istarsko veleuciliste, Pula"
 *      iza zareza ima MJESTO, ne sastavnicu. Zato se ne cijepa naslijepo nego se svaki segment
 *      isprobava i protiv imena jedinice i protiv imena ustanove.
 */

export interface CatalogUnitInput {
  unitId: string;
  unitName: string;
  institutionName: string;
}

export type MatchConfidence = 'exact' | 'strong' | 'weak';

export interface UnitMatch {
  unitId: string;
  confidence: MatchConfidence;
  reason: string;
}

export interface MatchProposal {
  /** Pojedinacni izvoditelj (nakon rastavljanja po `$`). */
  executor: string;
  match: UnitMatch | null;
  /** Druge jedinice koje su bile blizu; covjeku sluze da vidi je li izbor bio tijesan. */
  alternatives: string[];
  /** Broj programa u Upisniku koje taj izvoditelj izvodi (prioritet za ljudski pregled). */
  programCount: number;
}

export interface MatchReport {
  proposals: MatchProposal[];
  /** Jedinice iz naseg kataloga kojima nijedan izvoditelj nije pridruzen. */
  unitsWithoutExecutor: string[];
  summary: {
    executorCount: number;
    unitCount: number;
    byConfidence: Record<MatchConfidence | 'none', number>;
    unitsMatched: number;
    unitsWithoutExecutor: number;
    /** Programi ciji izvoditelj nije uparen ni s jednom jedinicom (nasa slijepa tocka). */
    programsWithoutUnit: number;
  };
}

/** Hrvatska dijakritika u ASCII, mala slova, bez interpunkcije i viska razmaka. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/č|ć/g, 'c')
    .replace(/ž/g, 'z')
    .replace(/š/g, 's')
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rastavlja celiju izvoditelja na pojedinacne izvoditelje (zdruzeni programi ih imaju vise). */
export function splitExecutors(cell: string): string[] {
  return cell
    .split('$')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Segmenti imena; svaki se isprobava i kao ustanova i kao sastavnica.
 *
 * Razdvaja se i po zarezu i po crtici s razmacima, jer Upisnik koristi oba oblika:
 * "Sveuciliste u Zagrebu, Fakultet politickih znanosti" i
 * "Sveuciliste u Splitu - Sveucilisni odjel zdravstvenih studija". Bez crtice je sedam
 * programa Splita ostajalo neupareno.
 */
function segments(executor: string): string[] {
  return executor
    .split(/,| - /)
    .map((s) => normalizeName(s))
    .filter(Boolean);
}

function tokens(value: string): Set<string> {
  // Rijeci koje se ponavljaju u gotovo svakom imenu ne nose signal i samo dizu lazne poklapanja.
  const STOP = new Set(['u', 'i', 'za', 'sveuciliste', 'veleuciliste', 'fakultet', 'odjel', 'studij', 'the', 'of']);
  return new Set(normalizeName(value).split(' ').filter((t) => t.length > 2 && !STOP.has(t)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Bira najbolju jedinicu za jednog izvoditelja.
 *
 * Ljestvica je namjerno konzervativna: `exact` trazi da se poklope I sastavnica I ustanova, jer
 * isti naziv sastavnice ("Ekonomski fakultet", "Pravni fakultet") postoji na vise sveucilista i
 * poklapanje samo po njemu bi tiho spojilo krive ustanove.
 */
export function matchExecutor(executor: string, units: CatalogUnitInput[]): { match: UnitMatch | null; alternatives: string[] } {
  const segs = segments(executor);
  const whole = normalizeName(executor);
  const execTokens = tokens(executor);

  /**
   * GOLI NAZIV USTANOVE nije sastavnica. "Sveuciliste Josipa Jurja Strossmayera u Osijeku" bez
   * nastavka odnosi se na cijelo sveuciliste; preklapanje rijeci ga inace zalijepi na prvi odjel
   * ciji puni naziv sadrzi isto sveuciliste (izmjereno: 0.80 prema `biolos`). Takav izvoditelj
   * mora ostati NEUPAREN, uz alternative, da odluku donese covjek.
   */
  const bareInstitution = units.find((u) => normalizeName(u.institutionName) === whole);
  if (bareInstitution) {
    const siblings = units.filter((u) => u.institutionName === bareInstitution.institutionName);
    if (siblings.length > 1) {
      return { match: null, alternatives: siblings.slice(0, 3).map((u) => u.unitId) };
    }
    // Samostalna ustanova (veleuciliste bez sastavnica) cesto ima jedinicu istog imena; tada se
    // poklapaju OBA imena i to je `exact`, ne slabiji nalaz.
    const sameName = normalizeName(bareInstitution.unitName) === whole;
    return {
      match: {
        unitId: bareInstitution.unitId,
        confidence: sameName ? 'exact' : 'strong',
        reason: sameName
          ? 'ustanova s jednom jedinicom istog naziva'
          : 'ustanova u katalogu ima tocno jednu jedinicu',
      },
      alternatives: [],
    };
  }

  let best: { unit: CatalogUnitInput; confidence: MatchConfidence; reason: string; score: number } | null = null;
  const near: Array<{ unitId: string; score: number }> = [];

  for (const unit of units) {
    const unitName = normalizeName(unit.unitName);
    const institutionName = normalizeName(unit.institutionName);
    const unitHit = segs.includes(unitName) || (unitName.length > 6 && whole.includes(unitName));
    const institutionHit =
      segs.includes(institutionName) || (institutionName.length > 6 && whole.includes(institutionName));

    let confidence: MatchConfidence | null = null;
    let reason = '';
    let score = 0;

    if (unitHit && institutionHit) {
      confidence = 'exact';
      reason = 'poklapaju se i sastavnica i ustanova';
      score = 1;
    } else if (unitHit) {
      confidence = 'strong';
      reason = 'poklapa se naziv sastavnice, ustanova nije potvrdjena';
      score = 0.8;
    } else if (institutionHit && units.filter((u) => u.institutionName === unit.institutionName).length === 1) {
      confidence = 'strong';
      reason = 'poklapa se ustanova koja u katalogu ima tocno jednu jedinicu';
      score = 0.75;
    } else {
      const overlap = jaccard(execTokens, tokens(`${unit.institutionName} ${unit.unitName}`));
      if (overlap >= 0.5) {
        confidence = 'weak';
        reason = `preklapanje rijeci ${overlap.toFixed(2)}`;
        score = overlap;
      } else if (overlap >= 0.3) {
        near.push({ unitId: unit.unitId, score: overlap });
      }
    }

    if (confidence && (!best || score > best.score)) {
      if (best) near.push({ unitId: best.unit.unitId, score: best.score });
      best = { unit, confidence, reason, score };
    } else if (confidence) {
      near.push({ unitId: unit.unitId, score });
    }
  }

  const alternatives = near
    .sort((a, b) => b.score - a.score)
    .map((n) => n.unitId)
    .filter((id, i, all) => all.indexOf(id) === i && id !== best?.unit.unitId)
    .slice(0, 3);

  return {
    match: best ? { unitId: best.unit.unitId, confidence: best.confidence, reason: best.reason } : null,
    alternatives,
  };
}

/** Gradi prijedlog uparivanja za sve izvoditelje iz harvestiranih redaka. */
export function buildMatchReport(
  rows: Array<{ izvoditelj: string }>,
  units: CatalogUnitInput[],
): MatchReport {
  const programCount = new Map<string, number>();
  for (const row of rows) {
    for (const executor of splitExecutors(row.izvoditelj)) {
      programCount.set(executor, (programCount.get(executor) ?? 0) + 1);
    }
  }

  const proposals: MatchProposal[] = [...programCount.keys()]
    .sort((a, b) => a.localeCompare(b, 'hr'))
    .map((executor) => {
      const { match, alternatives } = matchExecutor(executor, units);
      return { executor, match, alternatives, programCount: programCount.get(executor) ?? 0 };
    });

  const matchedUnits = new Set(proposals.map((p) => p.match?.unitId).filter((id): id is string => id != null));
  const unitsWithoutExecutor = units
    .map((u) => u.unitId)
    .filter((id) => !matchedUnits.has(id))
    .sort();

  const byConfidence: Record<MatchConfidence | 'none', number> = { exact: 0, strong: 0, weak: 0, none: 0 };
  for (const p of proposals) byConfidence[p.match?.confidence ?? 'none'] += 1;

  const programsWithoutUnit = rows.filter((row) =>
    splitExecutors(row.izvoditelj).every((executor) => {
      const proposal = proposals.find((p) => p.executor === executor);
      return proposal?.match == null;
    }),
  ).length;

  return {
    proposals,
    unitsWithoutExecutor,
    summary: {
      executorCount: proposals.length,
      unitCount: units.length,
      byConfidence,
      unitsMatched: matchedUnits.size,
      unitsWithoutExecutor: unitsWithoutExecutor.length,
      programsWithoutUnit,
    },
  };
}
