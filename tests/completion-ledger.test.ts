/**
 * Gard za completion ledger (docs/generated/completion-ledger.json), P0-3 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md.
 *
 * Ledger je jedini artefakt koji odgovara na pitanje "je li MOJ studij, MOJA vrsta rada dokazano
 * pokrivena i do koje razine". Zato ga cuvaju DVIJE vrste tvrdnji:
 *   1. drift: commitani izlaz === svjezi izracun (kad padne: `npm run completion-ledger`);
 *   2. postenje: nijedan redak ne smije tvrditi vise nego sto njegove osi dokazuju.
 *
 * Druga skupina je vaznija. Drift gard hvata zastarjelost, ali ne bi uhvatio da netko olabavi
 * ljestvicu i tiho promakne 400 profila u razinu B.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { computeWorklist } from '../src/verification/worklist';
import {
  buildCompletionLedger,
  CLAIM_LADDER,
  STROP_RAZINE_A,
  proofSourceProblems,
  pdfSeparationProblems,
  CLAIM_LABEL_A_PDF,
  type LedgerInputs,
  type CompletionLedger,
} from '../src/verification/completion-ledger';
import {
  provenUnitWorkTypes,
  provenPdfUnitWorkTypes,
  attestationProblems,
  pdfAttestationProblems,
  realSourceKindProblem,
  type CorpusAttestation,
} from '../src/verification/real-corpus-attestation';
import { attestationContentDigestSync } from '../src/verification/attestation-content-digest';
import baked from '../docs/generated/completion-ledger.json';
import profileClaims from '../data/profiles/profile-claims.json';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const readJson = <T>(rel: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), rel), 'utf8')) as T;

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];

const inputs: LedgerInputs = {
  registryProfiles: profiles.map((p) => ({
    id: p.id,
    unitId: (p as unknown as { unitId?: string }).unitId ?? null,
    workTypes: (p as unknown as { workTypes?: string[] }).workTypes ?? [],
  })),
  faculties: readJson<{ faculties: LedgerInputs['faculties'] }>('docs/generated/faculty-matrix.json').faculties,
  coverageCells: readJson<{ cells: LedgerInputs['coverageCells'] }>('data/coverage/scored-coverage.json').cells,
  worklistRows: computeWorklist(profiles, SOURCE_REGISTRY as SourceEntry[]).rows,
  repairRows: readJson<{ rows: LedgerInputs['repairRows'] }>('docs/generated/repair-coverage.json').rows,
  programs: readJson<{ programs: LedgerInputs['programs'] }>('data/programs/program-registry.json').programs,
  titleTemplates: readJson<LedgerInputs['titleTemplates']>('data/title-pages/templates-index.json'),
  citationSpecs: readJson<LedgerInputs['citationSpecs']>('data/tools/citation-specs/verified-index.json'),
  declarations: readJson<LedgerInputs['declarations']>('data/declarations/declarations.json'),
  closedLoop: readJson<{ rows: NonNullable<LedgerInputs['closedLoop']> }>('docs/generated/closed-loop.json').rows,
};

/**
 * Ovjera se MORA ucitati isto kao u generatoru, inace svjezi izracun nema dokaz koji commitani ima i
 * drift test pada na razlici koja nije regresija. Tocno taj razred kvara (artefakt ovisi o ulazu koji
 * test ne daje) danas je vec jednom obojio CI crvenim.
 */
const corpusAttestation = readJson<Parameters<typeof buildCompletionLedger>[0]['corpusAttestation']>(
  'data/verification/real-corpus-attestation.json',
);
// Codex #225, nalaz 2: i PDF ovjera se ucitava kao u generatoru (neobavezno), inace prva stvarna PDF ovjera
// obara drift test na razlici koja nije regresija.
const PDF_OVJERA = 'data/verification/pdf-corpus-attestation.json';
const pdfCorpusAttestation = existsSync(resolve(process.cwd(), PDF_OVJERA))
  ? readJson<Parameters<typeof buildCompletionLedger>[0]['pdfCorpusAttestation']>(PDF_OVJERA)
  : null;
