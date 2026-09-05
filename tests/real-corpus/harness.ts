import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFixture, resolveProfile } from '../../src/analysis/golden-entry';
import { installXmlDomParser } from '../../src/docx/xml-dom-install';
import { repairEntriesFor, ensureRepairMapHeavy } from '../../src/profiles/profile-runtime-maps';
import { applyFixers, type FixerRequest } from '../../src/repair/apply-fixers';
import { detectPassRegressions, dropStaleFieldRegressions } from '../../src/analysis/repair-regression';
import { buildDefaultRepairRequests, defaultSelectedItems } from '../../src/repair/default-selection';
import { summarizeRepairOutcome } from '../../src/repair/repair-outcome';
import { inspectDocxParts } from '../../src/repair/package-integrity';
import { readZip } from '../../src/repair/zip-codec';
import { buildAllRepairableItems } from '../../src/ui/repair-item-assembly';
import { sidecarAdmitted, type CorpusSidecar } from './corpus-track';

export { sidecarAdmitted, ADMITTED_TRACKS, type CorpusTrack, type CorpusSidecar } from './corpus-track';

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

/**
 * Korpus IZVAN stabla (`LEKTA_CORPUS_SOURCE`).
 *
 * Gitignoriran direktorij unutar stabla je jedan `git add -f` daleko od objave, a izmjereno je da
 * je bar jedna datoteka lokalnog korpusa (`_mapping.json`) vec nosila prezimena u citljivom obliku.
 * Zato pseudonimizirani radovi iz `scripts/corpus-ingest.mts` zive izvan repozitorija, a ovdje se
 * samo CITAJU. Kad varijabla nije postavljena, sve radi kao i prije.
 */
