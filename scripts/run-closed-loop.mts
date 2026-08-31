/**
 * CLI: closed-loop kroz CIJELI katalog profila (P4-3 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 *   npx vite-node scripts/run-closed-loop.mts [--limit 50]
 *   npm run closed-loop
 *
 * Zasto izvan `npm run check`: svaki profil su DVIJE stvarne analize plus popravak. Uzorak od 8
 * profila zivi u `tests/closed-loop-profiles.test.ts` i cuva ponasanje na svakoj promjeni; ovaj
 * pogon prolazi svih 410 i pise izvjestaj koji hrani `proof` os completion ledgera.
 *
 * Isti korisnicki tok kao test: dokument nastaje iz profilovih pravila, popravak se bira kao u
 * sucelju (`buildDefaultRepairRequests` + deep, koji je u panelu ukljucen po zadanom).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installXmlDomParser } from '../src/docx/xml-dom-install';

// Mora ici PRIJE uvoza analize: parser cita globalni DOMParser pri prvom pozivu.
installXmlDomParser(true);

const { analyzeFixture, resolveProfile } = await import('../src/analysis/golden-entry');
const { applyFixers } = await import('../src/repair/apply-fixers');
const { buildDefaultRepairRequests } = await import('../src/repair/default-selection');
const { buildAllRepairableItems } = await import('../src/ui/repair-item-assembly');
const { DEEP_CAPABLE } = await import('../src/ui/repair-panel');
const { detectPassRegressions } = await import('../src/analysis/repair-regression');
const { draftRuleEntriesFor, VERIFIED_PROFILES_WITH_DRAFTS } = await import('../src/profiles/drafts-runtime');
const { compileEffectiveRules } = await import('../src/profiles/rule-compiler');
const { normalizeCheckFlags } = await import('../src/profiles/profile-baseline');
const { applyScoredAdvisory } = await import('../src/profiles/advisory-demotion');
const { SOURCE_REGISTRY } = await import('../src/verification/verification-registry');
const { buildViolatingDocx, VIOLATABLE_CHECK_IDS } = await import('../tests/helpers/violating-docx');
const { APPLIED_AXIS_FIXER } = await import('../tests/helpers/coverage-cells');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/**
 * Strukturne osi su od 2026-08-30 UKLJUCENE po zadanom, odlukom vlasnika; `--no-structural`
 * reproducira staro mjerenje radi usporedbe.
 *
 * Zasto je odluka trebala: bez njih je closed-loop krsio samo sest profilnih osi, pa su profili
 * "prolazili" na osima koje nikad nisu bile izvrsene. Izmjereno na uzorku od 25 profila,
 * ukljucivanje daje 6 `pass` umjesto 24, i tih 18 pada na `toc-field` ili `heading-style`, dakle
 * na BODOVANE provjere koje su dotad bile nevidljive.
 *
 * Pad brojke `pass` zato NIJE regresija proizvoda nego prestanak vakuumskog zelenog.
 */
const useStructural = !process.argv.includes('--no-structural');
const limitFlag = process.argv.indexOf('--limit');
const limit = limitFlag > -1 ? Number(process.argv[limitFlag + 1]) : Infinity;

/**
 * Profil onako kako ga vidi ZIVI app: `effectiveRules` (Option A overlay), ne naslijedjeni
 * `rules` mirror.
 *
 * `golden-entry.resolveProfile` namjerno klonira `entry.rules` (golden harness mjeri sirovi
 * engine). Za closed-loop to je pogresna osnovica: popravak cita `ruleEntry`, pa bi analiza protiv
 * mirrora mjerila DRUGU vrijednost od one koju popravak postavlja. Izmjereno na
 * `vuka-strojarski-diplomski`: mirror kaze margine 2/2/2/2,5, zapis i `effectiveRules` kazu
 * 3/3/3/3 - petlja je bez ovog overlaya prijavljivala lazno proturjecje izmedju popravka i ocjene.
 */
