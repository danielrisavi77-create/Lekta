import type { RepairConfirmationReceipt } from '../report/repair-client.ts';
import { localRepairRequestRequiresConfirmation } from '../report/repair-client.ts';
import { renderConfirmation } from './repair-panel.ts';

export interface LocalRepairConfirmationItem {
  fixerId: unknown;
  ruleId: unknown;
  label?: unknown;
  confirmationText?: unknown;
  requiresConfirmation?: unknown;
}

type StoredConfirmationReceipt = Omit<RepairConfirmationReceipt, 'requestIndex'>;
export type LocalRepairConfirmationStore = Map<string, StoredConfirmationReceipt>;

function confirmationKey(item: LocalRepairConfirmationItem): string {
  return `${String(item.fixerId)}\u0000${String(item.ruleId)}`;
}

export function rememberLocalRepairConfirmations(
  store: LocalRepairConfirmationStore,
  items: LocalRepairConfirmationItem[],
  confirmedAt: string,
): void {
  for (const item of items) {
    if (!localRepairRequestRequiresConfirmation(String(item.fixerId))) continue;
    store.set(confirmationKey(item), {
      confirmationText: String(item.confirmationText || `Potvrdi popravak: ${String(item.label || '')}`).trim(),
      confirmedAt,
    });
  }
}

export function collectLocalRepairConfirmationReceipts(
  items: LocalRepairConfirmationItem[],
  store: LocalRepairConfirmationStore,
): RepairConfirmationReceipt[] {
  return items.flatMap((item, requestIndex) => {
    if (!localRepairRequestRequiresConfirmation(String(item.fixerId))) return [];
    const receipt = store.get(confirmationKey(item));
    if (!receipt) throw new Error('Nedostaje izricita potvrda za lokalni Word popravak.');
    return [{ requestIndex, ...receipt }];
  });
}

interface ConfirmRepairSelectionInput {
  consent: HTMLInputElement;
  consentHint: HTMLElement;
  consentRow: HTMLElement;
  wrap: HTMLElement;
  textItems: LocalRepairConfirmationItem[];
  getCheckedItems: () => LocalRepairConfirmationItem[];
  confirmBox: HTMLElement;
  confirmations: LocalRepairConfirmationStore;
  onConfirmed: () => void;
}

/**
 * Jedino mjesto koje bira stavke za potvrdni korak lokalnog Word popravka. Tekstualne stavke
 * ulaze samo kad je korisnik ukljucio njihov `data-text-apply`, a potvrda se zapisuje tek nakon
 * zasebnog klika u postojecem confirmation panelu.
 */
export function confirmRepairSelection(input: ConfirmRepairSelectionInput): void {
  const {
    consent, consentHint, consentRow, wrap, textItems, getCheckedItems,
    confirmBox, confirmations, onConfirmed,
  } = input;
  if (!consent.checked) {
    consentHint.hidden = false;
    consentRow.classList.add('lekta-repair-panel__deep--alert');
    consent.focus();
    consentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const selectedTextIds = new Set(
    Array.from(wrap.querySelectorAll<HTMLInputElement>('[data-text-apply]'))
      .filter((control) => control.checked)
      .map((control) => control.value),
  );
  const selectedItems = [
    ...getCheckedItems(),
    ...textItems.filter((item) => selectedTextIds.has(String(item.ruleId))),
  ];
  const needsConfirmation = selectedItems.filter((item) =>
    item.requiresConfirmation || localRepairRequestRequiresConfirmation(String(item.fixerId)));
  if (!needsConfirmation.length) {
    onConfirmed();
    return;
  }

  renderConfirmation(confirmBox, needsConfirmation as any[], () => {
    rememberLocalRepairConfirmations(confirmations, needsConfirmation, new Date().toISOString());
    confirmBox.hidden = true;
    confirmBox.innerHTML = '';
    onConfirmed();
  });
}
