/**
 * JEZGRA MJERENJA POPRAVKA: jedan dokument kroz lanac koji korisnik stvarno izvodi.
 *
 * Dijele je `measure.mts` (citljiv ispis nad punim generiranim skupom) i `repair-net.mts` (artefakt
 * i ratchet nad commitanim podskupom). Bez ovog izdvajanja bi dva alata mjerila "isto" na dva nacina,
 * sto je razred kvara koji je repozitorij vec platio: real-corpus harness je sastavljao popravke na
 * svoj nacin i zato godinama mjerio uzu povrsinu od one koju korisnik dobije.
 *
 * KLJUCNO SE BILJEZI RAZLOG, ne samo cinjenica. `applyFixers` vraca `skippedReasons`
 * (`already-ok`, `no-target`, `invalid-params`, `unsupported-structure`, `stale-anchor`), i taj
 * podatak danas ne ulazi ni u jedan artefakt; citaju ga samo sucelje i Edge funkcija. Bez njega je
 * "fixer nije nista promijenio" gola zastavica koja jednako opisuje ispravno ponasanje
 * (`already-ok`) i pravi kvar (`no-target` ondje gdje meta postoji).
 */
import { readFileSync } from 'node:fs';
import { analyzeFixture, resolveProfile } from '../../src/analysis/golden-entry';
import { ensureTemplatesHeavy, selectTemplate } from '../../src/title-pages/template-loader';
import { repairEntriesFor } from '../../src/profiles/profile-runtime-maps';
import { buildAllRepairableItems } from '../../src/ui/repair-item-assembly';
import { buildDefaultRepairRequests, hasActionableParams } from '../../src/repair/default-selection';
import { applyFixers } from '../../src/repair/apply-fixers';
import { detectPassRegressions } from '../../src/analysis/repair-regression';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface DocumentMeasurement {
  dokument: string;
  profileId: string | null;
  /** Provjere koje su pale PRIJE popravka, po stabilnom id-u. */
  paloPrije: string[];
  /** Fixeri koje je zadani odabir zatrazio. */
  zatrazeno: string[];
  /** Fixeri koji su proizveli unos u changelogu. */
  promijenili: string[];
  /** Fixeri zatrazeni bez ijedne promjene, s razlogom kad ga motor zna. */
  bezUcinka: Array<{ fixerId: string; reason: string }>;
  /**
   * Fixeri cijem zahtjevu params NE nose posao, dakle ceka se ljudska potvrda.
   *
   * Bez ovoga mreza NE MOZE razlikovati dva stanja koja izgledaju jednako: fixer koji se pokvario i
   * fixer koji po konstrukciji ceka covjeka. `consistency-fixer` gradi svaki odabir s `confirmed`
   * koji zadani odabir ne moze postaviti, pa je na svih 24 dokumenta slan s `groups: []` i
   * `replacements: []`; `citation-bibliography-sync-fixer` isto, kroz formu. Repozitorij tu razliku
   * vec zna (`hasActionableParams`, izmjereno 2026-08-29 na 116 stvarnih radova), samo ju mreza nije
   * koristila, pa je oba zvala MRTVIMA. Da se jedan od njih doista pokvari, izgledalo bi identicno.
   */
  cekaPotvrdu: string[];
  /**
   * Predlozak naslovnice koji je mjerenje izvelo za ovaj dokument, ili `null` kad ga nema.
   *
   * BROJAC MEHANIZMA, ne ukras. Do 2026-09-13 je ovdje stajao tvrdi `titleTemplate: null` uz
   * napomenu da je odabir predloska korak u sucelju, pa `title-page-fixer` nije bio pozvan NIJEDNOM,
   * a nizvodne mjere (broj zatrazenih fixera, pokrivenost) to nisu mogle razlikovati od fixera koji
   * se nudi i nema sto raditi. Bez vlastitog brojaca bi povratak na `null` opet bio nevidljiv.
   */
  titleTemplateId: string | null;
  rijeseno: string[];
  nerijeseno: string[];
  regresije: string[];
  integrityFailure: string | null;
}

/** Provjere koje se BODUJU i nisu prosle; `max === 0` je informativna i ne broji se. */
function failingChecks(checks: Array<{ id?: string; status?: string; max?: number }>): string[] {
  return checks
    .filter((c) => c.id && (c.max ?? 0) > 0 && c.status !== 'pass')
    .map((c) => c.id as string)
    .sort();
}

/**
 * Odabir iz kojeg se izvodi predlozak naslovnice, isti par koji sucelje ima u stanju rezultata
 * (`r.settings.selectionIds.unit`, `r.settings.workType`).
 */
export interface TitleSelection {
  unitId?: string | null;
  workType?: string | null;
}

