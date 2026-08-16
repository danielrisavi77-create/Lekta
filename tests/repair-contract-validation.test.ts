import { describe, expect, it } from 'vitest';
import {
  parseRepairContractV1,
  unsignedPayload,
  validateRepairContractContext,
  type RepairContractV1,
} from '../src/repair/contract';
import { TEST_SOURCE_BYTES, validContract } from './helpers/repair-contract';

const validContext = {
  now: new Date('2026-08-16T10:30:00.000Z'),
  sourceBytes: TEST_SOURCE_BYTES,
  engineVersion: '1.0.0',
};

const textRequest = {
  requestId: 'req-0001',
  fixerId: 'title-page-fixer' as const,
  ruleId: 'title-page',
  params: { paragraphCount: 1, lines: [{ text: 'Naslov' }] },
};

const textException = {
  requestId: 'req-0001',
  scope: 'visible-text' as const,
  confirmationSha256: 'a'.repeat(64),
  confirmedAt: '2026-08-16T09:30:00.000Z',
};

describe('Repair Contract v1 parser', () => {
  it('prihvaca strogo valjani ugovor i izdvaja nepotpisani payload', () => {
    const contract = validContract();
    expect(parseRepairContractV1(contract)).toEqual({ ok: true, contract });
    expect(unsignedPayload(contract)).toEqual(expect.not.objectContaining({ contractSignature: expect.anything() }));
    expect(unsignedPayload(contract)).toMatchObject({ jobId: contract.jobId, requests: contract.requests });
  });

  it.each([
    ['contractVersion', 2, 'unsupported-version'],
    ['sourceSha256', 'abc', 'invalid-hash'],
    ['sourceSize', -1, 'invalid-shape'],
    ['outputPolicy', { mode: 'new-file', overwriteSource: true, suggestedFileName: 'x.docx' }, 'unsafe-output-policy'],
  ])('odbija %s', (field, value, code) => {
    const contract = validContract({ [field]: value } as Partial<RepairContractV1>);
    expect(parseRepairContractV1(contract)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code })]),
    });
  });

  it('odbija nepoznati top-level kljuc i neispravne identitete', () => {
    expect(parseRepairContractV1({ ...validContract(), command: 'Start-Process' }))
      .toMatchObject({ ok: false, issues: [{ code: 'invalid-shape' }] });
    expect(parseRepairContractV1(validContract({ jobId: 'not-a-uuid' })))
      .toMatchObject({ ok: false, issues: [{ code: 'invalid-id' }] });
  });

  it('odbija skriveni podatkovni kljuc umjesto da ga parser previdi', () => {
    const contract = validContract() as RepairContractV1 & { command?: string };
    Object.defineProperty(contract, 'command', { value: 'Start-Process', enumerable: false });
    expect(parseRepairContractV1(contract)).toMatchObject({ ok: false, issues: [{ code: 'invalid-shape' }] });
  });

  it.each(['../Seminar.docx', 'CON.docx', 'NUL .docx', 'Semi:nar.docx', 'Seminar.pdf', 'a'.repeat(176) + '.docx'])(
    'odbija opasno ili neispravno ime datoteke: %s',
    (sourceFileName) => {
      expect(parseRepairContractV1(validContract({ sourceFileName })))
        .toMatchObject({ ok: false, issues: [{ code: 'invalid-shape' }] });
    },
  );

  it.each(['1.0', '1.0.0-beta', '10000.0.0'])(
    'odbija neispravan SemVer: %s',
    (engineMinVersion) => {
      expect(parseRepairContractV1(validContract({ engineMinVersion })))
        .toMatchObject({ ok: false, issues: [{ code: 'invalid-shape' }] });
    },
  );

  it('prosljeduje strogu request-policy gresku', () => {
    const requests = [{ ...validContract().requests[0], fixerId: 'powershell-fixer' }] as never;
    expect(parseRepairContractV1(validContract({ requests })))
      .toMatchObject({ ok: false, issues: [{ code: 'request-policy' }] });
  });

  it('zahtijeva svih G0-G9 i svih pet sigurnosnih boolean polja', () => {
    const policy = validContract().verificationPolicy;
    expect(parseRepairContractV1(validContract({
      verificationPolicy: { ...policy, requiredGates: policy.requiredGates.slice(0, 9) },
    }))).toMatchObject({ ok: false, issues: [{ code: 'insufficient-verification-policy' }] });
    expect(parseRepairContractV1(validContract({
      verificationPolicy: { ...policy, requireSourceByteIdentity: false as true },
    }))).toMatchObject({ ok: false, issues: [{ code: 'insufficient-verification-policy' }] });
  });

  it('za text-mutating fixer zahtijeva tocno jednu odgovarajucu potvrdu', () => {
    expect(parseRepairContractV1(validContract({ requests: [textRequest], allowedExceptions: [] })))
      .toMatchObject({ ok: false, issues: [{ code: 'missing-exception' }] });
    expect(parseRepairContractV1(validContract({ requests: [textRequest], allowedExceptions: [textException] })))
      .toMatchObject({ ok: true });
    expect(parseRepairContractV1(validContract({ requests: [textRequest], allowedExceptions: [textException, textException] })))
      .toMatchObject({ ok: false, issues: [{ code: 'missing-exception' }] });
    expect(parseRepairContractV1(validContract({
      requests: [textRequest],
      allowedExceptions: [{ ...textException, scope: 'metadata' }],
    }))).toMatchObject({ ok: false, issues: [{ code: 'missing-exception' }] });
  });

  it('odbija orphan i prestaru ili buducu potvrdu', () => {
    expect(parseRepairContractV1(validContract({
      allowedExceptions: [{ ...textException, requestId: 'req-9999' }],
    }))).toMatchObject({ ok: false, issues: [{ code: 'orphan-exception' }] });
    for (const confirmedAt of ['2026-08-15T09:59:59.999Z', '2026-08-16T10:00:00.001Z']) {
      expect(parseRepairContractV1(validContract({
        requests: [textRequest],
        allowedExceptions: [{ ...textException, confirmedAt }],
      }))).toMatchObject({ ok: false, issues: [{ code: 'invalid-time' }] });
    }
  });
});

