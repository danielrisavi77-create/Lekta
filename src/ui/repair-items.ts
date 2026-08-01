// src/ui/repair-items.ts
//
// Cista izvedba RepairableItem[] iz rezultata analize + profila (Opcija A: nudi popravak
// SAMO za PREKRSENE dimenzije). Kljucno nacelo: ciljane cm/pt vrijednosti (params) dolaze
// ISKLJUCIVO iz PROFILA (currentProfile().p), nikad hardkodirano. Bez DOM-a i bez globalnog
// stanja -> testabilno; app.ts ga samo poziva i mountira rezultat (uz paywall gating).

import type { RepairableItem } from './repair-panel';
import type { ElementCaptionFormDefinition, BibliographyFormDefinition, CitationBibliographySyncFormDefinition, LegalFootnoteRepairFormDefinition, FinalDocumentInspectorFormDefinition, TableFigureRescueFormDefinition, SectionSurgeryFormDefinition, CroatianTypographyFormDefinition, ConsistencyFormDefinition, RequiredSectionsFormDefinition, CrossFileSubmissionFormDefinition } from './repair-panel';
import type { RuleEntry } from '../profiles/profile-schema';
import type { Issue } from '../scoring/checks';
import type { SectionNumberingTarget } from '../repair/xml-patch';
import { CHECK_TITLES, PAPER_SIZE_TITLE_PREFIX } from '../analysis/check-fixer-map';
import type { HeadingCandidate, HeadingStructureWarning } from '../analysis/heading-structure';
import { headingNumberingRules } from '../analysis/heading-numbering';
import type { HeadingNumberingPlan } from '../analysis/heading-numbering';
import { buildTitlePageRepairPlan, type TitlePageRepairValues } from '../analysis/title-page-repair';
import { buildTitlePage } from '../tools/title-page';
import type { TitlePageTemplate } from '../title-pages/template-schema';
import { formatCitation, type CitationStyle } from '../tools/citation';
import type { BibliographyEnrichmentCandidate } from '../citations/bibliography-enrichment';
import { canonicalizeLinkForRepair } from '../analysis/link-doi-structure';
import { submissionMetadataFingerprint } from '../analysis/cross-file-submission-consistency';

/** Minimalni oblik provjere iz analyzeDocx rezultata (result.checks[]). */
export interface AnalyzedCheck {
  title: string;
  status: string;
  max: number;
}

// checkId -> naslov checka (za korelaciju "je li prekrseno"). Dijeljeni izvor istine je
// src/analysis/check-fixer-map.ts (isti ga koristi triage model); ovdje su lokalni aliasi
// da ostatak datoteke ostane nepromijenjen.
const CHECK_TITLE: Record<string, string> = CHECK_TITLES;
// paper-size ima dinamican naslov ('Format stranice A4' / 'Format stranice (A4/A3)') -> prefiks.
const PAPER_SIZE_PREFIX = PAPER_SIZE_TITLE_PREFIX;

/** A-serija (cm), isti izvor kao PS mapa u analyzeDocx; sluzi konverziji imena iz profila. */
const A_SERIES: Record<string, [number, number]> = {
  A4: [21, 29.7],
  A3: [29.7, 42],
  A2: [42, 59.4],
  A1: [59.4, 84.1],
  A0: [84.1, 118.8],
};

/**
 * Ciljane params IZ PROFILA po checkId-u. Vrijednosti dolaze iz profila (currentProfile().p),
 * ne hardkodirano. Vraca null ako profil nema ciljanu vrijednost (tada se popravak ne nudi).
 */
export function paramsForCheck(checkId: string, profile: any): Record<string, unknown> | null {
  switch (checkId) {
    case 'margins':
      return profile?.margins ? { ...profile.margins } : null;
    case 'font':
      return profile?.font?.[0] ? { fontName: profile.font[0] } : null;
    case 'font-size':
      return profile?.size?.[0] != null ? { fontSizePt: profile.size[0] } : null;
    case 'line-spacing':
      return profile?.spacing != null ? { multiplier: profile.spacing } : null;
    case 'justify':
      // Ponudi poravnanje SAMO kad profil ima izrican zahtjev: true -> obostrano,
      // false -> lijevo. undefined znaci "profil ne propisuje poravnanje" pa se u
      // "uskladi sve" toku ne smije ponuditi (inace bi lijevo poravnao ispravan rad).
      return profile?.justify === true ? { val: 'both' } : profile?.justify === false ? { val: 'left' } : null;
    case 'paper-size': {
      const name = profile?.paperSizes?.[0] || (profile?.requireA4 ? 'A4' : null);
      const dim = name ? A_SERIES[name] : null;
      return dim ? { w: dim[0], h: dim[1] } : null;
    }
    default:
      return null;
  }
}

/**
 * Isti oblik ciljanih params kao paramsForCheck, ali izvedeno IZRAVNO iz vrijednosti ruleEntry-ja
 * (entry.value), ne iz `profile`. Potrebno za "preporucene" (advisory) popravke: effectiveRules iz
 * ruleEntries NIJE zivo wiran u definition.rules (poznat jaz, vidi strateski audit 2026-07-13), pa
 * bi paramsForCheck(checkId, profile) za advisory-only institucije uvijek vratio null. Oblik
 * vrijednosti je namjerno identican onome sto rule-compiler.ts.applyEntry postavlja na `profile`
 * (npr. font-size: [12], margins: {top,right,bottom,left}), pa je pretvorba 1:1 s paramsForCheck.
 */
function paramsFromValue(checkId: string, value: unknown): Record<string, unknown> | null {
  switch (checkId) {
    case 'margins':
      return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : null;
    case 'font':
      return Array.isArray(value) && value[0] ? { fontName: value[0] } : null;
    case 'font-size':
      return Array.isArray(value) && value[0] != null ? { fontSizePt: value[0] } : null;
    case 'line-spacing':
      return typeof value === 'number' ? { multiplier: value } : null;
    case 'justify':
      return value === true ? { val: 'both' } : value === false ? { val: 'left' } : null;
    case 'paper-size': {
      const name = Array.isArray(value) ? value[0] : value === true ? 'A4' : typeof value === 'string' ? value : null;
      const dim = name ? A_SERIES[name] : null;
      return dim ? { w: dim[0], h: dim[1] } : null;
    }
    default:
      return null;
  }
}

/** Status checka po naslovu (ili undefined ako ga nema). Za razliku od isViolated NE trazi
 *  max>0: numeriranje-checkovi su nebodovani (max=0, "Word ne sprema dovoljno podataka") na
 *  jednosekcijskom radu, ali im status ostaje 'warn' kad numeriranje od Uvoda nije potvrdjeno. */
function checkStatusByTitle(checks: AnalyzedCheck[], title: string): string | undefined {
  return checks.find((c) => c.title === title)?.status;
}

/** Je li dimenzija (checkId) PREKRSENA: postoji bodovani check (max>0) koji nije 'pass'. */
function isViolated(checkId: string, checks: AnalyzedCheck[]): boolean {
  const chk =
    checkId === 'paper-size'
      ? checks.find((c) => c.title.startsWith(PAPER_SIZE_PREFIX))
      : checks.find((c) => c.title === CHECK_TITLE[checkId]);
  return !!chk && chk.max > 0 && chk.status !== 'pass';
}

/**
 * Za svako pravilo koje je autoFixable + status:'verified' + ima fixerId i checkId,
 * izgradi RepairableItem s params IZ PROFILA i oznakom je li dimenzija prekrsena.
 * Default (Opcija A, besplatni teaser): vraca SAMO prekrsene dimenzije. S
 * includeNonViolated (Feature B, placeno): vraca i neprekrsene (violated:false),
 * za "uskladi cijeli dokument" tok. Prazno dok nijedno pravilo nije autoFixable.
 *
 * Dodatno (neovisno o gornjem): pravila s status:'advisory' + recommended:true (pecena
 * projekcija recommendedFixerId, vidi profile-schema.ts) daju NEOBAVEZAN, jasno oznacen
 * "preporuceno" popravak. Uvijek se vracaju (bez obzira na includeNonViolated) jer su
 * jedini nacin da institucije bez ijednog BODOVANOG pravila ipak ponude koristan popravak;
 * violated je uvijek false (demotirani check uvijek javlja 'pass', pa se sukladnost ne moze
 * provjeriti niti kazniti - vidi analyzeDocx checkFont===false granu).
 */
export function buildRepairableItems(
  checks: AnalyzedCheck[],
  profile: any,
  ruleEntries: RuleEntry[],
  opts?: { includeNonViolated?: boolean },
): RepairableItem[] {
  const out: RepairableItem[] = [];
  for (const e of ruleEntries) {
    const isRecommended = e.recommended === true && e.status === 'advisory';
    const isRequired = e.autoFixable === true && e.status === 'verified';
    if ((!isRecommended && !isRequired) || !e.fixerId || !e.checkId) continue;
    if (isRecommended) {
      // Vrijednost dolazi IZ ZAPISA (pecena projekcija nosi e.value), ne iz `profile`:
      // effectiveRules iz ruleEntries nije zivo wiran u definition.rules (vidi paramsFromValue).
      const params = paramsFromValue(e.checkId, e.value);
      if (!params) continue;
      out.push({
        ruleId: e.ruleId,
        fixerId: e.fixerId as RepairableItem['fixerId'],
        label: e.label || CHECK_TITLE[e.checkId] || e.ruleId,
        params,
        violated: false,
        recommended: true,
        ...(CHECK_TITLE[e.checkId] ? { matchKeys: [CHECK_TITLE[e.checkId]] } : {}),
      });
      continue;
    }
    const params = paramsForCheck(e.checkId, profile);
    if (!params) continue; // profil nema ciljanu vrijednost -> ne nudi popravak
    const violated = isViolated(e.checkId, checks);
    if (!violated && !opts?.includeNonViolated) continue; // A: samo prekrseno
    out.push({
      ruleId: e.ruleId,
      fixerId: e.fixerId as RepairableItem['fixerId'],
      label: e.label || CHECK_TITLE[e.checkId] || e.ruleId,
      params,
      violated,
      ...(CHECK_TITLE[e.checkId] ? { matchKeys: [CHECK_TITLE[e.checkId]] } : {}),
    });
  }
  return out;
}

// Naslov checka "Prazni odlomci" iz analyzeDocx (src/analysis/analyze-docx.ts), byte-za-byte
// (dijakritika). Koristi se SAMO za korelaciju "je li prekrseno", ne kao izvor pravila.
const EMPTY_PARAGRAPHS_ISSUE_TITLE = 'Dokument sadrži mnogo praznih odlomaka';

/**
 * Univerzalna higijena dokumenta (prazni odlomci): NIJE vezana ni za jedan institucijski
 * ruleEntry pa namjerno zaobilazi cijeli ruleEntry gate (autoFixable/status/fixerId) iz
 * buildRepairableItems. Prekrsenost se racuna izravno iz issues[] (category:'elements' +
 * tocan naslov checka), ne iz profila.
 */
export function universalRepairableItems(issues: Issue[]): RepairableItem[] {
  const violated = issues.some((i) => i.category === 'elements' && i.title === EMPTY_PARAGRAPHS_ISSUE_TITLE);
  return [
    {
      ruleId: 'empty-paragraphs-universal',
      fixerId: 'empty-paragraph-fixer',
      label: 'Prazni odlomci',
      params: {},
      violated,
      matchKeys: [EMPTY_PARAGRAPHS_ISSUE_TITLE],
    },
  ];
}

/**
 * Univerzalni popravak razmaka prije/poslije odlomka: NIJE vezan za ruleEntry (isti
 * obrazac kao universalRepairableItems za prazne odlomke), ali OVISI o profilu jer
 * checkParagraphSpacingZero (analyzeDocx) nije univerzalan check, vec ga profil ukljucuje.
 * Kad profil ne provjerava razmak, popravak se ne nudi (nema checka za korelaciju).
 */
function twipsFromCm(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value / 2.54 * 1440) : undefined;
}

/** Univerzalni, konzervativni tehničko-tipografski čistač. Profilna pravila koriste se u analizi,
 * a bez njih se nude samo nedvojbene mehaničke izmjene. */
