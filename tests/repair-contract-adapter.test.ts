import { describe, expect, it } from 'vitest';

import { buildRecipe } from '../src/repair/recipe';
import {
  buildUnsignedRepairContractV1,
  parseContractRequests,
  sha256Hex,
  type BuildRepairContractInput,
} from '../src/repair/contract';

const SOURCE_BYTES = new TextEncoder().encode('PK-test-docx');

function input(overrides: Partial<BuildRepairContractInput> = {}): BuildRepairContractInput {
  return {
    jobId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    sourceBytes: SOURCE_BYTES,
    sourceFileName: 'Seminar.docx',
    createdAt: new Date('2026-08-16T10:00:00.000Z'),
    expiresAt: new Date('2026-08-16T11:00:00.000Z'),
    engineMinVersion: '1.0.0',
    engineMaxVersion: '1.0.0',
    requests: [{ fixerId: 'font-fixer', ruleId: 'body-font', params: { fontName: 'Times New Roman', fontSizePt: 12 } }],
    confirmations: [],
    ...overrides,
  };
}

describe('Repair Contract adapter', () => {
  it('gradi strogi unsigned contract iz stvarnih source bajtova', async () => {
    const contract = await buildUnsignedRepairContractV1(input());

    expect(contract.requests[0].requestId).toBe('req-0001');
    expect(contract.sourceSize).toBe(SOURCE_BYTES.length);
    expect(contract.sourceSha256).toBe(await sha256Hex(SOURCE_BYTES));
    expect(contract.outputPolicy).toEqual({ mode: 'new-file', overwriteSource: false, suggestedFileName: 'Seminar-popravljeno.docx' });
    expect(contract.verificationPolicy.requiredGates).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);
  });

  it('ocuva redoslijed i params te deterministicki dodjeljuje request ID-eve', async () => {
    const requests = [
      { fixerId: 'font-fixer', ruleId: 'font', params: { fontName: 'Arial', deep: true } },
      { fixerId: 'alignment-fixer', ruleId: 'alignment', params: { val: 'both' } },
    ];

    const contract = await buildUnsignedRepairContractV1(input({ requests }));

    expect(contract.requests.map((request) => request.requestId)).toEqual(['req-0001', 'req-0002']);
    expect(contract.requests.map(({ fixerId, ruleId, params }) => ({ fixerId, ruleId, params }))).toEqual(requests);
  });

  it('postuje izricito predlozeno ime izlaza', async () => {
    const contract = await buildUnsignedRepairContractV1(input({ suggestedFileName: 'Gotov seminar.docx' }));

    expect(contract.outputPolicy.suggestedFileName).toBe('Gotov seminar.docx');
  });

  it('hashira tekst potvrde koji je korisnik stvarno vidio i izvodi scope iz fixera', async () => {
    const confirmationText = 'Dopuštam promjenu velikih i malih slova u naslovima.';
    const confirmedAt = new Date('2026-08-16T09:59:00.000Z');
    const contract = await buildUnsignedRepairContractV1(input({
      requests: [{ fixerId: 'heading-case-fixer', ruleId: 'heading-case', params: { levels: [1, 2] } }],
      confirmations: [{ requestIndex: 0, confirmationText, confirmedAt }],
    }));

    expect(contract.allowedExceptions).toEqual([{
      requestId: 'req-0001',
      scope: 'visible-text',
      confirmationSha256: await sha256Hex(new TextEncoder().encode(confirmationText)),
      confirmedAt: confirmedAt.toISOString(),
    }]);
  });

  it.each([
    ['field-integrity-fixer', { version: 1, fields: [] }, 'structure'],
    ['submission-metadata-fixer', { version: 1, fields: [] }, 'metadata'],
  ] as const)('izvodi scope iz %s zahtjeva', async (fixerId, params, scope) => {
    const contract = await buildUnsignedRepairContractV1(input({
      requests: [{ fixerId, ruleId: `${fixerId}-rule`, params }],
      confirmations: [{ requestIndex: 0, confirmationText: 'Potvrđujem promjenu.', confirmedAt: new Date('2026-08-16T09:59:00.000Z') }],
    }));

    expect(contract.allowedExceptions[0].scope).toBe(scope);
  });

  it('odbija izostalu, suvisnu, duplu i izvan-dosega potvrdu', async () => {
    const textRequest = [{ fixerId: 'heading-case-fixer', ruleId: 'heading-case', params: { levels: [1] } }];
    const confirmation = { requestIndex: 0, confirmationText: 'Potvrđujem.', confirmedAt: new Date('2026-08-16T09:59:00.000Z') };

    await expect(buildUnsignedRepairContractV1(input({ requests: textRequest }))).rejects.toThrow(/potvrd/i);
    await expect(buildUnsignedRepairContractV1(input({ confirmations: [confirmation] }))).rejects.toThrow(/potvrd/i);
    await expect(buildUnsignedRepairContractV1(input({ requests: textRequest, confirmations: [confirmation, confirmation] }))).rejects.toThrow(/dupl|potvrd/i);
    await expect(buildUnsignedRepairContractV1(input({ confirmations: [{ ...confirmation, requestIndex: 1 }] }))).rejects.toThrow(/indeks|potvrd/i);
  });

  it('fail-closed odbija zahtjev koji ne prolazi postojecu request policy', async () => {
    await expect(buildUnsignedRepairContractV1(input({
      requests: [{ fixerId: 'nepostojeci-fixer', ruleId: 'x', params: {} }],
    }))).rejects.toThrow(/unknown-fixer|zahtjev/i);
  });
});

