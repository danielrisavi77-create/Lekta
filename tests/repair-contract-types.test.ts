import { describe, expect, it } from 'vitest';
import { FIXER_IDS as APPLY_FIXER_IDS } from '../src/repair/apply-fixers';
import {
  GOLDEN_GATES,
  REPAIR_CONTRACT_MAX_REQUESTS,
  REPAIR_CONTRACT_SIGNATURE_ALGORITHM,
  REPAIR_CONTRACT_VERSION,
  type RepairContractV1,
} from '../src/repair/contract';
import { FIXER_IDS } from '../src/repair/fixer-registry';

describe('Repair Contract v1 wire tipovi', () => {
  it('zakljucava verziju, potpis i G0-G9', () => {
    expect(REPAIR_CONTRACT_VERSION).toBe(1);
    expect(REPAIR_CONTRACT_MAX_REQUESTS).toBe(64);
    expect(REPAIR_CONTRACT_SIGNATURE_ALGORITHM).toBe('ES256-P1363');
    expect(GOLDEN_GATES).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);
  });

  it('ima jedan registry za contract i OOXML executor', () => {
    expect(FIXER_IDS).toBe(APPLY_FIXER_IDS);
    expect(FIXER_IDS).toHaveLength(31);
  });

  it('trazi novu datoteku i zabranu prepisivanja izvora', () => {
    const output: RepairContractV1['outputPolicy'] = {
      mode: 'new-file',
      overwriteSource: false,
      suggestedFileName: 'rad-popravljeno.docx',
    };
    expect(output).toEqual(expect.objectContaining({ mode: 'new-file', overwriteSource: false }));
  });
});