export function croatianTypographyRepairableItem(result: any): RepairableItem[] {
  const structure = result?.details?.typographyStructure;
  const occurrences = Array.isArray(structure?.occurrences) ? structure.occurrences : [];
  if (!occurrences.length) return [];
  const categoryNames: string[] = [...new Set<string>(occurrences.map((x: any) => String(x.category)))];
  const form: CroatianTypographyFormDefinition = {
    categories: categoryNames.map((category) => ({ category, count: occurrences.filter((x: any) => String(x.category) === category).length, selected: occurrences.some((x: any) => String(x.category) === category && x.confidence === 'high') })),
    occurrences: occurrences.map((occurrence: any) => ({
      id: String(occurrence.id), category: String(occurrence.category), before: String(occurrence.rawText), after: String(occurrence.proposedText), confidence: String(occurrence.confidence), evidence: Array.isArray(occurrence.evidence) ? occurrence.evidence.map(String) : [], selected: occurrence.confidence === 'high',
      operation: { id: String(occurrence.id), category: String(occurrence.category), paragraphIndex: Number(occurrence.paragraphIndex), ...(occurrence.textNodeIndex != null ? { textNodeIndex: Number(occurrence.textNodeIndex) } : {}), nodeKind: occurrence.category === 'text-tabs' ? 'tab' : occurrence.category === 'manual-line-breaks' ? 'line-break' : 'text', ...(occurrence.category !== 'text-tabs' && occurrence.category !== 'manual-line-breaks' ? { start: Number(occurrence.start), end: Number(occurrence.end) } : {}), before: String(occurrence.rawText), replacementText: String(occurrence.proposedText), anchorFingerprint: String(occurrence.anchorFingerprint), confirmed: true },
    })),
    summary: String(structure.summary?.text || `${occurrences.length} tipografskih nalaza`),
    buildParams: () => ({}),
  };
  form.buildParams = (current) => {
    const selectedCategories = current.categories.filter((category) => category.selected).map((category) => ({ category: category.category, consent: true as const }));
    const selected = new Set(selectedCategories.map((category) => category.category));
    return { version: 1, categories: selectedCategories, operations: current.occurrences.filter((occurrence) => occurrence.selected && selected.has(occurrence.category)).map((occurrence) => occurrence.operation) };
  };
  return [{ ruleId: 'croatian-typography-universal', fixerId: 'croatian-typography-fixer', label: 'Hrvatski tehničko-tipografski čistač', params: form.buildParams(form), violated: true, requiresConfirmation: true, confirmationText: 'Potvrdi samo odabrane tehničko-tipografske izmjene. Akademski sadržaj i složene Word strukture ostaju nepromijenjeni.', croatianTypographyForm: form, matchKeys: ['Tehničko-tipografska dosljednost', 'Tipografska dosljednost', 'Tehničko-tipografske pogreške'] }];
}

export function consistencyRepairableItem(result: any): RepairableItem[] {
  const structure = result?.details?.consistencyStructure;
  const sourceGroups = Array.isArray(structure?.groups) ? structure.groups : [];
  const metadataGroups = (Array.isArray(structure?.metadataMismatches) ? structure.metadataMismatches : []).map((mismatch: any) => ({
    id: String(mismatch.id), zone: 'document-metadata', label: `Dokumentni podatak: ${String(mismatch.field)}`, confidence: String(mismatch.confidence || 'medium'), evidence: Array.isArray(mismatch.evidence) ? mismatch.evidence.map(String) : [],
    variants: [{ text: String(mismatch.documentValue), count: 1, occurrences: [{ part: 'docProps/core.xml', anchorFingerprint: String(mismatch.occurrences?.[0]?.anchorFingerprint || ''), metadataField: String(mismatch.field) }] }, ...(Array.isArray(mismatch.observedValues) ? mismatch.observedValues : []).map((text: any) => ({ text: String(text), count: 1, occurrences: [] }))], selected: false, zoneConsent: false,
  }));
  if (!sourceGroups.length && !metadataGroups.length) return [];
  const groups: ConsistencyFormDefinition['groups'] = sourceGroups.map((group: any) => ({
    id: String(group.id), zone: String(group.zone), label: String(group.label || 'Dosljednost'), confidence: String(group.confidence || 'medium'), evidence: Array.isArray(group.evidence) ? group.evidence.map(String) : [],
    variants: (Array.isArray(group.variants) ? group.variants : []).map((variant: any) => ({ text: String(variant.text), count: Number(variant.count || 0), occurrences: (Array.isArray(variant.occurrences) ? variant.occurrences : []).map((occurrence: any) => ({ part: String(occurrence.part), ...(occurrence.paragraphIndex != null ? { paragraphIndex: Number(occurrence.paragraphIndex) } : {}), ...(occurrence.start != null ? { start: Number(occurrence.start) } : {}), ...(occurrence.end != null ? { end: Number(occurrence.end) } : {}), anchorFingerprint: String(occurrence.anchorFingerprint), ...(occurrence.metadataField ? { metadataField: String(occurrence.metadataField) } : {}) })) })),
    ...(group.suggestedCanonical ? { selectedCanonical: String(group.suggestedCanonical) } : {}), selected: false, zoneConsent: false,
  })).concat(metadataGroups);
  const form: ConsistencyFormDefinition = { groups, summary: String(structure.summary?.text || `${groups.length} grupa nedosljednosti`), buildParams: () => ({}) };
  form.buildParams = (current) => {
    const confirmedGroups = current.groups.filter((group) => group.selected && group.zoneConsent && group.selectedCanonical);
    const groupParams = confirmedGroups.map((group) => ({ id: group.id, zone: group.zone as any, canonicalText: group.selectedCanonical!, confirmed: true as const }));
    const replacements = confirmedGroups.flatMap((group) => {
      const canonical = group.selectedCanonical!;
      return group.variants.filter((variant) => variant.text !== canonical).flatMap((variant) => variant.occurrences.filter((occurrence) => (occurrence.part === 'word/document.xml' && occurrence.paragraphIndex != null && occurrence.start != null && occurrence.end != null) || (occurrence.part === 'docProps/core.xml' && occurrence.metadataField)).map((occurrence, index) => ({ id: `${group.id}-${variant.text}-${index}`, groupId: group.id, part: occurrence.part, ...(occurrence.paragraphIndex != null ? { paragraphIndex: occurrence.paragraphIndex } : {}), ...(occurrence.start != null ? { start: occurrence.start } : {}), ...(occurrence.end != null ? { end: occurrence.end } : {}), before: variant.text, replacementText: canonical, anchorFingerprint: occurrence.anchorFingerprint, ...(occurrence.metadataField ? { metadataField: occurrence.metadataField } : {}), confirmed: true as const })));
    });
    return { version: 1, groups: groupParams, replacements };
  };
  return [{ ruleId: 'consistency-engine-assisted', fixerId: 'consistency-fixer', label: 'Consistency Engine', params: form.buildParams(form), violated: true, requiresConfirmation: true, confirmationText: 'Potvrdi odabrane kanonske varijante. Lekta mijenja samo potvrđene jednostavne tekstualne raspone, a original ostaje nepromijenjen.', consistencyForm: form, matchKeys: ['Dosljednost', 'Consistency Engine'] }];
}

export function crossFileSubmissionRepairableItem(result: any, profile: any): RepairableItem[] {
  const structure = result?.details?.crossFileSubmissionConsistency;
  const issues = Array.isArray(structure?.issues) ? structure.issues.filter((issue: any) => issue.status !== 'consistent') : [];
  if (!issues.length) return [];
  const form: CrossFileSubmissionFormDefinition = {
    issues: issues.map((issue: any) => ({
      id: String(issue.id),
      field: String(issue.field),
      status: String(issue.status),
      severity: String(issue.severity || 'warning'),
      reason: String(issue.reason || ''),
      ...(issue.suggestedCanonical ? { suggestedCanonical: String(issue.suggestedCanonical) } : {}),
      values: (Array.isArray(issue.values) ? issue.values : []).map((value: any) => ({ value: String(value.value), source: String(value.source), ...(value.fileName ? { fileName: String(value.fileName) } : {}), ...(value.location ? { location: String(value.location) } : {}), fingerprint: String(value.fingerprint) })),
      ...(issue.suggestedCanonical ? { selectedCanonical: String(issue.suggestedCanonical) } : {}),
      selected: false,
    })),
    summary: String(structure.summary?.text || 'Usporedba predajnog paketa ima otvorene nalaze.'),
    fileNames: Array.isArray(structure.files) ? structure.files.map((file: any) => String(file.name)) : [],
    buildParams: () => ({}),
  };
  form.buildParams = (current) => {
    const fields = current.issues.flatMap((issue) => {
      if (!issue.selected || !issue.selectedCanonical) return [];
      return issue.values.filter((value) => value.source === 'docx-metadata' && (issue.field === 'title' || issue.field === 'author')).flatMap((value) => [{
        field: issue.field as 'title' | 'author',
        part: 'docProps/core.xml' as const,
        before: value.value,
        replacementText: issue.selectedCanonical!,
        fingerprint: submissionMetadataFingerprint(issue.field as 'title' | 'author', value.value),
        confirmed: true as const,
      }]);
    });
    return { version: 1, ...(result.details?.docxCore?.fingerprint ? { fileFingerprint: String(result.details.docxCore.fingerprint) } : {}), fields };
  };
  return [{
    ruleId: 'cross-file-submission-consistency-assisted',
    fixerId: 'submission-metadata-fixer',
    label: 'Cross-file Submission Consistency',
    params: form.buildParams(form),
    violated: issues.some((issue: any) => issue.status === 'mismatch' || issue.status === 'ambiguous'),
    requiresConfirmation: true,
    confirmationText: 'Potvrdi odabrane kanonske vrijednosti. Lekta mijenja samo potvrđene DOCX metapodatke, a PDF i tekst rada ostaju nepromijenjeni.',
    crossFileSubmissionForm: form,
    matchKeys: ['Cross-file Submission Consistency', 'Predajni paket'],
  }];
}

function twentiethsFromPt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 20) : undefined;
}