/**
 * Predlozak naslovnice za (jedinica, vrsta rada), ISTOM funkcijom kojom ga izvodi aplikacija.
 *
 * `src/ui/app.ts` (renderRepairSection) zove `selectTemplate(unitId, workType)` iz
 * `src/title-pages/template-loader.ts`; ta je funkcija cista i mjerenje ju moze pozvati jednako.
 * Tvrdnja da je odabir predloska "korak u sucelju" bila je netocna i drzala je `title-page-fixer`
 * izvan svakog mjerenja.
 *
 * Pozivatelj mora prije ovoga awaitati `ensureTemplatesHeavy()`, inace predlozak nema `elements` i
 * plan naslovnice tiho ispadne prazan.
 */
export function titleTemplateFor(selection: TitleSelection | null | undefined) {
  if (!selection?.unitId) return null;
  return selectTemplate(selection.unitId, selection.workType || 'final').template;
}

export async function measureDocument(
  path: string,
  profileId: string | null,
  selection?: TitleSelection | null,
): Promise<DocumentMeasurement> {
  await ensureTemplatesHeavy();
  const bytes = new Uint8Array(readFileSync(path));
  const naziv = path.split(/[\\/]/).pop() as string;
  const before = await analyzeFixture(new File([bytes], naziv, { type: DOCX_MIME }), {
    profileId: profileId ?? undefined,
  });

  // ISTI sastavljac i isti ulazi koje koristi sucelje. `entries` su nuzni: sedam asistiranih
  // graditelja cita `profile.ruleEntries`, kojega `resolveProfile` nema, pa bi bez njih ti fixeri
  // bili mrtvi bez ijedne poruke.
  const profile = profileId ? resolveProfile(profileId) : null;
  const titleTemplate = titleTemplateFor(selection);
  const items = buildAllRepairableItems({
    result: before,
    profile,
    entries: profileId ? repairEntriesFor(profileId) : [],
    // Naslovnica NE trazi UI korak: predlozak se izvodi istom cistom funkcijom koju zove sucelje.
    titleTemplate,
  });
  const requests = buildDefaultRepairRequests(items);
  const applied = await applyFixers(bytes, requests);

  const after = await analyzeFixture(new File([applied.docxBytes], `${naziv}-popravljen.docx`, { type: DOCX_MIME }), {
    profileId: profileId ?? undefined,
  });

  const prije = failingChecks(before.checks ?? []);
  const poslije = failingChecks(after.checks ?? []);
  const zatrazeno = [...new Set(requests.map((r) => r.fixerId))].sort();
  const promijenili = [...new Set((applied.changelog ?? []).map((c: { fixerId?: string }) => c.fixerId))]
    .filter((x): x is string => Boolean(x))
    .sort();

  // Razlog je kljucan po `ruleId`, a mjerenje ide po fixeru, pa se preslikava kroz same zahtjeve.
  // Fixer bez zapisa nije "uredan": motor razlog nije klasificirao (npr. fixer je bacio), i to se
  // imenuje kao `nepoznato` umjesto da se presuti.
  const razlogPoPravilu = applied.skippedReasons ?? {};
  const bezUcinka = zatrazeno
    .filter((f) => !promijenili.includes(f))
    .map((fixerId) => {
      const pravila = requests.filter((r) => r.fixerId === fixerId).map((r) => r.ruleId);
      const razlozi = [...new Set(pravila.map((rid) => razlogPoPravilu[rid]).filter(Boolean))];
      return { fixerId, reason: razlozi.length ? razlozi.sort().join('|') : 'nepoznato' };
    });

  // Ceka potvrdu = NIJEDAN od zahtjeva tog fixera ne nosi posao. Ako makar jedan nosi, fixer je
  // imao priliku i njegov izostanak ucinka je nalaz, ne stanje forme.
  const cekaPotvrdu = zatrazeno.filter((f) =>
    requests.filter((r) => r.fixerId === f).every((r) => !hasActionableParams(r.params as Record<string, unknown>, f)),
  );

  return {
    dokument: naziv,
    profileId,
    paloPrije: prije,
    zatrazeno,
    promijenili,
    bezUcinka,
    cekaPotvrdu,
    titleTemplateId: titleTemplate?.id ?? null,
    rijeseno: prije.filter((id) => !poslije.includes(id)),
    nerijeseno: poslije.filter((id) => prije.includes(id)),
    regresije: detectPassRegressions(before.checks ?? [], after.checks ?? []).map((r: unknown) =>
      typeof r === 'string' ? r : JSON.stringify(r),
    ),
    integrityFailure: (applied as { integrityFailure?: unknown }).integrityFailure
      ? String((applied as { integrityFailure?: unknown }).integrityFailure)
      : null,
  };
}

export interface FixerRow {
  fixerId: string;
  requested: number;
  changed: number;
  /** Razlozi izostanka ucinka, histogram po vrijednosti `FixerNoOpReason`. */
  reasons: Record<string, number>;
  /** Dokumenti na kojima je zatrazen a nije promijenio nista. */
  deadOn: string[];
  /** Na koliko je dokumenata zahtjev bio bez posla, dakle cekao ljudsku potvrdu. */
  awaitingConfirmation: number;
}

