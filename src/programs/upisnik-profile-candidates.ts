import universityCatalog from '../../data/catalog/zagreb-catalog.json';

export interface UpisnikProfileCandidateRow {
  sifraUpisnik: string;
  naziv: string;
  izvoditelj: string;
  vrsta?: string;
}

export interface ProgramComponentCandidateInput {
  programCode: string;
  executors: Array<{ componentIds: string[] }>;
}

export interface ProfileCandidateInput {
  id: string;
  unitId: string;
  programs: string[];
  workTypes?: string[];
  sources?: Array<{ url: string }>;
}

export interface ProgramProfileDecisionEvidence {
  sourceUrl: string;
  sourceLocator: string;
  quote: string;
}

export interface ProgramProfileDecision {
  programCode: string;
  profileId: string;
  evidence: ProgramProfileDecisionEvidence;
}

export interface IntegratedGraduateCoverageDecision extends ProgramProfileDecision {
  sourceId: string;
}

export interface ProgramProfileExclusionDecision {
  programCode: string;
  reasonCode: 'no-written-final-work' | 'no-required-written-work';
  evidence: ProgramProfileDecisionEvidence;
}

export interface ProgramProfileBlockerDecision {
  programCode: string;
  reasonCode: 'conflicting-completion-evidence';
  sources: ProgramProfileDecisionEvidence[];
}

export interface ProgramProfileHoldDecision {
  programCode: string;
  reason: string;
  missingEvidence: string[];
  sources: ProgramProfileDecisionEvidence[];
}

export type ProfileCoverageStatus =
  | 'verified'
  | 'component-unresolved'
  | 'profile-missing-for-component-level'
  | 'exact-name-candidate-needs-evidence'
  | 'identity-evidence-needed'
  | 'not-applicable'
  | 'evidence-conflict';

export type ProfileCoverageHoldCode =
  | 'component-mapping-needed'
  | 'profile-for-study-level-needed'
  | 'exact-candidate-evidence-needed'
  | 'program-profile-identity-needed'
  | 'completion-evidence-reconciliation-needed';

export interface ProfileCoverageHold {
  code: ProfileCoverageHoldCode;
  reason: string;
  missingEvidence: string[];
  sources: ProgramProfileDecisionEvidence[];
}

export interface UpisnikProfileCandidateReport {
  schemaVersion: 1;
  summary: {
    totalPrograms: number;
    mappedPrograms: number;
    unmappedPrograms: number;
    exactCandidatePrograms: number;
    noExactCandidatePrograms: number;
    candidatePrograms: number;
    noCandidatePrograms: number;
    evidenceBackedCandidatePrograms: number;
    notApplicablePrograms: number;
    evidenceConflictPrograms: number;
    coverageByStatus: Record<ProfileCoverageStatus, number>;
  };
  programs: Array<{
    programCode: string;
    programName: string;
    componentIds: string[];
    candidateProfileIds: string[];
    profileDecisionEvidence: Array<{ profileId: string } & ProgramProfileDecisionEvidence>;
    applicabilityDecisionEvidence: (ProgramProfileDecisionEvidence & { reasonCode: ProgramProfileExclusionDecision['reasonCode'] }) | null;
    profileBlockerEvidence: (Omit<ProgramProfileBlockerDecision, 'programCode'>) | null;
    componentWorkTypeProfileIds: string[];
    coverageStatus: ProfileCoverageStatus;
    remainingHold: ProfileCoverageHold | null;
  }>;
}

const HOLD_CODE_BY_STATUS: Partial<Record<ProfileCoverageStatus, ProfileCoverageHoldCode>> = {
  'component-unresolved': 'component-mapping-needed',
  'profile-missing-for-component-level': 'profile-for-study-level-needed',
  'exact-name-candidate-needs-evidence': 'exact-candidate-evidence-needed',
  'identity-evidence-needed': 'program-profile-identity-needed',
  'evidence-conflict': 'completion-evidence-reconciliation-needed',
};

const GENERIC_IDENTITY_EVIDENCE_REQUEST = 'Službeni aktualni izvor za identitet programa i sastavnicu, uz dokaz obvezne vrste rada i veze s odgovarajućim profilom.';