function paragraphFormattingParams(result: any, profile: any): Record<string, unknown> {
  const rules = profile?.paragraphRules;
  if (!rules || typeof rules !== 'object') return {};
  const styleRules: Record<string, unknown>[] = [];
  const styles = rules.styles && typeof rules.styles === 'object' ? rules.styles : {};
  for (const [styleId, raw] of Object.entries(styles as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const rule = raw as Record<string, unknown>;
    styleRules.push({
      styleId,
      beforeTwentieths: twentiethsFromPt(rule.beforePt),
      afterTwentieths: twentiethsFromPt(rule.afterPt),
      firstLineTwips: twipsFromCm(rule.firstLineCm),
      hangingTwips: twipsFromCm(rule.hangingCm),
      keepLines: rule.keepLines === true,
      keepNext: rule.keepNext === true,
      widowControl: rule.widowControl === true,
    });
  }
  const candidates = result?.details?.paragraphFormatting?.candidates;
  const targets: Record<string, unknown>[] = Array.isArray(candidates)
    ? candidates.flatMap((candidate: any) => {
        if (!candidate || typeof candidate.paragraphIndex !== 'number') return [];
        const target: Record<string, unknown> = { paragraphIndex: candidate.paragraphIndex };
        if (candidate.firstAfterHeading && rules.firstParagraphAfterHeading?.firstLineCm !== undefined) {
          target.firstLineTwips = twipsFromCm(rules.firstParagraphAfterHeading.firstLineCm);
        }
        if (candidate.shortBlock && rules.keepLinesShortBlocks === true) target.keepLines = true;
        if (candidate.fakeIndent && rules.removeFakeIndent === true) target.removeFakeIndent = true;
        if (rules.clearDirectIndent === true) target.clearDirectIndent = true;
        return Object.keys(target).length > 1 ? [target] : [];
      })
    : [];
  return { ...(styleRules.length ? { styleRules } : {}), ...(targets.length ? { targets } : {}) };
}

export function paragraphSpacingRepairableItem(checks: AnalyzedCheck[], profile: any, result?: any): RepairableItem[] {
  if (profile?.checkParagraphSpacingZero !== true) return [];
  const params = paragraphFormattingParams(result, profile);
  return [
    {
      ruleId: 'paragraph-spacing-universal',
      fixerId: 'paragraph-spacing-fixer',
      label: Object.keys(params).length ? 'Odlomci, uvlake i prijelomi stranice' : 'Razmak prije i poslije odlomka',
      params,
      violated: isViolated('paragraph-spacing', checks),
      matchKeys: [CHECK_TITLE['paragraph-spacing']],
    },
  ];
}

/**
 * Ciljevi numeriranja iz granice Uvoda, ISTI kriterij kao audit checkPageNumberStartAtIntro
 * (analyze-docx.ts): prednje sekcije zavrsavaju PRIJE Uvoda (paragraphIndex < introIndex).
 * Prednje -> rimski (start=1 na prvoj), glavne od Uvoda -> arapski (start=1 na prvoj glavnoj).
 * detectable:false (prazni targets) kad nema splita: <2 sekcije, nepoznat Uvod, ili su sve
 * odnosno nijedna sekcija prednje. Cista funkcija (testabilno, bez DOM-a).
 */
export function sectionNumberingTargets(
  sections: Array<{ paragraphIndex?: number | null }> | undefined | null,
  introParagraphIndex: number | null | undefined,
): { detectable: boolean; targets: SectionNumberingTarget[] } {
  if (introParagraphIndex == null || !Array.isArray(sections) || sections.length < 2) {
    return { detectable: false, targets: [] };
  }
  const isFront = (s: { paragraphIndex?: number | null }) =>
    typeof s?.paragraphIndex === 'number' && s.paragraphIndex < introParagraphIndex;
  // Prva sekcija koja NIJE prednja = pocetak glavnog teksta. mainStartIndex<=0 znaci
  // "nema prednje sekcije" ili "nema glavne" -> nema splita za popraviti.
  const mainStartIndex = sections.findIndex((s) => !isFront(s));
  if (mainStartIndex <= 0) return { detectable: false, targets: [] };
  // Kljucni uvjet ISPRAVNOSTI (adversarial review): pgNumType w:start=1 restarta numeriranje
  // na POCETKU glavne sekcije, pa prijelom sekcije mora KOINCIDIRATI s Uvodom. Zadnja prednja
  // sekcija mora zavrsavati tocno na paragrafu prije Uvoda (glavna sekcija POCINJE Uvodom),
  // inace bi arapski restart pao na prednji dio (sazetak/sadrzaj), a Uvod ne bi dobio broj 1.
  // Kad prijelom nije na Uvodu, umetanje prijeloma je posao koraka b (K6), ne K4 -> no-op.
  const before = sections[mainStartIndex - 1];
  if (before.paragraphIndex !== introParagraphIndex - 1) return { detectable: false, targets: [] };
  const targets: SectionNumberingTarget[] = sections.map((_s, i): SectionNumberingTarget => {
    if (i < mainStartIndex) {
      return i === 0 ? { sectionIndex: i, fmt: 'lowerRoman', start: 1 } : { sectionIndex: i, fmt: 'lowerRoman' };
    }
    return i === mainStartIndex ? { sectionIndex: i, fmt: 'decimal', start: 1 } : { sectionIndex: i, fmt: 'decimal' };
  });
  return { detectable: true, targets };
}

/**
 * Popravak numeriranja stranica od Uvoda (BL-06 korak a): rimski na prednjim listovima,
 * arapski od Uvoda (start=1). Gejtano profilnim flagom checkPageNumberStartAtIntro (isti
 * obrazac kao paragraphSpacingRepairableItem) I detektabilnom granicom Uvoda iz
 * result.details (sections + introParagraphIndex). Kad dokument nema split sekcija, popravak
 * se ne nudi (fixer bi ionako bio bit-identican no-op). violated se ocitava iz checkova
 * numeriranja (postoje samo kad dokument ima PAGE polje), pa je u teaseru konzervativan.
 */
export function pageNumberingRepairableItem(result: any, profile: any): RepairableItem[] {
  if (profile?.checkPageNumberStartAtIntro !== true) return [];
  const { detectable, targets } = sectionNumberingTargets(
    result?.details?.sections,
    result?.details?.introParagraphIndex,
  );
  if (!detectable) return [];
  const checks: AnalyzedCheck[] = result?.checks ?? [];
  const violated = isViolated('page-number-start', checks) || isViolated('page-number-scheme', checks);
  return [
    {
      ruleId: 'page-numbering-universal',
      fixerId: 'page-numbering-fixer',
      label: 'Numeriranje stranica od Uvoda (rimski/arapski)',
      params: { targets },
      violated,
      matchKeys: [CHECK_TITLE['page-number-start'], CHECK_TITLE['page-number-scheme']],
    },
  ];
}

/**
 * Univerzalni popravak razmaka prije/poslije fusnota: isti obrazac kao
 * paragraphSpacingRepairableItem, ali gated na checkFootnoteParagraphSpacingZero
 * (analyzeDocx samo tada dodaje check 'Razmak prije i poslije fusnota', vidi
 * src/analysis/analyze-docx.ts). Nije vezan za ruleEntry.
 */
export function footnoteSpacingRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  if (profile?.checkFootnoteParagraphSpacingZero !== true) return [];
  return [
    {
      ruleId: 'footnote-spacing-universal',
      fixerId: 'footnote-spacing-fixer',
      label: 'Razmak prije i poslije fusnota',
      params: {},
      violated: isViolated('footnote-spacing', checks),
      matchKeys: [CHECK_TITLE['footnote-spacing']],
    },
  ];
}

const VALID_PAGE_ALIGNMENTS = new Set(['left', 'center', 'right']);

/**
 * Normalizira profile.pageNumberAlignment u jedan od tri legalna cilja fixera. Profili u data/
 * nose STRING ("right"), ne boolean; legacy `true` i svaka nepoznata/nevaljana vrijednost
 * defaultiraju na "right" (jedina vrijednost koju ijedan stvarni profil danas koristi, RE-04/RE-05).
 */
function resolvePageNumberAlign(profile: any): 'left' | 'center' | 'right' {
  const raw = profile?.pageNumberAlignment;
  if (typeof raw === 'string' && VALID_PAGE_ALIGNMENTS.has(raw)) return raw as 'left' | 'center' | 'right';
  return 'right';
}

/**
 * Univerzalni popravak poravnanja broja stranice: isti obrazac kao
 * footnoteSpacingRepairableItem, gated na profile.pageNumberAlignment (analyzeDocx
 * samo tada dodaje check 'Položaj broja stranice', vidi src/analysis/analyze-docx.ts).
 * Nije vezan za ruleEntry.
 *
 * RE-04: profili u data/ nose STRING vrijednost ("right"), ne boolean `true`; gate koji je trazio
 * doslovni `=== true` je bio MRTAV za svaki stvarni profil (analiza sama gate-a na truthy, vidi
 * profile.pageNumberAlignment&&pageNums u analyze-docx.ts). Gate je sada na truthy, a STRING
 * vrijednost ide u params.align (fixer ju je dosad ignorirao i imao tvrdo upisano 'right').
 */
export function pageNumberAlignmentRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  if (!profile?.pageNumberAlignment) return [];
  const align = resolvePageNumberAlign(profile);
  return [
    {
      ruleId: 'page-number-alignment-universal',
      fixerId: 'page-number-alignment-fixer',
      label: 'Položaj broja stranice',
      params: { align },
      violated: isViolated('page-number-alignment', checks),
      matchKeys: [CHECK_TITLE['page-number-alignment']],
    },
  ];
}

/**
 * Oblikovanje naslova po razinama. Vrijednosti dolaze ISKLJUCIVO iz `profile.headingRules`, dakle
 * iz sluzbene upute fakulteta; profil bez tog pravila ne dobiva stavku. Popravljaju se samo
 * velicina, podebljano, kurziv i poravnanje slijeva, jer se sve to nalazi u stilu razine.
 *
 * NAMJERNO IZOSTAVLJENO: velika slova i numeriranje naslova. Provjera velikih slova cita TEKST
 * (isUppercaseText), pa bi je `w:caps` zavarao a da tekst ostane isti; pravo rjesenje trazi
 * prepisivanje autorova teksta. Numeriranje bi ubacivalo oznake razina, sto je takodjer autorska
 * odluka. Oboje ostaje u rucnim uputama.
 */
export function headingFormatRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  const rules = profile?.headingRules;
  if (!rules || typeof rules !== 'object') return [];
  const levels = rules.levels && typeof rules.levels === 'object' ? rules.levels : {};
  const maxLevel = Number(rules.maxLevel) || 3;
  const sizeHalfPoints = Number.isFinite(Number(rules.size)) ? Math.round(Number(rules.size) * 2) : undefined;
  const alignLeft = String(rules.align || '') === 'left';

  const targets: Array<Record<string, unknown>> = [];
  for (let level = 1; level <= maxLevel; level++) {
    const spec = levels[String(level)] || {};
    const target: Record<string, unknown> = { level };
    if (sizeHalfPoints !== undefined) target.sizeHalfPoints = sizeHalfPoints;
    if (spec.bold === true) target.bold = true;
    if (spec.italic === true) target.italic = true;
    if (alignLeft) target.alignLeft = true;
    // Razina bez ijednog popravljivog svojstva (npr. samo `uppercase`) se ne salje.
    if (Object.keys(target).length > 1) targets.push(target);
  }
  if (!targets.length) return [];

  return [
    {
      ruleId: 'heading-format-universal',
      fixerId: 'heading-format-fixer',
      label: 'Oblikovanje naslova po razinama',
      params: { targets },
      violated: isViolated('heading-format', checks),
      matchKeys: [CHECK_TITLE['heading-format']],
    },
  ];
}

/** Universalni popravak koji ručno oblikovane odlomke promovira u Heading stilove. */
export function headingStructureRepairableItem(result: any, profile: any): RepairableItem[] {
  const structure = result?.details?.headingStructure as {
    candidates?: HeadingCandidate[];
    warnings?: HeadingStructureWarning[];
  } | undefined;
  const candidates = Array.isArray(structure?.candidates) ? structure.candidates : [];
  const numberingPlan = result?.details?.headingNumberingPlan as HeadingNumberingPlan | null | undefined;
  if (!candidates.length && !numberingPlan?.mappings?.length) return [];
  const rules = profile?.headingRules || {};
  const sizeSpecified = Number.isFinite(Number(rules.size));
  const alignSpecified = String(rules.align || '') === 'left';
  const targets = numberingPlan
    ? numberingPlan.mappings.filter((mapping) => mapping.selectedByDefault).map((mapping) => ({
        paragraphIndex: mapping.paragraphIndex,
        level: mapping.level,
        numbered: mapping.numbered,
        removeManualNumbering: mapping.removeManualNumbering,
        clearDirectFont: sizeSpecified,
        clearDirectSize: sizeSpecified,
        clearDirectAlignment: alignSpecified,
      }))
    : candidates.filter((candidate) => candidate.selectedByDefault).map((candidate) => ({
        paragraphIndex: candidate.paragraphIndex,
        level: candidate.proposedLevel,
        numbered: candidate.numbered,
        clearDirectFont: sizeSpecified,
        clearDirectSize: sizeSpecified,
        clearDirectAlignment: alignSpecified,
      }));
  const pageBreak = rules.pageBreakBefore;
  const pageBreakLevels = Array.isArray(pageBreak)
    ? pageBreak.map(Number).filter((level: number) => Number.isInteger(level) && level >= 1 && level <= 9)
    : pageBreak === true ? [1] : [];
  const numberingRule = headingNumberingRules(rules.numbering);
  const numbering = numberingRule ?? undefined;
  const assistedNumbering = numberingPlan != null && numbering != null;
  return [{
    ruleId: 'heading-structure-universal',
    fixerId: 'heading-style-fixer',
    label: 'Ručno oblikovani naslovi: primijeni Heading stilove',
    params: { targets, options: { pageBreakLevels, ...(numbering ? { numbering } : {}) } },
    violated: true,
    matchKeys: ['Uporaba Word stilova naslova', 'Hijerarhija naslova'],
    headingCandidates: candidates,
    headingNumberingPlan: numberingPlan,
    headingWarnings: Array.isArray(structure?.warnings) ? structure.warnings : [],
    requiresConfirmation: assistedNumbering || candidates.some((candidate) => candidate.confidence !== 'high'),
    confirmationText: assistedNumbering
      ? `Potvrdi plan numeriranja: ${numberingPlan.summary.numbered} numeriranih i ${numberingPlan.summary.unnumbered} nenumeriranih naslova, ${numberingPlan.summary.removeManualPrefixes} ručnih prefiksa bit će uklonjeno iz teksta naslova. Word će generirati brojeve kroz numbering.xml.`
      : 'Odabrani odlomci dobit će Word Heading stilove. Tekst se ne mijenja, ali se mogu ukloniti direktni font, veličina ili poravnanje koji nadjačavaju stil.',
  }];
}

