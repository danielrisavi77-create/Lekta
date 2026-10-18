/**
 * Stable browser/server identity for one semantic repair request.
 *
 * The request UUID is deterministically derived from the SHA-256 fingerprint. Separate tabs,
 * refreshes, and devices therefore use the same key without retaining document data in storage.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const child = source[key];
    if (child === undefined) continue;
    // This acknowledgement permits an already-visible profile mismatch; it does not change the
    // requested fixes. Replaying a completed operation with this flag must keep the same identity.
    if (key === 'confirmedMismatch') continue;
    if (key === 'confirmations' && Array.isArray(child)) {
      result[key] = child.map((receipt) => {
        if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return canonicalize(receipt);
        const { confirmedAt: _receiptTimestamp, ...semanticReceipt } = receipt as Record<string, unknown>;
        return canonicalize(semanticReceipt);
      });
    } else {
      result[key] = canonicalize(child);
    }
  }
  return result;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Sigurni izračun identiteta popravka nije dostupan.');
  const digest = await subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Hash document bytes and semantic options; confirmation receipts bind to text, not click time. */
export async function repairRequestFingerprint(
  fileBytes: Uint8Array,
  meta: unknown,
): Promise<string> {
  const contentHash = await sha256Hex(fileBytes);
  const serializedMeta = JSON.stringify(canonicalize(meta)) ?? 'null';
  const metaHash = await sha256Hex(new TextEncoder().encode(serializedMeta));
  return sha256Hex(new TextEncoder().encode(`lekta-repair-request-v1:${contentHash}:${metaHash}`));
}

/**
 * Derive a UUIDv8 key from the fingerprint so concurrent tabs cannot mint different IDs for the
 * same request. It is an idempotency key, not an authorization token; the server still requires auth.
 */
export async function repairRequestId(fingerprint: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) return null;
  const digest = await sha256Hex(new TextEncoder().encode(`lekta-repair-request-id-v1:${fingerprint.toLowerCase()}`));
  const chars = digest.slice(0, 32).split('');
  chars[12] = '8';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return UUID_RE.test(id) ? id : null;
}