function liveProfile(profileId: string): Record<string, unknown> {
  const withDrafts = (VERIFIED_PROFILES_WITH_DRAFTS as Array<{ id: string }>).find((p) => p.id === profileId);
  const base = resolveProfile(profileId) as Record<string, unknown>;
  if (!withDrafts) return base;
  // Normalizacija MORA ici nakon overlaya: `applyEntry` upisuje sirovu vrijednost zapisa
  // (npr. `size: 12`), a analizator ocekuje oblik iz `rules` (`size: [12]`). Zivi app radi isto -
  // `currentProfile` normalizira nakon sto procita effectiveRules. Bez toga 144 profila puca na
  // `profile.size.some is not a function` (izmjereno).
  const merged = { ...base, ...compileEffectiveRules(withDrafts as never) } as Record<string, unknown>;
  normalizeCheckFlags(merged);
  /**
   * Scored/advisory demotion je PRODUKTNA politika: zivi engine boduje samo verificirani scored
   * skup, a ostale dimenzije prikazuje informativno (max 0). Golden je namjerno ne primjenjuje jer
   * mjeri sirovi engine, ali closed-loop mora mjeriti PROIZVOD - inace prijavi kao neuspjeh
   * popravka ono sto fakultet uopce ne propisuje nego savjetuje (izmjereno: 29 profila je na osi
   * `paper-size` ispadalo `partial`, a rijec je o `advisory` zapisu bez fixera).
   */
  applyScoredAdvisory(
    merged as never,
    withDrafts as never,
    draftRuleEntriesFor(profileId),
    SOURCE_REGISTRY as never,
  );
  return merged;
}


/**
 * Prekrsena OS -> stabilan checkId koji tu os mjeri.
 *
 * Ovo je ispravak greske u prvom mjerenju: `resolved` je brojao NASLOVE provjera, a `violated`
 * OSI - razlicite jedinice, pa je omjer "rijeseno/prekrseno" bio neusporediv i `pass` je znacio
 * samo "barem nesto se promijenilo". Sada se za svaku prekrsenu os gleda BAS njezina provjera.
 */
/**
 * Sest osi koje propisuje PROFIL. Strukturne se krse na svakom dokumentu bez obzira na profil, pa
 * se u presudu o profilu ne smiju mijesati.
 */
const PROFILE_AXES: ReadonlySet<string> = new Set<string>(VIOLATABLE_CHECK_IDS);

const AXIS_CHECK_ID: Record<string, string> = {
  font: 'format.font.dominant',
  'font-size': 'format.size.body',
  'line-spacing': 'format.spacing.body',
  justify: 'format.justify.body',
  margins: 'page.margins',
  // Strukturne osi (samo uz `--structural`). Ovdje smiju stajati ISKLJUCIVO osi cija je provjera
  // BODOVANA; obrazlozenje je u `STRUCTURAL_WITHOUT_SCORED_CHECK` nize.
  'toc-field': 'toc.present',
  'heading-style': 'structure.heading.word-styles',
};

/**
 * Strukturne osi koje NEMAJU bodovanu provjeru, pa ne smiju proizvoditi dokaz `resolved`.
 *
 * IZMJERENO 2026-08-30 na fpzg-politologija-diplomski:
 *
 *   toc-field            toc.present                     max 5   BODOVANA
 *   heading-style        structure.heading.word-styles   max 4   BODOVANA
 *   empty-paragraphs     element.empty-paragraphs        max 0   informativna
 *   croatian-typography  format.typography.consistency   max 0   informativna
 *   link-doi             nema provjere                     -     nema
 *
 * Zasto je to zamka a ne sitnica: `axisResolved` vraca `true` cim je `max === 0` (nebodovana
 * provjera ne moze kaznjavati). Da su te tri osi naivno ozicene, svaka bi se na SVAKOM profilu
 * odmah javila kao rijesena i matrica bi dobila 407 x 3 = 1221 celiju laznog dokaza. To je isti
 * razred kao "vakuumsko zeleno" iz hijerarhije naslova.
 *
 * Te osi i dalje vrijede u generatoru i u vlastitim testovima; samo ne mogu nositi `resolved`.
 * Za njih je predvidjena slabija jacina dokaza (`applied`, vidi `tests/helpers/coverage-cells.ts`),
 * koja jos nije ozicena.
 */
/**
 * Mjerljiv signal osi: koliko je njezinih nalaza jos u dokumentu.
 *
 * Sluzi da `applied` bude MJEREN, a ne samoiskaz fixera. Changelog dokazuje samo "neki fixer s tim
 * id-em vratio je `applied: true`", a `apply-fixers` taj zapis gura na temelju zastavice, bez
 * usporedbe bajtova. Najjasniji protuprimjer je `final-document-inspector-fixer`, koji `changed`
 * postavlja iz sest neovisnih grana (revizije, `updateFields`, rsid-ovi, customXml, metapodaci),
 * pa bi os `revision-metadata` mogla dobiti dokaz uz NULA uklonjenih rsid-ova.
 *
 * `undefined` znaci da analiza za tu os ne nudi brojku. Takva os ostaje na slabijem, changelog
 * pravilu i to se ovdje IMENUJE umjesto da se presuti.
 */