const TITLE_PAGE_FIELD_LABELS: Record<string, string> = {
  study: 'Studij i smjer',
  author: 'Ime i prezime',
  title: 'Naslov rada',
  workType: 'Vrsta rada',
  mentor: 'Mentor i titula',
  comentor: 'Komentor i titula',
  place: 'Mjesto',
  year: 'Godina',
  studentId: 'JMBAG',
};

const TITLE_PAGE_FIELD_ORDER = ['study', 'author', 'title', 'workType', 'mentor', 'comentor', 'place', 'year', 'studentId'];

function titlePageFields(plan: ReturnType<typeof buildTitlePageRepairPlan>, template: TitlePageTemplate): Array<{ key: string; label: string; required: boolean; value: string }> {
  if (!plan) return [];
  const values = plan.values as Record<string, unknown>;
  return TITLE_PAGE_FIELD_ORDER.flatMap((key) => {
    const role = key === 'workType' ? 'worktype' : key;
    const elements = template.elements.filter((element) => element.role === role);
    const required = elements.some((element) => element.required);
    const isRelevant = elements.length > 0 || Boolean(String(values[key] ?? '').trim()) || (key === 'studentId' && template.notes?.match(/jmbag|mati(?:č|c)ni broj/i));
    return isRelevant ? [{ key, label: TITLE_PAGE_FIELD_LABELS[key], required, value: String(values[key] ?? '') }] : [];
  });
}

/** Asistirani, službenim predloškom ograničeni popravak prve stranice. */
export function titlePageRepairableItem(result: any, profile: any, template: TitlePageTemplate | null): RepairableItem[] {
  const plan = buildTitlePageRepairPlan(result, profile, template);
  if (!plan || !template) return [];
  const fields = titlePageFields(plan, template);
  const buildParams = (values: Record<string, string>): Record<string, unknown> => {
    const model = buildTitlePage({ ...plan.values, ...values } as TitlePageRepairValues, template);
    return {
      paragraphCount: plan.paragraphCount,
      lines: model.lines,
      ensureTitlePageNoNumber: true,
      ...(template.marginsCm ? { marginsCm: template.marginsCm } : {}),
    };
  };
  return [{
    ruleId: 'title-page-repair-assisted',
    fixerId: 'title-page-fixer',
    label: 'Naslovnica: primijeni službeni raspored',
    params: buildParams(Object.fromEntries(fields.map((field) => [field.key, field.value]))),
    violated: true,
    requiresConfirmation: true,
    confirmationText: 'Potvrdi podatke u obrascu. Zamijenit će se samo omeđena prva stranica; tekst rada, tablice i slike izvan nje ostaju netaknuti.',
    titlePageForm: {
      fields,
      warnings: plan.warnings,
      buildParams,
    },
    matchKeys: ['Elementi naslovne stranice', 'Redoslijed elemenata naslovnice', 'Naslovna stranica možda nije potpuna'],
  }];
}

/** Asistirani popravak natpisa. Pravila se nude samo kad profil ima strukturirano pravilo. */
export function elementCaptionRepairableItem(result: any, profile: any): RepairableItem[] {
  const ruleEntry = (Array.isArray(profile?.ruleEntries) ? profile.ruleEntries : []).find((entry: any) => entry?.checkId === 'element-caption-rules' && entry?.status === 'verified' && entry?.sourceId && entry?.sourcePage && entry?.quote);
  const rules = ruleEntry?.value;
  const structure = result?.details?.elementStructure;
  const candidates = Array.isArray(structure?.candidates) ? structure.candidates : [];
  if (!rules?.labels || !rules?.captionPosition || !Array.isArray(candidates) || candidates.length === 0) return [];
  const labels = { table: String(rules.labels.table || 'Tablica'), figure: String(rules.labels.figure || 'Slika'), chart: String(rules.labels.chart || 'Grafikon') };
  const form: ElementCaptionFormDefinition = {
    candidates: candidates.map((candidate: any) => ({
      id: String(candidate.id),
      kind: candidate.kind,
      ordinal: Number(candidate.ordinal),
      confidence: candidate.confidence,
      description: String(candidate.existingCaption?.description || ''),
      source: String(candidate.source?.text || '').replace(/^(?:izvor|source)\s*:\s*/i, ''),
      position: candidate.existingCaption?.position || rules.captionPosition[candidate.kind] || 'below',
      replaceManualCaption: Boolean(candidate.existingCaption?.manualNumber),
      evidence: Array.isArray(candidate.evidence) ? candidate.evidence.map(String) : [],
      selected: candidate.confidence === 'high' && Boolean(candidate.existingCaption?.description),
    })),
    lists: (['table', 'figure', 'chart'] as const).flatMap((kind) => rules.lists?.[kind] && !structure.lists?.[kind]
      ? [{ kind, title: `Popis ${kind === 'table' ? labels.table.toLocaleLowerCase('hr') : kind === 'figure' ? labels.figure.toLocaleLowerCase('hr') : labels.chart.toLocaleLowerCase('hr')}`, selected: false, placement: rules.listPlacement || 'after-toc' }]
      : []),
    references: Array.isArray(structure.references) ? structure.references.map((reference: any) => ({ ...reference, selected: false })) : [],
    buildParams: () => ({}),
  };
  form.buildParams = (current) => ({
    version: 1,
    labels,
    numbering: rules.numbering === 'chapter' ? 'chapter' : 'document',
    ...(rules.captionStyle ? { captionStyle: rules.captionStyle } : {}),
    elements: current.candidates.filter((candidate) => candidate.selected).map((candidate) => {
      const original = candidates.find((entry: any) => entry.id === candidate.id);
      return {
        id: candidate.id,
        kind: candidate.kind,
        anchor: original.anchor,
        anchorFingerprint: original.anchorFingerprint,
        description: candidate.description.trim(),
        ...(candidate.source.trim() ? { source: candidate.source.trim() } : {}),
        position: candidate.position,
        replaceManualCaption: candidate.replaceManualCaption,
        label: labels[candidate.kind as keyof typeof labels],
      };
    }),
    lists: current.lists.filter((list) => list.selected).map((list) => ({ kind: list.kind, title: list.title, placement: list.placement })),
    references: current.references.filter((reference) => reference.selected).map(({ paragraphIndex, start, end, elementId }) => ({ paragraphIndex, start, end, elementId })),
  });
  return [{
    ruleId: 'element-caption-repair-assisted',
    fixerId: 'element-caption-fixer',
    label: 'Natpisi slika, tablica i grafikona',
    params: form.buildParams(form),
    violated: true,
    requiresConfirmation: true,
    confirmationText: `Pronađeno je ${candidates.length} elemenata. Potvrdi opise i izvore prije umetanja Word SEQ natpisa; popisi i cross-reference polja ostaju zasebni izbor.`,
    elementCaptionForm: form,
    matchKeys: ['Naslovi tablica', 'Naslovi slika i grafikona', 'Izvori ispod slika i tablica', 'Popisi slika i tablica'],
  }];
}

export function citationBibliographySyncRepairableItem(result: any, profile: any): RepairableItem[] {
  const ruleEntry = (Array.isArray(profile?.ruleEntries) ? profile.ruleEntries : []).find((entry: any) => entry?.checkId === 'citation-sync-rules' && entry?.status === 'verified' && entry?.sourceId && entry?.sourcePage && entry?.quote);
  const rules = ruleEntry?.value;
  const structure = result?.details?.bibliographyStructure;
  const sync = result?.details?.citationBibliographySync;
  if (!rules || rules.mode !== 'author-year' || !sync?.citations?.length) return [];
  const bibliographyEntries = Array.isArray(structure?.entries) ? structure.entries : [];
  const links = Array.isArray(sync.links) ? sync.links : [];
  const rows = sync.citations.map((citation: any) => {
    const link = links.find((candidate: any) => candidate.citationId === citation.id);
    return {
      id: String(citation.id), rawText: String(citation.rawText), replacementText: String(citation.rawText),
      status: String(link?.status || 'missing'), confidence: citation.confidence || 'medium',
      candidates: Array.isArray(link?.candidates) ? link.candidates.map(String) : [],
      ...(link?.bibliographyEntryId ? { selectedCandidate: String(link.bibliographyEntryId) } : {}),
      reason: String(link?.reason || 'Potrebna je potvrda veze.'),
      selected: false,
    };
  });
  const missingEntries = (Array.isArray(sync.missingEntries) ? sync.missingEntries : []).map((citation: any) => ({ id: `sync-entry-${citation.id}`, citationId: String(citation.id), text: '', selected: false }));
  const duplicates = (Array.isArray(sync.duplicateCandidates) ? sync.duplicateCandidates : []).flatMap((group: any) => (group.entryIds || []).slice(1).map((entryId: string) => {
    const entry = bibliographyEntries.find((candidate: any) => String(candidate.id) === String(entryId));
    return { entryId: String(entryId), rawText: String(entry?.rawText || ''), selected: false };
  }));
  const form: CitationBibliographySyncFormDefinition = {
    citations: rows,
    missingEntries,
    duplicates,
    summary: `${sync.summary?.citations || rows.length} citata: ${sync.summary?.matched || 0} povezanih, ${sync.summary?.missing || 0} nedostajućih, ${sync.summary?.ambiguous || 0} nejasnih i ${sync.summary?.pageIssues || 0} bez lokatora. Svaka izmjena traži potvrdu.`,
    buildParams: () => ({}),
  };
  form.buildParams = (current) => {
    const citationById = new Map<string, any>((sync.citations || []).map((citation: any) => [String(citation.id), citation]));
    const selectedCitations = current.citations.filter((citation) => citation.selected && citation.replacementText.trim());
    const citations = selectedCitations.flatMap((citation) => {
      const original = citationById.get(citation.id);
      if (!original) return [];
      return [{ id: citation.id, paragraphIndex: Number(original.paragraphIndex), start: Number(original.start), end: Number(original.end), anchorFingerprint: String(original.anchorFingerprint), replacementText: citation.replacementText.slice(0, 1000), reason: citation.reason }];
    });
    const entryById = new Map<string, any>(bibliographyEntries.map((entry: any) => [String(entry.id), entry]));
    const entries = rules.allowDuplicateMerge === true
      ? current.duplicates.filter((duplicate) => duplicate.selected).flatMap((duplicate) => {
      const original = entryById.get(duplicate.entryId);
      return original ? [{ id: duplicate.entryId, paragraphIndices: original.paragraphIndices, anchorFingerprint: original.anchorFingerprint, action: 'remove' as const }] : [];
      })
      : [];
    const lastEntry = bibliographyEntries.at(-1);
    const added = rules.allowMissingEntryInsertion === true
      ? current.missingEntries.filter((missing) => missing.selected && missing.text.trim() && lastEntry).map((missing) => ({ id: missing.id, paragraphIndices: [], anchorFingerprint: '', action: 'add' as const, replacementText: missing.text.trim().slice(0, 20_000), insertionAnchor: { paragraphIndex: Number(lastEntry.paragraphIndices[0]), anchorFingerprint: String(lastEntry.anchorFingerprint) } }))
      : [];
    const mappings = current.citations.filter((citation) => citation.selected && citation.selectedCandidate).map((citation) => ({ citationId: citation.id, bibliographyEntryId: citation.selectedCandidate as string, confirmed: true as const }));
    const missingMappings = current.missingEntries.filter((missing) => missing.selected && missing.text.trim() && lastEntry).map((missing) => ({ citationId: missing.citationId, bibliographyEntryId: missing.id, confirmed: true as const }));
    return { version: 1, ...(result?.details?.profileFingerprint ? { profileFingerprint: result.details.profileFingerprint } : {}), citations, entries: [...entries, ...added], mappings: [...mappings, ...missingMappings] };
  };
  const hasProblems = rows.some((row: any) => row.status !== 'matched') || missingEntries.length > 0 || duplicates.length > 0 || (sync.pageIssues || []).length > 0;
  if (!hasProblems) return [];
  return [{
    ruleId: 'citation-bibliography-sync-assisted', fixerId: 'citation-bibliography-sync-fixer', label: 'Sinkronizacija citata i bibliografije', params: form.buildParams(form), violated: true, requiresConfirmation: true,
    confirmationText: 'Potvrdi samo odabrane veze, izmjene lokatora, dodane zapise ili uklanjanje mogućih duplikata. Lekta neće mijenjati akademski sadržaj.',
    citationBibliographySyncForm: form, matchKeys: ['Citirano → literatura', 'Literatura → citirano', 'Lokator uz izravne citate', 'Isti autor i godina (a/b/c)'],
  }];
}

