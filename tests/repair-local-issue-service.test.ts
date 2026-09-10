import { describe, expect, it } from 'vitest';

import { sha256Hex, verifyRepairContractV1 } from '../src/repair/contract/index.ts';
import { issueLocalRepairJob } from '../src/repair/local-runner/issue-service.ts';

const SOURCE_BYTES = new TextEncoder().encode('PK-local-issue-source');
const TARGET_BYTES = new TextEncoder().encode('PK-local-issue-target');
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SLOT_ID = '33333333-3333-4333-8333-333333333333';

describe('local repair entitlement issuer', () => {
  it('vraca sirovi claim token samo u launch grani, a u zapis sprema potpisani ugovor i hash', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair;
    const tokenBytes = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);

    const issued = await issueLocalRepairJob({
      jobId: JOB_ID,
      userId: USER_ID,
      slotId: SLOT_ID,
      sourceBytes: SOURCE_BYTES,
      sourceFileName: 'Seminar.docx',
      targetBytes: TARGET_BYTES,
      targetFileName: 'Seminar-popravljeno.docx',
      createdAt: new Date('2026-08-24T19:00:00.000Z'),
      expiresAt: new Date('2026-08-25T19:00:00.000Z'),
      requests: [{
        fixerId: 'font-fixer',
        ruleId: 'body-font',
        params: { fontName: 'Times New Roman', fontSizePt: 12 },
      }],
      confirmations: [],
      signer: { privateKey: pair.privateKey, keyId: 'lekta-2026-08' },
    }, {
      randomBytes: (length) => {
        expect(length).toBe(32);
        return new Uint8Array(tokenBytes);
      },
    });

    expect(issued.launch).toEqual({
      version: 1,
      jobId: JOB_ID,
      claimToken: '__79_Pv6-fj39vX08_Lx8O_u7ezr6uno5-bl5OPi4eA',
      expiresAt: '2026-08-25T19:00:00.000Z',
    });
    expect(issued.record).toMatchObject({
      jobId: JOB_ID,
      userId: USER_ID,
      slotId: SLOT_ID,
      localState: 'claimable',
      contractKeyId: 'lekta-2026-08',
      claimTokenSha256: await sha256Hex(tokenBytes),
      claimExpiresAt: '2026-08-25T19:00:00.000Z',
    });
    expect(issued.record.sourceSha256).toBe(await sha256Hex(SOURCE_BYTES));
    expect(issued.record.targetSha256).toBe(await sha256Hex(TARGET_BYTES));
    expect(await verifyRepairContractV1(issued.record.repairContract, pair.publicKey)).toEqual({ ok: true });

    const stored = JSON.stringify(issued.record);
    expect(stored).not.toContain(issued.launch.claimToken);
    expect(issued.record).not.toHaveProperty('privateKey');
    expect(issued.record).not.toHaveProperty('signer');
  });
});