export const EXTERNAL_CORPUS_ROOT = process.env.LEKTA_CORPUS_SOURCE
  ? resolve(process.env.LEKTA_CORPUS_SOURCE)
  : null;

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
  /**
   * SVE provjere kojima se status promijenio, u obliku `id:prije->poslije`.
   *
   * ZASTO OPCENITO, a ne samo regresije. `passRegressionChecks` (dodano ranije) imenuje sto je
   * ispalo iz `pass`, ali ne kaze koliki je NAZIVNIK: koliko je dokumenata tu provjeru uopce imalo
   * bodovanu i koliko ih je zadrzalo. Bez toga se stopa racuna nad krivom populacijom. Izmjereno:
   * `structure.heading.hierarchy` regresira na 4 dokumenta, ali je izlozenih 25, a ne 43
   * promijenjena, jer je za 16 profila ta provjera `informational` (max 0) pa ne moze ni pasti.
   *
   * Biljezi se SAMO promjena, ne cijelo stanje: nepromijenjene provjere su vecina i samo bi
   * napuhale artefakt.
   */
  statusChanges: string[];
  after: { checkCount: number; passCount: number; score: number | null } | null;
  beforeEntryCount: number;
  afterEntryCount: number;
  droppedEntryCount: number;
  offeredFixerIds: string[];
  changedFixerIds: string[];
  /**
   * Ciljane provjere: one koje su PRIJE popravka stvarno padale (`max > 0 && earned < max`) i
   * meta su ZATRAZENOG fixera. Prije se brojalo `matchKeys` SVIH ponudjenih stavki, pa je
   * nazivnik sadrzavao i neprekrsene bodovane stavke (nose `matchKeys`, a `violated: false` ih
   * izbacuje iz zahtjeva) i naslove koje analiza nikad ne emitira. Takav "5 od 18" nije mjerio
   * popravak nego popis ponuda.
   */
  targetedCheckCount: number;
  targetedResolvedCount: number;
  targetedUnresolvedCount: number;
  /** Ciljano automatskim fixerom (bez potvrde) i dalje pada: stvarni jaz motora. */
  autoUnresolvedCount: number;
  /**
   * IMENA tih provjera, ne samo broj. Brojka skriva identitet: popis blokatora citatnih dosjea
   * ostao je 2026-08-31 na 1 dok je jedan otisao a drugi dosao, i samo ga je imenovan popis
   * uhvatio (CLAUDE.md, "provjeri IDENTITET, ne zbroj"). Iza broja 5 ovdje se krilo pet
   * neimenovanih kvarova popravka na stvarnim radovima.
   */
  autoUnresolvedChecks: string[];
  /**
   * Ciljano asistiranom stavkom (u sucelju trazi potvrdu) i dalje pada. Harness ju je PRIMIJENIO,
   * pa je ovo stvaran jaz asistiranog fixera, ne "alat ceka korisnika".
   */
  assistedUnresolvedCount: number;
  /** IMENA asistiranih provjera koje su i nakon primjene ostale crvene. */
  assistedUnresolvedChecks: string[];
  /**
   * Ciljano stavkom koja trazi potvrdu, ali joj je zadani odabir prazan, pa fixer NIJE imao sto
   * primijeniti. Odvojeno od `assistedUnresolvedCount`, jer to nije jaz motora nego cekanje
   * ljudskog odabira. Do 2026-08-29 je ulazilo u isti broj i napuhavalo ga.
   */
  awaitingConfirmationCount: number;
  /** Padalo prije popravka, a nijedna stavka ga ne cilja: izvan granice automatskog popravka. */
  manualOnlyCount: number;
  /**
   * `matchKeys` naslovi koje `stableCheckId` ne prepoznaje. Takav naslov analiza ne emitira, pa
   * je po starom racunu bio TRAJNO "nerazrijesen" i tiho je obarao postotak. Imenuje se umjesto
   * da se broji (isti obrazac kao dva mrtva pravila u `check-fixer-map`).
   */
  unmappedMatchKeys: string[];
  passRegressionCount: number;
  /**
   * IMENA regresiranih provjera, ne samo broj. `detectPassRegressions` vraca listu s identitetom, a
   * harness je do 2026-09-03 odmah radio `.length` i imena bacao. Posljedica je izmjerena: artefakt
   * kaze da su DVIJE provjere regresirale, a koje, ne zna nitko bez ponovnog prolaza kroz 54 stvarna
   * rada. Isti zapis vec imenuje `autoUnresolvedChecks` i `assistedUnresolvedChecks`; ovo samo
   * dosljedno primjenjuje pravilo "imenovano, ne prebrojano".
   */
  passRegressionChecks: string[];
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
  scope: {
    root: string;
    excludesSynthetic: true;
    contentStored: false;
    localDocumentCount?: number;
    /**
     * Zbroj CILJANIH provjera nad cijelim skupom, i izricita tvrdnja mjeri li ovaj izvjestaj uopce
     * ucinkovitost popravka.
     *
     * Zasto postoji, izmjereno 2026-09-03: commitani korpus (7 dopustenih fixtura nakon oznacavanja
     * devet sidecara kao `synthetic`) ima NULA ciljanih provjera. Njegove tvrdnje `failCount 0`,
     * `passRegressionCount 0` i `integrityFailureCount 0` su time VAKUUMSKI istinite: nema sto pasti.
     * Isti kod nad stvarnim radovima daje 94 ciljane provjere, 4 pada i 4 regresije.
     *
     * Posljedica nije akademska. Jedina mjera koju CI vrti po konstrukciji ne moze vidjeti regresiju
     * popravka, pa je ona danima stajala neprimijecena; nije je nitko propustio pogledati, nego
     * commitani gard nije sposoban je vidjeti. Zato izvjestaj to sada kaze o sebi, umjesto da
     * nula padova izgleda kao potvrda zdravlja.
     */
    targetedCheckCount: number;
    measuresRepairEffectiveness: boolean;
    detectsRepairRegression: boolean;
  };
  manifest: RealCorpusManifestEntry[];
  results: RealCorpusResult[];
  /**
   * Ishod nad dokumentima koje `sidecarAdmitted` iskljucuje. NIJEDAN potrosac tvrdnji ovo ne cita:
   * `buildCoverageCells` uzima iskljucivo `results`, pa lanac korpus -> matrica -> ledger -> tvrdnje
   * ostaje netaknut. Sluzi iskljucivo detekciji regresije popravka, koju je commitani korpus izgubio
   * kad je devet sidecara oznaceno sintetickima (39 ciljanih provjera -> 0).
   */
  syntheticResults: RealCorpusResult[];
  syntheticSummary: RealCorpusReport['summary'];
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
    /** Unija imena kroz cijeli korpus: KOJE provjere popravak igdje obara iz `pass`. */
    passRegressionChecks: string[];
    targetedCheckCount: number;
    targetedResolvedCount: number;
    autoUnresolvedCount: number;
    /** Unija imena kroz cijeli korpus, sortirana: koje provjere popravak NE rjesava nigdje. */
    autoUnresolvedChecks: string[];
    assistedUnresolvedCount: number;
    awaitingConfirmationCount: number;
    manualOnlyCount: number;
  };
}

