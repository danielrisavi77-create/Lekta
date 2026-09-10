const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

function bytesToBinary(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return chunks.join('');
}

export function toBase64Url(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function fromBase64Url(value: string): Uint8Array {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    throw new TypeError('Neispravan base64url zapis.');
  }

  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new TypeError('Neispravan base64url zapis.');
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (toBase64Url(bytes) !== value) throw new TypeError('Nekanonski base64url zapis.');
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