describe('Repair Contract v1 kontekst', () => {
  it('prihvaca valjani izvor, vrijeme, identitete i engine', async () => {
    expect(await validateRepairContractContext(validContract(), validContext)).toEqual({ ok: true });
  });

  it('odbija istek, buduci createdAt i lifetime iznad 24 sata', async () => {
    expect(await validateRepairContractContext(validContract(), { ...validContext, now: new Date('2026-08-16T11:00:00.000Z') }))
      .toMatchObject({ ok: false, issues: [{ code: 'expired' }] });
    expect(await validateRepairContractContext(validContract(), { ...validContext, now: new Date('2026-08-16T09:59:59.999Z') }))
      .toMatchObject({ ok: false, issues: [{ code: 'invalid-time' }] });
    expect(await validateRepairContractContext(validContract({ expiresAt: '2026-08-17T10:00:00.001Z' }), validContext))
      .toMatchObject({ ok: false, issues: [{ code: 'lifetime-too-long' }] });
  });

  it('odbija krivi job i user identitet', async () => {
    expect(await validateRepairContractContext(validContract(), { ...validContext, expectedJobId: 'other' }))
      .toMatchObject({ ok: false, issues: [{ code: 'invalid-id', path: 'jobId' }] });
    expect(await validateRepairContractContext(validContract(), { ...validContext, expectedUserId: 'other' }))
      .toMatchObject({ ok: false, issues: [{ code: 'invalid-id', path: 'userId' }] });
  });

  it('odbija krivu velicinu i isti naziv s drugim bajtovima', async () => {
    expect(await validateRepairContractContext(validContract({ sourceSize: 4 }), validContext))
      .toMatchObject({ ok: false, issues: [{ code: 'source-size-mismatch' }] });
    expect(await validateRepairContractContext(validContract(), { ...validContext, sourceBytes: new TextEncoder().encode('abd') }))
      .toMatchObject({ ok: false, issues: [{ code: 'source-hash-mismatch' }] });
  });

  it.each(['0.9.9', '1.0.1'])('odbija engine izvan ukljucivog raspona: %s', async (engineVersion) => {
    expect(await validateRepairContractContext(validContract(), { ...validContext, engineVersion }))
      .toMatchObject({ ok: false, issues: [{ code: 'engine-out-of-range' }] });
  });
});