const AXIS_SIGNAL: Record<string, ((result: AnalysisLike) => number) | undefined> = {
  'empty-paragraphs': (r) => Number(r?.details?.measurements?.structure?.emptyParagraphs ?? 0),
  'croatian-typography': (r) => Number(r?.details?.typographyStructure?.summary?.total ?? 0),
  /**
   * Broji PREOSTALI POSAO, ne broj nalaza.
   *
   * IZMJERENO 2026-08-31: popravak ne uklanja nalaz nego mu mijenja stanje
   * (`status: plain-text -> hyperlink-ok`, `safeOperations: 1 -> 0`), pa je ukupan broj nalaza
   * NEPROMIJENJEN i os bi lazno ispala neprimijenjena. Signal je zato broj nalaza koji jos imaju
   * sto popraviti.
   */
  'link-doi': (r) => (r?.details?.linkDoiStructure?.occurrences ?? []).filter((o) => (o?.safeOperations ?? []).length > 0).length,
  'required-section': (r) => (r?.details?.requiredSectionsStructure?.candidates ?? []).filter((c) => !c.present).length,
  // `revision-metadata` nema brojku rsid-ova u analizi; ostaje na changelog pravilu.
  'revision-metadata': undefined,
};

type AnalysisLike = {
  details?: {
    measurements?: { structure?: { emptyParagraphs?: unknown } };
    typographyStructure?: { summary?: { total?: unknown } };
    linkDoiStructure?: { occurrences?: Array<{ safeOperations?: unknown[] }> };
    requiredSectionsStructure?: { candidates?: Array<{ present?: boolean }> };
  };
};

/**
 * `required-section` je ovdje iz DRUGOG razloga nego ostale cetiri, i to treba znati.
 *
 * Ostale nemaju bodovanu provjeru. `required-section` je IMA (`structure.sections.profile`, max 7),
 * ali ju popravak ne moze zatvoriti, pa bi kao bodovana os trajno davala `partial`.
 *
 * IZMJERENO 2026-08-30 na fpzg-politologija-diplomski:
 *   prije popravka   2/7   nedostaje 5 dijelova
 *   poslije          4/7   nedostaju 3 (izjava o autorstvu, zakljucak, literatura)
 *
 * Uzrok nije fixer nego RASKORAK izmedju provjere i kandidata: provjera boduje pet obveznih
 * dijelova, a `requiredSectionsStructure` ih kao kandidate za umetanje nudi samo dva
 * (`abstract`, `keywords-en`). Preostala tri popravak nikad ne vidi, pa je 4/7 strop.
 *
 * Dok taj raskorak stoji, os nosi jacinu `applied` (fixer dokazano mijenja dokument), ne
 * `resolved`. Kad se kandidati prosire na svih pet, os se vraca u `AXIS_CHECK_ID`.
 */
const STRUCTURAL_WITHOUT_SCORED_CHECK = new Set([
  'empty-paragraphs',
  'croatian-typography',
  'link-doi',
  'revision-metadata',
  'required-section',
  // `element-caption` opisuje STANJE dokumenta (tablica s rucno prepisanim natpisom), a dokaz
  // za nju dolazi iz prolaza PREPORUKA, ne iz bodovane provjere. Da ostane u presudi, svaki bi
  // profil trajno bio `partial`, sto je konstantan pomak a ne mjerenje.
  'element-caption',
  // `field-integrity-fixer` upisuje `w:dirty="true"`, uputu Wordu da polje osvjezi pri
  // otvaranju. Nijedna bodovana provjera se time ne prevrne, jer polje i prije i poslije
  // postoji i ima status `ok`; dokaz je dakle `applied`, ne `resolved`.
  'field-integrity',
]);

/** Format stranice ima dinamican naslov (`page.size.*`), pa se prepoznaje po prefiksu. */
function checkForAxis(checks: Array<{ id?: string | null; title?: string }>, axis: string) {
  if (axis === 'paper-size') return checks.find((c) => typeof c.id === 'string' && c.id.startsWith('page.size'));
  const wanted = AXIS_CHECK_ID[axis];
  return wanted ? checks.find((c) => c.id === wanted) : undefined;
}