const fresh = buildCompletionLedger({ ...inputs, corpusAttestation, pdfCorpusAttestation });

describe('completion ledger: drift', () => {
  it('commitani izlaz === svjezi izracun (inace: npm run completion-ledger)', () => {
    expect(fresh).toEqual(baked as unknown as CompletionLedger);
  });

  it('pokriva svaki registrirani profil, sa retkom po vrsti rada', () => {
    expect(fresh.summary.profileCount).toBe(profiles.length);
    expect(fresh.summary.rowCount).toBeGreaterThanOrEqual(fresh.summary.profileCount);
  });
});

describe('completion ledger: nijedan redak ne tvrdi vise nego sto dokazuje', () => {
  it('A i B traze ljudski potvrdjena pravila, fakultetski popravak I dokaz na dokumentu', () => {
    for (const row of fresh.rows) {
      if (row.claim !== 'A' && row.claim !== 'B') continue;
      expect(row.rules, `${row.profileId}: razina ${row.claim} bez potpuno verificiranih pravila`).toBe('verified');
      expect(row.repair, `${row.profileId}: razina ${row.claim} bez fakultetskog popravka`).toBe('faculty-specific');
      expect(
        row.claim === 'A' ? 'real-docx-pass' : 'synthetic-pass',
        `${row.profileId}: razina ${row.claim} s dokazom ${row.proof}`,
      ).toBe(row.proof);
    }
  });

  it('samo razina A smije biti bez ijednog razloga blokade', () => {
    for (const row of fresh.rows) {
      if (row.claim === 'A') expect(row.blockedReasons).toEqual([]);
      else expect(row.blockedReasons.length, `${row.profileId} (${row.claim}) nema razlog`).toBeGreaterThan(0);
    }
  });

  it('bulk-pending pravila nikad ne dosezu A ni B', () => {
    for (const row of fresh.rows) {
      if (row.rules === 'bulk-pending') expect(['C', 'D', 'E']).toContain(row.claim);
    }
  });

  it('E znaci doista nula bodovanih pravila, a ne samo slab dokaz', () => {
    for (const row of fresh.rows) {
      if (row.claim === 'E') expect(row.evidence.scoredTotal).toBe(0);
      if (row.evidence.scoredTotal > 0) expect(row.claim).not.toBe('E');
    }
  });

  it('strop razine A je imenovan, prvi, na SVAKOM E retku profila i ni na jednom drugom retku', () => {
    // E = redci bez bodovanog pravila iz sluzbenog izvora + programi bez profila. Strop nose samo prvi:
    // program bez profila nije strop nego prazno mjesto, i vec ima vlastiti doslovni razlog.
    const eProfila = fresh.rows.filter((r) => r.claim === 'E' && r.profileId !== null);
    expect(eProfila.length).toBeGreaterThan(0);
    for (const row of eProfila) expect(row.blockedReasons[0]).toBe(STROP_RAZINE_A);
    for (const row of fresh.rows) {
      if (row.claim !== 'E') expect(row.blockedReasons).not.toContain(STROP_RAZINE_A);
    }
  });

  it('ovjera na stvarnim radovima dize SAMO par jedinica x vrsta rada, nikad cijeli profil', () => {
    // Odluka vlasnika 2026-09-05: dokaz vrijedi za (jedinica, vrsta rada). Isti profil moze biti A za
    // diplomski a B za doktorski. Mjera: bez ovjere ledger ima manje A; s ovjerom se smije promijeniti
    // iskljucivo redak ciji je par ovjeren, i to samo prema gore.
    const bezOvjere = buildCompletionLedger({ ...inputs, corpusAttestation: null });
    const dokazani = provenUnitWorkTypes(corpusAttestation);
    expect(dokazani.size).toBeGreaterThan(0);
    const aPrije = bezOvjere.rows.filter((r) => r.claim === 'A').length;
    const aPoslije = fresh.rows.filter((r) => r.claim === 'A').length;
    expect(aPoslije).toBeGreaterThan(aPrije);
    for (const row of fresh.rows) {
      const prije = bezOvjere.rows.find((r) => r.profileId === row.profileId && r.workType === row.workType);
      expect(prije).toBeDefined();
      const par = `${row.unitId}::${row.workType}`;
      if (!dokazani.has(par)) expect(row.claim).toBe(prije!.claim);
      if (row.claim === 'A' && prije!.claim !== 'A') expect(dokazani.has(par)).toBe(true);
    }
  });

  it('zbirna os pomocnog sadrzaja je NAJSLABIJI clan svoje tri podosi', () => {
    const order = ['exact-official', 'exact-derived', 'reused', 'generic', 'unknown'];
    for (const row of fresh.rows) {
      const worst = Math.max(
        order.indexOf(row.assetDetail.titlePage),
        order.indexOf(row.assetDetail.citation),
        order.indexOf(row.assetDetail.declaration),
      );
      expect(row.assets).toBe(order[worst]);
    }
  });

  it('svaka razina ljestvice ima formulaciju koju smijemo pokazati', () => {
    for (const row of fresh.rows) expect(CLAIM_LADDER[row.claim]).toBeTruthy();
  });
});