function sidecarPath(root: string, fileName: string): string {
  return join(root, fileName.replace(/\.docx$/i, '.json'));
}

/**
 * Dokumenti koje `sidecarAdmitted` ISKLJUCUJE (`synthetic: true`), a koji imaju valjan sidecar.
 *
 * Zasto uopce postoje u mjerenju, izmjereno 2026-09-05: oznacavanje devet sidecara kao sintetickih
 * ucinilo je TVRDNJU postenom (`A` = dokazano na stvarnom radu), ali je istovremeno srusilo
 * DETEKCIJU REGRESIJE: commitani korpus je s 39 ciljanih provjera pao na 0, pa su mu `failCount 0` i
 * `passRegressionCount 0` postali vakuumski istiniti.
 *
 * To su dvije razlicite svrhe koje su dijelile jednu zastavicu. Sinteticki dokument NE MOZE
 * potkrijepiti tvrdnju o stvarnom radu, ali savrseno dobro otkriva da je popravak regresirao.
 *
 * Zato se ovdje otkrivaju odvojeno i njihov ishod ide u `syntheticResults`, sestrinski kljuc koji
 * NIJEDAN potrosac tvrdnji ne cita: `buildCoverageCells` uzima iskljucivo `results`, pa lanac
 * korpus -> matrica -> ledger -> tvrdnje ostaje netaknut. Granica je time sacuvana, a CI je vratio
 * ono sto je izgubio.
 */
export function discoverExcludedCorpus(root = REAL_CORPUS_ROOT): RealCorpusManifestEntry[] {
  let files: string[];
  try {
    files = readdirSync(root);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.toLowerCase().endsWith('.docx'))
    .sort()
    .flatMap((fileName) => {
      let metadata: CorpusSidecar = {};
      try {
        metadata = JSON.parse(readFileSync(sidecarPath(root, fileName), 'utf8')) as CorpusSidecar;
      } catch {
        return [];
      }
      if (sidecarAdmitted(metadata) || !metadata.profileId) return [];
      return [
        { documentId: fileName.replace(/\.docx$/i, ''), fileName, profileId: metadata.profileId as string, root },
      ];
    });
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
      let metadata: CorpusSidecar = {};
      try {
        metadata = JSON.parse(readFileSync(sidecar, 'utf8')) as CorpusSidecar;
      } catch {
        return [];
      }
      if (!sidecarAdmitted(metadata)) return [];
      return [
        { documentId: fileName.replace(/\.docx$/i, ''), fileName, profileId: metadata.profileId as string, root },
      ];
    });
}

/**
 * Provjere kojima se status promijenio, kao `id:prije->poslije`. Identitet je `id`, ne naslov:
 * naslov je hrvatski i prezentacijski, pa bi se usporedba lomila na svakoj promjeni copyja.
 */
