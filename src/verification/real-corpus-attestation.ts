/**
 * OVJERA DOKAZA NAD STVARNIM RADOVIMA.
 *
 * ZASTO POSTOJI. Razina dokaza `A` trazi dokaz na stvarnom studentskom radu, a ljestvica je dosad
 * priznavala samo COMMITANE uzorke. Stvarni korpus (38 radova) su tudji studentski radovi i
 * gitignoriran je, pa je `A` bila nedostizna PO KONSTRUKCIJI: 338 profila trajno je stajalo na `B`
 * uz blokator koji nitko nikad ne moze ukloniti. To je najgori oblik mjere, jer izgleda kao
 * zaostatak a zapravo je zid, pa svaka sesija trosi trud na nesto sto ne moze pomaknuti brojku.
 *
 * STO OVJERA JEST: zapis da je mjerenje IZVEDENO, s brojkama i potpisom. Sto ovjera NIJE: dokument,
 * njegov sadrzaj, ni bilo sto iz cega bi se rad dao rekonstruirati. U repozitorij ulazi tvrdnja o
 * mjerenju, ne gradja nad kojom je mjereno.
 *
 * ZASTO POTPIS. Bez njega bi ovjera bila samopotvrdjujuca: skripta bi tvrdila da je dokaz izveden
 * jer ju je netko pokrenuo. Potpis je isti standard koji repozitorij vec trazi od tvrdnji o
 * pravilima (`verifiedBy`, `decidedBy`), i jedini je razlog zasto ovjera vrijedi vise od komentara.
 *
 * NEPOTPISANA OVJERA NE VRIJEDI NISTA i to je namjerno: generator je smije napisati, ali dok je
 * covjek ne potpise, ljestvica je ne gleda. Time se ne moze dogoditi da razina `A` poraste zato sto
 * je netko pokrenuo skriptu.
 */

import { attestationContentDigestSync } from './attestation-content-digest';
import { repairSourceFreshness } from '../../scripts/lib/repair-source-hash.mjs';

/**
 * Jedna mjerena skupina, bez ijednog podatka o dokumentima.
 *
 * GRANULARNOST JE JEDINICA x VRSTA RADA, odlukom vlasnika 2026-09-05. Rad mjeren nad profilom
 * dokazuje popravak za sve profile ISTE jedinice i ISTE vrste rada: pravila se po vrsti rada stvarno
 * razlikuju (diplomski ne dokazuje doktorski), a po katedri unutar iste vrste rijetko. Isti ustupak
 * repozitorij vec ima za citatne specove ("granularnost je danas FAKULTETSKA"). Izmjereno pri odluci:
 * po profilu bi trebalo jos 317 radova, po jedinici x vrsti 231, po jedinici 112.
 *
 * `profileIds` biljezi iz kojih je profila dokaz stvarno dosao, da se sirenje na jedinicu vidi, a ne
 * skriva.
 */
export interface CorpusAttestationEntry {
  unitId: string;
  workType: string;
  /** Profili cije su dokumente mjerene; sirenje na ostale profile jedinice je izvedeno, ne mjereno. */
  profileIds: string[];
  /** Koliko je stvarnih radova uslo u mjerenje za ovaj profil. */
  documentCount: number;
  /** Koliko ih je zavrsilo bez pada isporuke i bez pass-regresije. */
  cleanCount: number;
  /** Imena provjera koje su igdje regresirale; prazno znaci nijedna. */
  regressedChecks: string[];
}

