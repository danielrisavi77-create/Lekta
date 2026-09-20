/**
 * PROVJERENI ISHOD POPRAVKA U SUCELJU (plan T10). Jedan prikaz za lokalni i serverski panel.
 *
 * Razdvaja dvije velicine koje su se do sada lako mijesale: "zahvat izvrsen" (broj izmjena u changelogu, cinjenica o
 * dokumentu) i "problem rijesen" (ciljana provjera koja je prije padala, a sada prolazi, cinjenica o ponovnoj
 * analizi). Brojke dolaze iz `verifiedOutcomeFrom` (`src/repair/repair-outcome-verified.ts`); ovdje se samo
 * imenuju provjere i slazu u DOM. Neizmjereno se ne prikazuje kao rijeseno, a regresije obuhvacaju SVE provjere,
 * ne samo odabrane.
 */
import type { VerifiedRepairOutcome } from '../../repair/repair-outcome-verified';
import { describeRepairOutcome, type RepairOutcome } from '../../repair/repair-outcome';

export interface OutcomeViewInput {
  outcome: VerifiedRepairOutcome;
  /** Naslov provjere po id-u, za citljiv popis; nepoznat id se ispisuje kako jest. */
  titleOf: (checkId: string) => string;
  /** Provjere koje su prije padale, a nijedan zahvat ih ne cilja: preostale RUCNE obveze. */
  manualOnlyIds: readonly string[];
  /** Koliko je zahvata (changelog) stvarno izvrseno; prikazuje se ODVOJENO od broja provjera. */
  appliedChangeCount: number;
}

const INTEGRITY_TEXT: Record<VerifiedRepairOutcome['integrity'], string> = {
  passed: 'Paket je prošao provjeru ispravnosti.',
  failed: 'Paket NIJE prošao provjeru ispravnosti; popravljena kopija nije isporučena.',
  'not-verified': 'Ispravnost popravljenog paketa nije provjerena (ponovna analiza nije uspjela).',
};

function lista(ids: readonly string[], titleOf: (id: string) => string, esc: (v: string) => string): string {
  return ids.length ? `<ul>${ids.map((id) => `<li>${esc(titleOf(id))}</li>`).join('')}</ul>` : '';
}

export function repairOutcomeHtml(input: OutcomeViewInput, esc: (v: string) => string): string {
  const o = input.outcome;
  const targeted = o.resolvedIds.length + o.unresolvedIds.length + o.skippedIds.length;
  const naslov = targeted === 0
    ? 'Nijedna bodovana provjera nije bila cilj ovog popravka.'
    : `Riješeno ${o.resolvedIds.length} od ${targeted} ciljanih provjera.`;
  const zahvati = `<p class="muted">Izvršeno zahvata u dokumentu: ${input.appliedChangeCount}. Broj zahvata i broj provjera nisu ista veličina: jedan zahvat može riješiti više provjera, a neka provjera traži više zahvata.</p>`;
  const dijelovi: string[] = [];
  if (o.unresolvedIds.length) dijelovi.push(`<p><strong>Nije riješeno (${o.unresolvedIds.length}):</strong></p>${lista(o.unresolvedIds, input.titleOf, esc)}`);
  if (o.skippedIds.length) dijelovi.push(`<p><strong>Preskočeno, zahvat nije primijenjen (${o.skippedIds.length}):</strong></p>${lista(o.skippedIds, input.titleOf, esc)}`);
  if (o.regressedIds.length) dijelovi.push(`<p><strong>Regresija: prije je prolazilo, sada ne (${o.regressedIds.length}).</strong></p>${lista(o.regressedIds, input.titleOf, esc)}`);
  if (input.manualOnlyIds.length) dijelovi.push(`<p><strong>Ostaje za ručnu provjeru (${input.manualOnlyIds.length}):</strong> automatski popravak to ne dira.</p>${lista(input.manualOnlyIds, input.titleOf, esc)}`);
  const integritet = `<p class="muted" data-repair-integrity="${esc(o.integrity)}">${esc(INTEGRITY_TEXT[o.integrity])} Provjera predajnog paketa pokriva oblikovanje, strukturu i citate koje profil boduje; sadržaj rada nije predmet provjere.</p>`;
  return `<section class="lekta-repair-panel__verified" data-testid="repair-outcome" data-repair-outcome-resolved="${o.resolvedIds.length}" data-repair-outcome-unresolved="${o.unresolvedIds.length}" data-repair-outcome-regressed="${o.regressedIds.length}" data-repair-recommend="${o.recommendRepairedCopy ? 'da' : 'ne'}"><p><strong>${esc(naslov)}</strong></p>${zahvati}${dijelovi.join('')}${integritet}</section>`;
}

/**
 * Iskrena recenica o ISHODU popravka (bilo koji put). Tvrdnja i brojke dolaze iz `describeRepairOutcome`, isti izvor
 * koji koristi lokalni panel; ovdje je samo omot u HTML string. Preseljeno iz app.ts 2026-09-10 (T10).
 */
export function outcomeSentenceHtml(o: RepairOutcome | null, esc: (v: string) => string): string {
  const copy = describeRepairOutcome(o);
  if (!copy) return '';
  return `<p><strong>${esc(copy.headline)}</strong>${esc(copy.detail)}</p>`;
}
