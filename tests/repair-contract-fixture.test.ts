import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  importRepairContractPublicKey,
  parseRepairContractV1,
  sha256Hex,
  verifyRepairContractV1,
} from '../src/repair/contract';

const FIXTURE_SOURCE_BYTES = new TextEncoder().encode('PK-public-repair-contract-v1');
const FIXTURE_CONFIRMATION_TEXT = 'Dopuštam promjenu velikih i malih slova u naslovima.';
const fixtureDir = resolve(process.cwd(), 'tests', 'fixtures', 'repair-contract-v1');
const contractPath = resolve(fixtureDir, 'valid-contract.json');
const publicKeyPath = resolve(fixtureDir, 'public-key.spki.b64url');

describe('javni Repair Contract v1 fixture', () => {
  it('je parsabilan, stabilnog sadrzaja i kriptografski valjan', async () => {
    const raw = JSON.parse(readFileSync(contractPath, 'utf8')) as unknown;
    const parsed = parseRepairContractV1(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const contract = parsed.contract;
    const publicKey = await importRepairContractPublicKey(readFileSync(publicKeyPath, 'utf8').trim());

    expect(contract).toMatchObject({
      contractVersion: 1,
      jobId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      sourceFileName: 'Kalogjera - seminar Havel.docx',
      engineMinVersion: '1.0.0',
      engineMaxVersion: '1.0.0',
      contractSignature: { algorithm: 'ES256-P1363', keyId: 'fixture-2026-08-16' },
    });
    expect(contract.sourceSize).toBe(FIXTURE_SOURCE_BYTES.length);
    expect(contract.sourceSha256).toBe(await sha256Hex(FIXTURE_SOURCE_BYTES));
    expect(contract.requests).toEqual([
      { requestId: 'req-0001', fixerId: 'font-fixer', ruleId: 'body-font', params: { fontName: 'Times New Roman', fontSizePt: 12 } },
      { requestId: 'req-0002', fixerId: 'heading-case-fixer', ruleId: 'heading-case', params: { levels: [1, 2] } },
    ]);
    expect(contract.allowedExceptions).toEqual([{
      requestId: 'req-0002',
      scope: 'visible-text',
      confirmationSha256: await sha256Hex(new TextEncoder().encode(FIXTURE_CONFIRMATION_TEXT)),
      confirmedAt: '2026-08-16T09:59:00.000Z',
    }]);
    expect(await verifyRepairContractV1(contract, publicKey)).toEqual({ ok: true });
  });
});
