/**
 * Closed-loop provjera profilnih popravaka.
 *
 * Za svaki profil koji ima objavljenu repair stavku gradi se jedan kontrolirani
 * DOCX s namjerno pogresnim osnovnim oblikovanjem. Dokument prolazi kroz isti
 * ulazni lanac kao i golden testovi, stavke se izvuku iz iste runtime mape kao
 * u UI-ju, a nakon popravka se analiza ponavlja. Time test ne provjerava samo
 * da fixer mijenja XML, nego i da promjena stvarno uklanja ciljani nalaz.
 *
 * Ovo je test profilnih, automatskih popravaka. Asistirane stavke imaju
 * strukturu ovisnu o konkretnom nalazu i ostaju pokrivene svojim jedinicnim
 * testovima i repair-golden harnessom, koji vec prolazi kroz svaki poznati fixer.
 */
import { describe, expect, it } from 'vitest';
import { readZip } from '../src/repair/zip-codec';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { repairEntriesFor } from '../src/profiles/profile-runtime-maps';
import { buildRepairableItems, type AnalyzedCheck } from '../src/ui/repair-items';
import type { RepairableItem } from '../src/ui/repair-panel';
import { applyFixers, type FixerRequest } from '../src/repair/apply-fixers';
import { PAPER_SIZE_TITLE_PREFIX } from '../src/analysis/check-fixer-map';
import { buildDocxFile, type DocSpec, type ParaSpec } from './helpers/docx-builder';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const BODY_TEXT = 'Ovo je kontrolirani odlomak akademskog teksta za provjeru popravka.';
const DEEP_CAPABLE = new Set(['font-fixer', 'line-spacing-fixer', 'alignment-fixer']);

interface ProfileRepairEntry {
  ruleId: string;
  checkId: string | null;
}

interface RepairCase {
  profileId: string;
  entries: ProfileRepairEntry[];
}

function requiredCheckEnabled(profile: Record<string, unknown>, checkId: string): boolean {
  switch (checkId) {
    case 'font': return profile.checkFont !== false;
    case 'font-size': return profile.checkSize !== false;
    case 'line-spacing': return profile.checkSpacing !== false;
    case 'justify': return profile.checkJustify !== false && profile.justify === true;
    case 'margins': return profile.checkMargins !== false;
    case 'paper-size': return (Array.isArray(profile.paperSizes) && profile.paperSizes.length > 0) || profile.requireA4 === true;
    default: return true;
  }
}

function profileCases(): RepairCase[] {
  return VERIFIED_PROFILE_REGISTRY.flatMap((profile) => {
    const resolved = resolveProfile(profile.id) as Record<string, unknown>;
    const runtimeEntries = repairEntriesFor(profile.id);
    const offeredRuleIds = new Set(
      buildRepairableItems([], resolveProfile(profile.id), runtimeEntries, { includeNonViolated: true })
        .map((item) => item.ruleId),
    );
    const entries = runtimeEntries
      .filter((entry) => entry.checkId)
      .filter((entry) => offeredRuleIds.has(entry.ruleId))
      .filter((entry) => entry.recommended === true || requiredCheckEnabled(resolved, entry.checkId as string))
      .map((entry) => ({ ruleId: entry.ruleId, checkId: entry.checkId }));
    return entries.length ? [{ profileId: profile.id, entries }] : [];
  });
}

function firstCheck(checks: AnalyzedCheck[], title: string): AnalyzedCheck | undefined {
  return checks.find((check) => check.title === title);
}

function targetEntries(entries: ProfileRepairEntry[]): Map<string, string> {
  return new Map(entries.flatMap((entry) => (entry.checkId ? [[entry.ruleId, entry.checkId] as const] : [])));
}

function differentNumber(target: number, fallback: number): number {
  return Math.abs(target - fallback) < 0.001 ? fallback + 1 : fallback;
}

