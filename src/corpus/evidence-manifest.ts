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
 *
 * STO OVAJ MODUL JOS NE RADI, da se ne bi krivo citalo: `countsAsRealDocxProof` NIJE ozicen ni na
 * jedna vrata. Citaju ga samo vlastiti test, jedna mutacija u `tests/gate-mutations.test.ts` i
 * izvjestajna skripta `scripts/corpus-evidence.mts`. Nijedan harness zasad ne odbija run zbog
 * manifesta: modul MJERI, ne provodi. Provedba je zaseban zahvat i vlasnikova odluka, jer bi u
 * zatecenom stanju odbila sva 246 dokumenta.
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

/**
 * Sto je RENDERIRANI dokument pokazao. Ovo je treci orakul i on zatvara jedinu rupu koju
 * `expected` i Lekta zajedno ne vide: obje strane citaju OOXML, pa ako Word RENDERIRA drukcije nego
 * sto XML sugerira (nasljedjivanje stilova, tematski fontovi, `w:szCs`, postavke kompatibilnosti),
 * mogu se sloziti i obje biti u krivu o tome sto student stvarno vidi.
 *
 * ZASTO OVO ZAMJENJUJE LJUDSKO OKO. Pitanje "poklapa li se ono sto se vidi s onim sto smo izmjerili"
 * nije stvar prosudbe nego mjerenja, samo drugim alatom. Word preko COM-a (`scripts/word-verify/`)
 * na njega odgovara, i to ponovljivo. Covjek ostaje nuzan za nesto drugo: za potpis METODE, jednom,
 * ne za svaki dokument.
 */
export interface RenderOracle {
  /** Koji alat je renderirao; mora biti razlicit od Lekte i od `expected` orakula. */
  tool?: string;
  ranAt?: string;
  /** Je li se dokument uopce otvorio bez popravka (Word: OpenAndRepair=false). */
  opened?: boolean;
  /** Poklapaju li se renderirane vrijednosti s izmjerenima. */
  matches?: boolean;
  note?: string;
}

/**
 * Potpis METODE, ne dokumenta. Razina A je javna tvrdnja prema fakultetima ("dokazano na stvarnom
 * studentskom radu"), pa netko mora stati iza toga da je metoda dovoljna. To je prosudba o RIZIKU,
 * ne mjerenje, i zato je jedina stvar koja ostaje covjeku. Potpisuje se JEDNOM za metodu, a ne
 * cetrdeset puta za cetrdeset dokumenata.
 */
export interface ProofMethod {
  signedBy?: string;
  signedAt?: string;
  /** Popis neovisnih implementacija koje se moraju sloziti. Manje od dvije nije unakrsna provjera. */
  oracles?: string[];
  note?: string;
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
  /** Treci orakul: sto je pokazao RENDERIRANI dokument. Zamjenjuje ljudsko oko za to pitanje. */
  renderOracle?: RenderOracle;
}

/** Razlog zbog kojeg dokument JOS NE vrijedi kao dokaz. Prazan popis znaci da vrijedi. */
export type ManifestGap =
  | 'nema-ocekivanja'
  | 'ocekivanje-bez-datuma'
  | 'ocekivanje-bez-potpisa'
  | 'ocekivanje-zapisano-nakon-runa'
  | 'nema-provjere-renderiranog'
  | 'render-orakul-nije-otvorio'
  | 'render-orakul-se-ne-slaze'
  | 'pregled-bez-potpisa'
  | 'pregled-odstupa-neobjasnjeno';

/** Rupe u POTPISU METODE; odvojene od dokumenta, jer se metoda potpisuje jednom za sve. */
export type MethodGap = 'metoda-nije-potpisana' | 'metoda-bez-potpisnika' | 'premalo-orakula';

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
  // Sam DATUM ("2026-08-30") razrjesava se na ponoc UTC, pa bi svaki run istoga dana prosao kao
  // "poslije zapisa". Ocekivanje mora nositi TRENUTAK, inace se ne moze tvrditi da je prethodilo.
  if (!/\d{2}:\d{2}/.test(recorded)) return false;
  const at = Date.parse(recorded);
  if (Number.isNaN(at)) return false;
  // Sortiranje po VREMENU, ne leksikografski: uz razlicite vremenske zone leksikografski prvi niz
  // nije kronoloski prvi run, pa bi manifest sa zapisom NAKON stvarnog prvog runa prosao kao dokaz.
  const runs = (manifest.runs ?? [])
    .filter(isNonEmpty)
    .map((r) => Date.parse(r))
    .filter((t) => !Number.isNaN(t));
  if (runs.length !== (manifest.runs ?? []).filter(isNonEmpty).length) return false;
  if (!runs.length) return true;
  return at < Math.min(...runs);
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
  // PITANJE "poklapa li se ono sto se vidi s izmjerenim" smije zatvoriti ILI stroj ILI covjek.
  // Ranije je trazilo iskljucivo covjeka, i to je bila greska u dizajnu: tjeralo je potpis po
  // dokumentu (48 puta) za nesto sto je mjerenje, samo drugim alatom.
  const render = manifest.renderOracle;
  const review = manifest.visualReview;
  const hasRender = Boolean(render && isNonEmpty(render.tool));
  const hasReview = Boolean(review && isNonEmpty(review.verdict));

  if (!hasRender && !hasReview) gaps.push('nema-provjere-renderiranog');
  if (hasRender) {
    if (render!.opened === false) gaps.push('render-orakul-nije-otvorio');
    if (render!.matches !== true) gaps.push('render-orakul-se-ne-slaze');
  }
  if (hasReview) {
    if (!isNonEmpty(review!.reviewedBy)) gaps.push('pregled-bez-potpisa');
    if (review!.verdict === 'odstupa-neobjasnjeno') gaps.push('pregled-odstupa-neobjasnjeno');
  }
  return gaps;
}

/**
 * Je li METODA potpisana. Trazi se najmanje DVA orakula: jedan alat koji sam sebe potvrdjuje nije
 * unakrsna provjera, sto je ovaj repozitorij vec izmjerio (FER pilot: 7/7 doslovnih citata, 4 od 5
 * tvrdnji oboreno).
 */
export function proofMethodGaps(method: ProofMethod | null | undefined): MethodGap[] {
  const gaps: MethodGap[] = [];
  if (!method || !isNonEmpty(method.signedAt)) gaps.push('metoda-nije-potpisana');
  if (!method || !isNonEmpty(method.signedBy)) gaps.push('metoda-bez-potpisnika');
  if (!method || !Array.isArray(method.oracles) || method.oracles.filter(isNonEmpty).length < 2) {
    gaps.push('premalo-orakula');
  }
  return gaps;
}

/**
 * Smije li ovaj dokument brojati kao `real-docx-pass`, dakle kao dokaz koji nosi razinu A.
 *
 * Deny-by-default: sve sto nije uredno je NIJE dokaz. Dokument bez manifesta se time ne odbacuje iz
 * korpusa, samo ne broji kao dokaz; mjerenje strukture i intake granica na njemu i dalje vrijedi.
 */
export function countsAsRealDocxProof(
  manifest: EvidenceManifest,
  method?: ProofMethod | null,
): boolean {
  return manifestGaps(manifest).length === 0 && proofMethodGaps(method).length === 0;
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