export function finalDocumentInspectorRepairableItem(result: any): RepairableItem[] {
  const inspector = result?.details?.finalDocumentInspector;
  const sourceFindings = Array.isArray(inspector?.findings) ? inspector.findings : [];
  if (!sourceFindings.length) return [];
  const findings: FinalDocumentInspectorFormDefinition['findings'] = sourceFindings.map((finding: any) => ({
    id: String(finding.id),
    category: String(finding.category),
    summary: String(finding.summary),
    count: Number(finding.count) || 0,
    severity: String(finding.severity),
    supported: finding.supported === true,
    destructive: finding.destructive === true,
    ...(finding.warning ? { warning: String(finding.warning) } : {}),
    selected: finding.defaultSelected === true && finding.supported === true,
    action: String(finding.action || 'review-only'),
    evidence: (Array.isArray(finding.evidence) ? finding.evidence : []).map((item: any) => ({
      part: String(item.part || ''),
      location: String(item.location || ''),
      fingerprint: String(item.fingerprint || ''),
      ...(item.display ? { display: String(item.display) } : {}),
      ...(item.revisionId !== undefined ? { revisionId: String(item.revisionId) } : {}),
      ...(item.commentId !== undefined ? { commentId: String(item.commentId) } : {}),
      ...(item.field ? { field: String(item.field) } : {}),
      selected: finding.defaultSelected === true && finding.supported === true,
    })),
  }));
  const form: FinalDocumentInspectorFormDefinition = {
    findings,
    summary: 'Finalni pregled: ' + (inspector.summary?.comments || 0) + ' komentara, ' + (inspector.summary?.revisions || 0) + ' revizija, ' + (inspector.summary?.privateMetadata || 0) + ' privatnih metapodataka i ' + (inspector.summary?.staleFields || 0) + ' polja za provjeru.',
    buildParams: () => ({}),
  };
  form.buildParams = (current) => {
    const revisions = current.findings.filter((finding) => finding.selected && finding.category === 'revisions').flatMap((finding) => finding.evidence.filter((item) => item.selected && item.revisionId && item.revisionAction).map((item) => ({
      part: item.part, revisionId: item.revisionId, action: item.revisionAction, anchorFingerprint: item.fingerprint, confirmed: true as const,
    })));
    const comments = current.findings.filter((finding) => finding.selected && finding.category === 'comments').flatMap((finding) => finding.evidence.filter((item) => item.selected && item.commentId).map((item) => ({
      commentId: item.commentId, anchorFingerprint: item.fingerprint, action: 'remove' as const, confirmed: true as const,
    })));
    const metadata = current.findings.filter((finding) => finding.selected && finding.category === 'private-metadata').flatMap((finding) => finding.evidence.filter((item) => item.selected && item.field).map((item) => ({
      part: item.part.includes('/custom.xml') ? 'custom' as const : item.part.includes('/app.xml') ? 'app' as const : 'core' as const,
      field: item.field, fingerprint: item.fingerprint, action: 'remove' as const, confirmed: true as const,
    })));
    const hiddenText = current.findings.filter((finding) => finding.selected && finding.category === 'hidden-text').flatMap((finding) => finding.evidence.filter((item) => item.selected).map((item) => ({
      part: item.part, anchorFingerprint: item.fingerprint, action: 'remove' as const, confirmed: true as const,
    })));
    const customXml = current.findings.filter((finding) => finding.selected && finding.category === 'custom-xml').flatMap((finding) => finding.evidence.filter((item) => item.selected && item.location === 'package-part').map((item) => ({
      part: item.part, fingerprint: item.fingerprint, action: 'remove-unreferenced' as const, confirmed: true as const,
    })));
    const settings: Record<string, true> = {};
    if (current.findings.some((finding) => finding.selected && finding.category === 'tracking')) settings.disableTracking = true;
    if (current.findings.some((finding) => finding.selected && finding.category === 'revision-metadata')) settings.removeRevisionIds = true;
    if (current.findings.some((finding) => finding.selected && finding.category === 'fields')) settings.updateFields = true;
    return { version: 1, revisions, comments, metadata, hiddenText, ...(Object.keys(settings).length ? { settings } : {}), ...(customXml.length ? { customXml } : {}) };
  };
  if (!findings.some((finding) => finding.supported)) return [];
  return [{
    ruleId: 'final-document-inspector-assisted',
    fixerId: 'final-document-inspector-fixer',
    label: 'Final Document Inspector',
    params: form.buildParams(form),
    violated: true,
    requiresConfirmation: true,
    confirmationText: 'Izradit će se nova čista kopija. Originalni dokument ostaje nepromijenjen; revizije se prihvaćaju ili odbacuju samo pojedinačno.',
    finalDocumentInspectorForm: form,
    matchKeys: ['Komentari', 'Praćenje promjena', 'Skriveni tekst', 'Metapodaci', 'Word polja'],
  }];
}

export function fieldIntegrityRepairableItem(result: any): RepairableItem[] {
  const integrity = result?.details?.fieldIntegrity;
  if (!integrity || !Array.isArray(integrity.fields)) return [];
  const fields = integrity.fields.filter((field: any) => field && field.kind !== 'unknown' && field.status !== 'broken' && field.status !== 'error-reference-not-found').map((field: any) => ({
    id: String(field.id), part: String(field.part), kind: String(field.kind), instruction: String(field.instruction || ''), status: String(field.status), confidence: String(field.confidence || 'medium'), anchorFingerprint: String(field.anchorFingerprint), selected: field.status !== 'unsupported', evidence: Array.isArray(field.evidence) ? field.evidence.map(String) : [],
  }));
  const manualTocCandidates = (Array.isArray(integrity.manualTocCandidates) ? integrity.manualTocCandidates : []).map((candidate: any) => ({
    startParagraphIndex: Number(candidate.startParagraphIndex), endParagraphIndex: Number(candidate.endParagraphIndex), rawText: String(candidate.rawText || ''), anchorFingerprint: String(candidate.anchorFingerprint), selected: false,
  }));
  const bookmarks = (Array.isArray(integrity.bookmarks) ? integrity.bookmarks : []).map((bookmark: any) => ({ name: String(bookmark.name), part: String(bookmark.part), status: String(bookmark.status), ...(bookmark.startFingerprint ? { targetFingerprint: String(bookmark.startFingerprint) } : {}), selected: false }));
  if (!fields.length && !manualTocCandidates.length && !bookmarks.length) return [];
  const form: import('./repair-panel').FieldIntegrityFormDefinition = { fields, manualTocCandidates, bookmarks, summary: `Pronađeno je ${integrity.summary?.totalFields || fields.length} Word polja. ${integrity.summary?.staleFields || 0} ima zastarjeli rezultat, ${integrity.summary?.brokenFields || 0} ima prekinut cilj, a ${manualTocCandidates.length} ručnih sadržaja može se zasebno zamijeniti živim TOC poljem.`, buildParams: () => ({}) };
  form.buildParams = (current) => ({
    version: 1,
    fields: current.fields.filter((field) => field.selected).map((field) => ({ id: field.id, part: field.part, anchorFingerprint: field.anchorFingerprint, action: 'mark-dirty' as const, confirmed: true as const })),
    settings: { updateFieldsOnOpen: true as const },
    ...(current.manualTocCandidates.some((candidate) => candidate.selected) ? { manualToc: current.manualTocCandidates.filter((candidate) => candidate.selected).map((candidate) => ({ startParagraphIndex: candidate.startParagraphIndex, endParagraphIndex: candidate.endParagraphIndex, anchorFingerprint: candidate.anchorFingerprint, action: 'replace-with-live-toc' as const, confirmed: true as const })) } : {}),
  });
  return [{ ruleId: 'field-integrity-assisted', fixerId: 'field-integrity-fixer', label: 'Field Integrity', params: form.buildParams(form), violated: true, requiresConfirmation: false, confirmationText: 'Izradit će se nova XML-popravljena kopija. Originalni dokument ostaje nepromijenjen; konačni brojevi stranica ovise o Wordu ili LibreOffice renderu.', fieldIntegrityForm: form, matchKeys: ['Sadržaj', 'Word polja', 'Cross-reference', 'Brojevi stranica'] }];
}

export function tableFigureRescueRepairableItem(result: any, profile: any): RepairableItem[] {
  const ruleEntry = (Array.isArray(profile?.ruleEntries) ? profile.ruleEntries : []).find((entry: any) => entry?.checkId === 'table-figure-rescue-rules' && entry?.status === 'verified' && entry?.sourceId && entry?.sourcePage && entry?.quote);
  const structure = result?.details?.tableFigureRescue;
  if (!ruleEntry || !structure || (!structure.tables?.length && !structure.figures?.length)) return [];
  const rules = ruleEntry.value || {};
  const tables: TableFigureRescueFormDefinition['tables'] = (structure.tables || []).map((table: any) => ({
    id: String(table.id), bodyChildIndex: Number(table.bodyChildIndex), anchorFingerprint: String(table.anchorFingerprint),
    summary: `${table.rowCount || 0} redaka × ${table.columnCount || 0} stupaca${table.wide ? ', široka tablica' : ''}`,
    wide: table.wide === true, selected: table.unsupported !== true && table.confidence !== 'low',
    actions: { fitToTextWidth: true, equalColumns: true, repeatHeader: !table.hasHeader, preventRowSplit: table.rowsWithCantSplit < table.rowCount, center: true, applyProfileTypography: !!rules.table, separateSource: !!table.source },
    ...(table.source && table.sourceAnchorFingerprint ? { source: { paragraphIndex: Number(table.source.paragraphIndex), anchorFingerprint: String(table.sourceAnchorFingerprint), text: String(table.source.text || ''), selected: true } } : {}),
    ...(table.landscapeAnchors ? { landscape: { beforeFingerprint: String(table.landscapeAnchors.beforeFingerprint), afterFingerprint: String(table.landscapeAnchors.afterFingerprint), selected: false } } : {}),
    ...(rules.table ? { typography: { ...(rules.table.font ? { font: rules.table.font } : {}), ...(Number.isFinite(rules.table.sizePt) ? { sizePt: Number(rules.table.sizePt) } : {}), ...(Number.isFinite(rules.table.beforePt) ? { beforePt: Number(rules.table.beforePt) } : {}), ...(Number.isFinite(rules.table.afterPt) ? { afterPt: Number(rules.table.afterPt) } : {}) } } : {}),
    evidence: Array.isArray(table.evidence) ? table.evidence.map(String) : [],
  }));
  const figures: TableFigureRescueFormDefinition['figures'] = (structure.figures || []).map((figure: any) => ({
    id: String(figure.id), paragraphIndex: Number(figure.paragraphIndex), drawingIndex: Number(figure.drawingIndex), anchorFingerprint: String(figure.anchorFingerprint), ...(Number.isFinite(figure.availableWidthEmu) ? { maxWidthEmu: Number(figure.availableWidthEmu) } : {}),
    summary: `${figure.widthEmu ? Math.round(Number(figure.widthEmu) / 360000 * 100) / 100 : '?'} cm${figure.dpiX ? `, ${Math.round(Number(figure.dpiX))} DPI` : ''}`,
    lowResolution: Number.isFinite(figure.dpiX) && Number(figure.dpiX) < Number(rules.figure?.minDpi || 150), selected: figure.confidence !== 'low',
    actions: { constrainToTextWidth: true, preserveAspectRatio: true, center: true, removeWrapping: figure.wrapsText === true, keepWithCaption: !!rules.figure?.keepWithCaption }, altText: '', evidence: Array.isArray(figure.evidence) ? figure.evidence.map(String) : [],
  }));
  const form: TableFigureRescueFormDefinition = { tables, figures, summary: `Pronađeno je ${tables.length} tablica i ${figures.length} slika/grafikona. Sigurni geometrijski zahvati su predodabrani, a niska rezolucija ostaje upozorenje.`, buildParams: () => ({}) };
  form.buildParams = (current) => ({ version: 1, tables: current.tables.filter((table) => table.selected).map((table) => ({ id: table.id, bodyChildIndex: table.bodyChildIndex, anchorFingerprint: table.anchorFingerprint, actions: table.actions, ...(table.typography ? { typography: table.typography } : {}), ...(table.source?.selected ? { source: { paragraphIndex: table.source.paragraphIndex, anchorFingerprint: table.source.anchorFingerprint } } : {}), ...(table.landscape?.selected ? { landscape: { enabled: true as const, beforeFingerprint: table.landscape.beforeFingerprint, afterFingerprint: table.landscape.afterFingerprint, confirmed: true as const } } : {}) })), figures: current.figures.filter((figure) => figure.selected).map((figure) => ({ id: figure.id, paragraphIndex: figure.paragraphIndex, drawingIndex: figure.drawingIndex, anchorFingerprint: figure.anchorFingerprint, ...(figure.maxWidthEmu ? { maxWidthEmu: figure.maxWidthEmu } : {}), actions: figure.actions, ...(figure.altText.trim() ? { altText: figure.altText.trim() } : {}) })) });
  return [{ ruleId: 'table-figure-rescue-assisted', fixerId: 'table-figure-rescue-fixer', label: 'Table and Figure Rescue', params: form.buildParams(form), violated: true, requiresConfirmation: true, confirmationText: 'Potvrdi geometrijske zahvate i izradu nove popravljene kopije. Preniska rezolucija se ne povećava, alt tekst se ne izmišlja, a original ostaje nepromijenjen.', tableFigureRescueForm: form, matchKeys: ['Popisi slika i tablica', 'Oblik poveznica'] }];
}

