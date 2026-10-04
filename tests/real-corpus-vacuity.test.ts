/**
 * Gard: izvjestaj o stvarnom korpusu mora reci kad NISTA ne mjeri.
 *
 * Zasto postoji, izmjereno 2026-09-03. `docs/generated/repair-real-corpus.json` je jedini korpusni
 * artefakt koji je commitan, reproducibilan i koji CI vrti. Nakon sto je devet sidecara oznaceno
 * `synthetic: true`, u njemu je ostalo 7 dopustenih fixtura s UKUPNO NULA ciljanih provjera:
 *
 *     commitani korpus     0 ciljanih provjera    0 padova   0 regresija
 *     stvarni radovi      94 ciljanih provjera    4 pada     4 regresije
 *
 * Tvrdnje `failCount === 0` i `passRegressionCount === 0` u `tests/real-corpus.test.ts` time postaju
 * VAKUUMSKI istinite: prolaze jer nema sto pasti. Posljedica nije akademska, nego objasnjava zasto
 * je regresija popravka danima stajala neprimijecena: commitani gard je po konstrukciji ne moze
 * vidjeti, a njegovo zeleno se cita kao potvrda zdravlja.
 *
 * Ovaj gard ne moze dodati stvarne radove u git (gitignorirani su namjerno i to je ispravno). Moze
 * uciniti prazninu GLASNOM umjesto tihom, i sprijeciti da netko ukloni tu oznaku ne primijetivsi
 * sto ona znaci.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import baked from '../docs/generated/repair-real-corpus.json';
import repairMap from '../data/profiles/repair-map.json';
import { buildDocx, type DocSpec, type ParaSpec } from './helpers/docx-builder';
import {
  REAL_CORPUS_ROOT,
  WITNESS_TRACK,
  discoverExcludedCorpus,
  discoverRealCorpus,
  discoverWitnessCorpus,
  runRealCorpus,
  witnessIsolationProblems,
  witnessUntargeted,
  type RealCorpusReport,
} from './real-corpus/harness';

type Scope = { targetedCheckCount: number; measuresRepairEffectiveness: boolean };
type Report = { scope: Scope; results: Array<{ targetedCheckCount: number }> };
const izvjestaj = baked as unknown as Report;

/**
 * Zateceno stanje 2026-09-03: NULA. Ratchet smije samo RASTI.
 *
 * Raste kad se u commitani korpus doda fixtura koju profil stvarno cilja. Ne smije pasti: pad znaci
 * da je pokrivenost izgubljena, a upravo je takav pad (16 -> 7 dopustenih) i doveo do ove praznine,
 * i to bez ijednog upozorenja.
 */
const CILJANIH_RATCHET = 0;

describe('commitani korpus: praznina mora biti glasna', () => {
  it('zbroj u `scope` se slaze sa zbrojem po dokumentima', () => {
    const zbroj = izvjestaj.results.reduce((n, r) => n + r.targetedCheckCount, 0);
    expect(izvjestaj.scope.targetedCheckCount).toBe(zbroj);
  });

  /** Oznaka i broj moraju govoriti isto; oznaka koja laze gora je od nikakve. */
  it('`measuresRepairEffectiveness` je istinito TOCNO kad ima ciljanih provjera', () => {
    expect(izvjestaj.scope.measuresRepairEffectiveness).toBe(izvjestaj.scope.targetedCheckCount > 0);
  });

  it('broj ciljanih provjera smije samo rasti', () => {
    expect(
      izvjestaj.scope.targetedCheckCount,
      'pokrivenost je pala: commitani korpus mjeri manje nego prije',
    ).toBeGreaterThanOrEqual(CILJANIH_RATCHET);
  });

  /**
   * Dok je artefakt prazan, njegovo zeleno se NE SMIJE citati kao zdravlje popravka. Ova tvrdnja
   * pada cim netko doda ciljanu pokrivenost, i to je namjerno: tada treba spustiti ratchet i
   * obrisati ovaj test, jer praznine vise nema.
   */
  it('dok je prazan, izvjestaj to izricito priznaje', () => {
    if (izvjestaj.scope.targetedCheckCount === 0) {
      expect(
        izvjestaj.scope.measuresRepairEffectiveness,
        'nula ciljanih provjera znaci da ovaj izvjestaj NE mjeri ucinkovitost popravka',
      ).toBe(false);
    } else {
      expect(izvjestaj.scope.measuresRepairEffectiveness).toBe(true);
    }
  });

  /** NEGATIVNA KONTROLA: detektor mora razlikovati prazan izvjestaj od punog. */
  it('detektor prepoznaje i neprazan izvjestaj', () => {
    const pun: Scope = { targetedCheckCount: 94, measuresRepairEffectiveness: true };
    expect(pun.measuresRepairEffectiveness).toBe(pun.targetedCheckCount > 0);
    const lazan: Scope = { targetedCheckCount: 0, measuresRepairEffectiveness: true };
    expect(lazan.measuresRepairEffectiveness === (lazan.targetedCheckCount > 0)).toBe(false);
  });
});