export interface CorpusAttestation {
  schemaVersion: 1;
  /**
   * T83: verzija otiska. 2 = nad jedinstvenim documentId-ovima s oznakom verzije u ulazu
   * (scripts/lib/corpus-attestation-core.mjs). Bez polja je v1, koji je brojao ponavljanja.
   */
  fingerprintVersion?: number;
  /** Otisak SKUPA mjerenih radova (imena i velicine), nikad sadrzaja. Mijenja se kad se korpus mijenja. */
  corpusFingerprint: string;
  measuredAt: string;
  /** Commit nad kojim je mjereno; bez njega se ne zna sto je tocno dokazano. */
  measuredFromCommit: string | null;
  /** T75: sha256 produkcijskog `src/repair` u `measuredFromCommit` (scripts/lib/repair-source-hash.mjs); obvezan za v2. */
  repairSourceHash?: string | null;
  /** Alati kojima je mjereno. Prazno = ovjera ne vrijedi. */
  oracles: string[];
  /** Tko jamci za mjerenje. `null` dok covjek ne potpise, i tada ovjera NE vrijedi. */
  signedBy: string | null;
  signedAt: string | null;
  /** T83-05: sha256 kanonskog sadrzaja ovjere (bez polja potpisa) koji potpis pokriva; samo v2. */
  signedContentDigest?: string | null;
  /**
   * T06 (protokol 2.4): u kojoj je verziji Worda izlaz vizualno provjeren. `null` znaci "nije", ne "nepoznato".
   * Neobavezno, jer starije ovjere polje nemaju; njihova valjanost se time ne mijenja.
   */
  environment?: { wordVersion: string | null };
  /**
   * T06 (protokol 2.2 i 2.3): je li izdvojeni skup ostao izvan dokaza i koliko je ocekivanja zapisala neovisna
   * osoba prije popravka. Brojke opisuju MJERENJE, ne dokumente; ne ulaze u odluku o dokazu.
   */
  protocol?: {
    holdoutExcluded: boolean;
    holdoutDocumentCount: number;
    independentlyConfirmedCount: number;
    derivedExpectationCount: number;
    /**
     * T83: koliko je rezultata mjerenja dijelilo `documentId` s drugim. Nova skripta ovjere pise 0 ili
     * prekida; broj veci od nule znaci da je ovjera nastala nad mjerenjem koje je iste radove brojalo
     * vise puta. Starije ovjere polje nemaju; obveza polja uvodi se zajedno sa svjezom ovjerom (T75).
     */
    duplicateDocumentCount?: number;
    /** T83: rezultata u ovjeri (jedinstveni id-ovi) i koliko ih je bilo prije nego sto je harness izbacio kopije. */
    uniqueDocumentCount?: number;
    rawDocumentCount?: number;
    /** T83-07: jedinstveni dokumenti koji su usli u bar jednu skupinu (bez izdvojenih i bez jedinice). */
    countedDocumentCount?: number;
  };
  entries: CorpusAttestationEntry[];
  /**
   * Odakle su mjereni dokumenti (odluka vlasnika 2026-09-28), iz zatvorenog skupa `SOURCE_KINDS`.
   * `source-docx`: izvorni Word dokumenti, jedini put do razine A. `public-pdf-converted`: javni radovi iz
   * PDF repozitorija (Dabar, ZIR) pretvoreni u DOCX; takva ovjera daje ZASEBNU razinu `A-pdf` i nikad ne
   * dize `claim`. Polje je dio potpisanog sadrzaja (otisak pokriva sve osim polja potpisa), pa se ne moze
   * dopisati nakon potpisa. Bez polja smije biti SAMO ovjera mjerena prije `LEGACY_UNMARKED_BEFORE`.
   */
  sourceKind?: SourceKind;
}

/** Zatvoren skup vrsta izvora ovjere; svaka druga vrijednost je problem, ne izvorni DOCX. */
const SOURCE_KINDS = ['source-docx', 'public-pdf-converted'] as const;
type SourceKind = (typeof SOURCE_KINDS)[number];

/** Vrsta izvora ovjere nad javnim radovima pretvorenim iz PDF-a u DOCX (razina `A-pdf`). */
const PDF_SOURCE_KIND = 'public-pdf-converted' as const;

/**
 * Granica kompatibilnosti (Codex #225, nalaz 1). Ovjera bez `sourceKind` do ovog PR-a je znacila izvorni
 * DOCX; jedina takva potpisana ovjera (otisak korpusa 33768c3c..., mjerena 2026-09-27T21:25Z) ostaje
 * valjana. Svaka ovjera mjerena od ove granice MORA navesti `sourceKind`, inace bi PDF pretvoren u DOCX,
 * izmjeren postojecim putem i potpisan, tiho postao pravi A.
 */
const LEGACY_UNMARKED_BEFORE = '2026-09-28T00:00:00.000Z';

/**
 * PDF KONVERZIJA NIJE DOKAZ RAZINE A (odluka vlasnika 2026-09-28). Pretvorba iz PDF-a nagadja
 * strukturu koju izvorni Word dokument ima (stilovi, polja, sekcije), pa popravak takvog dokumenta ne
 * dokazuje da popravak radi na radu kakav student predaje. Prava ovjera vrijedi samo sa `sourceKind:
 * 'source-docx'`, ili bez polja ako je mjerena prije `LEGACY_UNMARKED_BEFORE`. `isPdf` i `legacyBefore`
 * postoje samo za mutacijski test.
 */