describe('kompatibilnost adaptera sa svim generiranim receptima', () => {
  it('svaku izvrsivu recipe stavku prihvaca, a opisne i unsafe stavke eksplicitno drzi izvan wire ugovora', () => {
    const composites: string[] = [];
    const documentDependent: string[] = [];
    const unsafeLegacy: string[] = [];
    const failures: string[] = [];

    for (const profile of buildRecipe()) {
      for (const item of profile.items) {
        if (item.fixerId.includes(' / ')) {
          composites.push(`${profile.id}/${item.ruleId}/${item.fixerId}`);
          const denied = parseContractRequests([{ requestId: 'req-0001', fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }]);
          expect(denied.ok).toBe(false);
          if (!denied.ok) expect(denied.issues[0].code).toBe('unknown-fixer');
          continue;
        }
        if (item.fixerId === 'toc-field-fixer' && item.ruleId === 'toc-field-universal' && Object.keys(item.params).length === 0) {
          documentDependent.push(`${profile.id}/${item.ruleId}`);
          const pendingTarget = parseContractRequests([{
            requestId: 'req-0001',
            fixerId: item.fixerId,
            ruleId: item.ruleId,
            params: item.params,
          }]);
          expect(pendingTarget.ok).toBe(false);
          if (!pendingTarget.ok) expect(pendingTarget.issues[0].code).toBe('invalid-param');
          continue;
        }
        const parsed = parseContractRequests([{
          requestId: 'req-0001',
          fixerId: item.fixerId,
          ruleId: item.ruleId,
          params: item.params,
        }]);
        if (!parsed.ok) {
          const identity = `${profile.id}/${item.fixerId}/${item.ruleId}: ${parsed.issues[0].code}`;
          if (identity === 'pmf-matematika-graduate/line-spacing-fixer/pmf-matematika-graduate--line-spacing: invalid-param') {
            unsafeLegacy.push(identity);
          } else {
            failures.push(identity);
          }
        }
      }
    }

    expect(composites.length).toBeGreaterThan(0);
    expect(composites.every((entry) => entry.includes('page-numbering-fixer / section-insert-fixer'))).toBe(true);
    expect(documentDependent.length).toBeGreaterThan(0);
    expect(parseContractRequests([{
      requestId: 'req-0001',
      fixerId: 'toc-field-fixer',
      ruleId: 'toc-field-universal',
      params: { target: { sadrzajParagraphIndex: 0 } },
    }]).ok).toBe(true);
    expect(unsafeLegacy).toEqual([
      'pmf-matematika-graduate/line-spacing-fixer/pmf-matematika-graduate--line-spacing: invalid-param',
    ]);
    expect(failures).toEqual([]);
  });
});