function holdForProgram(input: {
  programCode: string;
  componentIds: string[];
  candidateProfileIds: string[];
  componentWorkTypeProfileIds: string[];
  expectedWorkType: CandidateWorkType | null | undefined;
  status: ProfileCoverageStatus;
  sources?: ProgramProfileDecisionEvidence[];
}): ProfileCoverageHold | null {
  const code = HOLD_CODE_BY_STATUS[input.status];
  if (!code) return null;
  const components = input.componentIds.length > 0 ? input.componentIds.join(', ') : 'još neutvrđeni izvođač';
  const profiles = input.candidateProfileIds.length > 0 ? input.candidateProfileIds.join(', ') : 'nijedan točan profil';
  switch (code) {
    case 'component-mapping-needed':
      return {
        code,
        reason: `Za Upisnik šifru ${input.programCode} nije potvrđena sastavnica izvođača.`,
        missingEvidence: ['Službena aktualna stranica programa ili odluka ustanove koja povezuje program i izvođača.'],
        sources: [],
      };
    case 'profile-for-study-level-needed':
      return {
        code,
        reason: `Za sastavnicu ${components} nije pronađen profil za vrstu rada ${input.expectedWorkType ?? 'koja odgovara razini programa'}.`,
        missingEvidence: ['Službeni dokaz završnog rada ili druge obvezne pisane predaje te potpune važeće upute za taj program i vrstu rada.'],
        sources: [],
      };
    case 'exact-candidate-evidence-needed':
      return {
        code,
        reason: `Naziv Upisnik programa ${input.programCode} odgovara kandidatu ${profiles}, ali veza još nema službeni dokaz.`,
        missingEvidence: ['Službeni aktualni izvor koji povezuje ovaj program i razinu s kandidatskim profilom te potvrđuje njegov opseg i primjenjive upute.'],
        sources: [],
      };
    case 'program-profile-identity-needed':
      {
      const soleProfile = input.componentWorkTypeProfileIds.length === 1 ? input.componentWorkTypeProfileIds[0] : null;
      return {
        code,
        reason: soleProfile != null
          ? `Za Upisnik šifru ${input.programCode} kandidat ${soleProfile} odgovara razini, ali nedostaje dokaz da se njegove upute primjenjuju na ovaj program.`
          : `Za Upisnik šifru ${input.programCode} na sastavnici ${components} nema točnog naziva kandidatskog profila ni službenog preslikavanja.`,
        missingEvidence: soleProfile != null
          ? [`Službeni aktualni izvor koji imenuje program ${input.programCode} i potvrđuje primjenu uputa profila ${soleProfile} te obveznu vrstu rada.`]
          : [GENERIC_IDENTITY_EVIDENCE_REQUEST],
        sources: [],
      };
      }
    case 'completion-evidence-reconciliation-needed':
      return {
        code,
        reason: `Za Upisnik šifru ${input.programCode} postoje neusuglašeni službeni dokazi o završetku programa.`,
        missingEvidence: ['Važeća odluka ili aktualni program koji razrješava razliku između već zabilježenih službenih izvora i određuje primjenjivu kohortu.'],
        sources: input.sources ?? [],
      };
  }
}

/** Fail-closed check that each unresolved Upisnik row explains its blocker and next evidence need. */
export function validateUpisnikProfileCoverageHolds(report: UpisnikProfileCandidateReport): string[] {
  const problems: string[] = [];
  const unresolvedStatuses = new Set<ProfileCoverageStatus>(Object.keys(HOLD_CODE_BY_STATUS) as ProfileCoverageStatus[]);
  for (const program of report.programs) {
    const expectedCode = HOLD_CODE_BY_STATUS[program.coverageStatus];
    const hold = program.remainingHold;
    if (unresolvedStatuses.has(program.coverageStatus)) {
      if (hold == null) {
        problems.push(`${program.programCode}: unresolved coverage has no hold`);
        continue;
      }
      if (hold.code !== expectedCode) problems.push(`${program.programCode}: hold code does not match ${program.coverageStatus}`);
      if (!hold.reason.trim()) problems.push(`${program.programCode}: hold reason is empty`);
      if (!Array.isArray(hold.missingEvidence) || hold.missingEvidence.length === 0 || hold.missingEvidence.some((item) => !item.trim())) {
        problems.push(`${program.programCode}: missing evidence request is empty`);
      }
      if (program.componentWorkTypeProfileIds.length === 1 && program.coverageStatus === 'identity-evidence-needed'
        && hold.missingEvidence.some((item) => normalizedEvidenceRequest(item) === normalizedEvidenceRequest(GENERIC_IDENTITY_EVIDENCE_REQUEST))) {
        problems.push(`${program.programCode}: sole candidate has a generic evidence request`);
      }
      if (program.componentWorkTypeProfileIds.length === 1 && hold.missingEvidence.some((item) => normalizedEvidenceRequest(item).length < 40)) {
        problems.push(program.programCode + ': sole candidate evidence request is too short');
      }
      if (!Array.isArray(hold.sources) || hold.sources.some(({ sourceUrl, sourceLocator, quote }) =>
        !/^https:\/\//u.test(sourceUrl.trim()) || !sourceLocator.trim() || !quote.trim())) {
        problems.push(`${program.programCode}: hold source evidence is incomplete`);
      }
      if (program.coverageStatus === 'component-unresolved' && program.componentIds.length !== 0) {
        problems.push(`${program.programCode}: unresolved component hold has component IDs`);
      }
      if (program.coverageStatus === 'exact-name-candidate-needs-evidence' && program.candidateProfileIds.length === 0) {
        problems.push(`${program.programCode}: exact-candidate hold has no candidate profile`);
      }
      if (program.coverageStatus === 'evidence-conflict' && (program.profileBlockerEvidence?.sources.length ?? 0) < 2) {
        problems.push(`${program.programCode}: conflict hold has fewer than two cited sources`);
      }
      if (program.coverageStatus === 'evidence-conflict' && (hold.sources.length < 2 || new Set(hold.sources.map(({ sourceUrl }) => sourceUrl)).size < 2)) {
        problems.push(`${program.programCode}: conflict hold does not preserve both cited sources`);
      }
    } else if (hold != null) {
      problems.push(`${program.programCode}: ${program.coverageStatus} row must not have a remaining hold`);
    }
  }
  return problems;
}

function normalizedEvidenceRequest(value: string): string {
  return normalized(value).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase('hr');
}

function sourceHost(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./u, ''); }
  catch { return null; }
}

function comparableProfileSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase().replace(/^www\./u, '')
      + (url.port ? ':' + url.port : '')
      + url.pathname.replace(/\/$/u, '') + url.search + url.hash;
  } catch { return null; }
}

const UNIVERSITY_ROOTS = new Set(['unizg.hr', 'uniri.hr', 'unist.hr', 'unios.hr', 'unipu.hr', 'unidu.hr', 'unizd.hr']);

// Službena domena Arhitektonskog fakulteta koristi dulji naziv sastavnice od kataloškog id-a.
const UNIVERSITY_LABEL_ALIASES: Record<string, string[]> = { arh: ['arhitekt'] };

function sourceHosts(unitId: string, profiles: ProfileCandidateInput[], sourceRegistry: Array<{ url: string; snapshotPath?: string }>): Set<string> {
  const registryUrls = sourceRegistry
    .filter((source) => source.snapshotPath?.startsWith('data/sources/' + unitId + '/'))
    .map((source) => source.url);
  const profileUrls = profiles.filter((profile) => profile.unitId === unitId)
    .flatMap((profile) => profile.sources?.map((source) => source.url) ?? []);
  return new Set([...registryUrls, ...profileUrls]
    .map((url) => sourceHost(url))
    .filter((host): host is string => host != null));
}

function sourceBelongsToUnit(url: string, unitId: string, profiles: ProfileCandidateInput[], sourceRegistry: Array<{ url: string; snapshotPath?: string }>): boolean {
  const host = sourceHost(url);
  if (host == null || /(?:^|\.)repozitorij\./u.test(host) || host === 'dabar.srce.hr' || host === 'urn.nsk.hr') return false;
  const hosts = sourceHosts(unitId, profiles, sourceRegistry);
  for (const root of UNIVERSITY_ROOTS) {
    if (host !== root && !host.endsWith('.' + root)) continue;
    const institutionId = root.split('.')[0];
    const institution = universityCatalog.find((item) => item.id === institutionId);
    if (host === root) return unitId === institutionId;
    if (institution == null || !institution.units.some((unit) => unit.id === unitId)) return false;
    const label = host.slice(0, -root.length - 1).split('.').at(-1);
    const labels = new Set([unitId, ...(UNIVERSITY_LABEL_ALIASES[unitId] ?? []),
      ...[...hosts].filter((knownHost) => knownHost.endsWith('.' + root))
        .map((knownHost) => knownHost.slice(0, -root.length - 1).split('.').at(-1))]);
    return label != null && labels.has(label);
  }
  return [...hosts].some((knownHost) => !UNIVERSITY_ROOTS.has(knownHost)
    && (host === knownHost || host.endsWith('.' + knownHost)));
}

const WORD_ENDINGS = ['ijama', 'ama', 'ima', 'ega', 'emu', 'ih', 'im', 'om', 'em', 'og', 'oj', 'a', 'e', 'i', 'o', 'u'];

function wordRoot(word: string): string {
  const ending = WORD_ENDINGS.find((suffix) => word.endsWith(suffix) && word.length - suffix.length >= 4);
  return ending == null ? word : word.slice(0, -ending.length);
}

function wholeWorkScopeStatement(scopeQuote: string): boolean {
  const scopeMatch = /\b(upute|uputa|pravila|pravilnik|odredbe)\b([^.]{0,80})\b(odnose|primjenjuju|vrijede|primjenjuje)\b([^.]{0,30})\b(na|za) (sve|svim|svih) ((kategorij|vrst|oblik)\w* )?(studentsk|pisan|akademsk|ocjensk)\w* (rad|radove|radova|radovima)\b([^.]{0,60})/u.exec(scopeQuote);
  if (scopeMatch != null
    && !/\b(ne|nisu|nije)\b/u.test(scopeMatch[2] + scopeMatch[4])
    && !/\b(osim|izuzev)\b/u.test(scopeMatch[11])
    && !scopeMatch[11].startsWith(', bez')
    && !/\bna (kolegij|predmet)/u.test(scopeMatch[11])) return true;
  return false;
}