/** Provjera je rijesena kad vise ne kaznjava dokument (puni bodovi ili nije bodovana). */
function axisResolved(check: { earned?: number; max?: number } | undefined): boolean {
  if (!check) return false;
  return (check.max ?? 0) === 0 || (check.earned ?? 0) >= (check.max ?? 0);
}

type Outcome =
  /** Popravak je ponudjen i barem jedan nalaz je nestao. */
  | 'pass'
  /** Profil nema nijedno prekrsivo pravilo (nema sto dokazati). */
  | 'no-rules'
  /** Pravila postoje, ali nijedan popravak nije predodaban (npr. nista bodovano). */
  | 'no-repair'
  /** Popravak je izveden, ali nijedan nalaz nije nestao. */
  | 'unresolved'
  /** Dio prekrsenih osi je rijesen, dio nije. Nije dokaz pokrivenosti. */
  | 'partial'
  /** Popravak je oborio provjeru koja je prolazila, ili je promijenio tekst rada. */
  | 'regression'
  /** Fixer je bacio ili je paket ispao neispravan. */
  | 'error';

interface Row {
  profileId: string;
  outcome: Outcome;
  violated: string[];
  requested: number;
  /** Osi koje su nakon popravka prestale kaznjavati dokument. */
  axesResolved: string[];
  /**
   * Fixeri koji su TRAJNE preporuke (`recommended: true`, `violated: false`) i koji su u zasebnom
   * prolazu dokazano promijenili dokument bez pada integriteta.
   *
   * Zasto zaseban prolaz: `buildAllRepairableItems` preporuke uopce NE GRADI bez
   * `includeNonViolated`, a `buildDefaultRepairRequests` ih ne bi ni poslao, jer filtrira
   * `violated !== false`. Dva neovisna filtra znace da `element-caption-fixer` i
   * `table-figure-rescue-fixer` (kojima pravilo nema nijedan od 407 profila) u glavnom prolazu ne
   * mogu dobiti dokaz, koliko god dokument bio prikladan.
   *
   * Ovo NIJE isto pitanje kao glavni prolaz. Glavni pita "sto se dogodi kad korisnik klikne
   * Popravi"; ovaj pita "ako korisnik OZNACI preporuku, radi li ona". Zato ne ulazi u presudu.
   */
  recommendationsApplied: string[];
  /**
   * Osi koje propisuje PROFIL, a generator ih je prekrsio. Prazno znaci da tom profilu nijedan
   * objavljen izvor ne propisuje nijednu od sest formatnih osi.
   */
  profileAxesViolated: string[];
  /** Osi koje je popravak dirao, ali im nijedna bodovana provjera ne moze potvrditi rjesenje. */
  axesApplied: string[];
  /** Osi koje su i dalje prekrsene nakon popravka. */
  axesRemaining: string[];
  resolved: number;
  regressions: number;
  textPreserved: boolean;
  note?: string;
}

