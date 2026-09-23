import { VERIFIED_PROFILE_REGISTRY } from '../profiles/profile-registry';
import { ZAGREB_CATALOG, allUnits } from '../catalog/catalog-loader';
import { CORPUS_STATS } from './coverage-loader';
import type { WorkType } from '../ui/work-selection';

/**
 * Formula brojki za traku, IZDVOJENA da je generator i test dijele s bivsim zivim prikazom
 * (`renderHeroCoverage` u app.ts racunao je isto): broj verificiranih profila, broj ustanova iz
 * kataloga s barem jednom jedinicom koja ima verificiran profil, i broj javnih radova iz M4 korpusa.
 *
 * NE UVOZI SE U ULAZ `/`: ovaj modul vuce registar profila i katalog. Ulaz cita pecen JSON.
 */

/**
 * Jedna jedinica u pecenom indeksu.
 *
 * NOSI SAMO `kratica`, IAKO JE NALOG F8 TRAZIO I `naziv`, i to iz dva izmjerena razloga:
 *
 *   1. JEDAN IZVOR. Naziv jedinice VEC ima izvor (`data/catalog/zagreb-catalog.json`, polje
 *      `name`), pa bi peceni duplikat bio DRUGI izvor iste tvrdnje: tocno ono sto CLAUDE.md
 *      ("Izvori istine") zabranjuje. Kratica drugi izvor NEMA nigdje, i zato se pece.
 *   2. PRORACUN TRAKE. `src/shared/site-chrome.ts` uvozi ovaj JSON, a `tests/route-shell-budget.test.ts`
 *      mjeri njegov bundle uz granicu od 8 KB gzip. Izmjereno 2026-09-23: indeks s nazivima je
 *      traku digao na 7842 B, dakle 350 B od granice, a bez naziva na 6216 B. Naziv je pritom
 *      BEZ POTROSACA u pregledniku: plocica pokazuje kraticu, a `title` ostaje "Uskoro" dok
 *      ladica Z13 ne postoji (odluka F8).
 *
 * Zapisano kao F16 u `docs/agents/orchestrator-backlog.md`. Kad Z13 naziv zatreba, uzima ga iz
 * kataloga na ruti koja katalog vec ucitava, ne iz ovog indeksa.
 */
export interface SiteStatsUnit {
  kratica: string;
}

export interface SiteStats {
  profiles: number;
  institutions: number;
  works: number;
  /** `unitId` -> kratica ustanove (F8); plocica profila u traci cita odavde. */
  units: Record<string, SiteStatsUnit>;
  /** Pohranjeni `workType` -> kratica razine rada (F8). */
  workTypes: Record<string, string>;
}

/**
 * KRATICE RAZINA RADA (F8, odluka 2026-09-23).
 *
 * KLJUC JE POHRANJENI IDENTIFIKATOR, NE HRVATSKA RIJEC, i to je jedina razlika prema nalogu.
 * Nalog je kratice imenovao hrvatskim kljucevima (`diplomski`, `zavrsni`, ...), ali
 * `lekta.preferences.v2.workType` cuva vrijednosti `<select id="workType">`, dakle `graduate`,
 * `final`, `seminar`, `specialist`, `doctoral` (tip `WorkType` u `src/ui/work-selection.ts`).
 * Indeks s hrvatskim kljucevima ne bi se nikad poklopio s pohranom, pa bi plocica UVIJEK pokazivala
 * zamjenski natpis: zeleno u gardu, mrtvo na ekranu. Pitanje je zapisano kao F15 u
 * `docs/agents/orchestrator-backlog.md`; kratice su doslovno one iz naloga.
 *
 * Tip je `Partial<Record<WorkType, string>>` namjerno: `article` i `project` kratice NEMAJU (nisu
 * razine studija), a preimenovan identifikator u `work-selection.ts` ovdje pada u TypeScriptu
 * umjesto da tiho prestane raditi u pregledniku. `WorkType` se uvozi kao TIP, pa ovaj modul ne
 * dobiva nijednu novu runtime ovisnost.
 */
const RAZINA_KRATICA: Partial<Record<WorkType, string>> = {
  seminar: 'Sem.',
  final: 'Zavr.',
  graduate: 'Dipl.',
  specialist: 'Spec.',
  doctoral: 'Dokt.',
};

/**
 * KRATICA USTANOVE JE DETERMINISTICKI IZVEDENA, NE VERIFICIRANA TVRDNJA.
 *
 * Registar profila (`data/profiles/verified-profiles-index.json`) i katalog
 * (`data/catalog/zagreb-catalog.json`) NEMAJU polje s kraticom; provjereno 2026-09-23, jedina polja
 * jedinice su `id`, `name`, `family`, `programs`, `status`. Kratica se zato IZVODI iz `id`-a, a
 * pravilo izvodjenja stoji ovdje, jer izvedena vrijednost se ne smije predstaviti kao tvrdnja s
 * izvorom (CLAUDE.md, "Izvori istine").
 *
 * PRAVILO, u dva koraka i bez iznimaka:
 *   1. `id` se dijeli na `-`. Ako su SVA slova zajedno najvise sest (dakle id je vec akronim, npr.
 *      `fpzg`, `pmf`, `sois-ft`), svaki segment ide u VERZAL i spaja se crticom: FPZG, PMF, SOIS-FT.
 *   2. Inace je `id` ime, ne akronim (`algebra`, `matematika`, `libertas`), pa bi verzal dao
 *      sedam i vise znakova na plocici siroj od trake. Takav se pise velikim pocetnim slovom:
 *      Algebra, Matematika, Libertas.
 *
 * Granica od sest slova je izmjerena na stvarnom katalogu (2026-09-23): 125 od 134 jedinica ima
 * id od najvise sest slova, a devet preostalih (`algebra`, `biotech`, `effectus`, `forenzika`,
 * `libertas`, `matematika`, `securus`, `veleknin`, `sois-ft`) su imena ili duzi akronimi; `sois-ft`
 * je jedini s crticom i po pravilu 1 ostaje akronim (sest slova).
 */
export function unitKratica(unitId: string): string {
  const segmenti = unitId.split('-').filter((s) => s !== '');
  if (segmenti.length === 0) return unitId;
  const slova = segmenti.join('');
  if (/^[a-z]{1,6}$/.test(slova)) return segmenti.map((s) => s.toUpperCase()).join('-');
  return segmenti.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('-');
}

/**
 * Indeks jedinica za plocicu profila. Nosi SVE jedinice kataloga, ne samo one s verificiranim
 * profilom: korisnik smije odabrati jedinicu koja ide na opcu provjeru, i plocica mu tada mora
 * pokazati sto je odabrao, a ne zamjenski natpis "Odaberi profil".
 */
function unitIndex(): Record<string, SiteStatsUnit> {
  const out: Record<string, SiteStatsUnit> = {};
  for (const unit of allUnits().slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    out[unit.id] = { kratica: unitKratica(unit.id) };
  }
  return out;
}

export function computeSiteStats(): SiteStats {
  const profiles = VERIFIED_PROFILE_REGISTRY;
  const units = new Set(profiles.map((p) => (p as { unitId?: string }).unitId));
  const institutions = (ZAGREB_CATALOG as Array<{ units?: Array<{ id: string }> }>)
    .filter((group) => (group.units || []).some((u) => units.has(u.id))).length;
  return {
    profiles: profiles.length,
    institutions,
    works: CORPUS_STATS.works,
    units: unitIndex(),
    workTypes: { ...RAZINA_KRATICA } as Record<string, string>,
  };
}
