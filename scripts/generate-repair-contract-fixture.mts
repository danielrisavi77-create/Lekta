import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildUnsignedRepairContractV1,
  canonicalJson,
  importRepairContractPrivateKey,
  importRepairContractPublicKey,
  parseRepairContractV1,
  signRepairContractV1,
  unsignedPayload,
  verifyRepairContractV1,
  type JsonValue,
  type RepairContractV1,
} from '../src/repair/contract/index.ts';

// TEST FIXTURE ONLY. Ovaj privatni kljuc nema produkcijsku vrijednost i ne smije napustiti generator.
const FIXTURE_PRIVATE_KEY_PKCS8 = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgeuHCl2jPCcGOUtcZBKAI53bp0yOInplM4h11YQKQck-hRANCAAQPIRYkQlJcCornZZeV3WjQJAGQh8vFidOk-p2Cgn19R2ZsRtMJLqkS4FhIr7qfIazLKA1jAMC1I4Oz4xJLNAIc';
const FIXTURE_PUBLIC_KEY_SPKI = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEDyEWJEJSXAqK52WXld1o0CQBkIfLxYnTpPqdgoJ9fUdmbEbTCS6pEuBYSK-6nyGsyygNYwDAtSODs-MSSzQCHA';
const SOURCE_BYTES = new TextEncoder().encode('PK-public-repair-contract-v1');
const CONFIRMATION_TEXT = 'Dopuštam promjenu velikih i malih slova u naslovima.';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = join(root, 'tests', 'fixtures', 'repair-contract-v1');
const contractPath = join(fixtureDir, 'valid-contract.json');
const publicKeyPath = join(fixtureDir, 'public-key.spki.b64url');

const payload = await buildUnsignedRepairContractV1({
  jobId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  sourceBytes: SOURCE_BYTES,
  sourceFileName: 'Kalogjera - seminar Havel.docx',
  createdAt: new Date('2026-08-16T10:00:00.000Z'),
  expiresAt: new Date('2026-08-16T11:00:00.000Z'),
  engineMinVersion: '1.0.0',
  engineMaxVersion: '1.0.0',
  requests: [
    { fixerId: 'font-fixer', ruleId: 'body-font', params: { fontName: 'Times New Roman', fontSizePt: 12 } },
    { fixerId: 'heading-case-fixer', ruleId: 'heading-case', params: { levels: [1, 2] } },
  ],
  confirmations: [{
    requestIndex: 1,
    confirmationText: CONFIRMATION_TEXT,
    confirmedAt: new Date('2026-08-16T09:59:00.000Z'),
  }],
});

const publicKey = await importRepairContractPublicKey(FIXTURE_PUBLIC_KEY_SPKI);
let contract: RepairContractV1 | null = null;

// Web Crypto ECDSA koristi nasumicni nonce. Postojeci potpis cuvamo samo ako je kriptografski
// valjan i kanonski unsigned payload nije promijenjen; time je generator idempotentan bez vlastite
// ili nestandardne implementacije ECDSA-e.
if (existsSync(contractPath)) {
  try {
    const parsed = parseRepairContractV1(JSON.parse(readFileSync(contractPath, 'utf8')) as unknown);
    if (parsed.ok
      && (await verifyRepairContractV1(parsed.contract, publicKey)).ok
      && canonicalJson(unsignedPayload(parsed.contract) as unknown as JsonValue)
        === canonicalJson(payload as unknown as JsonValue)) {
      contract = parsed.contract;
    }
  } catch {
    contract = null;
  }
}

if (!contract) {
  const privateKey = await importRepairContractPrivateKey(FIXTURE_PRIVATE_KEY_PKCS8);
  contract = await signRepairContractV1(payload, privateKey, 'fixture-2026-08-16');
}

mkdirSync(fixtureDir, { recursive: true });
writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
writeFileSync(publicKeyPath, `${FIXTURE_PUBLIC_KEY_SPKI}\n`, 'utf8');

console.log('zapisano: tests/fixtures/repair-contract-v1/valid-contract.json');
console.log('zapisano: tests/fixtures/repair-contract-v1/public-key.spki.b64url');