async function runProfile(profileId: string): Promise<Row> {
  const base: Row = { profileId, outcome: 'error', violated: [], requested: 0, axesResolved: [], recommendationsApplied: [], profileAxesViolated: [], axesApplied: [], axesRemaining: [], resolved: 0, regressions: 0, textPreserved: true };
  try {
    const profile = liveProfile(profileId);
    const { bytes, violated } = await buildViolatingDocx(profile, useStructural ? { structural: true } : {});
    if (!violated.length) return { ...base, outcome: 'no-rules' };

    const before = await analyzeFixture(new File([bytes], `${profileId}.docx`, { type: DOCX_MIME }), { profileId, profile });
    /**
     * ISTI sklop koji koristi sucelje, ne samo profilna grana.
     *
     * `buildRepairableItems` gradi SAMO stavke izvedene iz pravila profila; univerzalne
     * (`toc-field`, `heading-style`, `empty-paragraph`, `croatian-typography`, `link-doi`,
     * `required-section`...) dolaze iz `buildAllRepairableItems`, koji zove i sucelje.
     *
     * IZMJERENO 2026-08-30: dok je stajao uzi sklop, closed-loop je za
     * `fpzg-politologija-diplomski` slao 5 zahtjeva, a `toc-field` i `heading-style` su ostajali
     * NERIJESENI na 322 od 322 profila, jer im fixer nikad nije ni bio ponudjen. S punim sklopom
     * isti profil salje 10 zahtjeva i provjera `structure.heading.word-styles` ide 2/4 -> 4/4.
     *
     * Isti razred kao napomena uz `buildDefaultRepairRequests`: harness koji ne ide kroz produkcijski
     * sklop mjeri tok koji nitko ne izvodi.
     */
    const items = buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(profileId) });
    const requests = buildDefaultRepairRequests(items as never).map((request) =>
      DEEP_CAPABLE.has(request.fixerId) ? { ...request, params: { ...request.params, deep: true } } : request,
    );
    if (!requests.length) return { ...base, outcome: 'no-repair', violated };

    const applied = await applyFixers(bytes, requests);

    /**
     * DRUGI PROLAZ: preporuke, svaka zasebno i nad IZVORNIM bajtovima.
     *
     * Zasebno, jer preporuke nisu skup koji korisnik nuzno oznaci zajedno, pa bi ih zajednicki
     * prolaz medjusobno maskirao. Nad izvornim bajtovima, jer ovo mjeri sto preporuka radi sama,
     * a ne sto radi nakon glavnog popravka.
     */
    const recommended = buildAllRepairableItems({
      result: before,
      profile,
      entries: draftRuleEntriesFor(profileId),
      includeNonViolated: true,
    } as never).filter((item: { recommended?: boolean }) => item.recommended === true);
    const recommendationsApplied: string[] = [];
    for (const item of recommended as Array<{ fixerId: string; ruleId: string; params?: unknown }>) {
      try {
        const out = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }] as never);
        if (out.changelog.length > 0 && !out.integrityFailure) recommendationsApplied.push(item.fixerId);
      } catch {
        // Preporuka koja baci ne smije oboriti mjerenje glavnog prolaza; izostanak je sam po sebi nalaz.
      }
    }
    if (applied.integrityFailure) {
      return { ...base, outcome: 'error', violated, requested: requests.length, note: 'integrityFailure' };
    }

    const after = await analyzeFixture(
      new File([applied.docxBytes], `${profileId}-fixed.docx`, { type: DOCX_MIME }),
      { profileId, profile },
    );

    const afterChecks = (after.checks ?? []) as Array<{ id?: string | null; title?: string; earned?: number; max?: number }>;
    // Os bez bodovane provjere ne moze biti `resolved`: `axisResolved` bi ju zbog `max === 0`
    // proglasio rijesenom bez ijednog dokaza.
    const axesResolved = violated.filter(
      (axis) => !STRUCTURAL_WITHOUT_SCORED_CHECK.has(axis) && axisResolved(checkForAxis(afterChecks, axis)),
    );
    /**
     * Osi bez bodovane provjere IZLAZE iz presude, ne samo iz `axesResolved`.
     *
     * IZMJERENO 2026-08-30 na istih 25 profila: dok su sjedile u `axesRemaining`, svaki je profil
     * postajao `partial` (24 `pass` -> 0 `pass`, 24 `partial`). To nije mjerenje nego konstantan
     * pomak: os koju nijedna provjera ne moze proglasiti rijesenom trajno obara presudu, pa razlika
     * medju profilima nestaje.
     *
     * Prijavljuju se odvojeno, kao `axesApplied`: fixer je dokumentu nesto napravio, ali artefakt
     * ne moze tvrditi da se ijedna provjera zbog toga prevrnula. To je tocno jacina `applied` iz
     * `tests/helpers/coverage-cells.ts`.
     */
    /**
     * `applied` se IZVODI iz changeloga, ne iz namjere.
     *
     * Do 2026-08-30 je ovdje stajalo `violated.filter((axis) => STRUCTURAL_WITHOUT_SCORED_CHECK
     * .has(axis))`, dakle os je dobivala dokaz `applied` samo zato sto je PREKRSENA i sto nema
     * bodovanu provjeru. Komentar je tvrdio "fixer je dokumentu nesto napravio", a kod to nikad
     * nije provjerio: 3 osi x 407 profila = 1.221 celija dokaza koji nitko nije zaradio.
     *
     * Da tvrdnja nije bezopasna, izmjereno je u istoj sesiji: `empty-paragraph-fixer` je na 116
     * stvarnih dokumenata bio ponudjen a nijednom nista nije promijenio, `link-doi-fixer` je
     * vracao `unsupported-structure` na svakom runu s `<w:rPr>`, a `croatian-typography` zna pasti
     * na `stale-anchor`. Sve tri bi pod starim izrazom svejedno prijavile `applied`.
     *
     * Isti razred kao "vakuumsko zeleno": dokaz koji se ne moze ne dogoditi nije dokaz.
     */
    const changedFixerIds = new Set(applied.changelog.map((entry) => entry.fixerId));
    const axesApplied = violated.filter((axis) => {
      if (!STRUCTURAL_WITHOUT_SCORED_CHECK.has(axis)) return false;
      if (!changedFixerIds.has(APPLIED_AXIS_FIXER[axis])) return false;
      const signal = AXIS_SIGNAL[axis];
      if (!signal) return true;
      // Dokaz trazi da je signal te osi doista PAO; jednak broj znaci da se nista nije rijesilo.
      return signal(after as AnalysisLike) < signal(before as AnalysisLike);
    });
    const axesRemaining = violated.filter(
      (axis) => !axesResolved.includes(axis) && !STRUCTURAL_WITHOUT_SCORED_CHECK.has(axis),
    );
    const profileAxesViolated = violated.filter((axis) => PROFILE_AXES.has(axis));
    const regressions = detectPassRegressions(before.checks ?? [], after.checks ?? []).length;

    const row: Row = {
      profileId,
      outcome: 'pass',
      violated,
      requested: requests.length,
      axesResolved,
      axesRemaining,
      axesApplied,
      recommendationsApplied: [...new Set(recommendationsApplied)].sort(),
      profileAxesViolated,
      resolved: axesResolved.length,
      regressions,
      textPreserved: true,
    };
    if (regressions > 0) return { ...row, outcome: 'regression' };
    /**
     * `no-rules` se sudi po PROFILNIM osima, ne po svima.
     *
     * Do 2026-08-30 je uvjet glasio `!violated.length`, sto je uz strukturne osi postalo
     * neispunjivo: one se krse na svakom dokumentu. Time je 35 profila kojima NIJEDAN objavljen
     * izvor ne propisuje nijednu od sest formatnih osi (`data/profiles/no-rules-reasons.json`,
     * stanje `source-not-found`) tiho preslo u `pass`.
     *
     * Profil koji "prolazi" zato sto mu je popravljena univerzalna higijena NIJE profil kojem je
     * oblikovanje dokazano. Te dvije stvari u istoj brojci daju vakuumsko zeleno.
     *
     * Dokaz se NE gubi: `axesResolved` i `axesApplied` su vec izracunati, pa matrica pokrivenosti i
     * dalje vidi sve sto je popravak napravio.
     */
    if (!profileAxesViolated.length) return { ...row, outcome: 'no-rules' };
    if (!axesResolved.length) return { ...row, outcome: 'unresolved' };
    // `partial` je vlastiti ishod, ne `pass`: profil kojem je od sest osi rijesena jedna NIJE
    // dokazan. Prvo mjerenje ih je spajalo i time precijenilo pokrivenost.
    if (axesRemaining.length) return { ...row, outcome: 'partial' };
    return row;
  } catch (error) {
    return { ...base, note: error instanceof Error ? error.message.slice(0, 120) : String(error) };
  }
}