/** Agregat po fixeru; ulaz su mjerenja pojedinih dokumenata. */
export function aggregateByFixer(mjerenja: readonly DocumentMeasurement[]): FixerRow[] {
  const map = new Map<string, FixerRow>();
  for (const m of mjerenja) {
    for (const f of m.zatrazeno) {
      const row = map.get(f) ?? { fixerId: f, requested: 0, changed: 0, reasons: {}, deadOn: [], awaitingConfirmation: 0 };
      row.requested += 1;
      if (m.cekaPotvrdu.includes(f)) row.awaitingConfirmation += 1;
      if (m.promijenili.includes(f)) row.changed += 1;
      else {
        row.deadOn.push(m.dokument);
        const reason = m.bezUcinka.find((b) => b.fixerId === f)?.reason ?? 'nepoznato';
        row.reasons[reason] = (row.reasons[reason] ?? 0) + 1;
      }
      map.set(f, row);
    }
  }
  return [...map.values()].sort((a, b) => a.fixerId.localeCompare(b.fixerId, 'en'));
}

/**
 * Fixeri koji su zatrazeni a nisu promijenili NISTA ni na jednom dokumentu.
 *
 * Fixer cijem je zahtjevu params BEZ POSLA na svakom dokumentu nije mrtav nego ceka ljudsku
 * potvrdu, i tu se razliku mora povuci ovdje: bez nje mrtav popis mijesa kvar sa stanjem forme, pa
 * bi stvaran kvar tih fixera bio nevidljiv, jer izgleda tocno kao danasnje stanje.
 */
export function deadFixers(rows: readonly FixerRow[]): string[] {
  return rows
    .filter((r) => r.requested > 0 && r.changed === 0 && r.awaitingConfirmation < r.requested)
    .map((r) => r.fixerId);
}

/** Fixeri koji ni na jednom dokumentu nisu dobili zahtjev s poslom; cekaju covjeka, nisu mrtvi. */
export function awaitingConfirmationFixers(rows: readonly FixerRow[]): string[] {
  return rows
    .filter((r) => r.requested > 0 && r.changed === 0 && r.awaitingConfirmation === r.requested)
    .map((r) => r.fixerId);
}

/**
 * BROJAC MEHANIZMA NASLOVNICE. Odgovara na pitanje na koje nizvodne mjere ne odgovaraju: je li
 * mjerenje predlozak uopce IZVELO, koliko je puta stavka izgradjena i koliko puta je fixer doista
 * promijenio dokument.
 *
 * Postoji zato sto se ista rupa vec dogodila: `titleTemplate: null` je bio tvrdo upisan na dva
 * mjesta, fixer nije bio pozvan nijednom, a nijedna nizvodna brojka to nije razlikovala od fixera
 * koji se nudi pa nema sto raditi. Brojac na nuli znaci MRTAV MEHANIZAM, ma sto matrica pokazivala.
 */
export interface TitlePageMechanism {
  documentCount: number;
  withTemplate: number;
  offered: number;
  changed: number;
}

export function titlePageMechanism(measurements: DocumentMeasurement[]): TitlePageMechanism {
  return {
    documentCount: measurements.length,
    withTemplate: measurements.filter((m) => m.titleTemplateId).length,
    offered: measurements.filter((m) => m.zatrazeno.includes('title-page-fixer')).length,
    changed: measurements.filter((m) => m.promijenili.includes('title-page-fixer')).length,
  };
}

/**
 * Presuda nad brojacem: prazan niz znaci da je mehanizam ziv, inace imenuje sto je otkazalo.
 *
 * Prag je NULA, ne postotak: predlozak postoji za dio jedinica, a plan naslovnice uz to trazi
 * `verified` + `official` predlozak, pouzdano omedjenu prvu stranicu i nijedan odlomak u tablici.
 * Koliko ce ih proci je svojstvo korpusa; da NIJEDAN ne prodje znaci da je putanja mrtva.
 */
export function titlePageMechanismProblems(m: TitlePageMechanism): string[] {
  const problems: string[] = [];
  if (!m.documentCount) problems.push('mjerenje nema nijedan dokument, pa brojac ne znaci nista');
  if (m.documentCount && !m.withTemplate) {
    problems.push('nijedan dokument nije izveo predlozak naslovnice (je li `titleTemplate` opet tvrdi null?)');
  }
  if (m.withTemplate && !m.offered) {
    problems.push('predlozak je izveden, a stavka naslovnice nije izgradjena ni jednom');
  }
  if (m.offered && !m.changed) {
    problems.push('stavka naslovnice je zatrazena, a fixer nije promijenio nijedan dokument');
  }
  return problems;
}
