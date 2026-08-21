/**
 * Projekcija ocjene PRIJE popravka: "sto ako odabrani popravci zatvore svoje provjere".
 *
 * Cist modul bez DOM-a (worker-safe: check-fixer-map prema src/repair ima samo `import type`).
 * Model je namjerno JEDNOSTRAN: flip samo DODAJE bodove (earned := max za pogodjene provjere),
 * regresije ne modelira. Zato:
 *   - prikaz smije tvrditi samo "do N (procjena)", nikad "najmanje N": regresija nakon stvarnog
 *     popravka postoji (detectPassRegressions + demotirana isporuka su ziva mreza),
 *   - `guaranteed` sloj je INTERNI (telemetrija projection_vs_recheck), ne za prikaz, dok
 *     mjerenja ne dokazu da auto sloj ne podbacuje,
 *   - nazivnik nakon popravka moze NARASTI (nemjerljivo postane mjerljivo), pa ni "do" nije
 *     strop u strogom smislu; copy mora nositi "procjena" i "potvrdjuje ponovna provjera".
 *
 * A0 UGOVOR: analyzeDocx racuna result.score PRIJE nego u checks gurne tipografski check (vidi
 * scoreFromChecks docblock), pa `current` iz OVOG modula nad result.checks moze biti nizi od
 * result.score. Potrosac za prikaz "sada" koristi result.score i klampa slojeve na >= njega.
 */
import { scoreFromChecks, type Check, type ScoreParts } from './checks';
import { classifyFixabilityById, type Fixability } from '../analysis/check-fixer-map';
import { stableCheckId } from './check-id-registry';

/** Minimalni oblik odabrane stavke popravka (podskup RepairableItem, bez UI ovisnosti). */
export interface SelectedRepairLike {
  checkIds?: readonly string[];
  fixerId?: string;
  requiresConfirmation?: boolean;
}

export interface ScoreProjection {
  /** Sirovo stanje IZ PROSLIJEDJENIH checks (moze se razlikovati od result.score, vidi A0). */
  current: ScoreParts;
  /** Samo auto-klasificirani ID-jevi odabranih stavki bez potvrde i bez deep-degradacije.
   *  INTERNO (telemetrija); prikaz v1 ovaj broj NE ispisuje. */
  guaranteed: ScoreParts;
  /** Svi ID-jevi svih odabranih stavki: "do N (procjena)". */
  optimistic: ScoreParts;
  /** Ima li odabir tvrdnji iznad guaranteed sloja (gradirano/assisted/uz potvrdu). */
  hasAssistedClaims: boolean;
}

/** Identitet provjere: stabilni id, s naslovnim fallbackom kao triage.ts (rucni fixturi bez id-a). */
function checkIdentity(c: Check): string | null {
  return c.id ?? stableCheckId(c.title);
}

/**
 * Flip: bodovana provjera (max>0, scored) koja NIJE 'pass' i ciji je identitet u skupu dobiva
 * earned := max. Nista se ne oduzima, pa su slojevi monotoni na sirovim sumama; Math.round je
 * monoton pa i na prikazu (susjedni slojevi smiju biti jednaki, pad je nemoguc).
 * Rubovi: warn s punim bodovima (manual.checks 3/3) je numericki no-op; unmeasurable (max 0)
 * i informativne ostaju netaknute i izvan nazivnika.
 */
function projectFlip(checks: readonly Check[], ids: ReadonlySet<string>): ScoreParts {
  let earned = 0;
  let max = 0;
  for (const c of checks) {
    if (!c || c.max <= 0) continue;
    max += c.max;
    const id = checkIdentity(c);
    const flips = c.scored && c.status !== 'pass' && id != null && ids.has(id);
    earned += flips ? c.max : c.earned;
  }
  return { earned, max, score: max ? Math.round((earned / max) * 100) : null };
}

/**
 * Projekcija za trenutno odabran skup stavki (ziva procjena u ledgeru).
 *
 * `opts.uncertainFixerIds`: fixeri cije jamstvo pada na "do" (npr. DEEP_CAPABLE skup kad je
 * dubinski preklopnik iskljucen: font/prored/poravnanje tada realno ne primaju). Pozivatelj
 * salje svoje stanje preklopnika; skup se ne seli ovamo.
 */
