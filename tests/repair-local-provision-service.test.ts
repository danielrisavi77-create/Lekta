import { describe, expect, it, vi } from 'vitest';

import { provisionLocalRepairJob } from '../src/repair/local-runner/provision-service.ts';
import type { IssuedLocalRepairJob, IssueLocalRepairInput } from '../src/repair/local-runner/issue-service.ts';

const issueInput = {
  jobId: '33333333-3333-4333-8333-333333333333',
  userId: '11111111-1111-4111-8111-111111111111',
  slotId: '22222222-2222-4222-8222-222222222222',
  sourceBytes: new Uint8Array([0x50, 0x4b, 1]),
  sourceFileName: 'Seminar.docx',
  targetBytes: new Uint8Array([0x50, 0x4b, 2]),
  targetFileName: 'Seminar-popravljeno.docx',
  createdAt: new Date('2026-08-24T19:00:00.000Z'),
  expiresAt: new Date('2026-08-25T19:00:00.000Z'),
  requests: [{ fixerId: 'font-fixer', ruleId: 'body-font', params: { fontName: 'Times New Roman' } }],
  confirmations: [],
} satisfies Omit<IssueLocalRepairInput, 'signer'>;

describe('local repair provisioning', () => {
  it('ne dodiruje privatni kljuc kada lokalni put nije omogucen', async () => {
    const importSigner = vi.fn();
    const result = await provisionLocalRepairJob(issueInput, {
      enabled: false,
      privateKeyPkcs8Base64Url: '',
      keyId: '',
    }, { importSigner, issue: vi.fn() });

    expect(result).toEqual({ ok: false, code: 'disabled' });
    expect(importSigner).not.toHaveBeenCalled();
  });

  it('izdaje posao samo s konfiguriranim signerom', async () => {
    const privateKey = {} as CryptoKey;
    const issued = {
      launch: { version: 1, jobId: issueInput.jobId, claimToken: 'A'.repeat(43), expiresAt: issueInput.expiresAt.toISOString() },
      record: { jobId: issueInput.jobId },
    } as IssuedLocalRepairJob;
    const issue = vi.fn(async (_input: IssueLocalRepairInput) => issued);
    const result = await provisionLocalRepairJob(issueInput, {
      enabled: true,
      privateKeyPkcs8Base64Url: 'private-key-secret',
      keyId: 'lekta-2026-08',
    }, {
      importSigner: async (encoded) => {
        expect(encoded).toBe('private-key-secret');
        return privateKey;
      },
      issue,
    });

    expect(result).toEqual({ ok: true, issued });
    expect(issue).toHaveBeenCalledWith({
      ...issueInput,
      signer: { privateKey, keyId: 'lekta-2026-08' },
    });
  });

  it('ne kvari serverski rezultat kada signer ili contract provisioning padne', async () => {
    const result = await provisionLocalRepairJob(issueInput, {
      enabled: true,
      privateKeyPkcs8Base64Url: 'bad-key',
      keyId: 'lekta-2026-08',
    }, {
      importSigner: async () => { throw new Error('key import failed'); },
      issue: vi.fn(),
    });

    expect(result).toEqual({ ok: false, code: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain('bad-key');
  });
});
