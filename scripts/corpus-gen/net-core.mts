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
import { repairEntriesFor } from '../../src/profiles/profile-runtime-maps';
import { buildAllRepairableItems } from '../../src/ui/repair-item-assembly';
import { buildDefaultRepairRequests } from '../../src/repair/default-selection';
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

export async function measureDocument(path: string, profileId: string | null): Promise<DocumentMeasurement> {
  const bytes = new Uint8Array(readFileSync(path));
  const naziv = path.split(/[\\/]/).pop() as string;
  const before = await analyzeFixture(new File([bytes], naziv, { type: DOCX_MIME }), {
    profileId: profileId ?? undefined,
  });

  // ISTI sastavljac i isti ulazi koje koristi sucelje. `entries` su nuzni: sedam asistiranih
  // graditelja cita `profile.ruleEntries`, kojega `resolveProfile` nema, pa bi bez njih ti fixeri
  // bili mrtvi bez ijedne poruke.
  const profile = profileId ? resolveProfile(profileId) : null;
  const items = buildAllRepairableItems({
    result: before,
    profile,
    entries: profileId ? repairEntriesFor(profileId) : [],
    titleTemplate: null, // naslovnica trazi UI odabir predloska, pa je izvan mjerenja
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

  return {
    dokument: naziv,
    profileId,
    paloPrije: prije,
    zatrazeno,
    promijenili,
    bezUcinka,
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
}

/** Agregat po fixeru; ulaz su mjerenja pojedinih dokumenata. */
export function aggregateByFixer(mjerenja: readonly DocumentMeasurement[]): FixerRow[] {
  const map = new Map<string, FixerRow>();
  for (const m of mjerenja) {
    for (const f of m.zatrazeno) {
      const row = map.get(f) ?? { fixerId: f, requested: 0, changed: 0, reasons: {}, deadOn: [] };
      row.requested += 1;
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

/** Fixeri koji su zatrazeni a nisu promijenili NISTA ni na jednom dokumentu. */
export function deadFixers(rows: readonly FixerRow[]): string[] {
  return rows.filter((r) => r.requested > 0 && r.changed === 0).map((r) => r.fixerId);
}
