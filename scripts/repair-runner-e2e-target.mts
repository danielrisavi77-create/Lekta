import { analyzeFieldIntegrity } from '../src/analysis/field-integrity.ts';
import {
  applyFixers,
  type FixerRequest,
} from '../src/repair/apply-fixers.ts';
import { validateAssistedParams } from '../src/repair/contract/assisted-request-policy.ts';
import { readZip } from '../src/repair/zip-codec.ts';
import { fieldIntegrityRepairableItem } from '../src/ui/repair-items.ts';

export interface FieldStableTarget {
  docxBytes: Uint8Array;
  request: FixerRequest | null;
  removedFields: number;
  requiresConfirmation: boolean;
  confirmationText: string | null;
}

function xmlParts(entries: Awaited<ReturnType<typeof readZip>>): Record<string, string> {
  const decoder = new TextDecoder();
  return Object.fromEntries(
    entries
      .filter((entry) => entry.name.endsWith('.xml'))
      .map((entry) => [entry.name, decoder.decode(entry.data)]),
  );
}

export async function prepareFieldStableTarget(
  docxBytes: Uint8Array,
): Promise<FieldStableTarget> {
  const entries = await readZip(docxBytes);
  const integrity = analyzeFieldIntegrity({ parts: xmlParts(entries) });
  const item = fieldIntegrityRepairableItem({
    details: { fieldIntegrity: integrity },
  })[0];
  const form = item?.fieldIntegrityForm;

  if (!form) {
    return { docxBytes, request: null, removedFields: 0, requiresConfirmation: false, confirmationText: null };
  }

  const fields = form.fields.map((field) => ({
    ...field,
    selected: field.action === 'remove-orphan-control',
  }));
  const removedFields = fields.filter((field) => field.selected).length;
  if (removedFields === 0) {
    return { docxBytes, request: null, removedFields: 0, requiresConfirmation: false, confirmationText: null };
  }
  if (item.requiresConfirmation !== true || !item.confirmationText) {
    throw new Error('Field-integrity structural repair is missing explicit confirmation text.');
  }

  const params = form.buildParams({
    ...form,
    fields,
    manualTocCandidates: form.manualTocCandidates.map((candidate) => ({
      ...candidate,
      selected: false,
    })),
    bookmarks: form.bookmarks.map((bookmark) => ({ ...bookmark, selected: false })),
  });
  if (!validateAssistedParams('field-integrity-fixer', params)) {
    throw new Error('Generated field-integrity request failed contract validation.');
  }

  const request: FixerRequest = {
    fixerId: 'field-integrity-fixer',
    ruleId: 'field-integrity-orphan-control',
    params,
  };
  const repaired = await applyFixers(docxBytes, [request]);
  if (repaired.integrityFailure || repaired.skipped.length || repaired.changelog.length !== 1) {
    throw new Error('Field-integrity orphan-control repair did not apply atomically.');
  }

  return {
    docxBytes: repaired.docxBytes,
    request,
    removedFields,
    requiresConfirmation: true,
    confirmationText: item.confirmationText,
  };
}