// ============================================================================================
// SVJEDOCI (T68): zaseban skup s vlastitim ratchetom
// ============================================================================================

/**
 * Zbroj ciljanih provjera nad SVJEDOCIMA u commitanom artefaktu. Smije samo RASTI.
 *
 * Zasto 0: svjedoke generira radna stanica s Wordom (`scripts/corpus-gen/word/make-violation-witnesses.ps1`),
 * a laptop koji je uveo skup Word dokument ne pise u commit. Ratchet se dize u ISTOM commitu u kojem
 * svjedoci i regenerirani `docs/generated/repair-real-corpus.json` ulaze u stablo.
 */
const WITNESS_CILJANIH_RATCHET = 0;

const izvjestajSvjedoka = baked as unknown as RealCorpusReport;

/**
 * POZNATI JAZ MJERENJA, imenovan umjesto prikriven. Izmjereno 2026-10-04 prvim Word-free svjedokom
 * (dolje): Letter umjesto A4 analiza vidi kao pad i `paper-size-fixer` ga popravlja (`statusChanges`
 * nosi `page.size.a4:warn->pass`), ali stavka formata papira nema `matchKeys`, jer `CHECK_TITLES` u
 * `src/analysis/check-fixer-map.ts` nema kljuc `paper-size` (naslov je dinamican). Zato je
 * `summarizeRepairOutcome` nikad ne broji kao ciljanu provjeru, ni ovdje ni u sucelju. Isto se vidi na
 * postojecim sintetickim fixturama (`lo-fpzg-zavrsni-neuskladjen`: format papira prelazi u `pass`, a
 * ciljane su samo cetiri druge osi). Ispravak je u kodu popravka i zaseban je zadatak; kad bude gotov,
 * ovaj popis se prazni i test dolje pada dok se to ne ucini.
 */
const POZNATI_NECILJANI_PREKRSAJI: readonly string[] = ['paper-size'];

/**
 * Invarijante skupa svjedoka, kao imenovani problemi. Isti izracun vrijedi za commitani artefakt i za
 * Word-free mjerenje dolje, pa test ne moze biti zelen nad jednim, a slijep nad drugim.
 */