function statusChangesOf(
  before: Array<{ id?: string; status?: string }>,
  after: Array<{ id?: string; status?: string }>,
): string[] {
  const prije = new Map(before.filter((c) => c.id).map((c) => [c.id as string, c.status ?? '?']));
  const out: string[] = [];
  for (const c of after) {
    if (!c.id) continue;
    const p = prije.get(c.id);
    if (p !== undefined && p !== (c.status ?? '?')) out.push(`${c.id}:${p}->${c.status ?? '?'}`);
  }
  return out.sort();
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
    autoUnresolvedCount: 0,
    autoUnresolvedChecks: [] as string[],
    assistedUnresolvedCount: 0,
    assistedUnresolvedChecks: [] as string[],
    awaitingConfirmationCount: 0,
    manualOnlyCount: 0,
    unmappedMatchKeys: [] as string[],
    passRegressionCount: 0,
    passRegressionChecks: [] as string[],
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
    // Isti odabir koji sucelje salje: `violated !== false` PLUS `deep` (u panelu ukljucen po
    // zadanom). Harness je dosad slao plitke zahtjeve, pa je mjerio slabiji popravak od onoga
    // koji korisnik dobije: izravno oblikovanje nadjacava stil i font/velicina/prored/poravnanje
    // tiho ne prime.
    const selected = defaultSelectedItems(items);
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
    // ISTI izracun koji koristi sucelje (src/repair/repair-outcome.ts), da se dva prikaza
    // istog ishoda ne mogu razici.
    const outcome = summarizeRepairOutcome({
      before: before.checks ?? [],
      after: after.checks ?? [],
      selected,
    });
    const unresolved = outcome.unresolved.length;

    // Ista funkcija koju koristi produkcija (kljuca po stabilnom id-u, fallback naslov),
    // umjesto vlastite kopije logike koja je znala izracunati isto na svoj nacin.
    // Ustajalo TOC polje nije steta: Word ga regenerira pri otvaranju (vidi dropStaleFieldRegressions).
    const regressionList = dropStaleFieldRegressions(
      detectPassRegressions(before.checks ?? [], after.checks ?? []),
      after,
    );
    const regressions = regressionList.length;
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
    /**
     * `required-section-fixer` je dodan 2026-08-30, uz odluku vlasnika.
     *
     * Umece ISKLJUCIVO naslov koji propisuje verificirano pravilo profila (`required-section-rules`
     * sa `sourceId`, `sourcePage` i doslovnim citatom), nikakav sadrzaj: izmjereno na
     * `local-36-diplomski` razlika je 25 znakova, i to naslov "kljucne rijeci / keywords". Rezervirani
     * tekst i komentar se umecu samo kad ih profil izricito trazi, i stavka uvijek trazi izricitu
     * korisnikovu potvrdu (`requiresConfirmation: true`).
     *
     * Granica ostaje ista: umece se natpis koji je fakultet sam propisao, nikad recenica rada.
     */
    const TEXT_CHANGING_BY_DESIGN = new Set(['heading-case-fixer', 'croatian-typography-fixer', 'link-doi-fixer', 'bibliography-repair-fixer', 'toc-field-fixer', 'required-section-fixer']);
    const textChangeAllowed = changedFixerIds.some((id) => TEXT_CHANGING_BY_DESIGN.has(id));
    const unexpectedTextChange = beforeText !== afterText && !textChangeAllowed;
    const finalResult: RealCorpusResult = {
      ...base,
      /**
       * `pass` je do sada bio NEDOSTIZAN: izraz je glasio `unresolved ? 'review' : changed ?
       * 'review' : 'no-op'`, pa je svaki promijenjen dokument zavrsavao na `review` i
       * `passCount` je uvijek bio 0. "Gotovo je kada svi prolaze" time nije imalo definiciju.
       *
       * Sada: `pass` znaci da je bilo sto mjeriti (barem jedna ciljana provjera je padala) i da
       * je sve ciljano razrijeseno, bez regresije i uz ispravan paket. Dokument koji se
       * promijenio a nije imao nijednu ciljanu provjeru ostaje `review`, jer je promjena
       * stvarna ali je nijedan bodovan check ne potvrdjuje.
       *
       * `manualReviewRequired` je ODVOJEN od ovoga: strojni `pass` ne ukida vizualni pregled u
       * Wordu ili LibreOfficeu (Tier 1.5/2), on je i dalje uvjet za razinu A u ledgeru.
       */
      outcome: integrityFailure || regressions || !outputReadable || malformedParts.length > 0 || droppedEntryCount > 0 || !secondPassNoOp || unexpectedTextChange
        ? 'fail'
        : unresolved > 0
          ? 'review'
          : outcome.targeted.length > 0
            ? 'pass'
            : changed
              ? 'review'
              : 'no-op',
      before: { checkCount: before.checks?.length ?? 0, passCount: checkPassCount(before.checks ?? []), score: scoreOf(before) },
      statusChanges: statusChangesOf(before.checks ?? [], after.checks ?? []),
      after: { checkCount: after.checks?.length ?? 0, passCount: checkPassCount(after.checks ?? []), score: scoreOf(after) },
      beforeEntryCount: beforeEntries.length,
      afterEntryCount: afterEntries.length,
      droppedEntryCount,
      offeredFixerIds: [...new Set(items.map((item) => item.fixerId))],
      changedFixerIds,
      targetedCheckCount: outcome.targeted.length,
      targetedResolvedCount: outcome.resolved.length,
      targetedUnresolvedCount: unresolved,
      autoUnresolvedCount: outcome.autoUnresolved.length,
      autoUnresolvedChecks: outcome.autoUnresolved,
      assistedUnresolvedCount: outcome.assistedUnresolved.length,
      assistedUnresolvedChecks: outcome.assistedUnresolved,
      awaitingConfirmationCount: outcome.awaitingConfirmation.length,
      manualOnlyCount: outcome.manualOnly.length,
      unmappedMatchKeys: outcome.unmappedMatchKeys,
      passRegressionCount: regressions,
      passRegressionChecks: regressionList.map((r) => r.id ?? r.title).sort(),
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

/** Sazetak nad BILO KOJIM skupom rezultata; dijele ga dopusteni i iskljuceni korpus. */
function summarizeResults(results: RealCorpusResult[]): RealCorpusReport['summary'] {
  return {
    documentCount: results.length,
    passCount: results.filter((result) => result.outcome === 'pass').length,
    reviewCount: results.filter((result) => result.outcome === 'review').length,
    failCount: results.filter((result) => result.outcome === 'fail').length,
    integrityFailureCount: results.filter((result) => result.integrityFailure !== null).length,
    noOpCount: results.filter((result) => result.outcome === 'no-op').length,
    changedDocumentCount: results.filter((result) => result.changedFixerIds.length > 0).length,
    manualReviewCount: results.filter((result) => result.manualReviewRequired).length,
    passRegressionCount: results.reduce((total, result) => total + result.passRegressionCount, 0),
    passRegressionChecks: [...new Set(results.flatMap((result) => result.passRegressionChecks))].sort(),
    targetedCheckCount: results.reduce((total, result) => total + result.targetedCheckCount, 0),
    targetedResolvedCount: results.reduce((total, result) => total + result.targetedResolvedCount, 0),
    autoUnresolvedCount: results.reduce((total, result) => total + result.autoUnresolvedCount, 0),
    autoUnresolvedChecks: [...new Set(results.flatMap((result) => result.autoUnresolvedChecks))].sort(),
    assistedUnresolvedCount: results.reduce((total, result) => total + result.assistedUnresolvedCount, 0),
    awaitingConfirmationCount: results.reduce((total, result) => total + result.awaitingConfirmationCount, 0),
    manualOnlyCount: results.reduce((total, result) => total + result.manualOnlyCount, 0),
  };
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
    ...(options.includeLocal && EXTERNAL_CORPUS_ROOT ? discoverRealCorpus(EXTERNAL_CORPUS_ROOT) : []),
  ];
  if (options.outputDir) mkdirSync(options.outputDir, { recursive: true });
  const results = await Promise.all(manifest.map((entry) => runOne(entry, entry.root ?? root, options.outputDir)));
  // Iskljuceni (sinteticki) idu ZASEBNO i bez `outputDir`: sluze detekciji regresije, ne dokazu.
  const excluded = [
    ...discoverExcludedCorpus(root),
    ...(options.includeLocal ? discoverExcludedCorpus(LOCAL_CORPUS_ROOT) : []),
  ];
  const syntheticResults = await Promise.all(excluded.map((entry) => runOne(entry, entry.root ?? root)));
  const localCount = options.includeLocal
    ? discoverRealCorpus(LOCAL_CORPUS_ROOT).length +
      (EXTERNAL_CORPUS_ROOT ? discoverRealCorpus(EXTERNAL_CORPUS_ROOT).length : 0)
    : 0;
  return {
    schemaVersion: 1,
    scope: {
      root: localCount ? 'tests/fixtures/docx + tests/fixtures/docx-local' : 'tests/fixtures/docx',
      excludesSynthetic: true,
      contentStored: false,
      ...(localCount ? { localDocumentCount: localCount } : {}),
      targetedCheckCount: results.reduce((total, result) => total + result.targetedCheckCount, 0),
      measuresRepairEffectiveness: results.some((result) => result.targetedCheckCount > 0),
      /**
       * Moze li ovaj izvjestaj UOPCE otkriti regresiju popravka, bez obzira na to smije li njome
       * potkrijepiti tvrdnju. Racuna se nad OBA skupa: sinteticki dokument ne dokazuje nista o
       * stvarnom radu, ali savrseno dobro pokazuje da je popravak prestao raditi.
       *
       * Do 2026-09-05 su te dvije stvari dijelile jednu zastavicu, pa je postenije oznacavanje
       * sidecara usput oslijepilo CI: 39 ciljanih provjera palo je na 0.
       */
      detectsRepairRegression:
        results.some((r) => r.targetedCheckCount > 0) || syntheticResults.some((r) => r.targetedCheckCount > 0),
    },
    // Serijalizira se REPO-RELATIVNA putanja; apsolutna bi izvjestaj vezala uz jedan stroj.
    manifest: manifest.map((entry) => ({ ...entry, ...(entry.root ? { root: repoRelative(entry.root) } : {}) })),
    results,
    summary: summarizeResults(results),
    syntheticResults,
    syntheticSummary: summarizeResults(syntheticResults),
  };
}