export function realSourceKindProblem(
  a: CorpusAttestation,
  isPdf: (attestation: CorpusAttestation) => boolean = (x) => x.sourceKind === PDF_SOURCE_KIND,
  legacyBefore: string = LEGACY_UNMARKED_BEFORE,
): string | null {
  if (isPdf(a)) return 'ovjera nad radovima pretvorenim iz PDF-a nije dokaz na izvornom Word dokumentu';
  if (a.sourceKind === undefined) {
    const mjereno = Date.parse(String(a.measuredAt ?? ''));
    return Number.isFinite(mjereno) && mjereno < Date.parse(legacyBefore)
      ? null
      : 'ovjera bez sourceKind vrijedi samo za mjerenja prije 2026-09-28; nova ovjera mora navesti "source-docx"';
  }
  if (!(SOURCE_KINDS as readonly string[]).includes(a.sourceKind)) return `nepoznat sourceKind "${String(a.sourceKind)}"`;
  return a.sourceKind === 'source-docx' ? null : `prava ovjera ne prihvaca sourceKind "${a.sourceKind}"`;
}

/** Razlozi zbog kojih ovjera ne vrijedi. Prazan niz znaci da vrijedi. */
/**
 * Pokriva li potpis v2 ovjere njen STVARNI sadrzaj (Codex #185, runda 3, NOVO-01). Citac sam racuna
 * kanonski otisak sadrzaja i usporeduje ga sa `signedContentDigest`; brojka promijenjena nakon potpisa
 * (npr. `cleanCount` 1 -> 2) je problem. `digest` postoji samo za mutacijski test.
 */
export function signedContentProblem(
  a: CorpusAttestation,
  digest: (attestation: CorpusAttestation) => string = attestationContentDigestSync,
): string | null {
  if (a.fingerprintVersion !== 2 || !a.signedBy) return null;
  if (!/^[0-9a-f]{64}$/.test(String(a.signedContentDigest ?? ''))) return 'potpis v2 ovjere ne navodi otisak sadrzaja koji pokriva';
  if (a.signedContentDigest !== digest(a)) return 'sadrzaj ovjere je promijenjen nakon potpisa';
  return null;
}

/**
 * T75: v2 ovjera mora navesti otisak koda popravka nad kojim je mjereno (T74, sha256 produkcijskog
 * `src/repair` u `measuredFromCommit`), inace se ne zna koji je kod dokazan. `isHash` postoji samo za
 * mutacijski test.
 */
export function measuredCodeProblem(
  a: CorpusAttestation,
  isHash: (value: string) => boolean = (value) => /^[0-9a-f]{64}$/.test(value),
): string | null {
  if (a.fingerprintVersion !== 2) return null;
  return isHash(String(a.repairSourceHash ?? '')) ? null : 'nema otiska koda popravka nad kojim je mjereno';
}

/**
 * Razlozi zbog kojih PRAVA ovjera (izvorni Word dokumenti) ne vrijedi. Prazan niz znaci da vrijedi.
 * Uz zajednicke provjere oblika i potpisa odbija ovjeru nad radovima pretvorenim iz PDF-a.
 */
export function attestationProblems(a: CorpusAttestation | null | undefined, currentRepairSourceHash?: string | null): string[] {
  const p = sharedAttestationProblems(a, currentRepairSourceHash);
  if (!a) return p;
  const izvor = realSourceKindProblem(a);
  if (izvor) p.push(izvor);
  return p;
}

/**
 * Razlozi zbog kojih ovjera nad javnim radovima pretvorenim iz PDF-a ne vrijedi: iste provjere oblika,
 * potpisa i brojki kao za pravu ovjeru, plus obvezni `sourceKind: 'public-pdf-converted'`. Namjerno ne
 * zove `attestationProblems`, jer ta odbija upravo takav `sourceKind`.
 */
export function pdfAttestationProblems(a: CorpusAttestation | null | undefined): string[] {
  const p = sharedAttestationProblems(a);
  if (!a) return p;
  if (a.sourceKind !== PDF_SOURCE_KIND) p.push(`PDF ovjera mora nositi sourceKind "${PDF_SOURCE_KIND}"`);
  return p;
}