function evidenceNamesProgram(name: string, evidence: ProgramProfileDecisionEvidence, cycle: StudyCycle | null, profile: ProfileCandidateInput): boolean {
  const title = normalizedProgramTitle(name).replace(/\s*\((?:jednopredmetni|dvopredmetni)\)/gu, '').trim();
  const text = normalized(evidence.quote + ' ' + evidence.sourceLocator)
    .replace(/fakultet\p{L}*\s+za\s+\p{L}+(?:\s+\p{L}+)?/gu, '');
  const aliases = [title, ...[...title.matchAll(/\(([^)]+)\)/gu)].map((match) => match[1])]
    .map((part) => part.replace(/\([^)]*\)/gu, '').trim()).filter(Boolean);
  const textWords = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (aliases.some((alias) => {
    const words = (alias.match(/[\p{L}\p{N}]+/gu) ?? [])
      .filter((word) => word.length > 2 && !['studij', 'studija'].includes(word));
    let at = 0;
    return words.length > 0 && words.every((word) => {
      const root = wordRoot(word);
      const found = textWords.findIndex((candidate, index) => index >= at && wordRoot(candidate) === root);
      if (found < 0) return false;
      at = found + 1;
      return true;
    });
  })) return true;
  if (/\bna studijima (?:fakulteta|sveucilista|odjela)\b/u.test(text)) return true;
  const levels: Record<string, StudyCycle> = {
    prijediplomsk: 'undergraduate', diplomsk: 'graduate',
    specijalistick: 'specialist', doktorsk: 'doctoral',
  };
  for (const match of text.matchAll(/\b(?:na\s+)?svim?\s+((?:prijediplomsk|diplomsk|specijalistick|doktorsk)\w*)?\s*studij(?:ima|i)\b/gu)) {
    const level = match[1] == null ? null : levels[Object.keys(levels).find((root) => match[1].startsWith(root)) ?? ''];
    if (level != null && level === cycle) return true;
  }
  // Izricita izjava o svim vrstama radova vrijedi samo iz dokumenta vezanog profila.
  const scopeQuote = normalized(evidence.quote).replace(/\s+/gu, ' ');
  if (wholeWorkScopeStatement(scopeQuote)) {
    const evidenceUrl = comparableProfileSourceUrl(evidence.sourceUrl);
    if (evidenceUrl != null && profile.sources?.some((source) => comparableProfileSourceUrl(source.url) === evidenceUrl)) return true;
  }
  return false;
}

function evidenceContradictsStudyKind(kind: StudyKind | null, quote: string): boolean {
  const quotedKind = studyKindForEvidenceQuote(quote);
  return quotedKind === 'both' || (kind != null && quotedKind != null && kind !== quotedKind);
}

type CandidateWorkType = NonNullable<ProfileCandidateInput['workTypes']>[number];

function workTypeForStudyLevel(value: string): CandidateWorkType | null {
  const level = normalized(value);
  if (level.includes('doktorski')) return 'doctoral';
  if (level.includes('specijalisticki')) return 'specialist';
  if (level.includes('integrirani')) return 'graduate';
  if (level.includes('prijediplomski')) return 'final';
  if (level.includes('diplomski')) return 'graduate';
  return null;
}

type StudyKind = 'university' | 'vocational';
type StudyCycle = 'integrated' | 'undergraduate' | 'graduate' | 'specialist' | 'doctoral';

function studyKindForEvidenceQuote(quote: string): StudyKind | 'both' | null {
  const text = normalized(quote);
  const kind = (root: string): StudyKind => root === 'sveucilisn' ? 'university' : 'vocational';
  const nextToStudy = new Set([...text.matchAll(/\b(sveucilisn|strucn)\w*\s+(?:\w+\s+){0,3}studij\w*\b/gu)]
    .map((match) => kind(match[1])));
  // Pricuvno citanje bez rijeci studij ne broji vrstu rada: "strucni rad" nije strucni studij (EFST 2026-10-03).
  const found = nextToStudy.size > 0 ? nextToStudy
    : new Set([...text.matchAll(/\b(sveucilisn|strucn)\w*\b(?!\s+rad(?:a|u|om|ovi|ova|ove|ovima)?\b)/gu)].map((match) => kind(match[1])));
  if (found.size === 2) return 'both';
  return found.values().next().value ?? null;
}

function studyKindForStudyType(value: string): StudyKind | null {
  const studyType = normalized(value);
  if (studyType.includes('sveucilisni')) return 'university';
  if (studyType.includes('strucni')) return 'vocational';
  return null;
}

function studyCycleForStudyType(value: string): StudyCycle | null {
  const studyType = normalized(value);
  if (studyType.includes('doktorski')) return 'doctoral';
  if (studyType.includes('specijalisticki')) return 'specialist';
  if (studyType.includes('integrirani')) return 'integrated';
  if (studyType.includes('prijediplomski')) return 'undergraduate';
  if (studyType.includes('diplomski')) return 'graduate';
  return null;
}