function witnessProblems(report: RealCorpusReport): string[] {
  const out: string[] = [];
  const w = report.witnessResults;
  const s = report.witnessSummary;
  if (!Array.isArray(w) || !s) return ['izvjestaj nema witnessResults ili witnessSummary'];
  const zbroj = w.reduce((n, r) => n + r.targetedCheckCount, 0);
  if (s.targetedCheckCount !== zbroj) out.push(`witnessSummary.targetedCheckCount ${s.targetedCheckCount} != zbroj po dokumentu ${zbroj}`);
  if (s.documents !== w.length) out.push(`witnessSummary.documents ${s.documents} != ${w.length}`);
  if (s.secondPassNoOp !== s.documents) out.push(`drugi prolaz nije no-op na ${s.documents - s.secondPassNoOp} svjedoka`);
  if (s.regressions !== 0) out.push(`popravak je regresirao ${s.regressions} provjera na svjedocima`);
  const real = new Set([...report.results, ...report.syntheticResults].map((r) => r.documentId));
  const manifest = new Set(report.manifest.map((m) => m.documentId));
  for (const r of w) {
    if (real.has(r.documentId)) out.push(`${r.documentId}: svjedok je i u results ili syntheticResults`);
    if (manifest.has(r.documentId)) out.push(`${r.documentId}: svjedok je u manifestu realnog skupa`);
    if (r.error !== null) out.push(`${r.documentId}: ${r.error}`);
    if (r.outcome === 'fail') out.push(`${r.documentId}: ishod fail`);
    if (r.intendedChecks.length === 0) out.push(`${r.documentId}: sidecar ne imenuje nijedan namjerni prekrsaj`);
    const neocekivano = r.intendedUntargeted.filter((c) => !POZNATI_NECILJANI_PREKRSAJI.includes(c));
    if (neocekivano.length > 0) out.push(`${r.documentId}: namjerni prekrsaj bez cilja popravka: ${neocekivano.join(', ')}`);
    // Svaka ciljana provjera zavrsi `pass` ili izricito trazi korisnika; treceg ishoda nema.
    if (r.targetedResolvedCount + r.assistedUnresolvedCount + r.autoUnresolvedCount !== r.targetedCheckCount) {
      out.push(`${r.documentId}: ciljane provjere se ne razlazu na rijesene, asistirane i nerijesene`);
    }
    if (r.unexplainedUnresolved.length > 0) out.push(`${r.documentId}: ciljano automatski, i dalje pada bez razloga: ${r.unexplainedUnresolved.join(', ')}`);
    for (const n of r.needsAssistance) {
      if (!n.reason) out.push(`${r.documentId}: ${n.checkId} trazi korisnika bez razloga`);
    }
    const asistiranih = r.needsAssistance.filter((n) => n.reason === 'asistirana-stavka-trazi-rucnu-potvrdu').map((n) => n.checkId);
    if (asistiranih.join(',') !== r.assistedUnresolvedChecks.join(',')) out.push(`${r.documentId}: needsAssistance ne imenuje sve asistirane nerijesene provjere`);
  }
  return out;
}

describe('svjedoci (T68): commitani artefakt', () => {
  it('gard izolacije: svjedok ide samo u witness skup, kontrolne trake ostaju gdje su bile', () => {
    expect(witnessIsolationProblems()).toEqual([]);
  });

  it('witnessSummary postoji, zbroj se slaze i ne pada ispod ratcheta', () => {
    expect(izvjestajSvjedoka.witnessSummary, 'artefakt nema witnessSummary; regeneriraj ga').toBeDefined();
    const zbroj = izvjestajSvjedoka.witnessResults.reduce((n, r) => n + r.targetedCheckCount, 0);
    expect(izvjestajSvjedoka.witnessSummary.targetedCheckCount).toBe(zbroj);
    expect(
      izvjestajSvjedoka.witnessSummary.targetedCheckCount,
      'pokrivenost svjedoka je pala ispod ratcheta',
    ).toBeGreaterThanOrEqual(WITNESS_CILJANIH_RATCHET);
  });

  it('svaki ciljani check svjedoka zavrsi pass ili izricito needsAssistance, drugi prolaz je no-op', () => {
    expect(witnessProblems(izvjestajSvjedoka)).toEqual([]);
  });

  it('realni results ne sadrzi nijedan svjedok, ni po izvjestaju ni po sidecaru na disku', () => {
    const svjedoci = new Set(izvjestajSvjedoka.witnessResults.map((r) => r.documentId));
    expect(izvjestajSvjedoka.results.filter((r) => svjedoci.has(r.documentId))).toEqual([]);
    // Neovisno o skupu svjedoka: sidecar svakog dokumenta u `results` ne smije nositi traku `witness`.
    const procurjeli = izvjestajSvjedoka.results.filter((r) => {
      const sidecar = JSON.parse(readFileSync(join(REAL_CORPUS_ROOT, r.fileName.replace(/\.docx$/i, '.json')), 'utf8')) as { track?: unknown };
      return sidecar.track === WITNESS_TRACK;
    });
    expect(procurjeli.map((r) => r.documentId)).toEqual([]);
  });

  /** NEGATIVNA KONTROLA: invarijante moraju vidjeti svjedoka koji je procurio ili ostao bez razloga. */
  it('invarijante hvataju procurjelog svjedoka i nerijesen ciljani check bez razloga', () => {
    const lazan = structuredClone(izvjestajSvjedoka);
    lazan.witnessResults = [{
      ...structuredClone(izvjestajSvjedoka.results[0]),
      targetedCheckCount: 1,
      autoUnresolvedCount: 1,
      autoUnresolvedChecks: ['format.font.dominant'],
      intendedChecks: ['font'],
      intendedUntargeted: [],
      needsAssistance: [],
      unexplainedUnresolved: ['format.font.dominant'],
    }];
    lazan.witnessSummary = { ...lazan.witnessSummary, documents: 1, targetedCheckCount: 1, secondPassNoOp: 1, regressions: 0 };
    const problemi = witnessProblems(lazan);
    expect(problemi.some((p) => p.includes('svjedok je i u results'))).toBe(true);
    expect(problemi.some((p) => p.includes('i dalje pada bez razloga'))).toBe(true);
  });
});