describe('completion ledger: nacionalna tvrdnja', () => {
  /**
   * Ovo je poanta cijelog audita pretvorena u test. Dokle god ijedan redak nije na A ili B, ili
   * postoji program bez evidencije, tvrdnja "Lekta provjerava i popravlja svaki akademski rad u
   * Hrvatskoj" je NO-GO. Test NE trazi da blokatora nema (danas ih ima); trazi da su IMENOVANI,
   * pa se stanje ne moze predstaviti kao dovrseno.
   */
  it('blokatori nacionalne tvrdnje su izvedeni iz osi, ne prepricani', () => {
    const s = fresh.summary;
    const unproven = s.byClaim.C + s.byClaim.D + s.byClaim.E;
    expect(s.programGaps).toBe(fresh.rows.filter((r) => r.program === 'missing').length);
    if (s.programGaps > 0 || unproven > 0 || s.programsWithoutProfile.length > 0) {
      expect(s.nationalClaimBlockers.length).toBeGreaterThan(0);
    } else {
      expect(s.nationalClaimBlockers).toEqual([]);
    }
  });

  it('nijedan redak jos nema program iz sluzbenog Upisnika (faza P1 nije izvedena)', () => {
    // Kad P1 zavrsi, ovaj test se mijenja u suprotnu tvrdnju. Dok traje, cuva da nitko ne oznaci
    // program `official` bez stvarne sinkronizacije s Upisnikom.
    expect(fresh.summary.byProgram.official).toBe(0);
  });

  it('zatecena tri evidentirana programa bez profila ostaju vidljiva', () => {
    expect(fresh.summary.programsWithoutProfile).toHaveLength(3);
    expect(fresh.summary.programsWithoutProfile.join(' ')).toContain('Vojno vođenje');
  });
});

/**
 * Vanjski audit 2026-09-08, nalaz 4: od 31 profila razine A samo je 12 izravno u ovjeri, 19 nasljedjuje
 * dokaz po paru jedinica x vrsta rada (odluka vlasnika 2026-09-05), a sucelje ih je pokrivalo istom
 * recenicom. Ledger sada uz os dokaza nosi i IZVOR (`proofSource`), pa se izmjereno i izvedeno moze
 * razlikovati bez sroceanja u sucelju.
 */