function profileSupportsStudyType(
  profile: ProfileCandidateInput,
  studyKind: StudyKind | null,
  studyCycle: StudyCycle | null,
  evidenceQuote?: string,
): boolean {
  if (evidenceQuote != null && evidenceContradictsStudyKind(studyKind, evidenceQuote)) return false;
  const declaredKinds = new Set(profile.programs.flatMap((program) => {
    const kind = studyKindForStudyType(program);
    return kind == null ? [] : [kind];
  }));
  if (studyKind != null && declaredKinds.size > 0 && !declaredKinds.has(studyKind)) return false;

  const declaredCycles = new Set(profile.programs.flatMap((program) => {
    const cycle = studyCycleForStudyType(program);
    return cycle == null ? [] : [cycle];
  }));
  return studyCycle == null || declaredCycles.size === 0 || declaredCycles.has(studyCycle);
}

function profileSupportsExplicitStudyType(
  profile: ProfileCandidateInput,
  studyKind: StudyKind | null,
  studyCycle: StudyCycle | null,
  evidenceQuote: string,
): boolean {
  if (profileSupportsStudyType(profile, studyKind, studyCycle, evidenceQuote)) return true;
  const documentedSpecialistRefinement = studyCycle === 'graduate'
    && profileSupportsStudyType(profile, studyKind, 'specialist', evidenceQuote)
    && normalized(evidenceQuote).includes('specijalisticki');
  return documentedSpecialistRefinement;
}

function normalizedProgramTitle(value: string): string {
  return normalized(value).replace(
    /^(?:sveucilisni|strucni)\s+(?:prijediplomski|diplomski|integrirani prijediplomski i diplomski|specijalisticki|doktorski|kratki)\s+studij\s+/,
    '',
  ).trim();
}