// --- Word-free generator testa: sinteticki svjedok mora proizvesti CILJANU klasu ulaza --------------

const PROFIL_SVJEDOKA = 'apuri-zavrsni';
const SCORED = ['font', 'font-size', 'line-spacing', 'margins', 'paper-size', 'justify'];

/** Verificirana bodovana pravila profila iz repair-mapa, isti filtar kao generator `.ps1`. */
function verificiranaBodovana(profileId: string): string[] {
  const entries = (repairMap as unknown as Record<string, Array<{ checkId: string; status: string }>>)[profileId] ?? [];
  return [...new Set(entries.filter((e) => SCORED.includes(e.checkId) && e.status === 'verified').map((e) => e.checkId))].sort();
}

/** Izmisljen akademski tekst; nijedna recenica nije iz studentskog rada. */
const ODLOMCI = [
  'Ovaj rad razmatra opce nacelo prema kojem se formalna pravila pisanja provjeravaju neovisno o sadrzaju, pa se ista provjera moze primijeniti na razlicita podrucja.',
  'Polaziste je pretpostavka da ujednacen izgled teksta olaksava citanje i ocjenjivanje, a da odstupanja od propisanog oblika ne govore nista o kvaliteti argumentacije.',
  'Izmisljeni primjer opisuje istrazivanje provedeno na zamisljenom uzorku, pri cemu su svi podaci i imena izmisljeni iskljucivo za potrebe ovog ogleda.',
  'Rezultati zamisljenog istrazivanja prikazani su opisno, bez tablica i slika, kako bi se pazljivo odvojilo ono sto se mjeri od onoga sto se tek pretpostavlja.',
  'U raspravi se zakljucuje da je dosljedan oblik preduvjet za postenu usporedbu radova, ali da sam po sebi ne jamci nijednu tvrdnju o njihovu sadrzaju.',
];

/** Svjedok: krsi SVIH sest bodovanih osi profila (Times New Roman 12, prored 1,5, obostrano, A4, 2,5 cm). */
function svjedokSpec(): DocSpec {
  const para = (text: string): ParaSpec => ({ text, font: 'Courier New', sizePt: 9, jc: 'left', spacingLine: 240 });
  return {
    paragraphs: [...ODLOMCI, ...ODLOMCI, ...ODLOMCI].map((t, i) => para(`${i + 1}. ${t}`)),
    pageCm: { w: 21.59, h: 27.94 },
    marginsCm: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
    settings: true,
  };
}

/** Kontrola: uskladjen oblik; razlicit tekst po oznaci, da bajtovi ne budu isti (dedupe bi odbio). */
function kontrolaSpec(oznaka: string): DocSpec {
  return {
    paragraphs: ODLOMCI.map((t) => ({ text: `${oznaka}: ${t}`, font: 'Times New Roman', sizePt: 12, jc: 'both', spacing15: true })),
    marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    settings: true,
  };
}