/** Provjere oblika, potpisa i brojki zajednicke pravoj i PDF ovjeri. */
function sharedAttestationProblems(a: CorpusAttestation | null | undefined, currentRepairSourceHash?: string | null): string[] {
  if (!a) return ['ovjere nema'];
  const p: string[] = [];
  if (a.schemaVersion !== 1) p.push('nepoznata verzija sheme');
  if (!a.signedBy || !a.signedBy.trim()) p.push('nije potpisana');
  if (!a.signedAt) p.push('nema datuma potpisa');
  if (!Array.isArray(a.oracles) || a.oracles.length === 0) p.push('nema navedenih alata mjerenja');
  if (!a.corpusFingerprint) p.push('nema otiska korpusa');
  if (currentRepairSourceHash !== undefined) {
    const freshness = repairSourceFreshness(a.repairSourceHash, currentRepairSourceHash);
    if (repairSourceFreshness(currentRepairSourceHash, currentRepairSourceHash).status === 'missing') {
      p.push('nema otiska aktualnog koda popravka');
    } else if (freshness.status === 'stale') {
      p.push('kod popravka promijenjen nakon mjerenja');
    }
  }
  if (!a.measuredFromCommit) p.push('nema commita nad kojim je mjereno');
  // Vrijeme mjerenja je ono sto potpis pokriva; bez njega gard "potpis stariji od mjerenja" nema sto
  // usporediti i tiho prolazi. Do 2026-09-05 ga je skripta izmisljala (`new Date()` pri pisanju ovjere).
  if (!a.measuredAt || !Number.isFinite(Date.parse(a.measuredAt))) p.push('nema vremena mjerenja');
  if (!Array.isArray(a.entries) || a.entries.length === 0) p.push('nema nijednog mjerenog profila');
  // T83: mjerenje koje je isti rad brojalo vise puta napuhuje documentCount i cleanCount po skupini.
  const dvostruki = a.protocol?.duplicateDocumentCount;
  if (typeof dvostruki === 'number' && dvostruki > 0) p.push('mjerenje je iste dokumente brojalo vise puta');
  // T83 (Codex #185, T83-04): v2 ovjera mora nositi uskladjena brojcana polja; nepoznata verzija otiska
  // se ne tumaci.
  //
  // T75: v1 ovjera (bez polja, otisak s ponavljanjima) VISE NIJE DOKAZ. Potpisana v1 ovjera a74d93d5
  // brojala je 102 rada dvaput; T75 je u istom commitu zamjenjuje v2 ovjerom istog skupa. v2 mora nositi
  // i otisak koda popravka nad kojim je mjereno (T74), inace se ne zna koji je kod dokazan.
  const verzija = a.fingerprintVersion;
  if (verzija === undefined || verzija === 1) p.push('ovjera v1 (otisak s ponavljanjima) vise nije dokaz');
  else if (verzija !== 2) p.push('nepoznata verzija otiska korpusa');
  const kod = measuredCodeProblem(a);
  if (kod) p.push(kod);
  if (verzija === 2) {
    const pr = a.protocol;
    const cijeli = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
    if (
      !pr ||
      pr.duplicateDocumentCount !== 0 ||
      !cijeli(pr.uniqueDocumentCount) ||
      !cijeli(pr.rawDocumentCount) ||
      !cijeli(pr.countedDocumentCount) ||
      pr.rawDocumentCount < pr.uniqueDocumentCount ||
      pr.countedDocumentCount > pr.uniqueDocumentCount ||
      pr.holdoutDocumentCount > pr.uniqueDocumentCount
    ) {
      p.push('ovjera v2 nema uskladjene brojeve dokumenata');
    } else {
      // T83-07 (Codex #185, runda 2): agregati moraju biti dosljedni medjusobno. Zbroj `documentCount`
      // po skupinama NIJE jednak broju jedinstvenih (dokument profila s vise vrsta rada ulazi u svaku;
      // izmjereno 27. 9.: 290 prema 219), ali nijedna skupina ne smije imati vise dokumenata od
      // uracunatih, ni vise cistih od mjerenih, a dokazna skupina trazi bar jedan uracunat dokument.
      const counted = pr.countedDocumentCount as number;
      const dokazne = Array.isArray(a.entries) ? a.entries.filter((e) => e.documentCount > 0) : [];
      const neskladne = (Array.isArray(a.entries) ? a.entries : []).some(
        (e) => e.cleanCount > e.documentCount || e.documentCount > counted || e.cleanCount < 0 || e.documentCount < 0,
      );
      if (neskladne || (dokazne.length > 0 && counted === 0)) p.push('ovjera v2: brojke po skupini ne odgovaraju broju dokumenata');
    }
    const potpis = signedContentProblem(a);
    if (potpis) p.push(potpis);
  }

  // POTPIS NE SMIJE BITI STARIJI OD MJERENJA KOJE POKRIVA.
  //
  // Izmjereno 2026-09-04: ovjera je nosila potpis od 21:50 i mjerenje od 23:04, dakle 74 minute
  // KASNIJE. Datoteka je time tvrdila da je covjek ovjerio brojke koje u trenutku potpisa nisu
  // postojale. Nijedna postojeca provjera to nije vidjela: sve su gledale POSTOJI li potpis, nikad
  // sto pokriva.
  //
  // Nastalo je bez ičije namjere, mehanicki: mjerenje je ponovljeno nakon sto je zatvorena
  // regresija, a potpis je prenesen iz prethodne ovjere. Zato je i gard mehanicki.
  if (a.signedAt && a.measuredAt) {
    const potpis = Date.parse(a.signedAt);
    const mjerenje = Date.parse(a.measuredAt);
    if (Number.isFinite(potpis) && Number.isFinite(mjerenje) && potpis < mjerenje) {
      p.push('potpis je stariji od mjerenja koje pokriva');
    }
  }

  return p;
}

