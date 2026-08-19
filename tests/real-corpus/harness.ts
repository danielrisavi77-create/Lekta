import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFixture, resolveProfile } from '../../src/analysis/golden-entry';
import { installXmlDomParser } from '../../src/docx/xml-dom-install';
import { repairEntriesFor, ensureRepairMapHeavy } from '../../src/profiles/profile-runtime-maps';
import { applyFixers, type FixerRequest } from '../../src/repair/apply-fixers';
import { detectPassRegressions } from '../../src/analysis/repair-regression';
import { buildDefaultRepairRequests } from '../../src/repair/default-selection';
import { inspectDocxParts } from '../../src/repair/package-integrity';
import { readZip } from '../../src/repair/zip-codec';
import { buildAllRepairableItems } from '../../src/ui/repair-item-assembly';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REAL_CORPUS_ROOT = join(HERE, '..', 'fixtures', 'docx');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
installXmlDomParser(true);

/**
 * LOKALNI, NECOMMITANI korpus (P1-1).
 *
 * Commitane fixture su anonimne ili sinteticke i ostaju jedini reproducibilan skup za CI. Stvarni
 * studentski radovi se NE commitaju (tudji osobni podaci trajno bi usli u povijest gita, vidi
 * `tests/fixtures/docx/README.md`), pa se drze ovdje i mjere lokalno. U git ide samo REZULTAT
 * mjerenja (`docs/generated/repair-real-corpus.json`), nikad sadrzaj dokumenata.
 *
 * Direktorij je u `.gitignore`. Kad ne postoji, sve radi kao i prije.
 */
export const LOCAL_CORPUS_ROOT = join(HERE, '..', 'fixtures', 'docx-local');

export interface RealCorpusManifestEntry {
  documentId: string;
  fileName: string;
  profileId: string;
  /** Direktorij iz kojeg se datoteka cita; omogucuje spajanje commitanog i lokalnog korpusa. */
  root?: string;
}

export interface RealCorpusResult {
  documentId: string;
  fileName: string;
  profileId: string;
  outcome: 'pass' | 'review' | 'fail' | 'no-op';
  before: { checkCount: number; passCount: number; score: number | null };
  after: { checkCount: number; passCount: number; score: number | null } | null;
  beforeEntryCount: number;
  afterEntryCount: number;
  droppedEntryCount: number;
  offeredFixerIds: string[];
  changedFixerIds: string[];
  targetedCheckCount: number;
  targetedResolvedCount: number;
  targetedUnresolvedCount: number;
  passRegressionCount: number;
  outputReadable: boolean;
  /**
   * Faza A2 (RE-47 klasa): je li SVAKI XML/rels dio popravljenog paketa well-formed.
   * `outputReadable` iznad provjerava samo da word/document.xml postoji i nije prazan, pa je
   * neispravan settings.xml/footer1.xml/numbering.xml dosad prolazio neprimijeceno.
   */
  packageWellFormed: boolean;
  /** Dijelovi koji su pali strogi skener, s razlogom i offsetom (prazno kad je paket cist). */
  malformedParts: string[];
  secondPassNoOp: boolean;
  /**
   * Je li vrata integriteta odbila isporuku. applyFixers tada vraca ULAZNE bajtove uz prazan
   * changelog, pa bi bez ovog polja odbijen popravak izgledao kao uredan 'no-op': sve ostale
   * tvrdnje (outputReadable, secondPassNoOp, droppedEntryCount, passRegressionCount) prolaze
   * VAKUUMSKI nad neizmijenjenim originalom. Zato je integrityFailure tvrdi 'fail'.
   */
  integrityFailure: string | null;
  manualReviewRequired: boolean;
  manualReviewReasons: string[];
  error: string | null;
}

export interface RealCorpusReport {
  schemaVersion: 1;
  scope: { root: string; excludesSynthetic: true; contentStored: false; localDocumentCount?: number };
  manifest: RealCorpusManifestEntry[];
  results: RealCorpusResult[];
  summary: {
    documentCount: number;
    passCount: number;
    reviewCount: number;
    failCount: number;
    /** Koliko je dokumenata vrata integriteta odbila (mora biti 0; vidi RealCorpusResult). */
    integrityFailureCount: number;
    noOpCount: number;
    changedDocumentCount: number;
    manualReviewCount: number;
    passRegressionCount: number;
  };
}

