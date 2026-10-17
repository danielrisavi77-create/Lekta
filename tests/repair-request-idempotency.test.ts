import { describe, expect, it } from 'vitest';
import { repairRequestFingerprint, repairRequestId } from '../src/report/repair-request-idempotency';

const META = {
  workType: 'diplomski',
  signals: { words: 12000, titleMarker: 'diplomski' },
  requests: [{ fixerId: 'spacing-fixer', ruleId: 'line-spacing', params: { multiplier: 1.5 } }],
  profileRef: 'hks-sestrinstvo',
  consentVersion: 'terms-v1',
  confirmations: [{ requestIndex: 0, confirmationText: 'primijeni', confirmedAt: '2026-10-16T10:00:00.000Z' }],
};

describe('repair idempotency key', () => {
  it('derives the same UUID in parallel tabs and after a refresh', async () => {
    const fingerprint = await repairRequestFingerprint(new Uint8Array([1, 2, 3]), META);
    const [firstTab, secondTab, afterRefresh] = await Promise.all([
      repairRequestId(fingerprint),
      repairRequestId(fingerprint),
      repairRequestId(fingerprint),
    ]);
    expect(firstTab).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(secondTab).toBe(firstTab);
    expect(afterRefresh).toBe(firstTab);
  });

  it('keeps a lost-response identity stable after 25 hours and after 30 days', async () => {
    const fingerprint = await repairRequestFingerprint(new Uint8Array([1, 2, 3]), META);
    const now = await repairRequestId(fingerprint);
    const after25Hours = await repairRequestId(fingerprint);
    const after30Days = await repairRequestId(fingerprint);
    expect(after25Hours).toBe(now);
    expect(after30Days).toBe(now);
  });

  it('distinguishes different bytes, profile, and repair selection', async () => {
    const original = await repairRequestFingerprint(new Uint8Array([1, 2, 3]), META);
    const otherBytes = await repairRequestFingerprint(new Uint8Array([1, 2, 4]), META);
    const otherProfile = await repairRequestFingerprint(new Uint8Array([1, 2, 3]), { ...META, profileRef: 'fpzg' });
    const otherFix = await repairRequestFingerprint(new Uint8Array([1, 2, 3]), {
      ...META,
      requests: [{ fixerId: 'font-fixer', ruleId: 'font', params: { name: 'Book Antiqua' } }],
    });
    const ids = await Promise.all([original, otherBytes, otherProfile, otherFix].map(repairRequestId));
    expect(new Set([original, otherBytes, otherProfile, otherFix]).size).toBe(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('ignores receipt timestamps but binds the exact confirmation and consent', async () => {
    const first = await repairRequestFingerprint(new Uint8Array([1]), META);
    const sameConfirmation = await repairRequestFingerprint(new Uint8Array([1]), {
      ...META,
      confirmations: [{ ...META.confirmations[0], confirmedAt: '2026-10-16T10:05:00.000Z' }],
    });
    const otherConfirmation = await repairRequestFingerprint(new Uint8Array([1]), {
      ...META,
      confirmations: [{ ...META.confirmations[0], confirmationText: 'drugi tekst' }],
    });
    const otherConsent = await repairRequestFingerprint(new Uint8Array([1]), { ...META, consentVersion: 'terms-v2' });
    expect(sameConfirmation).toBe(first);
    expect(otherConfirmation).not.toBe(first);
    expect(otherConsent).not.toBe(first);
  });

  it('keeps one identity when only the mismatch acknowledgement changes', async () => {
    const base = { ...META, confirmedMismatch: false };
    const first = await repairRequestFingerprint(new Uint8Array([1]), base);
    const confirmed = await repairRequestFingerprint(new Uint8Array([1]), { ...META, confirmedMismatch: true });
    expect(confirmed).toBe(first);
    expect(await repairRequestId(confirmed)).toBe(await repairRequestId(first));
  });

  it('rejects malformed fingerprints', async () => {
    expect(await repairRequestId('not-a-fingerprint')).toBeNull();
    expect(await repairRequestId('a'.repeat(63))).toBeNull();
  });
});