/** Candidate extraction only. It deliberately does not assign profiles or infer work types. */
export function buildUpisnikProfileCandidates(
  rows: UpisnikProfileCandidateRow[],
  componentDecisions: ProgramComponentCandidateInput[],
  profiles: ProfileCandidateInput[],
  programProfileDecisions: ProgramProfileDecision[] = [],
  programProfileExclusions: ProgramProfileExclusionDecision[] = [],
  programProfileBlockers: ProgramProfileBlockerDecision[] = [],
  programProfileHolds: ProgramProfileHoldDecision[] = [],
  sourceRegistry: Array<{ id?: string; url: string; snapshotPath?: string }> = [],
  integratedGraduateCoverage: IntegratedGraduateCoverageDecision[] = [],
): UpisnikProfileCandidateReport {
  const decisions = new Map(componentDecisions.map((decision) => [decision.programCode, decision]));
  const rowByCode = new Map(rows.map((row) => [row.sifraUpisnik, row]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const integratedPairs = new Set<string>();
  for (const coverage of integratedGraduateCoverage) {
    const pair = coverage.programCode + '/' + coverage.profileId;
    if (integratedPairs.has(pair)) throw new Error('duplicate integrated graduate coverage: ' + pair);
    integratedPairs.add(pair);
    const row = rowByCode.get(coverage.programCode);
    const profile = profileById.get(coverage.profileId);
    if (!row || studyCycleForStudyType(row.vrsta ?? '') !== 'integrated') throw new Error('integrated graduate coverage ' + pair + ' has unknown or non-integrated program');
    if (!profile) throw new Error('integrated graduate coverage ' + pair + ' has unknown profile');
    const componentIds = decisions.get(coverage.programCode)?.executors.flatMap((executor) => executor.componentIds) ?? [];
    if (!componentIds.includes(profile.unitId)) throw new Error('integrated graduate coverage ' + pair + ' has component mismatch');
    if (!profile.workTypes?.includes('graduate')) throw new Error('integrated graduate coverage ' + pair + ' has no graduate work type');
    const { sourceUrl, sourceLocator, quote } = coverage.evidence;
    if (!/^https:\/\//u.test(sourceUrl.trim()) || !sourceLocator.trim() || !quote.trim()) throw new Error('integrated graduate coverage ' + pair + ' has incomplete evidence');
    if (!sourceRegistry.some((source) => source.id === coverage.sourceId && source.url === sourceUrl)) throw new Error('integrated graduate coverage ' + pair + ' has source registry mismatch');
    if (!sourceBelongsToUnit(sourceUrl, profile.unitId, profiles, sourceRegistry)) throw new Error('integrated graduate coverage ' + pair + ' has source domain mismatch');
    if (!evidenceNamesProgram(row.naziv, coverage.evidence, studyCycleForStudyType(row.vrsta ?? ''), profile)) throw new Error('integrated graduate coverage ' + pair + ' lacks program name');
    if (!profileSupportsStudyType(profile, studyKindForStudyType(row.vrsta ?? ''), 'graduate', quote)) throw new Error('integrated graduate coverage ' + pair + ' has study type mismatch');
  }
  const explicitByCode = new Map<string, ProgramProfileDecision[]>();
  const seenPairs = new Set<string>();
  for (const explicit of programProfileDecisions) {
    const pair = `${explicit.programCode}\u0000${explicit.profileId}`;
    if (seenPairs.has(pair)) throw new Error(`duplicate program profile decision: ${explicit.programCode}/${explicit.profileId}`);
    seenPairs.add(pair);
    const row = rowByCode.get(explicit.programCode);
    const profile = profileById.get(explicit.profileId);
    if (!row) throw new Error(`program profile decision references unknown Upisnik code ${explicit.programCode}`);
    if (!profile) throw new Error(`program profile decision references unknown profile ${explicit.profileId}`);
    const componentIds = decisions.get(explicit.programCode)?.executors.flatMap((executor) => executor.componentIds) ?? [];
    if (!componentIds.includes(profile.unitId)) {
      throw new Error(`program profile decision ${explicit.programCode}/${explicit.profileId} has component mismatch`);
    }
    const expectedWorkType = row.vrsta == null ? null : workTypeForStudyLevel(row.vrsta);
    if (row.vrsta != null && expectedWorkType == null) {
      throw new Error(`program profile decision ${explicit.programCode}/${explicit.profileId} has unknown Upisnik work type`);
    }
    if (expectedWorkType != null && profile.workTypes != null && profile.workTypes.length > 0 && !profile.workTypes.includes(expectedWorkType)) {
      throw new Error(`program profile decision ${explicit.programCode}/${explicit.profileId} has work type mismatch`);
    }
    if (expectedWorkType != null && (profile.workTypes == null || profile.workTypes.length === 0)) {
      throw new Error(`program profile decision ${explicit.programCode}/${explicit.profileId} has no declared work type`);
    }
    if (row.vrsta != null && !profileSupportsExplicitStudyType(
      profile,
      studyKindForStudyType(row.vrsta),
      studyCycleForStudyType(row.vrsta),
      explicit.evidence.quote,
    )) {
      throw new Error(`program profile decision ${explicit.programCode}/${explicit.profileId} has study type mismatch`);
    }
    const { sourceUrl, sourceLocator, quote } = explicit.evidence;
    if (!/^https:\/\//u.test(sourceUrl.trim()) || !sourceLocator.trim() || !quote.trim()) {
      throw new Error(`program profile decision ${explicit.programCode}/${explicit.profileId} has incomplete evidence`);
    }
    if (!sourceBelongsToUnit(sourceUrl, profile.unitId, profiles, sourceRegistry)) {
      throw new Error(`program profile decision ${explicit.programCode}/${explicit.profileId} has source domain mismatch`);
    }
    if (!evidenceNamesProgram(row.naziv, explicit.evidence, studyCycleForStudyType(row.vrsta ?? ''), profile)) {
      throw new Error(`program profile decision ${explicit.programCode}/${explicit.profileId} lacks program name`);
    }
    const forCode = explicitByCode.get(explicit.programCode) ?? [];
    forCode.push(explicit);
    explicitByCode.set(explicit.programCode, forCode);
  }
  const exclusionByCode = new Map<string, ProgramProfileExclusionDecision>();
  for (const exclusion of programProfileExclusions) {
    if (!['no-written-final-work', 'no-required-written-work'].includes(exclusion.reasonCode)) {
      throw new Error(`program profile exclusion ${exclusion.programCode} has unsupported reason code`);
    }
    if (exclusionByCode.has(exclusion.programCode)) {
      throw new Error(`duplicate program profile exclusion: ${exclusion.programCode}`);
    }
    const row = rowByCode.get(exclusion.programCode);
    if (!row) throw new Error(`program profile exclusion references unknown Upisnik code ${exclusion.programCode}`);
    const workType = workTypeForStudyLevel(row.vrsta ?? '');
    if (exclusion.reasonCode === 'no-written-final-work' && workType !== 'final') {
      throw new Error(`program profile exclusion ${exclusion.programCode} does not apply to a final-work programme`);
    }
    if (exclusion.reasonCode === 'no-required-written-work' && workType == null) {
      throw new Error(`program profile exclusion ${exclusion.programCode} has an unknown study work type`);
    }
    if ((explicitByCode.get(exclusion.programCode) ?? []).length > 0) {
      throw new Error(`program profile exclusion ${exclusion.programCode} conflicts with a profile mapping`);
    }
    const { sourceUrl, sourceLocator, quote } = exclusion.evidence;
    const componentIds = decisions.get(exclusion.programCode)?.executors.flatMap((executor) => executor.componentIds) ?? [];
    if (!componentIds.some((unitId) => sourceBelongsToUnit(sourceUrl, unitId, profiles, sourceRegistry))) {
      throw new Error(`program profile exclusion ${exclusion.programCode} has source domain mismatch`);
    }
    if (!/^https:\/\//u.test(sourceUrl.trim()) || !sourceLocator.trim() || !quote.trim()) {
      throw new Error(`program profile exclusion ${exclusion.programCode} has incomplete evidence`);
    }
    exclusionByCode.set(exclusion.programCode, exclusion);
  }
  const blockerByCode = new Map<string, ProgramProfileBlockerDecision>();
  for (const blocker of programProfileBlockers) {
    if (blocker.reasonCode !== 'conflicting-completion-evidence') {
      throw new Error(`program profile blocker ${blocker.programCode} has unsupported reason code`);
    }
    const row = rowByCode.get(blocker.programCode);
    if (!row) throw new Error(`program profile blocker references unknown Upisnik code ${blocker.programCode}`);
    if (workTypeForStudyLevel(row.vrsta ?? '') !== 'final') {
      throw new Error(`program profile blocker ${blocker.programCode} does not apply to a final-work programme`);
    }
    if (blockerByCode.has(blocker.programCode)) throw new Error(`duplicate program profile blocker: ${blocker.programCode}`);
    if ((explicitByCode.get(blocker.programCode) ?? []).length > 0 || exclusionByCode.has(blocker.programCode)) {
      throw new Error(`program profile blocker ${blocker.programCode} conflicts with another profile decision`);
    }
    const urls = new Set<string>();
    const componentIds = decisions.get(blocker.programCode)?.executors.flatMap((executor) => executor.componentIds) ?? [];
    for (const { sourceUrl, sourceLocator, quote } of blocker.sources) {
      if (!componentIds.some((unitId) => sourceBelongsToUnit(sourceUrl, unitId, profiles, sourceRegistry))) {
        throw new Error(`program profile blocker ${blocker.programCode} has source domain mismatch`);
      }
      if (!/^https:\/\//u.test(sourceUrl.trim()) || !sourceLocator.trim() || !quote.trim()) {
        throw new Error(`program profile blocker ${blocker.programCode} has incomplete evidence`);
      }
      urls.add(sourceUrl);
    }
    if (urls.size < 2) throw new Error(`program profile blocker ${blocker.programCode} needs at least two distinct sources`);
    blockerByCode.set(blocker.programCode, blocker);
  }
  const holdByCode = new Map<string, ProgramProfileHoldDecision>();
  for (const hold of programProfileHolds) {
    if (holdByCode.has(hold.programCode)) throw new Error(`duplicate program profile hold: ${hold.programCode}`);
    if (!rowByCode.has(hold.programCode)) throw new Error(`program profile hold references unknown Upisnik code ${hold.programCode}`);
    if ((explicitByCode.get(hold.programCode) ?? []).length > 0 || exclusionByCode.has(hold.programCode) || blockerByCode.has(hold.programCode)) {
      throw new Error(`program profile hold ${hold.programCode} conflicts with another profile decision`);
    }
    if (!hold.reason.trim() || hold.missingEvidence.length === 0 || hold.missingEvidence.some((item) => !item.trim())) {
      throw new Error(`program profile hold ${hold.programCode} has incomplete explanation`);
    }
    if (hold.sources.length === 0) {
      throw new Error(`program profile hold ${hold.programCode} needs source evidence`);
    }
    for (const { sourceUrl, sourceLocator, quote } of hold.sources) {
      if (!/^https:\/\//u.test(sourceUrl.trim()) || !sourceLocator.trim() || !quote.trim()) {
        throw new Error(`program profile hold ${hold.programCode} has incomplete source evidence`);
      }
    }
    holdByCode.set(hold.programCode, hold);
  }
  const programs = rows.map((row) => {
    const decision = decisions.get(row.sifraUpisnik);
    const componentIds = [...new Set(decision?.executors.flatMap((executor) => executor.componentIds) ?? [])].sort();
    const programName = normalizedProgramTitle(row.naziv);
    const expectedWorkType = row.vrsta == null ? undefined : workTypeForStudyLevel(row.vrsta);
    const studyKind = row.vrsta == null ? null : studyKindForStudyType(row.vrsta);
    const studyCycle = row.vrsta == null ? null : studyCycleForStudyType(row.vrsta);
    const applicabilityDecision = exclusionByCode.get(row.sifraUpisnik);
    const blockerDecision = blockerByCode.get(row.sifraUpisnik);
    const authoredHold = holdByCode.get(row.sifraUpisnik);
    const exactCandidateProfileIds = applicabilityDecision || blockerDecision ? [] : profiles
      .filter((profile) => {
        if (!componentIds.includes(profile.unitId)) return false;
        if (profile.workTypes?.length === 0) return false;
        if (!profileSupportsStudyType(profile, studyKind, studyCycle)
          && !(studyCycle === 'integrated' && integratedPairs.has(row.sifraUpisnik + '/' + profile.id)
            && profileSupportsStudyType(profile, studyKind, 'graduate'))) return false;
        if (!profile.programs.some((name) => normalizedProgramTitle(name) === programName)) return false;
        if (row.vrsta == null) return true;
        if (expectedWorkType == null) return profile.workTypes == null;
        return profile.workTypes == null || profile.workTypes.includes(expectedWorkType);
      })
      .map((profile) => profile.id)
      .sort();
    const componentWorkTypeProfileIds = applicabilityDecision || blockerDecision ? [] : profiles
      .filter((profile) => {
        if (!componentIds.includes(profile.unitId)) return false;
        if (profile.workTypes?.length === 0) return false;
        if (!profileSupportsStudyType(profile, studyKind, studyCycle)
          && !(studyCycle === 'integrated' && integratedPairs.has(row.sifraUpisnik + '/' + profile.id)
            && profileSupportsStudyType(profile, studyKind, 'graduate'))) return false;
        if (row.vrsta == null || expectedWorkType == null) return true;
        return profile.workTypes == null || profile.workTypes.includes(expectedWorkType);
      })
      .map((profile) => profile.id)
      .sort();
    const profileDecisionEvidence = (explicitByCode.get(row.sifraUpisnik) ?? [])
      .map(({ profileId, evidence }) => ({ profileId, ...evidence }))
      .sort((a, b) => a.profileId.localeCompare(b.profileId));
    const candidateProfileIds = blockerDecision ? [] : [...new Set([
      ...exactCandidateProfileIds,
      ...profileDecisionEvidence.map(({ profileId }) => profileId),
    ])].sort();
    const coverageStatus: ProfileCoverageStatus = profileDecisionEvidence.length > 0
      ? 'verified'
      : blockerDecision != null
        ? 'evidence-conflict'
        : applicabilityDecision != null
        ? 'not-applicable'
      : componentIds.length === 0
        ? 'component-unresolved'
        : componentWorkTypeProfileIds.length === 0
          ? 'profile-missing-for-component-level'
          : exactCandidateProfileIds.length > 0
            ? 'exact-name-candidate-needs-evidence'
            : 'identity-evidence-needed';
    const derivedHold = holdForProgram({
      programCode: row.sifraUpisnik,
      componentIds,
      candidateProfileIds,
      componentWorkTypeProfileIds,
      expectedWorkType,
      status: coverageStatus,
      sources: blockerDecision?.sources,
    });
    return {
      programCode: row.sifraUpisnik,
      programName: row.naziv,
      componentIds,
      candidateProfileIds,
      profileDecisionEvidence,
      applicabilityDecisionEvidence: applicabilityDecision == null
        ? null
        : { reasonCode: applicabilityDecision.reasonCode, ...applicabilityDecision.evidence },
      profileBlockerEvidence: blockerDecision == null
        ? null
        : { reasonCode: blockerDecision.reasonCode, sources: blockerDecision.sources },
      exactCandidateProfileIds,
      componentWorkTypeProfileIds,
      coverageStatus,
      remainingHold: authoredHold == null
        ? derivedHold
        : {
          ...derivedHold!,
          reason: authoredHold.reason,
          missingEvidence: authoredHold.missingEvidence,
          sources: authoredHold.sources,
        },
    };
  });
  const mappedPrograms = programs.filter((program) => program.componentIds.length > 0).length;
  const exactCandidatePrograms = programs.filter((program) => program.exactCandidateProfileIds.length > 0).length;
  const candidatePrograms = programs.filter((program) => program.candidateProfileIds.length > 0).length;
  return {
    schemaVersion: 1,
    summary: {
      totalPrograms: rows.length,
      mappedPrograms,
      unmappedPrograms: rows.length - mappedPrograms,
      exactCandidatePrograms,
      noExactCandidatePrograms: rows.length - exactCandidatePrograms,
      candidatePrograms,
      noCandidatePrograms: rows.length - candidatePrograms,
      evidenceBackedCandidatePrograms: programs.filter((program) => program.profileDecisionEvidence.length > 0).length,
      notApplicablePrograms: programs.filter((program) => program.coverageStatus === 'not-applicable').length,
      evidenceConflictPrograms: programs.filter((program) => program.coverageStatus === 'evidence-conflict').length,
      coverageByStatus: {
        verified: programs.filter((program) => program.coverageStatus === 'verified').length,
        'component-unresolved': programs.filter((program) => program.coverageStatus === 'component-unresolved').length,
        'profile-missing-for-component-level': programs.filter((program) => program.coverageStatus === 'profile-missing-for-component-level').length,
        'exact-name-candidate-needs-evidence': programs.filter((program) => program.coverageStatus === 'exact-name-candidate-needs-evidence').length,
        'identity-evidence-needed': programs.filter((program) => program.coverageStatus === 'identity-evidence-needed').length,
        'not-applicable': programs.filter((program) => program.coverageStatus === 'not-applicable').length,
        'evidence-conflict': programs.filter((program) => program.coverageStatus === 'evidence-conflict').length,
      },
    },
    programs,
  };
}