function sectionSurgeryRuleEntry(profile: any): any | undefined {
  return (Array.isArray(profile?.ruleEntries) ? profile.ruleEntries : []).find((entry: any) => entry?.checkId === 'section-surgery-rules' && entry?.status === 'verified' && entry?.sourceId && entry?.sourcePage && entry?.quote);
}

export function sectionSurgeryRepairableItem(result: any, profile: any): RepairableItem[] {
  const ruleEntry = sectionSurgeryRuleEntry(profile);
  const structure = result?.details?.sectionStructure;
  if (!ruleEntry || !structure?.sections?.length) return [];
  const rules = ruleEntry.value || {};
  const twips = (cm: unknown): number | undefined => typeof cm === 'number' && Number.isFinite(cm) ? Math.round(cm / 2.54 * 1440) : undefined;
  const sectionForms: SectionSurgeryFormDefinition['sections'] = (structure.sections || []).map((candidate: any) => {
    const operations: SectionSurgeryFormDefinition['sections'][number]['operations'] = [];
    const add = (kind: string, label: string, operation: Record<string, unknown>, selected = true, disabled = false) => operations.push({ id: `${candidate.id}-${kind}`, kind, label, selected, disabled, operation: { id: `${candidate.id}-${kind}`, kind, sectionOrdinal: Number(candidate.ordinal), anchorFingerprint: String(candidate.anchorFingerprint), confirmed: true, ...operation } });
    if (candidate.ordinal === 0 && rules.frontMatter?.numbering && rules.frontMatter.numbering !== 'none') add('set-numbering', `Prednji dio: ${rules.frontMatter.numbering === 'roman' ? 'rimsko' : 'decimalno'} numeriranje`, { numbering: { format: rules.frontMatter.numbering === 'roman' ? 'lowerRoman' : 'decimal', start: 1 } });
    if (candidate.ordinal > 0 && rules.mainMatter?.numbering === 'decimal' && !candidate.isAppendix) add('set-numbering', 'Glavni dio: decimalno numeriranje', { numbering: { format: 'decimal', start: Number(rules.mainMatter.startAt || 1) } });
    if (candidate.isAppendix && rules.appendices?.enabled && rules.appendices.numbering) {
      const format = rules.appendices.numbering === 'letters' ? 'upperLetter' : rules.appendices.numbering === 'roman' ? 'upperRoman' : 'decimal';
      add('set-numbering', `Prilozi: ${rules.appendices.numbering} numeriranje`, { numbering: { format, start: Number(rules.appendices.restartAt || 1) } });
    }
    if (candidate.ordinal === 0 && (rules.frontMatter?.differentFirstPage || rules.frontMatter?.removePageNumberFromTitlePage || rules.headersFooters?.differentFirstPage)) add('set-title-page', 'Different First Page, naslovnica bez broja', { enabled: true });
    if (candidate.ordinal > 0 && rules.mainMatter?.margins) {
      const marginsTwips = Object.fromEntries(Object.entries(rules.mainMatter.margins).flatMap(([key, value]) => { const result = twips(value); return result === undefined ? [] : [[key, result]]; }));
      if (Object.keys(marginsTwips).length) add('set-geometry', 'Primijeni profilne margine ove sekcije', { marginsTwips });
    }
    if (candidate.ordinal === 0 && rules.headersFooters?.differentOddEvenPages) add('set-odd-even', 'Različita zaglavlja parnih i neparnih stranica', { enabled: true });
    if (candidate.ordinal > 0 && rules.headersFooters?.unlinkFromPrevious) {
      if (candidate.headers?.default || candidate.headers?.linkedToPrevious) add('unlink-header', 'Prekini vezu zaglavlja s prethodnom sekcijom', { headerType: 'default' }, false);
      if (candidate.footers?.default || candidate.footers?.linkedToPrevious) add('unlink-footer', 'Prekini vezu podnožja s prethodnom sekcijom', { footerType: 'default' }, false);
    }
    return { id: String(candidate.id), ordinal: Number(candidate.ordinal), summary: candidate.paragraphIndex ? `odlomak ${candidate.paragraphIndex}` : 'završna sekcija', confidence: candidate.confidence || 'low', evidence: Array.isArray(candidate.evidence) ? candidate.evidence.map(String) : [], warnings: Array.isArray(candidate.warnings) ? candidate.warnings.map(String) : [], operations };
  });
  const operationCount = sectionForms.reduce((sum, section) => sum + section.operations.length, 0);
  if (!operationCount) return [];
  const form: SectionSurgeryFormDefinition = { sections: sectionForms, summary: `Pronađeno je ${sectionForms.length} Word sekcija i ${operationCount} profilnih operacija. Sigurne geometrijske i numeracijske promjene su predodabrane, a prekid veza zaglavlja/podnožja traži zasebnu potvrdu.`, buildParams: () => ({}) };
  form.buildParams = (current) => ({ version: 1, operations: current.sections.flatMap((section) => section.operations.filter((operation) => operation.selected && !operation.disabled).map((operation) => operation.operation)) });
  return [{ ruleId: 'section-surgery-assisted', fixerId: 'section-surgery-fixer', label: 'Section Surgery Engine', params: form.buildParams(form), violated: true, requiresConfirmation: true, confirmationText: 'Potvrdi promjene sekcija. Lekta može promijeniti margine, orijentaciju, numeriranje i nasljeđivanje zaglavlja/podnožja, ali ne mijenja tekst rada. Original ostaje nepromijenjen.', sectionSurgeryForm: form, matchKeys: ['Numeriranje stranica', 'Margine dokumenta', 'Sekcije'] }];
}

export function legalFootnoteRepairableItem(result: any, profile: any): RepairableItem[] {
  const ruleEntry = (Array.isArray(profile?.ruleEntries) ? profile.ruleEntries : []).find((entry: any) => entry?.checkId === 'legal-footnote-repair-rules' && entry?.status === 'verified' && entry?.sourceId && entry?.sourcePage && entry?.quote);
  const rules = ruleEntry?.value;
  const structure = result?.details?.legalFootnoteStructure;
  if (!rules || rules.mode !== 'legal-notes' || !structure?.candidates?.length) return [];
  const candidates = (structure.candidates || []).map((candidate: any) => ({
    footnoteId: Number(candidate.footnoteId), rawText: String(candidate.rawText || ''), type: String(candidate.type || 'other'), confidence: candidate.confidence || 'low', evidence: Array.isArray(candidate.evidence) ? candidate.evidence.map(String) : [],
    operations: (candidate.operations || []).map((operation: any) => ({ id: String(operation.id), kind: String(operation.kind), before: String(operation.before || ''), after: String(operation.after || ''), replacementText: String(operation.after || ''), reason: String(operation.reason || ''), confidence: String(operation.confidence || 'medium'), selected: false, ...(Number.isInteger(operation.start) ? { start: Number(operation.start) } : {}), ...(Number.isInteger(operation.end) ? { end: Number(operation.end) } : {}), ...(Number.isInteger(operation.paragraphIndex) ? { paragraphIndex: Number(operation.paragraphIndex) } : {}), ...(operation.markerPosition === 'before-punctuation' || operation.markerPosition === 'after-punctuation' ? { markerPosition: operation.markerPosition } : {}) })),
  }));
  const markers = (structure.markers || []).map((marker: any) => ({ id: String(marker.id), paragraphIndex: Number(marker.paragraphIndex), footnoteId: Number(marker.footnoteId), rawText: String(marker.rawText || ''), confidence: String(marker.confidence || 'medium'), selected: marker.confidence === 'high' }));
  const links = (structure.candidates || []).flatMap((candidate: any) => candidate.bibliographyEntryId ? [{ footnoteId: Number(candidate.footnoteId), bibliographyEntryId: String(candidate.bibliographyEntryId), selected: false }] : []);
  const form: LegalFootnoteRepairFormDefinition = { candidates, markers, links, warnings: Array.isArray(structure.warnings) ? structure.warnings.map(String) : [], summary: `${structure.summary?.footnotes || candidates.length} pravnih fusnota, ${structure.summary?.operations || 0} prijedloga i ${markers.length} ručnih markera. Tekstualne promjene potvrđuju se pojedinačno.`, buildParams: () => ({}) };
  form.buildParams = (current) => ({
    version: 1,
    ...(result?.details?.profileFingerprint ? { profileFingerprint: result.details.profileFingerprint } : {}),
    markers: current.markers.filter((marker) => marker.selected).flatMap((marker) => {
      const original = (structure.markers || []).find((candidate: any) => String(candidate.id) === marker.id);
      return original ? [{ paragraphIndex: Number(original.paragraphIndex), start: Number(original.start), end: Number(original.end), footnoteId: Number(original.footnoteId), anchorFingerprint: String(original.anchorFingerprint), confirmed: true as const }] : [];
    }),
    operations: current.candidates.flatMap((candidate) => candidate.operations.filter((operation) => operation.selected).map((operation) => {
      const originalCandidate = (structure.candidates || []).find((entry: any) => Number(entry.footnoteId) === candidate.footnoteId);
      const original = originalCandidate?.operations?.find((entry: any) => String(entry.id) === operation.id);
      return original ? { id: operation.id, footnoteId: candidate.footnoteId, kind: operation.kind, anchorFingerprint: operation.kind === 'move-marker' ? String(original.anchorFingerprint) : String(originalCandidate.anchorFingerprint), ...(operation.kind === 'move-marker' ? { start: operation.start, end: operation.end, paragraphIndex: operation.paragraphIndex, markerPosition: operation.markerPosition } : { start: 0, end: String(originalCandidate.rawText || '').length, replacementText: operation.replacementText.slice(0, 20_000) }), confirmed: true as const, reason: operation.reason } : null;
    }).filter(Boolean)),
    bibliographyLinks: current.links.filter((link) => link.selected).map((link) => ({ footnoteId: link.footnoteId, bibliographyEntryId: link.bibliographyEntryId, confirmed: true as const })),
  });
  const hasActions = candidates.some((candidate: any) => candidate.operations.length) || markers.length || links.length;
  if (!hasActions) return [];
  return [{
    ruleId: 'legal-footnote-repair-assisted', fixerId: 'legal-footnote-repair-fixer', label: 'Advanced Legal Footnote Repair', params: form.buildParams(form), violated: true, requiresConfirmation: true,
    confirmationText: 'Potvrdi pojedinačne promjene citatnog teksta. Ručni markeri pretvaraju se u stvarne Word fusnote samo uz sigurno postojeće sidro.', legalFootnoteRepairForm: form,
    matchKeys: ['Pravne fusnote', 'op. cit. → prvo navođenje', 'Slijed Ibid.', 'Propisi i uvedene kratice', 'Fusnote ↔ bibliografija'],
  }];
}