describe('completion ledger: izvor dokaza na stvarnom radu', () => {
  it('os dokaza i njezin izvor se slazu na svakom retku (svjeze i commitano)', () => {
    expect(proofSourceProblems(fresh.rows)).toEqual([]);
    expect(proofSourceProblems((baked as CompletionLedger).rows)).toEqual([]);
  });

  it('svaki A redak ima izvor, i nijedan redak bez dokaza na stvarnom radu ga nema', () => {
    for (const row of fresh.rows) {
      if (row.claim === 'A') expect(row.proofSource, row.profileId ?? '?').not.toBeNull();
      if (row.proof !== 'real-docx-pass') expect(row.proofSource, row.profileId ?? '?').toBeNull();
    }
  });

  it('zbroj po izvoru odgovara redovima', () => {
    const s = fresh.summary.byProofSource;
    expect(s.profile + s['unit-work-type'] + s.none).toBe(fresh.rows.length);
    expect(s.profile + s['unit-work-type']).toBe(fresh.summary.byProof['real-docx-pass']);
  });

  /**
   * RATCHET s imenovanim brojkama (izmjereno 2026-09-09 nad ovjerom od 2026-09-05): 18 redaka ima
   * dokaz izmjeren na vlastitom profilu (12 razlicitih profila, tocno onih 12 iz `profileIds` ovjere),
   * 23 retka ga nasljedjuju po paru. Izmjereni broj smije samo RASTI (vise ovjerenih profila), a
   * naslijedjeni se smije mijenjati samo uz svjesnu izmjenu ovdje. Pad izmjerenog znaci da je ovjera
   * izgubila profil ili da je definicija izvora popustila.
   */
  it('izmjereno naspram naslijedjeno: 18 redaka / 12 profila izmjereno, 23 retka naslijedjeno', () => {
    const s = fresh.summary.byProofSource;
    expect(s.profile).toBeGreaterThanOrEqual(18);
    expect(s['unit-work-type']).toBe(23);
    const izravniProfili = new Set(fresh.rows.filter((r) => r.proofSource === 'profile').map((r) => r.profileId));
    expect(izravniProfili.size).toBeGreaterThanOrEqual(12);
  });

  it('gard nad izvorom stvarno grize (podmetnut A redak bez izvora)', () => {
    const cisto = fresh.rows;
    expect(proofSourceProblems(cisto)).toEqual([]);
    const a = cisto.find((r) => r.claim === 'A')!;
    expect(proofSourceProblems([{ ...a, proofSource: null }])).toHaveLength(1);
    const b = cisto.find((r) => r.proof !== 'real-docx-pass')!;
    expect(proofSourceProblems([{ ...b, proofSource: 'unit-work-type' }])).toHaveLength(1);
  });
});

/**
 * RAZINA `A-pdf` (odluka vlasnika 2026-09-28). Javni rad iz PDF repozitorija (Dabar, ZIR), pretvoren u
 * DOCX i popravljen Lektom, daje ZASEBNU razinu. Nikad ne mijenja `claim`, `byClaim` ni agregat "svi na
 * A": pravi A ostaje samo izvorni DOCX (data/verification/real-corpus-attestation.json).
 *
 * PDF ovjera ovdje je SIMULACIJA bez podataka: izmisljeni otisci, jedna skupina po paru, bez ijednog
 * rada. Stvarna PDF ovjera jos ne postoji, pa je commitani ledger na nula `A-pdf`.
 */