function buildBrokenSpec(items: RepairableItem[], entries: ProfileRepairEntry[]): DocSpec {
  const checkByRule = new Map(entries.flatMap((entry) => (entry.checkId ? [[entry.ruleId, entry.checkId] as const] : [])));
  const params = items.flatMap((item) => {
    const checkId = checkByRule.get(item.ruleId);
    return checkId ? [{ checkId, target: item.params }] : [];
  });

  const targetByCheck = new Map(params.map((entry) => [entry.checkId, entry.target]));
  const fontTarget = targetByCheck.get('font')?.fontName;
  const sizeTarget = targetByCheck.get('font-size')?.fontSizePt;
  const lineTarget = targetByCheck.get('line-spacing')?.multiplier;
  const justifyTarget = targetByCheck.get('justify')?.val;
  const marginsTarget = targetByCheck.get('margins');
  const paperTarget = targetByCheck.get('paper-size');

  const paragraphs: ParaSpec[] = Array.from({ length: 8 }, (_, index) => ({
    text: `${BODY_TEXT} ${index + 1}`,
    ...(typeof fontTarget === 'string' ? { font: 'Comic Sans MS' } : {}),
  }));

  const wrongMargins = marginsTarget && typeof marginsTarget === 'object'
    ? Object.fromEntries(['top', 'right', 'bottom', 'left'].map((side) => {
        const target = Number((marginsTarget as Record<string, unknown>)[side]);
        return [side, differentNumber(target, 1)];
      })) as DocSpec['marginsCm']
    : undefined;

  const wrongPaper = paperTarget && typeof paperTarget === 'object'
    ? (() => {
        const target = paperTarget as { w?: unknown; h?: unknown };
        return Math.abs(Number(target.w) - 14.8) < 0.001 && Math.abs(Number(target.h) - 21) < 0.001
          ? { w: 29.7, h: 42 }
          : { w: 14.8, h: 21 };
      })()
    : undefined;

  return {
    paragraphs,
    ...(wrongMargins ? { marginsCm: wrongMargins } : {}),
    ...(wrongPaper ? { pageCm: wrongPaper } : {}),
  };
}

function buildBrokenStyles(items: RepairableItem[], entries: ProfileRepairEntry[], profile: Record<string, unknown>): string {
  const checkByRule = new Map(entries.flatMap((entry) => (entry.checkId ? [[entry.ruleId, entry.checkId] as const] : [])));
  const paramsByCheck = new Map(items.flatMap((item) => {
    const checkId = checkByRule.get(item.ruleId);
    return checkId ? [[checkId, item.params] as const] : [];
  }));
  const lineTarget = paramsByCheck.get('line-spacing')?.multiplier;
  const justifyTarget = paramsByCheck.get('justify')?.val;
  const fontTarget = paramsByCheck.get('font')?.fontName;
  const sizeTarget = paramsByCheck.get('font-size')?.fontSizePt;
  const wrongFont = typeof fontTarget === 'string' ? 'Comic Sans MS' : 'Times New Roman';
  const allowedSizes = Array.isArray(profile.size) ? profile.size.filter((value): value is number => typeof value === 'number') : [];
  const wrongSizeCandidates = [5, 7, 9, 14, 18, 22];
  const wrongSize = wrongSizeCandidates.find((candidate) => !allowedSizes.some((allowed) => Math.abs(allowed - candidate) < 0.1)) ??
    (typeof sizeTarget === 'number' ? differentNumber(sizeTarget, 10) : 12);
  const line = typeof lineTarget === 'number' && Math.abs(lineTarget - 1) < 0.001 ? 480 : 240;
  const alignment = justifyTarget === 'both' ? 'left' : 'both';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${wrongFont}" w:hAnsi="${wrongFont}"/><w:sz w:val="${Math.round(wrongSize * 2)}"/></w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/><w:pPr><w:spacing w:line="${line}" w:lineRule="auto"/><w:jc w:val="${alignment}"/></w:pPr></w:style>` +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>' +
    '</w:styles>'
  );
}

async function documentTexts(bytes: Uint8Array): Promise<string[]> {
  const entries = await readZip(bytes);
  const document = entries.find((entry) => entry.name === 'word/document.xml');
  if (!document) throw new Error('DOCX nema word/document.xml');
  const xml = new TextDecoder().decode(document.data);
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) =>
    match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
}