export function bibliographyRepairableItem(result: any, profile: any): RepairableItem[] {
  const ruleEntry = (Array.isArray(profile?.ruleEntries) ? profile.ruleEntries : []).find((entry: any) => entry?.checkId === 'bibliography-rules' && entry?.status === 'verified' && entry?.sourceId && entry?.sourcePage && entry?.quote);
  const rules = ruleEntry?.value;
  const structure = result?.details?.bibliographyStructure;
  const entries = Array.isArray(structure?.entries) ? structure.entries : [];
  if (!rules || !entries.length) return [];
  const hangingIndentCm = Number(rules.hangingIndentCm);
  const toTwips = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value / 2.54 * 1440) : undefined;
  const exactDuplicateIds = new Set<string>();
  for (const group of Array.isArray(structure.duplicateGroups) ? structure.duplicateGroups : []) {
    for (const id of Array.isArray(group) ? group.slice(1) : []) exactDuplicateIds.add(String(id));
  }
  const selectedEntries = entries.map((entry: any) => ({
    id: String(entry.id), rawText: String(entry.rawText || ''), confidence: entry.confidence, selected: true,
    ...(exactDuplicateIds.has(String(entry.id)) ? { remove: true } : {}),
    evidence: Array.isArray(entry.evidence) ? entry.evidence.map(String) : [],
  }));
  const suffixes = rules.authorYearSuffixes === true
    ? (Array.isArray(structure.authorYearGroups) ? structure.authorYearGroups : []).flatMap((group: any) => (group.entryIds || []).map((id: string, index: number) => ({ entryId: String(id), suffix: String(group.suffixes?.[index] || String.fromCharCode(97 + index)), selected: true })))
    : [];
  const form: BibliographyFormDefinition = {
    entries: selectedEntries,
    summary: `${structure.summary?.total || entries.length} zapisa, ${structure.summary?.highConfidence || 0} sigurna, ${structure.summary?.review || 0} za pregled. Sigurne higijenske promjene su predodabrane.`,
    enrichmentInputs: entries.map((entry: any) => ({ id: String(entry.id), fields: entry.fields || {} })),
    suffixes,
    buildParams: () => ({}),
  };
  form.applyEnrichment = (candidate: BibliographyEnrichmentCandidate) => {
    const entry = form.entries.find((item) => item.id === candidate.id);
    const original = entries.find((item: any) => String(item.id) === candidate.id);
    if (!entry || !original) return;
    const rendered = formatCitation({ type: original.sourceType || 'knjiga', ...(original.fields || {}), ...candidate.fields }, (rules.styleToken || 'autor-godina') as CitationStyle).citation;
    entry.replacementText = rendered;
    entry.selected = true;
  };
  form.buildParams = (current) => {
    const originalById = new Map<string, any>(entries.map((entry: any) => [String(entry.id), entry]));
    const chosen = current.entries.filter((entry) => entry.selected).flatMap((entry) => {
      const original = originalById.get(entry.id);
      if (!original) return [];
      return [{
        id: entry.id,
        paragraphIndices: original.paragraphIndices,
        anchorFingerprint: original.anchorFingerprint,
        ...(entry.remove ? { remove: true } : {}),
        ...(entry.replacementText !== undefined && entry.replacementText !== entry.rawText ? { replacementText: entry.replacementText } : {}),
        normalizeText: true,
        ...(original.fields?.doi ? { hyperlink: 'doi' as const } : original.fields?.url ? { hyperlink: 'url' as const } : {}),
      }];
    });
    const selectedIds = new Set(current.entries.filter((entry) => entry.selected).map((entry) => entry.id));
    const order = rules.sort === 'alphabetical'
      ? entries.slice().filter((entry: any) => selectedIds.has(String(entry.id))).sort((a: any, b: any) => String(a.fields?.authors || a.rawText).localeCompare(String(b.fields?.authors || b.rawText), 'hr')).map((entry: any) => String(entry.id))
      : undefined;
    return {
      version: 1,
      ...(result?.details?.profileFingerprint ? { profileFingerprint: result.details.profileFingerprint } : {}),
      entries: chosen,
      ...(order ? { order } : {}),
      options: {
        ...(toTwips(hangingIndentCm) !== undefined ? { hangingIndentTwips: toTwips(hangingIndentCm) } : {}),
        ...(typeof rules.beforePt === 'number' ? { beforeTwentieths: Math.round(rules.beforePt * 20) } : {}),
        ...(typeof rules.afterPt === 'number' ? { afterTwentieths: Math.round(rules.afterPt * 20) } : {}),
        ...(rules.stripUrlTerminalPunctuation === true ? { stripUrlTerminalPunctuation: true } : {}),
      },
      ...(current.suffixes?.some((suffix) => suffix.selected) ? { suffixes: current.suffixes.filter((suffix) => suffix.selected).map(({ entryId, suffix }) => ({ entryId, suffix })) } : {}),
    };
  };
  return [{
    ruleId: 'bibliography-repair-assisted',
    fixerId: 'bibliography-repair-fixer',
    label: 'Bibliography Repair Engine',
    params: form.buildParams(form),
    violated: true,
    requiresConfirmation: true,
    confirmationText: 'Potvrdi sortiranje, normalizaciju i ciljano uklanjanje potpuno identičnih duplikata. Nepotpuni i slični zapisi ne mijenjaju se bez dodatne potvrde.',
    bibliographyForm: form,
    matchKeys: ['Potpunost bibliografskih zapisa', 'Citirano → literatura', 'Literatura → citirano'],
  }];
}

/**
 * Velika slova naslova: JEDINA stavka koja mijenja AUTOROV TEKST.
 *
 * Zato nikad ne ulazi u "Popravi sve" (vraca se odvojeno, vidi app.ts) i nosi
 * `requiresConfirmation`. Korisniku se uz nju uvijek nudi i opcija "samo prijedlog", koja tocno
 * pokaze koji bi se naslovi promijenili i kako, bez ijedne izmjene dokumenta.
 */
export function headingCaseRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  const rules = profile?.headingRules;
  const levels = rules?.levels;
  if (!rules || !levels || typeof levels !== 'object') return [];
  const maxLevel = Number(rules.maxLevel) || 3;
  const wanted: number[] = [];
  for (let level = 1; level <= maxLevel; level++) {
    if (levels[String(level)]?.uppercase === true) wanted.push(level);
  }
  if (!wanted.length) return [];

  const opis = wanted.length === 1 ? `naslova ${wanted[0]}. razine` : `naslova razina ${wanted.join(', ')}`;
  return [
    {
      ruleId: 'heading-case-universal',
      fixerId: 'heading-case-fixer',
      label: 'Velika slova naslova',
      params: { levels: wanted },
      violated: isViolated('heading-format', checks),
      matchKeys: [CHECK_TITLE['heading-format']],
      requiresConfirmation: true,
      confirmationText: `Ovo mijenja TEKST ${opis} u velika slova. Jedini je popravak koji dira sadržaj rada, pa se primjenjuje samo uz tvoju izričitu privolu.`,
    },
  ];
}

/**
 * Font i velicina teksta fusnota. Gated na profilne `footnoteFont`/`footnoteSize`, koje postavlja
 * samo pravni profil (isti izvor koji analiza koristi za provjeru "Oblikovanje fusnota").
 */
export function footnoteTypographyRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  const fonts: unknown = profile?.footnoteFont;
  const size = Number(profile?.footnoteSize);
  const fontName = Array.isArray(fonts) && typeof fonts[0] === 'string' ? String(fonts[0]) : undefined;
  const fontSizePt = Number.isFinite(size) && size > 0 ? size : undefined;
  if (fontName === undefined && fontSizePt === undefined) return [];

  const params: Record<string, unknown> = {};
  if (fontName !== undefined) params.fontName = fontName;
  if (fontSizePt !== undefined) params.fontSizePt = fontSizePt;
  if (profile?.footnoteJustify === true) params.alignJustify = true;
  return [
    {
      ruleId: 'footnote-typography-universal',
      fixerId: 'footnote-typography-fixer',
      label: 'Font i veličina fusnota',
      params,
      violated: isViolated('footnote-typography', checks),
      matchKeys: [CHECK_TITLE['footnote-typography']],
    },
  ];
}

// GO-LIVE zastavica (K6, BL-07c). Umetanje sekcije prije Uvoda je strukturna izmjena docx-a
// ciju realnu Word/LibreOffice valjanost golden NE moze dokazati (pokriva samo XML-transform);
// izlazni gate K6 trazi rucnu Word/LO matricu prije objave. Dok je false, popravak se ne nudi
// korisniku (motor + testovi + golden su zeleni, ali putanja je "tamna"). Vlasnik je postavlja
// na true TEK nakon rucne matrice (K5+K6 se objavljuju zajedno). Vidi docs/LEKTA_BUILD_PIPELINE.md K6.
// UPALJENO 2026-07-19 nakon vlasnicke Word/LibreOffice validacije (WS-4) na demo-diplomskom:
// naslovnica bez broja, rimski na prednjim listovima, arapski od Uvoda - potvrdjeno u oba preglednika.
export const SECTION_INSERT_LIVE = true;

/**
 * Popravak "numeriranje od Uvoda" za dokument BEZ upotrebljivog prijeloma sekcije (najcesci
 * slucaj: jedna sekcija). Umece prijelom sekcije prije Uvoda pa postavlja rimski/arapski
 * numeriranje i podnozje s brojem (kompozitni section-insert-fixer). Gejtano:
 *  - profilnom zastavicom checkPageNumberStartAtIntro (isti izvor kao K4 stavka),
 *  - detektabilnom granicom Uvoda: introParagraphIndex >= 2 (mora postojati prednji dio),
 *  - ODSUSTVOM upotrebljivog splita: kad sectionNumberingTargets vec vrati detectable=true,
 *    dokument IMA sekcije s granicom na Uvodu pa to rjesava K4 stavka (pageNumberingRepairableItem),
 *    ne umetanje; ovdje se nudi samo kad K4 put NE hvata (nema splita ili nije na Uvodu),
 *  - SECTION_INSERT_LIVE zastavicom (rucna Word/LO matrica prije objave).
 * Trazi izricitu potvrdu lokacije u panelu (requiresConfirmation): umetanje prijeloma je
 * semanticka odluka o mjestu, najveci UX rizik pipelinea. violated se cita iz STATUSA
 * numeriranje-checka (nebodovan na jednosekcijskom radu, ali 'warn' kad nije potvrdjen).
 */
export function introSectionRepairableItem(result: any, profile: any): RepairableItem[] {
  // GO-LIVE gate (K6): dok rucna Word/LO matrica nije odradjena, ne nudi se korisniku.
  return SECTION_INSERT_LIVE ? introSectionItem(result, profile) : [];
}

/** Jezgra logike (neovisna o SECTION_INSERT_LIVE), izdvojena da se gating moze testirati bez
 *  diranja zastavice. app.ts UVIJEK zove flag-gated introSectionRepairableItem, ne ovu. */
