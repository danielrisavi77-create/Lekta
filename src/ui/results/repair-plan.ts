/**
 * PLAN ISPRAVAKA: sto ce se popraviti, sto trazi tvoju odluku, sto moras sam.
 *
 * Klasifikacija nad postojecim podacima, mjerljiva bez preglednika:
 *
 *     violated !== false && !requiresConfirmation   ->  SIGURNO (predodabrano)
 *     requiresConfirmation === true                 ->  TREBA ODLUKU
 *     violated === false && recommended === true    ->  TREBA ODLUKU (preporuka fakulteta)
 *     violated === false, bez preporuke             ->  NE ULAZI ("uskladi sve" opt-in)
 *     nalaz koji nijedna stavka ne pokriva          ->  RUCNO
 *
 * Prva dva reda su POSTOJECA pravila (`default-selection.ts`), pa plan ne smije imati vlastito:
 * inace obecava jedno, a motor radi drugo. RUCNO izvodi iz NALAZA, jer to nije vrsta popravka
 * nego ODSUTNOST popravka. Sve tri skupine drzi `tests/repair-plan.test.ts`.
 */
import type { VisualFindingModel } from './visual-result-model';

/** Minimalni oblik stavke popravka; `RepairableItem` iz `repair-panel.ts` ga zadovoljava. */
export interface PlanItemInput {
  readonly ruleId: string;
  readonly label: string;
  readonly violated?: boolean;
  readonly recommended?: boolean;
  readonly requiresConfirmation?: boolean;
  readonly confirmationText?: string;
  readonly matchKeys?: readonly string[];
}

export interface PlanStavka {
  readonly ruleId: string;
  readonly label: string;
  /** Izmjereno stanje i ciljano stanje, kad ih nalaz zna ("2,3 cm" -> "3,0 cm"). */
  readonly prije: string | null;
  readonly poslije: string | null;
  /** Sto tocno treba potvrditi; samo za skupinu koja trazi odluku. */
  readonly potvrda: string | null;
  /** Preporuka fakulteta, ne bodovan propis: nikad predodabrana. */
  readonly preporuka: boolean;
}

export interface PlanRucno {
  readonly naslov: string;
  readonly razlog: string;
}

export interface RepairPlan {
  readonly sigurni: readonly PlanStavka[];
  readonly odluka: readonly PlanStavka[];
  readonly rucni: readonly PlanRucno[];
  /** Koliko je zahvata PREDODABRANO, dakle sto ce se primijeniti bez daljnjeg biranja. */
  readonly odabrano: number;
  /** Ima li plan uopce sto ponuditi; prazan plan se ne crta. */
  readonly prazan: boolean;
}

/**
 * Nalaz koji pripada stavci. Veza je ista koju `visual-result-model.ts` vec koristi za znacku
 * popravljivosti (`matchKeys`), pa se ne uvodi drugo pravilo za isto pitanje.
 */
function nalazZaStavku(
  stavka: PlanItemInput,
  findings: readonly VisualFindingModel[],
): VisualFindingModel | null {
  if (!stavka.matchKeys?.length) return null;
  return findings.find((f) => stavka.matchKeys!.some((k) => f.matchKeys.includes(k))) ?? null;
}

function uStavku(stavka: PlanItemInput, findings: readonly VisualFindingModel[]): PlanStavka {
  const nalaz = nalazZaStavku(stavka, findings);
  return {
    ruleId: stavka.ruleId,
    label: stavka.label,
    // Kartica ih vec prikazuje; plan ih preslaguje u redak "prije -> poslije", i ne izmislja ga.
    prije: nalaz?.measured ?? null,
    poslije: nalaz?.expected ?? null,
    potvrda: stavka.confirmationText ?? null,
    preporuka: stavka.recommended === true,
  };
}

