/**
 * MANIFEST DOKAZA: kada pokretanje Lekte nad stvarnim radom vrijedi kao DOKAZ, a kada je samo run.
 *
 * Modul NEMA nijedan uvoz, namjerno, iz istog razloga kao `tests/real-corpus/corpus-track.ts`:
 * zid mora biti dostupan mutacijskom testu bez povlacenja analize i motora popravka.
 *
 * ZASTO POSTOJI. Do sada je "dokaz na stvarnom radu" znacio samo da je harness prosao bez pada.
 * Takav run ne moze NE slagati se s ocekivanjem, jer ocekivanja nema: sto god alat javi, to se
 * upise kao ishod. To je isti razred kvara koji je ovaj repozitorij vec dvaput imenovao - vise
 * prolaza ISTIM alatom nije provjera, a boolean nad pragom nije nalaz.
 *
 * Manifest uvodi dvije stvari koje run ne moze sam sebi dati:
 *
 *   1. OCEKIVANJE ZAPISANO PRIJE POKRETANJA. Covjek unaprijed kaze sto bi alat trebao naci. Ako se
 *      zapise poslije, to vise nije predvidjanje nego prepricavanje ishoda, pa `expectationPrecedesRun`
 *      trazi da je `recordedAt` STROGO prije prvog runa. Bez toga se neslaganje ne moze ni dogoditi.
 *   2. POTPIS VIZUALNOG PREGLEDA. Netko je otvorio dokument i rekao slaze li se ono sto vidi s onim
 *      sto je alat javio. Bez toga se ne zna je li "prosao" znacilo "tocan" ili "nije se srusio".
 *
 * Manifest NE ocjenjuje sadrzaj rada i ne dira dokument: on biljezi ocekivanje i ljudsku presudu.
 */

/** Ishod usporedbe onoga sto je covjek ocekivao i onoga sto je alat javio. */
export type ReviewVerdict =
  /** Alat je nasao ono sto je covjek ocekivao. */
  | 'slaze-se'
  /** Alat i covjek se razilaze, i razlika je objasnjena u biljesci. Dokaz vrijedi, nalaz je poznat. */
  | 'odstupa-objasnjeno'
  /** Razilaze se, razlog nije poznat. NIKAD ne vrijedi kao dokaz. */
  | 'odstupa-neobjasnjeno';

export interface ExpectedFinding {
  /** Stabilan identitet provjere (`page.margins`, `format.font.dominant`...). */
  checkId: string;
  /** Ocekuje li covjek da provjera PADA na ovom radu. */
  expectFail: boolean;
  /** Zasto to ocekuje; kratka ljudska recenica, ne strojni ispis. */
  because?: string;
}

export interface EvidenceManifest {
  expected?: {
    findings?: ExpectedFinding[];
    /** ISO datum kad je ocekivanje ZAPISANO. Mora biti prije prvog runa. */
    recordedAt?: string;
    /** Tko je zapisao ocekivanje. */
    recordedBy?: string;
  };
  visualReview?: {
    reviewedAt?: string;
    reviewedBy?: string;
    verdict?: ReviewVerdict;
    note?: string;
  };
  /** ISO datumi pokretanja harnessa nad ovim dokumentom, najstariji prvi. */
  runs?: string[];
}

/** Razlog zbog kojeg dokument JOS NE vrijedi kao dokaz. Prazan popis znaci da vrijedi. */
export type ManifestGap =
  | 'nema-ocekivanja'
  | 'ocekivanje-bez-datuma'
  | 'ocekivanje-bez-potpisa'
  | 'ocekivanje-zapisano-nakon-runa'
  | 'nema-vizualnog-pregleda'
  | 'pregled-bez-potpisa'
  | 'pregled-odstupa-neobjasnjeno';

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Je li ocekivanje zapisano PRIJE prvog pokretanja. Bez runa je odgovor `true`: ocekivanje koje jos
 * nije provjereno nije nevaljano, samo neiskusano.
 *
 * Usporedba je STROGA (`<`), ne `<=`: isti timestamp znaci da je zapis nastao u istom potezu kao run,
 * a upravo to je obrazac koji se zeli sprijeciti.
 */
export function expectationPrecedesRun(manifest: EvidenceManifest): boolean {
  const recorded = manifest.expected?.recordedAt;
  if (!isNonEmpty(recorded)) return false;
  const runs = (manifest.runs ?? []).filter(isNonEmpty).sort();
  if (!runs.length) return true;
  return new Date(recorded).getTime() < new Date(runs[0]).getTime();
}

/** Svi razlozi zbog kojih dokument ne vrijedi kao dokaz; prazan popis znaci da vrijedi. */
export function manifestGaps(manifest: EvidenceManifest): ManifestGap[] {
  const gaps: ManifestGap[] = [];
  const expected = manifest.expected;
  if (!expected || !Array.isArray(expected.findings) || expected.findings.length === 0) {
    gaps.push('nema-ocekivanja');
  } else {
    if (!isNonEmpty(expected.recordedAt)) gaps.push('ocekivanje-bez-datuma');
    else if (!expectationPrecedesRun(manifest)) gaps.push('ocekivanje-zapisano-nakon-runa');
    if (!isNonEmpty(expected.recordedBy)) gaps.push('ocekivanje-bez-potpisa');
  }
  const review = manifest.visualReview;
  if (!review || !isNonEmpty(review.verdict)) gaps.push('nema-vizualnog-pregleda');
  else {
    if (!isNonEmpty(review.reviewedBy)) gaps.push('pregled-bez-potpisa');
    if (review.verdict === 'odstupa-neobjasnjeno') gaps.push('pregled-odstupa-neobjasnjeno');
  }
  return gaps;
}

/**
 * Smije li ovaj dokument brojati kao `real-docx-pass`, dakle kao dokaz koji nosi razinu A.
 *
 * Deny-by-default: sve sto nije uredno je NIJE dokaz. Dokument bez manifesta se time ne odbacuje iz
 * korpusa, samo ne broji kao dokaz; mjerenje strukture i intake granica na njemu i dalje vrijedi.
 */
export function countsAsRealDocxProof(manifest: EvidenceManifest): boolean {
  return manifestGaps(manifest).length === 0;
}

/**
 * Slaze li se ono sto je alat javio s onim sto je covjek ocekivao, po provjerama.
 *
 * Vraca imenovane razlike, ne broj: presuda po tvrdnji trazi da se vidi KOJA provjera odstupa.
 * Provjere koje covjek nije ocekivao se NE prijavljuju kao razlika - ocekivanje je popis onoga na
 * sto se pazi, ne potpun opis dokumenta.
 */
export function compareExpectedToActual(
  expected: ExpectedFinding[],
  actual: Array<{ id?: string; status?: string }>,
): { agreed: string[]; disagreed: Array<{ checkId: string; expectFail: boolean; actualStatus: string | null }> } {
  const byId = new Map<string, string>();
  for (const check of actual) {
    if (isNonEmpty(check.id)) byId.set(check.id, String(check.status ?? ''));
  }
  const agreed: string[] = [];
  const disagreed: Array<{ checkId: string; expectFail: boolean; actualStatus: string | null }> = [];
  for (const e of expected) {
    const status = byId.has(e.checkId) ? (byId.get(e.checkId) as string) : null;
    const actuallyFailed = status !== null && status !== 'pass';
    if (status !== null && actuallyFailed === e.expectFail) agreed.push(e.checkId);
    else disagreed.push({ checkId: e.checkId, expectFail: e.expectFail, actualStatus: status });
  }
  return { agreed, disagreed };
}