const profileIds = (VERIFIED_PROFILES_WITH_DRAFTS as Array<{ id: string }>).map((p) => p.id).slice(0, limit);

const rows: Row[] = [];
for (const [index, profileId] of profileIds.entries()) {
  rows.push(await runProfile(profileId));
  if ((index + 1) % 50 === 0) console.log(`  ... ${index + 1}/${profileIds.length}`);
}
rows.sort((a, b) => a.profileId.localeCompare(b.profileId));

const byOutcome = rows.reduce<Record<string, number>>((acc, row) => {
  acc[row.outcome] = (acc[row.outcome] ?? 0) + 1;
  return acc;
}, {});

const report = {
  schemaVersion: 1,
  profileCount: rows.length,
  byOutcome,
  rows,
};

mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
writeFileSync(join(root, 'docs', 'generated', 'closed-loop.json'), JSON.stringify(report, null, 2) + '\n');

console.log('=== Closed-loop kroz katalog ===');
console.log(`profila: ${rows.length}`);
for (const [outcome, n] of Object.entries(byOutcome).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${outcome}`);
}
const bad = rows.filter((r) => r.outcome === 'regression' || r.outcome === 'error');
if (bad.length) {
  console.log('');
  console.log(`PROBLEMI (${bad.length}):`);
  for (const row of bad.slice(0, 20)) console.log(`  ${row.profileId}: ${row.outcome}${row.note ? ` (${row.note})` : ''}`);
  if (bad.length > 20) console.log(`  ... jos ${bad.length - 20}`);
}
console.log('');
console.log('zapisano: docs/generated/closed-loop.json');
