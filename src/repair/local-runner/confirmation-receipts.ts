import type { RepairConfirmationInput } from '../contract/adapter.ts';

type DataObject = Record<string, unknown>;

function dataObject(value: unknown): value is DataObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseRepairConfirmationReceipts(
  value: unknown,
  requestCount: number,
  now: Date,
): RepairConfirmationInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > requestCount || value.length > 64) return null;
  if (!Number.isInteger(requestCount) || requestCount < 1 || requestCount > 64) return null;
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return null;

  const seen = new Set<number>();
  const confirmations: RepairConfirmationInput[] = [];
  for (const candidate of value) {
    if (!dataObject(candidate)
      || Object.keys(candidate).sort().join(',') !== 'confirmationText,confirmedAt,requestIndex'
      || !Number.isInteger(candidate.requestIndex)
      || (candidate.requestIndex as number) < 0
      || (candidate.requestIndex as number) >= requestCount
      || seen.has(candidate.requestIndex as number)
      || typeof candidate.confirmationText !== 'string'
      || candidate.confirmationText !== candidate.confirmationText.trim()
      || candidate.confirmationText.length < 1
      || candidate.confirmationText.length > 4_000
      || typeof candidate.confirmedAt !== 'string') return null;
    const confirmedAtMs = Date.parse(candidate.confirmedAt);
    if (!Number.isFinite(confirmedAtMs)
      || new Date(confirmedAtMs).toISOString() !== candidate.confirmedAt
      || confirmedAtMs > nowMs) return null;
    seen.add(candidate.requestIndex as number);
    confirmations.push({
      requestIndex: candidate.requestIndex as number,
      confirmationText: candidate.confirmationText,
      confirmedAt: new Date(confirmedAtMs),
    });
  }
  return confirmations;
}
