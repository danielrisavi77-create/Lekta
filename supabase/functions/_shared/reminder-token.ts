// supabase/functions/_shared/reminder-token.ts
//
// Potpisan token za odjavu iz e-maila bez potrebe za loginom. Format:
// base64url(payloadJson) + '.' + hex(hmac-sha256(secret, payloadJson))
//
// Payload nosi TIP odjave, jer imamo dva razlicita mehanizma odjave
// (deadline_subscription vs slot_expiry preferenca), vidi ROKOVI_PODSJETNICI.md.

export type UnsubscribePayload =
  | { type: 'deadline_subscription'; subscriptionId: string }
  | { type: 'slot_expiry_pref'; userId: string };

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    input.length + ((4 - (input.length % 4)) % 4),
    '=',
  );
  const str = atob(padded);
  return Uint8Array.from(str, (c) => c.charCodeAt(0));
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signUnsubscribeToken(
  payload: UnsubscribePayload,
  secret: string,
): Promise<string> {
  const payloadJson = JSON.stringify(payload);
  const encoded = base64UrlEncode(new TextEncoder().encode(payloadJson));
  const sig = await hmacHex(secret, payloadJson);
  return `${encoded}.${sig}`;
}

export async function verifyUnsubscribeToken(
  token: string,
  secret: string,
): Promise<UnsubscribePayload | null> {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  let payloadJson: string;
  try {
    payloadJson = new TextDecoder().decode(base64UrlDecode(encoded));
  } catch {
    return null;
  }

  const expectedSig = await hmacHex(secret, payloadJson);
  if (expectedSig !== sig) return null;

  try {
    return JSON.parse(payloadJson) as UnsubscribePayload;
  } catch {
    return null;
  }
}