export function introSectionItem(result: any, profile: any): RepairableItem[] {
  if (profile?.checkPageNumberStartAtIntro !== true) return [];
  const introIdx = result?.details?.introParagraphIndex;
  if (typeof introIdx !== 'number' || introIdx < 2) return [];
  // OPSEG K6 v1: nudi se SAMO za jednosekcijski rad (ista granica kao sectionInsertFixer
  // backstop). Visesekcijski dokument -> ne nudimo umetanje (rizik krivog mapiranja sekcija):
  //  - ako je granica sekcije tocno na Uvodu, K4 stavka (pageNumberingRepairableItem) to rjesava
  //    postavljanjem pgNumType nad postojecim sekcijama; umetanje bi bilo dvostruki prijelom,
  //  - ako granica NIJE na Uvodu (npr. zasebna naslovnica pa sazetak pa Uvod), umetanje markera
  //    dalo bi >=3 sekcije i hardkodirani rimski/arapski ciljevi bi krivo mapirali prednji dio;
  //    to je odgodjeno (isti razlog kao backstop u sectionInsertFixer).
  const sections = result?.details?.sections;
  if (!Array.isArray(sections) || sections.length !== 1) return [];
  const checks: AnalyzedCheck[] = result?.checks ?? [];
  const startStatus = checkStatusByTitle(checks, CHECK_TITLE['page-number-start']);
  // violated: numeriranje od Uvoda nije potvrdjeno (status != 'pass' ili check ne postoji).
  const violated = startStatus !== 'pass';
  // RE-05: align se IZVODI iz profila (isti pageNumberAlignment kao pageNumberAlignmentRepairableItem),
  // ne hardkodira na 'center'. Prije je popravak umetao CENTRIRAN broj dok su SVI profili koji ovu
  // stavku nude (checkPageNumberStartAtIntro) istodobno trazili broj DESNO: popravak je sam sebi
  // proizvodio novi prekrsaj na recheku ("Spremnost 85 -> 82").
  const align = resolvePageNumberAlign(profile);
  return [
    {
      ruleId: 'section-insert-intro',
      fixerId: 'section-insert-fixer',
      label: 'Numeriranje od Uvoda: umetni prijelom sekcije (rimski/arapski, naslovnica bez broja)',
      params: { target: { introParagraphIndex: introIdx, align } },
      violated,
      // Isti checkId kao pageNumberingRepairableItem (K4): ovo je ALTERNATIVNI put za isti nalaz
      // ("Provjeri rimsku i arapsku numeraciju"/"Numeriranje od prve stranice Uvoda") kad dokument
      // nema upotrebljiv split sekcija. Bar jedan od dva (nikad oba) zavrsi u items[].
      matchKeys: [CHECK_TITLE['page-number-start'], CHECK_TITLE['page-number-scheme']],
      requiresConfirmation: true,
      confirmationText:
        `Umetnut ćemo prijelom sekcije neposredno prije ${introIdx}. odlomka (Uvod). ` +
        'Prednji listovi (naslovnica, sažetak, sadržaj) dobivaju rimske brojeve, glavni tekst od Uvoda arapske od 1, ' +
        'a naslovnica ostaje bez broja. Provjeri da je to točno mjesto početka Uvoda prije nego nastaviš.',
    },
  ];
}

export function requiredSectionsRepairableItem(result: any, profile: any): RepairableItem[] {
  const entries = Array.isArray(profile?.ruleEntries) ? profile.ruleEntries : [];
  const verified = entries.some((entry: RuleEntry) => entry?.checkId === 'required-section-rules' && entry?.status === 'verified' && entry?.sourceId && entry?.sourcePage && entry?.quote);
  if (!verified) return [];
  const structure = result?.details?.requiredSectionsStructure;
  const candidates = Array.isArray(structure?.candidates) ? structure.candidates.filter((candidate: any) => !candidate.present) : [];
  if (!candidates.length) return [];
  const rules = profile?.effectiveRules?.requiredSectionRules || profile?.requiredSectionRules || {};
  const form: RequiredSectionsFormDefinition = {
    summary: structure.summary?.text || `Nedostaje ${candidates.length} obveznih dijelova.`,
    candidates: candidates.map((candidate: any) => ({ id: String(candidate.id), kind: String(candidate.kind), label: String(candidate.label), confidence: String(candidate.confidence), headingLevel: Number(candidate.headingLevel) || 1, ...(candidate.styleId ? { styleId: String(candidate.styleId) } : {}), numbered: candidate.numbered === true, contentPolicy: String(candidate.contentPolicy || 'none'), verifiedStatement: typeof candidate.verifiedStatement === 'string' ? candidate.verifiedStatement : undefined, placeholderText: rules.placeholderText?.[candidate.kind] || '[OVDJE UNESI SADRŽAJ]', commentText: 'Ovdje unesi sadržaj', selected: candidate.confidence === 'high' && !!candidate.insertionAnchor, contentMode: candidate.verifiedStatement ? 'statement' : rules.addComment ? 'comment' : 'none', insertionAnchor: candidate.insertionAnchor, evidence: Array.isArray(candidate.evidence) ? candidate.evidence : [], warnings: Array.isArray(candidate.warnings) ? candidate.warnings : [] })),
    buildParams: (current) => ({ version: 1, sections: current.candidates.filter((candidate) => candidate.selected && candidate.insertionAnchor).map((candidate) => ({ id: candidate.id, kind: candidate.kind, label: candidate.label, insertionAnchor: candidate.insertionAnchor, headingLevel: candidate.headingLevel, ...(candidate.styleId ? { styleId: candidate.styleId } : {}), numbered: candidate.numbered, confirmed: true, ...(candidate.contentMode === 'placeholder' ? { placeholderText: candidate.placeholderText } : {}), ...(candidate.contentMode === 'comment' ? { commentText: candidate.commentText } : {}), ...(candidate.contentMode === 'statement' && candidate.verifiedStatement ? { statementText: candidate.verifiedStatement } : {}) })) }),
  };
  return [{ ruleId: 'required-section-rules', fixerId: 'required-section-fixer', label: 'Nedostajući obvezni dijelovi', params: form.buildParams(form), violated: true, requiresConfirmation: true, confirmationText: 'Potvrdi umetanje samo naslova i odabranih oznaka za unos. Akademski sadržaj se ne generira.', requiredSectionsForm: form, matchKeys: ['Dijelovi verificiranog profila'] }];
}

export function linkDoiRepairableItem(result: any, profile: any): RepairableItem[] {
  const structure = result?.details?.linkDoiStructure;
  const occurrences = Array.isArray(structure?.occurrences) ? structure.occurrences : [];
  if (!occurrences.length) return [];
  const rules = profile?.effectiveRules?.linkRules || profile?.linkRules;
  const form: import('./repair-panel').LinkDoiFormDefinition = {
    summary: `Pronađeno je ${occurrences.length} poveznica ili DOI oznaka.`,
    occurrences: occurrences.map((occurrence: any) => {
      const canonical = canonicalizeLinkForRepair(String(occurrence.rawText), rules);
      const operations = (Array.isArray(occurrence.safeOperations) ? occurrence.safeOperations : []).map((action: string) => ({ action, before: String(occurrence.rawText), ...(action === 'make-hyperlink' || action === 'normalize-doi' || action === 'repair-spacing' ? { replacementText: occurrence.kind === 'doi' ? canonical : action === 'repair-spacing' ? canonical : String(occurrence.rawText), targetUrl: canonical } : {}), ...(action === 'remove-tracking' ? { replacementText: canonical, targetUrl: canonical } : {}), selected: occurrence.confidence === 'high' && !occurrence.requiresConfirmation }));
      return { id: String(occurrence.id), rawText: String(occurrence.rawText), displayedText: String(occurrence.displayedText), ...(occurrence.target ? { target: String(occurrence.target) } : {}), kind: String(occurrence.kind), status: String(occurrence.status), confidence: String(occurrence.confidence), evidence: Array.isArray(occurrence.evidence) ? occurrence.evidence : [], selectedActions: operations.filter((x: any) => x.selected).map((x: any) => x.action), operations, paragraphIndex: Number(occurrence.paragraphIndex), start: Number(occurrence.start), end: Number(occurrence.end), anchorFingerprint: String(occurrence.anchorFingerprint) };
    }),
    buildParams: (current) => ({ version: 1, operations: current.occurrences.flatMap((occurrence) => occurrence.operations.filter((operation) => operation.selected).map((operation) => ({ id: `${occurrence.id}-${operation.action}`, part: 'word/document.xml', paragraphIndex: occurrence.paragraphIndex, start: occurrence.start, end: occurrence.end, anchorFingerprint: occurrence.anchorFingerprint, before: operation.before, ...(operation.replacementText !== undefined ? { replacementText: operation.replacementText } : {}), ...(operation.targetUrl !== undefined ? { targetUrl: operation.targetUrl } : {}), action: operation.action, confirmed: true }))) }),
  };
  return [{ ruleId: 'link-doi-repair-assisted', fixerId: 'link-doi-fixer', label: 'Popravak poveznica i DOI-ja', params: form.buildParams(form), violated: true, requiresConfirmation: true, confirmationText: 'Potvrdi odabrane lokalne popravke poveznica. HTTP provjere i kanonske zamjene ostaju zasebna privola.', linkDoiForm: form, matchKeys: ['Oblik poveznica'] }];
}

// GO-LIVE zastavica (K7, BL-09). Umetanje TOC polja je strukturna docx izmjena ciju realnu Word
// regeneraciju (osvjezava li Word polje na otvaranju, bez "repair" upozorenja) golden NE dokazuje;
// izlazni gate K7 trazi rucnu provjeru u Wordu. Dok je false, popravak se ne nudi (motor + testovi +
// golden zeleni, putanja tamna). Vlasnik postavlja na true nakon Word provjere (moze zajedno s K5/K6
// matricom, jednom Word sesijom). Vidi docs/LEKTA_BUILD_PIPELINE.md K7.
// UPALJENO 2026-07-19 nakon vlasnicke Word validacije (WS-4): TOC je SDT sadrzaj-kontrola
// (docPartGallery "Table of Contents") pa Word nudi "Azuriraj tablicu" i regenerira sadrzaj.
export const TOC_FIELD_LIVE = true;

/**
 * Popravak: pretvori rucni "Sadrzaj" u ZIVO TOC polje (K7, BL-09). Nedestruktivno (dodaje polje, NE
 * brise rucne stavke; fixer to poručuje u afterLabel). Gejtano:
 *  - profil trazi sadrzaj (requireToc),
 *  - postoji naslov Sadrzaj (details.sadrzajParagraphIndex != null) = sidro za umetanje,
 *  - dokument JOS NEMA zivo TOC polje (details.hasTocField !== true) = ne dupliciramo,
 *  - TOC_FIELD_LIVE zastavica (rucna Word provjera prije objave).
 * app.ts UVIJEK zove flag-gated tocFieldRepairableItem, ne jezgru tocFieldItem.
 */
export function tocFieldRepairableItem(result: any, profile: any): RepairableItem[] {
  return TOC_FIELD_LIVE ? tocFieldItem(result, profile) : [];
}

/** Jezgra (neovisna o TOC_FIELD_LIVE), izdvojena da se gating testira bez diranja zastavice. */
export function tocFieldItem(result: any, profile: any): RepairableItem[] {
  if (profile?.requireToc !== true) return [];
  const sadrzajIdx = result?.details?.sadrzajParagraphIndex;
  if (typeof sadrzajIdx !== 'number' || sadrzajIdx < 1) return [];
  if (result?.details?.hasTocField === true) return []; // vec ima zivo polje -> ne nudimo (ne dupliciramo)
  return [
    {
      ruleId: 'toc-field-universal',
      fixerId: 'toc-field-fixer',
      label: 'Sadržaj: pretvori u živo TOC polje (Word ga sam ažurira)',
      params: { target: { sadrzajParagraphIndex: sadrzajIdx } },
      violated: true,
      // Namjerno BEZ matchKeys: ova stavka se nudi neovisno o tome je li "Sadrzaj dokumenta"
      // check prekrsen (cesto je vec 'pass', jer paragraf "Sadrzaj" vec postoji), pa nema
      // pojedinacan nalaz na kartici rezultata kojem bi je trebalo vezati (RESULT-03).
    },
  ];
}

/**
 * Pronadji stavku iz items[] (ili textItems[]) cija povredu popravlja BAS ovaj nalaz (RESULT-03:
 * klik na "Otvori mogucnost popravka" na kartici konkretnog nalaza treba otvoriti popravak TOG
 * nalaza, ne opceniti panel bez ikakve veze). Korelacija ide preko matchKeys (naslov checka/issuea
 * koji je nalaz proizveo), ne preko ruleId-a (ruleId je specifican za profil/institucijski zapis,
 * matchKeys su specificni za VRSTU povrede pa preslikavanje radi kroz sve profile jednako).
 * Vraca undefined kad nijedna stavka ne odgovara (npr. dokument nema upotrebljiv split sekcija za
 * numeriranje, ili je stavka izvan trenutno ponudjenog skupa) - poziva se HONESTAN fallback, ne
 * tiho ostavljanje korisnika na proizvoljnoj stavki.
 */
export function pickTargetItem(
  matchKeys: string[] | undefined,
  items: readonly RepairableItem[],
): RepairableItem | undefined {
  if (!matchKeys?.length) return undefined;
  return items.find((item) => item.matchKeys?.some((key) => matchKeys.includes(key)));
}