/**
 * WORD-AUTORSKI SVJEDOK ZA MJERENJE. `word-veliki-neuredan.docx` je napravljen PRAVIM Wordom nad
 * izmisljenim tekstom (`scripts/word-verify/make-large-messy.ps1`) i krsi svih pet verificiranih
 * bodovanih pravila profila `fpzg-politologija-diplomski` (font, velicina, prored, obostrano, A4; profil
 * nema verificiran zapis o marginama). Dakle je tocno ono sto generator svjedoka proizvodi, samo bez
 * Worda na ovom stroju. Graditelj iz `tests/helpers/docx-builder.ts` sluzi samo razvrstavanju: njegov
 * paket nema `word/_rels/document.xml.rels`, pa ishod popravka nad njim ne bi bio reprezentativan.
 */
const WORD_SVJEDOK = 'word-veliki-neuredan';
const WORD_SVJEDOK_PROFIL = 'fpzg-politologija-diplomski';

function napraviKorpus(svjedok: 'graditelj' | 'word'): string {
  const root = mkdtempSync(join(tmpdir(), 'lekta-t68-svjedok-'));
  const pisi = (id: string, bytes: Uint8Array, sidecar: Record<string, unknown>) => {
    writeFileSync(join(root, `${id}.docx`), bytes);
    writeFileSync(join(root, `${id}.json`), JSON.stringify(sidecar, null, 2));
  };
  const profil = svjedok === 'word' ? WORD_SVJEDOK_PROFIL : PROFIL_SVJEDOKA;
  const bajtovi = svjedok === 'word'
    ? new Uint8Array(readFileSync(join(REAL_CORPUS_ROOT, `${WORD_SVJEDOK}.docx`)))
    : buildDocx(svjedokSpec());
  pisi(`svjedok-${profil}`, bajtovi, {
    profileId: profil,
    track: WITNESS_TRACK,
    synthetic: true,
    violations: verificiranaBodovana(profil).map((checkId) => ({ checkId, expected: 'profil', set: 'namjerno krivo' })),
  });
  pisi('kontrola-real', buildDocx(kontrolaSpec('stvarni')), { profileId: profil });
  pisi('kontrola-synthetic', buildDocx(kontrolaSpec('sinteticki')), { profileId: profil, synthetic: true });
  return root;
}

describe('svjedoci (T68): Word-free mjerenje sintetickog svjedoka', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('profil svjedoka ima svih sest verificiranih bodovanih pravila', () => {
    expect(verificiranaBodovana(PROFIL_SVJEDOKA)).toEqual([...SCORED].sort());
  });

  it('otkrivanje: svjedok samo u witness skupu, kontrole u svojim skupovima', () => {
    const root = napraviKorpus('graditelj');
    dirs.push(root);
    expect(discoverRealCorpus(root).map((e) => e.documentId)).toEqual(['kontrola-real']);
    expect(discoverExcludedCorpus(root).map((e) => e.documentId)).toEqual(['kontrola-synthetic']);
    const svjedoci = discoverWitnessCorpus(root);
    expect(svjedoci.map((e) => e.documentId)).toEqual([`svjedok-${PROFIL_SVJEDOKA}`]);
    expect(svjedoci[0].intendedChecks).toEqual([...SCORED].sort());
  });

  it('mjerenje: svjedok ide u witnessResults, nikad u results, i stvarno nosi ciljane prekrsaje', async () => {
    const root = napraviKorpus('word');
    dirs.push(root);
    const ocekivani = verificiranaBodovana(WORD_SVJEDOK_PROFIL);
    expect(ocekivani).toEqual(['font', 'font-size', 'justify', 'line-spacing', 'paper-size']);
    const report = await runRealCorpus(root, { externalRoot: null });
    expect(report.results.map((r) => r.documentId)).toEqual(['kontrola-real']);
    expect(report.manifest.map((m) => m.documentId)).toEqual(['kontrola-real']);
    expect(report.syntheticResults.map((r) => r.documentId)).toEqual(['kontrola-synthetic']);
    expect(report.witnessResults.map((r) => r.documentId)).toEqual([`svjedok-${WORD_SVJEDOK_PROFIL}`]);

    // Ciljana klasa ulaza: svaki namjerni prekrsaj analiza vidi kao pad i popravak ga cilja.
    const [w] = report.witnessResults;
    expect(w.error).toBeNull();
    expect(w.intendedChecks).toEqual(ocekivani);
    // Format papira je poznati jaz mjerenja (POZNATI_NECILJANI_PREKRSAJI): fixer ga popravlja, ali ishod
    // ga ne broji. Oba dijela se tvrde, da jaz ne nestane ni ne naraste tiho.
    expect(w.intendedUntargeted).toEqual([...POZNATI_NECILJANI_PREKRSAJI]);
    expect(w.statusChanges.some((c) => /^page\.size\.[^:]+:\w+->pass$/.test(c)), w.statusChanges.join(' ')).toBe(true);
    expect(w.targetedCheckCount).toBeGreaterThanOrEqual(ocekivani.length - POZNATI_NECILJANI_PREKRSAJI.length);
    expect(w.targetedResolvedCount).toBeGreaterThan(0);
    expect(report.witnessSummary.targetedCheckCount).toBe(w.targetedCheckCount);
    expect(report.witnessSummary.resolved).toBe(w.targetedResolvedCount);
    expect(report.witnessSummary.documents).toBe(1);
    // Sve sto nije rijeseno izricito trazi korisnika, s imenovanim razlogom.
    expect(report.witnessSummary.needsAssistance).toBe(w.needsAssistance.length);
    expect(w.targetedCheckCount - w.targetedResolvedCount).toBe(w.assistedUnresolvedCount);
    // Idempotencija dvama prolazima: drugi prolaz popravka je no-op.
    expect(w.secondPassNoOp).toBe(true);
    expect(report.witnessSummary.secondPassNoOp).toBe(1);
    expect(witnessProblems(report)).toEqual([]);
    // Svjedok ne dira zbrojeve realnog skupa.
    expect(report.summary.documentCount).toBe(1);
    expect(report.scope.targetedCheckCount).toBe(report.results.reduce((n, r) => n + r.targetedCheckCount, 0));
  }, 180_000);
});

