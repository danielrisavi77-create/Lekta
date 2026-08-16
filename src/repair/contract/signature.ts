import { canonicalUtf8 } from './canonical-json.ts';
import { unsignedPayload } from './contract-v1.ts';
import { fromBase64Url, toBase64Url } from './hash.ts';
import {
  REPAIR_CONTRACT_SIGNATURE_ALGORITHM,
  type JsonValue,
  type RepairContractV1,
  type UnsignedRepairContractV1,
} from './types.ts';

export type SignatureResult =
  | { ok: true }
  | {
    ok: false;
    code:
      | 'unsupported-algorithm'
      | 'invalid-key-id'
      | 'invalid-signature-encoding'
      | 'signature-mismatch';
  };

const KEY_ID = /^[A-Za-z0-9._-]{1,80}$/;
const ECDSA_SHA_256: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };
const P256: EcKeyImportParams = { name: 'ECDSA', namedCurve: 'P-256' };
const P1363_SIGNATURE_BYTES = 64;

function contractBytes(payload: UnsignedRepairContractV1): Uint8Array<ArrayBuffer> {
  return new Uint8Array(canonicalUtf8(payload as unknown as JsonValue));
}

export async function signRepairContractV1(
  payload: UnsignedRepairContractV1,
  privateKey: CryptoKey,
  keyId: string,
): Promise<RepairContractV1> {
  if (!KEY_ID.test(keyId)) throw new TypeError('Neispravan Repair Contract keyId.');
  const signature = new Uint8Array(await crypto.subtle.sign(
    ECDSA_SHA_256,
    privateKey,
    contractBytes(payload),
  ));
  if (signature.length !== P1363_SIGNATURE_BYTES) {
    throw new TypeError('Repair Contract potpis nije ES256-P1363 zapis od 64 bajta.');
  }
  return {
    ...payload,
    contractSignature: {
      algorithm: REPAIR_CONTRACT_SIGNATURE_ALGORITHM,
      keyId,
      value: toBase64Url(signature),
    },
  };
}

export async function verifyRepairContractV1(
  contract: RepairContractV1,
  publicKey: CryptoKey,
): Promise<SignatureResult> {
  if (contract.contractSignature.algorithm !== REPAIR_CONTRACT_SIGNATURE_ALGORITHM) {
    return { ok: false, code: 'unsupported-algorithm' };
  }
  if (!KEY_ID.test(contract.contractSignature.keyId)) {
    return { ok: false, code: 'invalid-key-id' };
  }

  let signature: Uint8Array;
  try {
    signature = fromBase64Url(contract.contractSignature.value);
  } catch {
    return { ok: false, code: 'invalid-signature-encoding' };
  }
  if (signature.length !== P1363_SIGNATURE_BYTES) {
    return { ok: false, code: 'invalid-signature-encoding' };
  }

  try {
    const verified = await crypto.subtle.verify(
      ECDSA_SHA_256,
      publicKey,
      new Uint8Array(signature),
      contractBytes(unsignedPayload(contract)),
    );
    return verified ? { ok: true } : { ok: false, code: 'signature-mismatch' };
  } catch {
    return { ok: false, code: 'signature-mismatch' };
  }
}

export async function importRepairContractPrivateKey(pkcs8Base64Url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    new Uint8Array(fromBase64Url(pkcs8Base64Url)),
    P256,
    false,
    ['sign'],
  );
}

export async function importRepairContractPublicKey(spkiBase64Url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    new Uint8Array(fromBase64Url(spkiBase64Url)),
    P256,
    false,
    ['verify'],
  );
}