function sidecarPath(root: string, fileName: string): string {
  return join(root, fileName.replace(/\.docx$/i, '.json'));
}

export function discoverRealCorpus(root = REAL_CORPUS_ROOT): RealCorpusManifestEntry[] {
  let files: string[];
  try {
    files = readdirSync(root);
  } catch {
    return []; // direktorij ne postoji (npr. lokalni korpus na tudjem stroju)
  }
  return files
    .filter((fileName) => /\.docx$/i.test(fileName))
    .sort()
    .flatMap((fileName) => {
      const sidecar = sidecarPath(root, fileName);
      let metadata: { profileId?: unknown; synthetic?: unknown } = {};
      try {
        metadata = JSON.parse(readFileSync(sidecar, 'utf8')) as typeof metadata;
      } catch {
        return [];
      }
      if (metadata.synthetic === true || typeof metadata.profileId !== 'string' || !metadata.profileId) return [];
      return [{ documentId: fileName.replace(/\.docx$/i, ''), fileName, profileId: metadata.profileId, root }];
    });
}

function checkPassCount(checks: Array<{ status?: string }>): number {
  return checks.filter((check) => check.status === 'pass').length;
}

function scoreOf(result: { score?: unknown }): number | null {
  return typeof result.score === 'number' && Number.isFinite(result.score) ? result.score : null;
}