/** Oba oblika para dijele istu provjeru potpisa, otiska i cistog mjerenja. */
function provenPairs(
  a: CorpusAttestation | null | undefined,
  currentRepairSourceHash: string | null | undefined,
  keys: (entry: CorpusAttestationEntry) => readonly string[],
): Set<string> {
  if (attestationProblems(a, currentRepairSourceHash).length > 0) return new Set();
  const out = new Set<string>();
  for (const e of a!.entries) {
    if (e.documentCount > 0 && e.cleanCount > 0 && e.regressedChecks.length === 0) {
      for (const key of keys(e)) out.add(key);
    }
  }
  return out;
}

/**
 * Parovi `unitId::workType` kojima ovjera daje dokaz na stvarnom radu.
 *
 * Par ulazi SAMO ako je barem jedan rad zavrsio cisto I nijedna provjera nije regresirala. Mjerenje
 * koje je naslo regresiju nije dokaz da popravak radi; ono je dokaz da ne radi.
 */
export function provenUnitWorkTypes(
  a: CorpusAttestation | null | undefined,
  currentRepairSourceHash?: string | null,
): Set<string> {
  return provenPairs(a, currentRepairSourceHash, (e) => [`${e.unitId}::${e.workType}`]);
}

/**
 * Parovi `unitId::workType` kojima PDF ovjera daje dokaz na javnom radu pretvorenom iz PDF-a (razina
 * `A-pdf`). Isti uvjet cistoce kao `provenUnitWorkTypes`, ali preko `pdfAttestationProblems`. Rezultat
 * NIKAD ne ulazi u os `proof` ni u `claim`; ledger ga biljezi zasebno (`pdfProof`, `pdfClaim`).
 */
export function provenPdfUnitWorkTypes(a: CorpusAttestation | null | undefined): Set<string> {
  if (pdfAttestationProblems(a).length > 0) return new Set();
  return cleanUnitWorkTypes(a!);
}

function cleanUnitWorkTypes(a: CorpusAttestation): Set<string> {
  const out = new Set<string>();
  for (const e of a.entries) {
    if (e.documentCount > 0 && e.cleanCount > 0 && e.regressedChecks.length === 0) {
      out.add(`${e.unitId}::${e.workType}`);
    }
  }
  return out;
}

/**
 * Parovi `profileId::workType` na cijim je dokumentima dokaz STVARNO izmjeren (polje `profileIds`
 * dokazanog unosa). Razlika prema `provenUnitWorkTypes` je razlika izmedju izmjerenog i izvedenog:
 * ovjera dokazuje par jedinica x vrsta rada za sve profile te jedinice, ali su radovi dosli iz
 * profila koje unos imenuje. Ledger tu razliku biljezi kao `proofSource` (vanjski audit
 * 2026-09-08, nalaz 4: sucelje je 12 izmjerenih i 19 izvedenih profila pokrivalo istom recenicom).
 * Isti uvjet cistoce kao za par: unos s regresijom nista ne dokazuje.
 */
export function attestedProfileWorkTypes(
  a: CorpusAttestation | null | undefined,
  currentRepairSourceHash?: string | null,
): Set<string> {
  return provenPairs(a, currentRepairSourceHash, (e) => (e.profileIds ?? []).map((p) => `${p}::${e.workType}`));
}
