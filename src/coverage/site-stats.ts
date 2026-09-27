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
 * Jedna jedinica u pecenom indeksu STRANICE `/saznaj-vise/`: kratica i puni naziv ustanove.
 *
 * KRATICA JE IZVEDENA, NAZIV JE PRESLIKAN. Kratica nema izvor nigdje u podacima, pa se izvodi po
 * pravilu zapisanom uz `unitKratica` ispod; naziv je doslovno `name` iz kataloga
 * (`data/catalog/zagreb-catalog.json`), dakle projekcija postojeceg izvora u artefakt koji pece
 * ISTI commit, a ne druga autorska tvrdnja.
 *
 * TRAKA (`src/shared/site-chrome.ts`) OVAJ TIP NE UVOZI. Do ovog kruga je uvozila CIJELI JSON s
 * nazivom svake od 134 jedinica, pa je gzipani chrome JS izmjeren na 8001 B, 191 B ispod granice
 * od 8192 B u `tests/route-shell-budget.test.ts` (`esbuild` + `gzipSync`). Naziv plocici ne treba
 * (crta samo kraticu), pa traka sada uvozi mali `data/coverage/unit-kratice.json`
 * (`PlateIndex`/`computePlateIndex` ispod), bez `naziv` polja; `npm run gen-site-stats` pece OBA
 * artefakta iz ISTOG izracuna, pa se ne mogu raziciti.
 */
export interface SiteStatsUnit {
  kratica: string;
  naziv: string;
}

export interface SiteStats {
  profiles: number;
  institutions: number;
  works: number;
  /** `unitId` -> kratica i naziv ustanove (F8); plocica profila u traci cita kraticu odavde. */
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
 * PRAVILO NIJE "prepoznaj akronim": kratki `id` se VERZALIZIRA bez obzira je li vec akronim ili
 * skracena rijec, jer razlika izmedju to dvoje nije u podacima. Za `fpzg`, `pmf` verzal DAJE
 * akronim; za `pravo`, `pravos`, `biolos` verzal daje samo velika slova skracene rijeci (PRAVO,
 * PRAVOS, BIOLOS), sto formalno nije akronim, ali je citljivo i krace od punog imena, dakle bolje
 * od nicega dok registar profila ne dobije vlastito polje `kratica` po jedinici (pitanje F16,
 * `docs/agents/orchestrator-backlog.md`).
 *
 * PRAVILO, u dva koraka i bez iznimaka:
 *   1. `id` se dijeli na `-`. Ako su SVA slova zajedno najvise sest (npr. `fpzg`, `pmf`, `pravo`,
 *      `sois-ft`), svaki segment ide u VERZAL i spaja se crticom: FPZG, PMF, PRAVO, SOIS-FT.
 *   2. Inace je `id` predugacko ime za verzal (`algebra`, `matematika`, `libertas`), pa bi verzal
 *      dao sedam i vise znakova na plocici siroj od trake. Takav se pise velikim pocetnim slovom:
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
    out[unit.id] = { kratica: unitKratica(unit.id), naziv: unit.name };
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

/** Indeks za plocicu profila u traci: `unitId` -> KRATICA (bez naziva). Vidi `PlateIndex`. */
export type PlateUnitIndex = Record<string, string>;

export interface PlateIndex {
  /** Broj verificiranih profila (F8 plocica pokazuje isti broj kao traka s brojkama). */
  profiles: number;
  units: PlateUnitIndex;
  /** Pohranjeni `workType` -> kratica razine rada (F8). */
  workTypes: Record<string, string>;
}

/**
 * ZASEBAN, MALI ARTEFAKT ZA TRAKU (F8/Z15 MINOR, 2026-09-23).
 *
 * `src/shared/site-chrome.ts` je do ovog kruga uvozio CIJELI `site-stats.json`, ukljucujuci puni
 * naziv svake od 134 jedinica; taj naziv plocici ne treba (crta samo kraticu), a gurao je gzipani
 * chrome JS na 8001 B, 191 B ispod granice od 8192 B u `tests/route-shell-budget.test.ts`. Ovaj
 * indeks nosi ISTU formulu i ISTO pravilo izvodjenja kratice, samo bez `naziv` polja, pa `npm run
 * gen-site-stats` pece OBA artefakta iz JEDNOG izracuna i ne mogu se raziciti.
 */
export function computePlateIndex(): PlateIndex {
  const profiles = VERIFIED_PROFILE_REGISTRY;
  const units: PlateUnitIndex = {};
  for (const [id, unit] of Object.entries(unitIndex())) units[id] = unit.kratica;
  return {
    profiles: profiles.length,
    units,
    workTypes: { ...RAZINA_KRATICA } as Record<string, string>,
  };
}