function requestsFor(items: RepairableItem[]): FixerRequest[] {
  return items.map((item) => ({
    fixerId: item.fixerId,
    ruleId: item.ruleId,
    params: DEEP_CAPABLE.has(item.fixerId) ? { ...item.params, deep: true } : item.params,
  }));
}

function assertNoPassRegression(before: AnalyzedCheck[], after: AnalyzedCheck[], targeted: Set<string>): void {
  for (const check of before) {
    if (targeted.has(check.title) || check.status !== 'pass') continue;
    const afterCheck = firstCheck(after, check.title);
    expect(afterCheck?.status, `check koji je prije prolazio ne smije pasti: ${check.title}`).toBe('pass');
  }
}

describe('Repair Engine closed-loop profilna matrica', () => {
  const cases = profileCases();

  it('svaki profilni repair zapis ima pripadajuci profil', () => {
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every((item) => item.entries.length > 0)).toBe(true);
  });

  it.each(cases)('$profileId: detektira, popravlja i ponovno provjerava sve osnovne opcije', async ({ profileId, entries }) => {
    const profile = resolveProfile(profileId) as Record<string, unknown>;
    const runtimeEntries = repairEntriesFor(profileId);
    // includeNonViolated izvodi params istim putem kao "uskladi sve" u UI-ju.
    // To je vazno za recommended stavke, ciji cilj dolazi iz entry.value.
    const expectedItems = buildRepairableItems([], profile, runtimeEntries, { includeNonViolated: true });
    const stylesXml = buildBrokenStyles(expectedItems, entries, profile);
    const spec = { ...buildBrokenSpec(expectedItems, entries), stylesXml };
    const input = buildDocxFile(spec, `${profileId}-closed-loop.docx`);
    const before = await analyzeFixture(input, { profileId });
    const items = buildRepairableItems(before.checks, profile, runtimeEntries);
    const expectedByRule = targetEntries(entries);

    expect(new Set(items.map((item) => item.ruleId)), profileId).toEqual(new Set(expectedByRule.keys()));
    for (const item of items) {
      if (!item.recommended) expect(item.violated, `${profileId}/${item.ruleId}`).toBe(true);
    }

    const targetedTitles = new Set(items.flatMap((item) => item.matchKeys ?? []));
    const beforeTexts = await documentTexts(new Uint8Array(await input.arrayBuffer()));
    const applied = await applyFixers(new Uint8Array(await input.arrayBuffer()), requestsFor(items));

    const handledRuleIds = [...applied.changelog.map((entry) => entry.ruleId), ...applied.skipped].sort();
    expect(handledRuleIds, profileId).toEqual(items.map((item) => item.ruleId).sort());
    expect(applied.changelog.length, `${profileId}: barem jedna stavka mora stvarno promijeniti dokument`).toBeGreaterThan(0);

    const outputFile = new File([applied.docxBytes], `${profileId}-closed-loop-fixed.docx`, { type: DOCX_MIME });
    const after = await analyzeFixture(outputFile, { profileId });
    const afterTexts = await documentTexts(applied.docxBytes);
    expect(afterTexts, `${profileId}: tekst se ne smije promijeniti`).toEqual(beforeTexts);

    for (const item of items) {
      if (item.recommended) continue;
      for (const title of item.matchKeys ?? []) {
        const check = title.startsWith(PAPER_SIZE_TITLE_PREFIX)
          ? after.checks.find((candidate) => candidate.title.startsWith(PAPER_SIZE_TITLE_PREFIX))
          : firstCheck(after.checks, title);
        expect(check?.status, `${profileId}/${item.ruleId}: ${title}`).toBe('pass');
      }
    }
    assertNoPassRegression(before.checks, after.checks, targetedTitles);

    const second = await applyFixers(applied.docxBytes, requestsFor(items));
    expect(second.changelog, `${profileId}: drugi prolaz mora biti no-op`).toEqual([]);
    expect(second.docxBytes, `${profileId}: no-op mora zadrzati istu referencu`).toBe(applied.docxBytes);
  }, 120000);
});