export function buildRepairPlan(
  items: readonly PlanItemInput[],
  findings: readonly VisualFindingModel[],
  popravakDostupan: boolean,
): RepairPlan {
  if (!popravakDostupan) {
    return { sigurni: [], odluka: [], rucni: [], odabrano: 0, prazan: true };
  }
  const sigurni: PlanStavka[] = [];
  const odluka: PlanStavka[] = [];
  for (const it of items) {
    if (it.requiresConfirmation === true) { odluka.push(uStavku(it, findings)); continue; }
    // `violated !== false` je ISTO pravilo koje koristi `defaultSelectedItems`; drugo pravilo ovdje
    // znacilo bi da plan obecava jedno, a popravak radi drugo.
    if (it.violated !== false) { sigurni.push(uStavku(it, findings)); continue; }
    // PREPORUKA FAKULTETA je izbor, pa pripada odluci.
    if (it.recommended === true) { odluka.push(uStavku(it, findings)); continue; }
    // OSTALO NE ULAZI (ispravak 2026-09-08, nadjen na snimci): stavke koje nisu prekrsene ni
    // preporucene su "uskladi cijeli dokument" opt-ini, dakle dimenzija je vec u redu. Prva
    // izvedba ih je stavljala pod "Treba tvoju odluku", pa je plan citao kao configuration
    // panel koji treba zamijeniti. Puni panel iza "Detalji provjere" ih i dalje nudi.
  }

  const pokriveni = new Set<string>();
  for (const it of items) {
    for (const f of findings) {
      if (it.matchKeys?.some((k) => f.matchKeys.includes(k))) pokriveni.add(f.id);
    }
  }
  const rucni: PlanRucno[] = findings
    .filter((f) => f.status !== 'ignored' && !pokriveni.has(f.id) && f.capabilities.repair !== true)
    .map((f) => ({ naslov: f.title, razlog: f.explanation }));

  return {
    sigurni,
    odluka,
    rucni,
    odabrano: sigurni.length,
    prazan: sigurni.length === 0 && odluka.length === 0 && rucni.length === 0,
  };
}

/**
 * ODABIR U PLANU (T09). Plan sada ima STVARNE kontrole: svaka stavka iz "Sigurni zahvati" i "Treba tvoju odluku" je
 * checkbox vezan na jedan `ruleId`. Ove dvije funkcije su cista logika ispod tih kontrola: zadani odabir (sigurni
 * ukljuceni, odluke iskljucene, isto kao dosadasnji prikaz) i sazetak onoga sto ce se poslati.
 *
 * Grupiranje je samo PRIKAZ: svaki checkbox mijenja tocno jedan `ruleId`, pa iskljucivanje jednog zahvata ne moze
 * tiho ukljuciti drugi. Rucne stavke nemaju kontrolu, jer se ne mogu poslati.
 */
export function defaultPlanSelection(plan: RepairPlan): string[] {
  return plan.sigurni.map((s) => s.ruleId);
}

export interface PlanSelectionSummary {
  count: number;
  /** Oznake odabranih zahvata, u redoslijedu plana (sigurni pa odluke). */
  labels: string[];
  /** Odabrane odluke koje traze potvrdu; prikazuju se PRIJE slanja s razlogom. */
  needsConfirmation: PlanStavka[];
}

export function planSelectionSummary(plan: RepairPlan, selectedRuleIds: Iterable<string>): PlanSelectionSummary {
  const sel = new Set(selectedRuleIds);
  const odabrane = [...plan.sigurni, ...plan.odluka].filter((s) => sel.has(s.ruleId));
  return {
    count: odabrane.length,
    labels: odabrane.map((s) => s.label),
    needsConfirmation: odabrane.filter((s) => s.potvrda !== null),
  };
}

/** `ruleId`-evi svih stavki koje imaju kontrolu u planu; sve izvan toga plan ne smije poslati. */
export function selectablePlanRuleIds(plan: RepairPlan): Set<string> {
  return new Set([...plan.sigurni, ...plan.odluka].map((s) => s.ruleId));
}