// --- Generator .ps1: bez Worda NEPOKRIVEN i kod 2; plan krsi tocno verificirana bodovana pravila ------

const GENERATOR = 'scripts/corpus-gen/word/make-violation-witnesses.ps1';

/** Broj verificiranih bodovanih ZAPISA profila (ne razlicitih checkId-eva), kako ga broji zaglavlje. */
function brojVerificiranihBodovanih(profileId: string): number {
  const entries = (repairMap as unknown as Record<string, Array<{ checkId: string; status: string }>>)[profileId] ?? [];
  return entries.filter((e) => SCORED.includes(e.checkId) && e.status === 'verified').length;
}

/** Retci `#   <profileId>   <broj>   ...` iz bloka PREPORUCENI PROFILI u zaglavlju generatora. */
function preporukaIzZaglavlja(source: string): Array<{ profileId: string; count: number }> {
  const lines = source.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => l.startsWith('# PREPORUCENI PROFILI'));
  if (start < 0) return [];
  const out: Array<{ profileId: string; count: number }> = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('#')) break;
    const m = /^#\s{3}([a-z0-9][a-z0-9-]*)\s+(\d+)\s{2,}/.exec(line);
    if (m) out.push({ profileId: m[1], count: Number(m[2]) });
  }
  return out;
}

describe('svjedoci (T68): neciljani namjerni prekrsaj', () => {
  it('prekrsaj koji nista ne gadja je neciljan; ciljani i onaj u cekanju odabira nisu', () => {
    expect(witnessUntargeted(['font', 'line-spacing', 'paper-size'], ['format.font.dominant'], ['format.spacing.body']))
      .toEqual(['paper-size']);
    // Format papira ima dinamican id, prepoznaje se po prefiksu `page.size.`.
    expect(witnessUntargeted(['paper-size'], ['page.size.a4'], [])).toEqual([]);
    // Baseline: bez ijednog cilja svi namjerni prekrsaji su neciljani.
    expect(witnessUntargeted(['font', 'justify'], [], [])).toEqual(['font', 'justify']);
  });
});

