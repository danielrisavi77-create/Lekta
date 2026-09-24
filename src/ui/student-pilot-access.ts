export type PilotResultKind = 'none' | 'demo' | 'unpaid' | 'paid';
export const STUDENT_PILOT = import.meta.env.VITE_LEKTA_STUDENT_PILOT === 'true';

export interface StudentPilotAccessInput {
  pilotEnabled: boolean;
  resultKind: PilotResultKind;
  reportConfigured: boolean;
  repairConfigured: boolean;
  checkoutConfigured: boolean;
  paidOffersLive: boolean;
}

export function studentPilotAccess(input: StudentPilotAccessInput) {
  const hasResult = input.resultKind !== 'none';
  const unpaid = input.resultKind === 'unpaid';
  const diagnosticsLocked = !input.pilotEnabled && input.reportConfigured && unpaid;
  const repairLocked = input.pilotEnabled ? unpaid : diagnosticsLocked;
  const purchaseAvailable = unpaid && input.reportConfigured && input.checkoutConfigured
    && input.repairConfigured && input.paidOffersLive;
  const repairAvailable = input.resultKind === 'paid'
    && (!input.pilotEnabled || input.repairConfigured);
  return { diagnosticsUnlocked: hasResult && !diagnosticsLocked, diagnosticsLocked, repairLocked, purchaseAvailable, repairAvailable };
}

export function pilotRepairAllowed(pilotEnabled: boolean, access: Pick<ReturnType<typeof studentPilotAccess>, 'purchaseAvailable' | 'repairAvailable'> | null): boolean {
  return !pilotEnabled || !!access?.purchaseAvailable || !!access?.repairAvailable;
}

export function pilotAccessForResult(result: { demo?: boolean; fullReport?: boolean } | null | undefined, pilotEnabled: boolean, ready: Omit<StudentPilotAccessInput, 'pilotEnabled' | 'resultKind'>) {
  const resultKind: PilotResultKind = !result ? 'none' : result.demo ? 'demo' : result.fullReport ? 'paid' : 'unpaid';
  return studentPilotAccess({ ...ready, pilotEnabled, resultKind });
}

export function pilotRepairLockHtml(input: { purchaseAvailable: boolean; workTypeLabel?: string; price?: number | null }): string {
  const label = input.workTypeLabel?.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
  const price = input.price == null ? '' : ` Cijena${label ? ` za ${label.toLowerCase()}` : ''}: ${input.price.toFixed(2).replace('.', ',')} €.`;
  return `<div class="lock-panel" data-pilot-repair-lock><i data-lucide="lock" aria-hidden="true"></i><div><strong>Popravljeni Word dokument</strong><p>Dijagnoza, dokazi i osnovne upute su besplatni. Plaćeni popravak daje novi DOCX, ponovnu analizu i pregled stvarno primijenjenih promjena. Ishod ovisi o provjeri nakon popravka.${price}</p>${input.purchaseAvailable ? '<button class="btn btn-primary btn-sm" type="button" data-unlock-cta>Otvori kupnju popravka</button>' : '<p>Kupnja i automatski popravak trenutačno nisu dostupni u ovom okruženju. Besplatne nalaze možeš koristiti za ručni ispravak u Wordu.</p>'}</div></div>`;
}

export function pilotRepairEntryHtml(input: { pilotEnabled: boolean; auto: number; recommendedCount: number; serverSide: boolean } = { pilotEnabled: true, auto: 0, recommendedCount: 0, serverSide: false }): string {
  if (input.pilotEnabled) return '<h3>Popravljeni Word dokument</h3><p>Besplatna dijagnoza i upute ostaju dostupne. Plaćeni popravak uključuje ponovnu analizu i pregled stvarnih promjena.</p><button type="button" class="triage-repair-cta" data-repair-entry>Pregledaj mogućnost popravka</button>';
  const heading = input.serverSide ? 'Automatski popravak' : 'Automatski popravci na ovom uređaju';
  const action = input.auto
    ? `${input.serverSide ? 'Možeš poslati na popravak' : 'Možeš lokalno primijeniti'} ${input.auto} ${input.auto === 1 ? 'podržanu stavku' : 'podržane stavke'} i preuzeti novi Word dokument.`
    : `Pregledaj podržane ${input.serverSide ? '' : 'lokalne '}popravke i preuzmi novi Word dokument.`;
  const disclosure = input.serverSide ? ' Dokument se pritom šalje na server i pohranjuje dok ga ne obrišeš.' : ' Dokument se pri tome ne šalje na poslužitelj.';
  const recommendation = input.recommendedCount
    ? `<p class="repair-entry-recommended">Uz to, tvoj fakultet <strong>preporučuje</strong> još ${input.recommendedCount} ${input.recommendedCount === 1 ? 'uskladbu' : 'uskladbi'}. Ne ulaze u ocjenu, ali ih možemo popraviti u istom prolazu.</p>`
    : '';
  const button = input.serverSide ? 'Pošalji na popravak' : 'Odaberi lokalne popravke';
  return `<h3>${heading}</h3><p>${action}${disclosure}</p>${recommendation}<button type="button" class="triage-repair-cta" data-repair-entry><i data-lucide="wand-2"></i>${button} <span aria-hidden="true">→</span></button>`;
}
