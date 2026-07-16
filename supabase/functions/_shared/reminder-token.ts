// supabase/functions/_shared/reminder-token.ts
//
// Potpisan token za odjavu iz e-maila bez potrebe za loginom. Format:
// base64url(payloadJson) + '.' + hex(hmac-sha256(secret, payloadJson))
//
// Payload nosi TIP odjave, jer imamo dva razlicita mehanizma odjave
// (deadline_subscription vs slot_expiry preferenca), vidi ROKOVI_PODSJETNICI.md.
//
// AUD-25 (security): (1) token nosi 'exp' (unix sekunde) pa istekli/bez-exp tokeni se odbijaju
// (fail-closed), sto ogranicava prozor replaya jer link putuje u URL-u (GET) i zavrsava u
// Resend/proxy/browser logovima; (2) potpis se usporeduje KONSTANTNO-VREMENSKI (timingSafeEqual iz
// cron-auth.ts), ne '!==' koje bi curilo poziciju prve razlike bajta.

import { timingSafeEqual } from './cron-auth.ts';

export type UnsubscribePayload =
  | { type: 'deadline_subscription'; subscriptionId: string }
  | { type: 'slot_expiry_pref'; userId: string };

// Zadani rok valjanosti odjavnog linka. Mora biti dovoljno dug da vrijedi kroz cijeli prozor
// podsjetnika (7 i 1 dan prije roka, istek slota), ali ne beskonacan (replay se ogranicava).
export const UNSUB_TOKEN_TTL_S = 60 * 60 * 24 * 90; // 90 dana

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
  ttlSeconds: number = UNSUB_TOKEN_TTL_S,
): Promise<string> {
  // Utisni exp (unix sekunde) u potpisani payload; verify ga zahtijeva i odbija istekle.
  const signed = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadJson = JSON.stringify(signed);
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
  // Konstantno-vremenska usporedba (isti timingSafeEqual kao cron-auth.ts): sprjecava timing napad
  // na HMAC. Radi nad hex stringovima (ista duljina za valjan potpis).
  if (!timingSafeEqual(expectedSig, sig)) return null;

  let parsed: UnsubscribePayload & { exp?: unknown };
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  // Istek (fail-closed): odbij tokene bez valjanog exp-a i istekle tokene. Stariji tokeni bez exp
  // (izdani prije uvodenja) tako se odbijaju; podsjetnicki sustav je inertan dok nema Resend tajni.
  if (typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp) || parsed.exp * 1000 < Date.now()) {
    return null;
  }

  // Vrati SAMO domenski payload (bez exp), da pozivatelji ostanu nepromijenjeni.
  if (parsed.type === 'deadline_subscription' && typeof parsed.subscriptionId === 'string') {
    return { type: 'deadline_subscription', subscriptionId: parsed.subscriptionId };
  }
  if (parsed.type === 'slot_expiry_pref' && typeof parsed.userId === 'string') {
    return { type: 'slot_expiry_pref', userId: parsed.userId };
  }
  return null;
}