describe('completion ledger: razina A-pdf je odvojena od ljestvice', () => {
  /** Ponovo potpisana kopija: otisak sadrzaja pokriva i `sourceKind`, pa se racuna nakon izmjene. */
  const potpisi = (a: Record<string, unknown>): CorpusAttestation => {
    const bez = { ...a };
    for (const k of ['signedBy', 'signedAt', 'signatureNote', 'signedContentDigest']) delete bez[k];
    return {
      ...bez,
      signedBy: 'simulacija',
      signedAt: '2026-09-28T10:00:00.000Z',
      signedContentDigest: attestationContentDigestSync(bez as unknown as CorpusAttestation),
    } as unknown as CorpusAttestation;
  };
  /** B par bez prave ovjere (alu::graduate: B, D i E redci) i par vec dokazan na izvornom DOCX-u (efzg::final). */
  const PDF_PAROVI = ['alu::graduate', 'efzg::final'];
  const pdfOvjera = (over: Record<string, unknown> = {}): CorpusAttestation =>
    potpisi({
      schemaVersion: 1,
      fingerprintVersion: 2,
      sourceKind: 'public-pdf-converted',
      corpusFingerprint: 'e'.repeat(32),
      measuredAt: '2026-09-28T09:00:00.000Z',
      measuredFromCommit: 'c'.repeat(40),
      repairSourceHash: 'a'.repeat(64),
      oracles: ['simulacija'],
      environment: { wordVersion: null },
      protocol: {
        holdoutExcluded: true,
        holdoutDocumentCount: 0,
        independentlyConfirmedCount: 0,
        derivedExpectationCount: 2,
        duplicateDocumentCount: 0,
        uniqueDocumentCount: 2,
        rawDocumentCount: 2,
        countedDocumentCount: 2,
      },
      entries: PDF_PAROVI.map((par) => {
        const [unitId, workType] = par.split('::');
        return { unitId, workType, profileIds: [], documentCount: 1, cleanCount: 1, regressedChecks: [] };
      }),
      ...over,
    });

  it('gard odvojenosti vidi SVA polja osim PDF polja: promjena summary.byProof ili osi retka je nalaz (Codex #225, nalaz 3)', () => {
    const sazetak = structuredClone(fresh);
    sazetak.summary.byProof = { ...sazetak.summary.byProof, review: sazetak.summary.byProof.review + 1 };
    expect(pdfSeparationProblems(fresh, sazetak)).toContain('PDF ovjera je promijenila byProof');
    const redak = structuredClone(fresh);
    redak.rows[0] = { ...redak.rows[0], program: redak.rows[0].program === 'missing' ? 'official' : 'missing' };
    expect(pdfSeparationProblems(fresh, redak).some((p) => p.includes('PDF ovjera je promijenila program'))).toBe(true);
    // Samo PDF polja smiju se razlikovati.
    const pdfSamo = structuredClone(fresh);
    pdfSamo.summary.byPdfClaim = { 'A-pdf': 0 };
    expect(pdfSeparationProblems(fresh, pdfSamo)).toEqual([]);
  });

  it('commitana PDF ovjera ne dira ljestvicu; bez datoteke nijedan redak nema A-pdf (svjeze i commitano)', () => {
    const bezPdf = buildCompletionLedger({ ...inputs, corpusAttestation, pdfCorpusAttestation: null });
    expect(pdfSeparationProblems(bezPdf, fresh)).toEqual([]);
    if (pdfCorpusAttestation === null) {
      for (const l of [fresh, baked as unknown as CompletionLedger]) {
        expect(l.summary.byPdfClaim).toEqual({ 'A-pdf': 0 });
        expect(l.rows.filter((r) => r.pdfProof !== null || r.pdfClaim !== null || r.pdfClaimLabel !== null)).toEqual([]);
      }
    }
  });

  it('valjana PDF ovjera daje A-pdf SAMO ovjerenom paru koji bi s dokazom bio A; claim i byClaim su identicni', () => {
    const pdf = pdfOvjera();
    expect(pdfAttestationProblems(pdf)).toEqual([]);
    expect([...provenPdfUnitWorkTypes(pdf)].sort()).toEqual([...PDF_PAROVI].sort());
    const sa = buildCompletionLedger({ ...inputs, corpusAttestation, pdfCorpusAttestation: pdf });

    expect(pdfSeparationProblems(fresh, sa)).toEqual([]);
    expect(sa.summary.byClaim).toEqual(fresh.summary.byClaim);
    expect(sa.rows.map((r) => r.claim)).toEqual(fresh.rows.map((r) => r.claim));

    // Ocekivani A-pdf redci izvedeni iz SVJEZEG ledgera bez PDF-a: par je ovjeren, a redak je B samo
    // zato sto nema dokaza na stvarnom radu (verificirana pravila, fakultetski popravak).
    const ocekivani = fresh.rows
      .filter((r) => PDF_PAROVI.includes(`${r.unitId}::${r.workType}`))
      .filter((r) => r.claim === 'B' && r.rules === 'verified' && r.repair === 'faculty-specific')
      .map((r) => `${r.profileId}::${r.workType}`);
    expect(ocekivani.length).toBeGreaterThan(0);
    const aPdf = sa.rows.filter((r) => r.pdfClaim === 'A-pdf');
    expect(aPdf.map((r) => `${r.profileId}::${r.workType}`)).toEqual(ocekivani);
    expect(sa.summary.byPdfClaim['A-pdf']).toBe(ocekivani.length);
    for (const r of aPdf) expect(r.pdfClaimLabel).toBe(CLAIM_LABEL_A_PDF);

    // D i E redci ovjerenog para dobivaju PDF dokaz, ali ne i razinu; A redci (izvorni DOCX) takodjer.
    const ovjereni = sa.rows.filter((r) => PDF_PAROVI.includes(`${r.unitId}::${r.workType}`));
    expect(ovjereni.every((r) => r.pdfProof === 'pdf-docx-pass')).toBe(true);
    expect(ovjereni.some((r) => r.claim === 'A')).toBe(true);
    expect(ovjereni.some((r) => r.claim === 'D' || r.claim === 'E')).toBe(true);
    for (const r of ovjereni) if (r.claim !== 'B') expect(r.pdfClaim, `${r.profileId} (${r.claim})`).toBeNull();
    // Redci izvan ovjerenih parova ostaju bez PDF dokaza.
    expect(sa.rows.filter((r) => !PDF_PAROVI.includes(`${r.unitId}::${r.workType}`) && r.pdfProof !== null)).toEqual([]);
  });

  it('PDF ovjera bez sourceKind ne vrijedi', () => {
    const bezVrste = pdfOvjera({ sourceKind: undefined });
    expect(pdfAttestationProblems(bezVrste)).toEqual(['PDF ovjera mora nositi sourceKind "public-pdf-converted"']);
    expect(provenPdfUnitWorkTypes(bezVrste).size).toBe(0);
    const sa = buildCompletionLedger({ ...inputs, corpusAttestation, pdfCorpusAttestation: bezVrste });
    expect(sa.summary.byPdfClaim['A-pdf']).toBe(0);
    expect(sa).toEqual(fresh);
  });

  it('nepotpisana PDF ovjera ne vrijedi', () => {
    const nepotpisana = { ...pdfOvjera(), signedBy: null } as CorpusAttestation;
    expect(pdfAttestationProblems(nepotpisana)).toContain('nije potpisana');
    expect(provenPdfUnitWorkTypes(nepotpisana).size).toBe(0);
  });

  it('prava ovjera sa sourceKind PDF konverzije ne vrijedi i ne daje nijedan A', () => {
    expect(attestationProblems(corpusAttestation)).toEqual([]);
    const kaoPdf = potpisi({ ...(corpusAttestation as unknown as Record<string, unknown>), sourceKind: 'public-pdf-converted' });
    const problem = realSourceKindProblem(kaoPdf);
    expect(problem).not.toBeNull();
    expect(attestationProblems(kaoPdf)).toEqual([problem]);
    expect(provenUnitWorkTypes(kaoPdf).size).toBe(0);
    const s = buildCompletionLedger({ ...inputs, corpusAttestation: kaoPdf }).summary;
    const bez = buildCompletionLedger({ ...inputs, corpusAttestation: null }).summary;
    expect(s.byClaim).toEqual(bez.byClaim);
    expect(s.byClaim.A).toBeLessThan(fresh.summary.byClaim.A);
    // Ni PDF ovjera predana kao prava ne daje A.
    expect(provenUnitWorkTypes(pdfOvjera()).size).toBe(0);
  });

  it('profile-claims.json prepisuje A-pdf iz ledgera zasebno, bez diranja byProfile (inace: npm run gen-profile-claims)', () => {
    const art = profileClaims as unknown as {
      pdfLadder: Record<string, string>;
      pdfCounts: Record<string, number>;
      byPdfProfile: Record<string, string>;
    };
    expect(art.pdfLadder).toEqual({ 'A-pdf': CLAIM_LABEL_A_PDF });
    const redci: Record<string, Array<string | null>> = {};
    for (const r of (baked as unknown as CompletionLedger).rows) if (r.profileId) (redci[r.profileId] ??= []).push(r.pdfClaim);
    const ocekivano = Object.fromEntries(
      Object.entries(redci)
        .filter(([, c]) => c.every((x) => x === 'A-pdf'))
        .map(([id]) => [id, 'A-pdf']),
    );
    expect(art.byPdfProfile).toEqual(ocekivano);
    expect(art.pdfCounts).toEqual({ 'A-pdf': Object.keys(ocekivano).length });
  });
});