function textFingerprint(entries: Array<{ name: string; data: Uint8Array }>): string {
  const text = entries
    .filter((entry) => entry.name === 'word/document.xml' || entry.name === 'word/footnotes.xml')
    .map((entry) => new TextDecoder().decode(entry.data))
    .join('\n')
    .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function afterCheckForTitle(checks: Array<{ title?: string; status?: string }>, title: string) {
  return checks.find((check) => check.title === title);
}

function targetedTitles(items: Array<{ matchKeys?: string[] }>): string[] {
  return [...new Set(items.flatMap((item) => item.matchKeys ?? []))];
}

async function runOne(entry: RealCorpusManifestEntry, root: string, outputDir?: string): Promise<RealCorpusResult> {
  const base = {
    documentId: entry.documentId,
    fileName: entry.fileName,
    profileId: entry.profileId,
    outcome: 'fail' as const,
    before: { checkCount: 0, passCount: 0, score: null },
    after: null,
    beforeEntryCount: 0,
    afterEntryCount: 0,
    droppedEntryCount: 0,
    offeredFixerIds: [],
    changedFixerIds: [],
    targetedCheckCount: 0,
    targetedResolvedCount: 0,
    targetedUnresolvedCount: 0,
    passRegressionCount: 0,
    outputReadable: false,
    packageWellFormed: false,
    malformedParts: [] as string[],
    secondPassNoOp: false,
    integrityFailure: null as string | null,
    manualReviewRequired: false,
    manualReviewReasons: [] as string[],
    error: null as string | null,
  };

  try {
    const bytes = new Uint8Array(readFileSync(join(root, entry.fileName)));
    const beforeFile = new File([bytes], entry.fileName, { type: DOCX_MIME });
    const before = await analyzeFixture(beforeFile, { profileId: entry.profileId });
    const profile = resolveProfile(entry.profileId);
    // ISTI sastavljac koji koristi sucelje (src/ui/repair-item-assembly.ts). Prije je harness
    // zvao samo dva graditelja, pa je mjerio uzu povrsinu od one koju korisnik stvarno dobije:
    // sirenje korpusa s 12 na 50 stvarnih radova nije pomaklo pokrivenost s 4 fixera jer
    // numeriranje, sadrzaj, naslovnica, natpisi, bibliografija i sekcije nikad nisu ni ponudjeni.
    const items = buildAllRepairableItems({
      result: before,
      profile,
      entries: repairEntriesFor(entry.profileId),
      titleTemplate: null, // naslovnica trazi odabir predloska (UI korak), pa je izvan mjerenja
    });
    // Isti odabir kao UI checkbox (violated !== false): advisory preporuke su opt-in i NE ulaze
    // u zadani popravak. Bez ovoga je harness primjenjivao i preporuke pa je izvjestaj opisivao
    // tok koji nijedan korisnik ne izvodi (npr. pmf-matematika-uskladjen: 100/100 pa ipak margine).
    const requests: FixerRequest[] = buildDefaultRepairRequests(items);
    const beforeEntries = await readZip(bytes);
    const beforeText = textFingerprint(beforeEntries);
    const applied = await applyFixers(bytes, requests);
    const afterEntries = await readZip(applied.docxBytes);
    const afterNames = new Set(afterEntries.map((item) => item.name));
    const droppedEntryCount = beforeEntries.filter((item) => !afterNames.has(item.name)).length;
    const outputReadable = afterEntries.some((item) => item.name === 'word/document.xml' && item.data.length > 0);
    const malformedParts = inspectDocxParts(afterEntries)
      .filter((part) => !part.ok)
      .map((part) => `${part.part}: ${part.problem} (offset ${part.offset})`);
    const afterFile = new File([applied.docxBytes], `${entry.documentId}-repaired.docx`, { type: DOCX_MIME });
    const after = await analyzeFixture(afterFile, { profileId: entry.profileId });
    const afterText = textFingerprint(afterEntries);
    const titles = targetedTitles(items);
    const resolved = titles.filter((title) => afterCheckForTitle(after.checks ?? [], title)?.status === 'pass');
    const unresolved = titles.length - resolved.length;
    // Ista funkcija koju koristi produkcija (kljuca po stabilnom id-u, fallback naslov),
    // umjesto vlastite kopije logike koja je znala izracunati isto na svoj nacin.
    const regressions = detectPassRegressions(before.checks ?? [], after.checks ?? []).length;
    const second = await applyFixers(applied.docxBytes, requests);
    const secondPassNoOp = second.changelog.length === 0 && second.docxBytes === applied.docxBytes;
    const changed = applied.changelog.length > 0;
    const manualReviewReasons = [
      ...(changed ? ['vizualno-provjeriti-promjene-u-Wordu-ili-LibreOfficeu'] : []),
      ...(unresolved ? ['ciljani-check-nije-u-potpunosti-riješen'] : []),
      ...(items.some((item) => item.requiresConfirmation) ? ['postoji-asistirana-stavka-koja-traži-potvrdu'] : []),
    ];
    const integrityFailure = applied.integrityFailure
      ? `${applied.integrityFailure.part}: ${applied.integrityFailure.problem}`
      : null;
    // TEST VIDLJIVOG TEKSTA (CLAUDE.md): popravak ne smije promijeniti tekst koji korisnik vidi.
    // Cetiri mehanizma to SMIJU i to je namjerno, jer su format a ne argumentacija: velika slova
    // naslova, hrvatska tehnicka tipografija, kanonizacija DOI-ja i polje sadrzaja (tekst sadrzaja
    // GENERIRA Word iz polja, nije autorov). Bez izuzeca harness prijavljuje lazni pad.
    const changedFixerIds = [...new Set(applied.changelog.map((change) => change.fixerId))];
    const TEXT_CHANGING_BY_DESIGN = new Set(['heading-case-fixer', 'croatian-typography-fixer', 'link-doi-fixer', 'bibliography-repair-fixer', 'toc-field-fixer']);
    const textChangeAllowed = changedFixerIds.some((id) => TEXT_CHANGING_BY_DESIGN.has(id));
    const unexpectedTextChange = beforeText !== afterText && !textChangeAllowed;
    const finalResult: RealCorpusResult = {
      ...base,
      outcome: integrityFailure || regressions || !outputReadable || malformedParts.length > 0 || droppedEntryCount > 0 || !secondPassNoOp || unexpectedTextChange ? 'fail' : unresolved ? 'review' : changed ? 'review' : 'no-op',
      before: { checkCount: before.checks?.length ?? 0, passCount: checkPassCount(before.checks ?? []), score: scoreOf(before) },
      after: { checkCount: after.checks?.length ?? 0, passCount: checkPassCount(after.checks ?? []), score: scoreOf(after) },
      beforeEntryCount: beforeEntries.length,
      afterEntryCount: afterEntries.length,
      droppedEntryCount,
      offeredFixerIds: [...new Set(items.map((item) => item.fixerId))],
      changedFixerIds,
      targetedCheckCount: titles.length,
      targetedResolvedCount: resolved.length,
      targetedUnresolvedCount: unresolved,
      passRegressionCount: regressions,
      outputReadable,
      packageWellFormed: malformedParts.length === 0,
      malformedParts,
      secondPassNoOp,
      integrityFailure,
      manualReviewRequired: manualReviewReasons.length > 0,
      manualReviewReasons,
      error: null,
    };
    if (outputDir && finalResult.manualReviewRequired && changed) {
      writeFileSync(join(outputDir, `${entry.documentId}__repaired.docx`), applied.docxBytes);
    }
    return finalResult;
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Putanja relativna korijenu repozitorija, s kosim crtama, za SERIJALIZIRANI izvjestaj.
 *
 * `manifest[].root` je apsolutan jer se iz njega stvarno cita s diska. Kad je takav zavrsio u
 * commitanom `docs/generated/repair-real-corpus.json`, artefakt je postao vezan uz JEDAN stroj:
 * lokalno je pisalo `C:\Users\...`, a CI racunao `/home/runner/...`, pa `toEqual` nije mogao
 * proci nigdje osim ondje gdje je generiran. Test je zato bio zelen lokalno i crven u CI-ju bez
 * ijedne stvarne razlike u ponasanju popravka.
 */
function repoRelative(absolute: string): string {
  return relative(join(HERE, '..', '..'), absolute).split(sep).join('/');
}

export async function runRealCorpus(
  root = REAL_CORPUS_ROOT,
  options: { outputDir?: string; includeLocal?: boolean } = {},
): Promise<RealCorpusReport> {
  // Lokalni korpus se DODAJE commitanom, ne zamjenjuje ga: mjerenje mora obuhvatiti i anonimne
  // fixture koje CI vidi i stvarne radove koji nikad ne napustaju disk.
  await ensureRepairMapHeavy();
  const manifest = [
    ...discoverRealCorpus(root),
    ...(options.includeLocal ? discoverRealCorpus(LOCAL_CORPUS_ROOT) : []),
  ];
  if (options.outputDir) mkdirSync(options.outputDir, { recursive: true });
  const results = await Promise.all(manifest.map((entry) => runOne(entry, entry.root ?? root, options.outputDir)));
  const localCount = options.includeLocal ? discoverRealCorpus(LOCAL_CORPUS_ROOT).length : 0;
  return {
    schemaVersion: 1,
    scope: {
      root: localCount ? 'tests/fixtures/docx + tests/fixtures/docx-local' : 'tests/fixtures/docx',
      excludesSynthetic: true,
      contentStored: false,
      ...(localCount ? { localDocumentCount: localCount } : {}),
    },
    // Serijalizira se REPO-RELATIVNA putanja; apsolutna bi izvjestaj vezala uz jedan stroj.
    manifest: manifest.map((entry) => ({ ...entry, ...(entry.root ? { root: repoRelative(entry.root) } : {}) })),
    results,
    summary: {
      documentCount: results.length,
      passCount: results.filter((result) => result.outcome === 'pass').length,
      reviewCount: results.filter((result) => result.outcome === 'review').length,
      failCount: results.filter((result) => result.outcome === 'fail').length,
      integrityFailureCount: results.filter((result) => result.integrityFailure !== null).length,
      noOpCount: results.filter((result) => result.outcome === 'no-op').length,
      changedDocumentCount: results.filter((result) => result.changedFixerIds.length > 0).length,
      manualReviewCount: results.filter((result) => result.manualReviewRequired).length,
      passRegressionCount: results.reduce((total, result) => total + result.passRegressionCount, 0),
    },
  };
}