export function projectScore(
  checks: readonly Check[],
  selected: readonly SelectedRepairLike[],
  opts?: { uncertainFixerIds?: ReadonlySet<string> },
): ScoreProjection {
  const optimisticIds = new Set<string>();
  const guaranteedIds = new Set<string>();
  for (const item of selected) {
    for (const id of item.checkIds ?? []) {
      optimisticIds.add(id);
      const uncertain = item.requiresConfirmation === true
        || (item.fixerId != null && opts?.uncertainFixerIds?.has(item.fixerId) === true)
        || classifyFixabilityById(id).fixability !== 'auto';
      if (!uncertain) guaranteedIds.add(id);
    }
  }
  const current = scoreFromChecks(checks);
  const guaranteed = projectFlip(checks, guaranteedIds);
  const optimistic = projectFlip(checks, optimisticIds);
  return { current, guaranteed, optimistic, hasAssistedClaims: optimistic.earned > guaranteed.earned };
}

export interface RepairPathStep {
  score: number | null;
  earnedRaw: number;
  maxRaw: number;
}

export interface RepairPath {
  current: RepairPathStep;
  /** Nakon svih auto popravaka (bez potvrde). Prikaz: "automatski". */
  afterAuto: RepairPathStep;
  /** Nakon auto + assisted (uz potvrdu). Numericki jednak strojnom stropu (repairCeiling). */
  afterAssisted: RepairPathStep;
  /** Manual provjere s IZGUBLJENIM bodovima: put "-> rucno". */
  manualItems: Array<{ title: string; lostPoints: number }>;
  /** Manual provjere bez izgubljenih bodova (warn uz pune bodove): savjet, ne bodovni jaz. */
  manualAdvisories: string[];
  /** SAMO uz `offered`: auto/assisted gubici koje nijedna ponudjena stavka ne pokriva
   *  ("za ovo nema ponudjenog popravka u ovom profilu"). */
  uncoveredItems: Array<{ title: string; lostPoints: number }>;
  /** manualItems.length > 0 (rub lostPoints===0 vise ne pali jaz; vidi manualAdvisories). */
  hasManualGap: boolean;
}

function toStep(parts: ScoreParts): RepairPathStep {
  return { score: parts.score, earnedRaw: parts.earned, maxRaw: parts.max };
}

/**
 * Troslojni put do stropa: current -> afterAuto -> afterAssisted, plus manualni ostatak.
 *
 * Bez `offered` (kompat nacin, isto sto je repairCeiling oduvijek pretpostavljao): slojevi se
 * grade iz CISTE klasifikacije svih ne-pass bodovanih provjera. `afterAssisted` je tada
 * identican staroj formuli stropa (totalMax - manualLost) / totalMax, jer je svaka ne-pass
 * provjera auto, assisted ili manual.
 *
 * S `offered` (stvarno ponudjene stavke): slojevi se sijeku s unijom checkIds ponudjenih
 * stavki; auto sloj dodatno samo stavke BEZ requiresConfirmation (poklapa se sa "Sigurni
 * automatski" zonom ledgera). Nepokriveni auto/assisted gubici idu u `uncoveredItems`.
 */
export function repairPath(checks: readonly Check[], offered?: readonly SelectedRepairLike[]): RepairPath {
  const offeredAll = offered ? new Set<string>() : null;
  const offeredSafe = offered ? new Set<string>() : null;
  if (offered && offeredAll && offeredSafe) {
    for (const item of offered) {
      for (const id of item.checkIds ?? []) {
        offeredAll.add(id);
        if (item.requiresConfirmation !== true) offeredSafe.add(id);
      }
    }
  }

  const autoIds = new Set<string>();
  const assistedIds = new Set<string>();
  const manualItems: Array<{ title: string; lostPoints: number }> = [];
  const manualAdvisories: string[] = [];
  const uncoveredItems: Array<{ title: string; lostPoints: number }> = [];

  for (const c of checks) {
    if (!c || !c.scored || c.max <= 0 || c.status === 'pass') continue;
    const id = checkIdentity(c);
    const fixability: Fixability = classifyFixabilityById(id).fixability;
    const lostPoints = c.max - c.earned;
    if (fixability === 'manual' || id == null) {
      if (lostPoints > 0) manualItems.push({ title: c.title, lostPoints });
      else manualAdvisories.push(c.title);
      continue;
    }
    if (offeredAll) {
      if (!offeredAll.has(id)) {
        if (lostPoints > 0) uncoveredItems.push({ title: c.title, lostPoints });
        continue;
      }
      assistedIds.add(id);
      if (fixability === 'auto' && offeredSafe!.has(id)) autoIds.add(id);
    } else {
      assistedIds.add(id);
      if (fixability === 'auto') autoIds.add(id);
    }
  }

  const current = scoreFromChecks(checks);
  return {
    current: toStep(current),
    afterAuto: toStep(projectFlip(checks, autoIds)),
    afterAssisted: toStep(projectFlip(checks, assistedIds)),
    manualItems,
    manualAdvisories,
    uncoveredItems,
    hasManualGap: manualItems.length > 0,
  };
}
