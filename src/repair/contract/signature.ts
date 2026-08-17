import { canonicalUtf8 } from './canonical-json.ts';
import { parseUnsignedRepairContractV1 } from './contract-v1.ts';
import { fromBase64Url, toBase64Url } from './hash.ts';
import {
  REPAIR_CONTRACT_KEY_ID_PATTERN,
  REPAIR_CONTRACT_SIGNATURE_ALGORITHM,
  REPAIR_CONTRACT_SIGNATURE_BYTES,
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

const ECDSA_SHA_256: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };
const P256: EcKeyImportParams = { name: 'ECDSA', namedCurve: 'P-256' };

type DataObject = Record<string, unknown>;

function dataDescriptors(value: unknown): PropertyDescriptorMap | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => {
    if (typeof key !== 'string') return true;
    const descriptor = descriptors[key];
    return !descriptor.enumerable || !('value' in descriptor);
  })) return null;
  return descriptors;
}

function signatureEnvelope(value: unknown): {
  signature: { algorithm: unknown; keyId: unknown; value: unknown };
  payload: JsonValue;
} | null {
  const contract = dataDescriptors(value);
  const signatureDescriptor = contract?.contractSignature;
  if (!contract || !signatureDescriptor || !('value' in signatureDescriptor)) return null;

  const signature = dataDescriptors(signatureDescriptor.value);
  if (!signature || Object.keys(signature).sort().join(',') !== 'algorithm,keyId,value') return null;

  const payload: DataObject = Object.create(null) as DataObject;
  for (const [key, descriptor] of Object.entries(contract)) {
    if (key !== 'contractSignature') payload[key] = descriptor.value;
  }
  return {
    signature: {
      algorithm: signature.algorithm.value,
      keyId: signature.keyId.value,
      value: signature.value.value,
    },
    payload: payload as JsonValue,
  };
}

function contractBytes(payload: JsonValue): Uint8Array<ArrayBuffer> {
  return new Uint8Array(canonicalUtf8(payload as unknown as JsonValue));
}

export async function signRepairContractV1(
  payload: UnsignedRepairContractV1,
  privateKey: CryptoKey,
  keyId: string,
): Promise<RepairContractV1> {
  if (!REPAIR_CONTRACT_KEY_ID_PATTERN.test(keyId)) throw new TypeError('Neispravan Repair Contract keyId.');
  const validated = parseUnsignedRepairContractV1(payload);
  if (!validated.ok) {
    const first = validated.issues[0];
    throw new TypeError(`Neispravan Repair Contract ${first.path}: ${first.code}`);
  }
  const signature = new Uint8Array(await crypto.subtle.sign(
    ECDSA_SHA_256,
    privateKey,
    contractBytes(validated.contract as unknown as JsonValue),
  ));
  if (signature.length !== REPAIR_CONTRACT_SIGNATURE_BYTES) {
    throw new TypeError('Repair Contract potpis nije ES256-P1363 zapis od 64 bajta.');
  }
  return {
    ...validated.contract,
    contractSignature: {
      algorithm: REPAIR_CONTRACT_SIGNATURE_ALGORITHM,
      keyId,
      value: toBase64Url(signature),
    },
  };
}

export async function verifyRepairContractV1(
  contract: unknown,
  publicKey: CryptoKey,
): Promise<SignatureResult> {
  let envelope: ReturnType<typeof signatureEnvelope>;
  try {
    envelope = signatureEnvelope(contract);
  } catch {
    return { ok: false, code: 'invalid-signature-encoding' };
  }
  if (!envelope) return { ok: false, code: 'invalid-signature-encoding' };
  if (envelope.signature.algorithm !== REPAIR_CONTRACT_SIGNATURE_ALGORITHM) {
    return { ok: false, code: 'unsupported-algorithm' };
  }
  if (typeof envelope.signature.keyId !== 'string' || !REPAIR_CONTRACT_KEY_ID_PATTERN.test(envelope.signature.keyId)) {
    return { ok: false, code: 'invalid-key-id' };
  }

  let signature: Uint8Array;
  try {
    if (typeof envelope.signature.value !== 'string') throw new TypeError('Neispravan potpis.');
    signature = fromBase64Url(envelope.signature.value);
  } catch {
    return { ok: false, code: 'invalid-signature-encoding' };
  }
  if (signature.length !== REPAIR_CONTRACT_SIGNATURE_BYTES) {
    return { ok: false, code: 'invalid-signature-encoding' };
  }

  try {
    const verified = await crypto.subtle.verify(
      ECDSA_SHA_256,
      publicKey,
      new Uint8Array(signature),
      contractBytes(envelope.payload),
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