describe('svjedoci (T68): generator make-violation-witnesses.ps1', () => {
  it('zaglavlje preporucuje 3 do 5 profila s najvise verified bodovanih pravila, s tocnim brojem', () => {
    const preporuka = preporukaIzZaglavlja(readFileSync(resolve(process.cwd(), GENERATOR), 'utf8'));
    expect(preporuka.length, JSON.stringify(preporuka)).toBeGreaterThanOrEqual(3);
    expect(preporuka.length).toBeLessThanOrEqual(5);
    const najvise = Math.max(...Object.keys(repairMap).map(brojVerificiranihBodovanih));
    for (const { profileId, count } of preporuka) {
      expect(count, profileId).toBe(brojVerificiranihBodovanih(profileId));
      expect(count, `${profileId} nije medju profilima s najvise pravila (${najvise})`).toBe(najvise);
    }
  });

  it('UTF-8 bez BOM-a, samo ASCII, bez em i en crtica', () => {
    const bytes = readFileSync(resolve(process.cwd(), GENERATOR));
    expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.every((b) => b < 0x80), 'skripta mora biti cisti ASCII (PowerShell 5.1 bez BOM-a cita ANSI)').toBe(true);
  });

  const onWindows = process.platform === 'win32';
  const ps = (...args: string[]) =>
    spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(process.cwd(), GENERATOR), ...args], {
      encoding: 'utf8',
      timeout: 120_000,
      windowsHide: true,
    });

  it.skipIf(!onWindows)('bez Worda ispisuje NEPOKRIVEN i izlazi s kodom 2, bez ijedne datoteke', () => {
    const out = mkdtempSync(join(tmpdir(), 'lekta-t68-bez-worda-'));
    try {
      const r = ps('-Profiles', PROFIL_SVJEDOKA, '-OutDir', join(out, 'izlaz'), '-WordProgId', 'Lekta.NePostoji.Word');
      expect(r.status, r.stderr).toBe(2);
      expect(r.stdout).toContain('NEPOKRIVEN: Word nije dostupan');
      expect(() => readFileSync(join(out, 'izlaz', `svjedok-${PROFIL_SVJEDOKA}.docx`))).toThrow();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);

  it.skipIf(!onWindows)('plan za svaki preporuceni profil krsi tocno verificirana bodovana pravila, izvan tolerancije analize', () => {
    // Svi preporuceni profili iz zaglavlja, ne rucno odabran par: preporuka mora biti izvediva.
    const preporuceni = preporukaIzZaglavlja(readFileSync(resolve(process.cwd(), GENERATOR), 'utf8')).map((p) => p.profileId);
    expect(preporuceni).toContain(PROFIL_SVJEDOKA);
    const r = ps('-Profiles', preporuceni.join(','), '-OutDir', tmpdir(), '-PlanOnly');
    expect(r.status, r.stderr).toBe(0);
    type Prekrsaj = { checkId: string; expected: unknown; set: unknown };
    const plan = JSON.parse(r.stdout) as Array<{ profileId: string; track: string; violations: Prekrsaj[] }>;
    expect(plan.map((p) => p.profileId)).toEqual(preporuceni);
    for (const p of plan) {
      expect(p.track).toBe(WITNESS_TRACK);
      expect(p.violations.map((v) => v.checkId).sort(), p.profileId).toEqual(verificiranaBodovana(p.profileId));
      const by = Object.fromEntries(p.violations.map((v) => [v.checkId, v]));
      expect((by.font.expected as string[]).includes(by.font.set as string)).toBe(false);
      for (const want of by['font-size'].expected as number[]) expect(Math.abs(want - (by['font-size'].set as number))).toBeGreaterThanOrEqual(2);
      for (const want of by['line-spacing'].expected as number[]) expect(Math.abs(want - (by['line-spacing'].set as number))).toBeGreaterThan(0.2);
      // Tolerancija margina u analizi je 0,36 cm (2,54 prema 2,5 NIJE prekrsaj); svjedok je uzi za 1 cm.
      const exp = by.margins.expected as Record<string, number>;
      const set = by.margins.set as Record<string, number>;
      for (const side of ['top', 'right', 'bottom', 'left']) expect(exp[side] - set[side], side).toBeGreaterThan(0.36);
      expect(by['paper-size'].set).toBe('Letter');
      expect(by.justify.set).toBe('lijevo');
    }
  }, 120_000);
});
