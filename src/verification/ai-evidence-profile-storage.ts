import type { ThesisProfile, VerificationLedgerEntry } from '../profiles/profile-schema';

export type AiEvidenceDraftDocument = Record<string, unknown>;

export type AiEvidencePersistencePlan =
  | {
      ok: true;
      draftDocument: AiEvidenceDraftDocument;
      ledger: VerificationLedgerEntry[];
      updatedRuleIds: string[];
      addedLedgerIds: string[];
    }
  | { ok: false; errors: string[] };

function draftEntries(document: AiEvidenceDraftDocument, profileId: string): unknown[] | null {
  if (document.profileId === profileId && Array.isArray(document.entries)) return document.entries;
  const profiles = document.profiles;
  if (typeof profiles !== 'object' || profiles === null || Array.isArray(profiles)) return null;
  const entries = (profiles as Record<string, unknown>)[profileId];
  return Array.isArray(entries) ? entries : null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Priprema atomski plan upisa jednog već auditiranog profila.
 * Ne mijenja ulaze, čuva neciljane profile/zapise i odbija djelomične ili kolidirajuće upise.
 */
export function prepareAiEvidenceProfilePersistence(
  currentDraftDocument: AiEvidenceDraftDocument,
  auditedProfile: ThesisProfile,
  currentLedger: VerificationLedgerEntry[],
  additions: VerificationLedgerEntry[],
): AiEvidencePersistencePlan {
  const errors: string[] = [];
  if (auditedProfile.id !== currentDraftDocument.profileId
      && !Object.hasOwn((currentDraftDocument.profiles as object | null) ?? {}, auditedProfile.id)) {
    errors.push(`${auditedProfile.id}: draft dokument ne sadrži ciljani profil.`);
  }
  const beforeEntries = draftEntries(currentDraftDocument, auditedProfile.id);
  if (!beforeEntries) return { ok: false, errors: [`${auditedProfile.id}: ne mogu razriješiti popis pravila u draft dokumentu.`] };

  const validBefore = beforeEntries.filter((entry): entry is Record<string, unknown> =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  );
  if (validBefore.length !== beforeEntries.length) {
    errors.push(`${auditedProfile.id}: draft sadrži zapis koji nije objekt.`);
  }
  const beforeById = new Map<string, Record<string, unknown>>();
  for (const entry of validBefore) {
    const id = entry.ruleId;
    if (typeof id !== 'string' || beforeById.has(id)) {
      errors.push(`${auditedProfile.id}: draft ima nedostajući ili duplicirani ruleId.`);
      continue;
    }
    beforeById.set(id, entry);
  }

  const updatedEntries = auditedProfile.ruleEntries ?? [];
  const updatedById = new Map(updatedEntries.map((entry) => [entry.ruleId, entry]));
  const scoredIds = updatedEntries.filter((entry) => entry.scored === true).map((entry) => entry.ruleId);
  const auditedIds = updatedEntries
    .filter((entry) => entry.scored === true && entry.confirmedVia === 'ai-evidence-audit')
    .map((entry) => entry.ruleId);
  if (!auditedIds.length || new Set(scoredIds).size !== scoredIds.length
      || new Set(auditedIds).size !== auditedIds.length) {
    errors.push(`${auditedProfile.id}: AI-audit rezultat nema jedinstvena bodovana pravila.`);
  }
  if (scoredIds.length !== auditedIds.length || scoredIds.some((id) => !auditedIds.includes(id))) {
    errors.push(`${auditedProfile.id}: prijelaz ne pokriva sva bodovana pravila profila.`);
  }
  for (const ruleId of auditedIds) {
    if (!beforeById.has(ruleId)) errors.push(`${auditedProfile.id}/${ruleId}: pravilo nedostaje u draftu.`);
    if (!updatedById.has(ruleId)) errors.push(`${auditedProfile.id}/${ruleId}: auditirani zapis nedostaje.`);
  }
  for (const addition of additions) {
    if (addition.profileId !== auditedProfile.id || addition.action !== 'ai-confirmed'
        || addition.actor !== 'ai-evidence-audit') {
      errors.push(`${auditedProfile.id}/${addition.ruleId}: ledger dodatak nije AI potvrda ciljanog profila.`);
    }
  }
  const additionIds = new Set(additions.map((entry) => entry.ruleId));
  if (additions.length !== auditedIds.length || additionIds.size !== auditedIds.length
      || auditedIds.some((id) => !additionIds.has(id))) {
    errors.push(`${auditedProfile.id}: AI potvrde i bodovana pravila nisu potpuni 1:1 skup.`);
  }
  for (const addition of additions) {
    const entry = updatedById.get(addition.ruleId);
    if (entry && (entry.confirmedVia !== 'ai-evidence-audit'
        || addition.sourceId !== (entry.sourceId ?? null)
        || addition.sourcePage !== (entry.sourcePage ?? null)
        || addition.quote !== (entry.quote ?? null))) {
      errors.push(`${auditedProfile.id}/${addition.ruleId}: ledger dokaz ne odgovara auditiranom pravilu.`);
    }
  }

  const currentById = new Map(currentLedger.map((entry) => [entry.id, entry]));
  const addedLedgerIds: string[] = [];
  for (const addition of additions) {
    const existing = currentById.get(addition.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(addition)) {
      errors.push(`${addition.id}: kolizija ledger ID-ja s drukčijim sadržajem.`);
    } else if (!existing) {
      addedLedgerIds.push(addition.id);
    }
  }

  if (errors.length) return { ok: false, errors };

  const draftDocument = cloneJson(currentDraftDocument);
  const currentTargetEntries = draftEntries(draftDocument, auditedProfile.id)!;
  const replaced = new Set<string>();
  const nextTargetEntries = currentTargetEntries.map((value) => {
    const entry = value as Record<string, unknown>;
    const ruleId = typeof entry.ruleId === 'string' ? entry.ruleId : '';
    const replacement = updatedById.get(ruleId);
    if (!replacement || !auditedIds.includes(ruleId)) return value;
    replaced.add(ruleId);
    return cloneJson(replacement);
  });
  if (replaced.size !== auditedIds.length) {
    return { ok: false, errors: [`${auditedProfile.id}: samoprovjera zamjene nije obuhvatila sva pravila.`] };
  }
  if (draftDocument.profileId === auditedProfile.id) {
    draftDocument.entries = nextTargetEntries;
  } else {
    const profiles = draftDocument.profiles as Record<string, unknown>;
    profiles[auditedProfile.id] = nextTargetEntries;
  }

  const ledger = [...currentLedger];
  const currentIds = new Set(currentLedger.map((entry) => entry.id));
  for (const addition of additions) {
    if (!currentIds.has(addition.id)) {
      ledger.push(cloneJson(addition));
      currentIds.add(addition.id);
    }
  }
  return { ok: true, draftDocument, ledger, updatedRuleIds: [...replaced], addedLedgerIds };
}
