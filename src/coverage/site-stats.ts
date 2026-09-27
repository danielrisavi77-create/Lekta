import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERIFIED_PROFILE_REGISTRY } from '../profiles/profile-registry';
import SCORED_COVERAGE from '../../data/coverage/scored-coverage.json';
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
  /**
   * VERZIJA PRAVILA za "Stanje stola" u punom podnozju (Z15, drugi krug): prvih sedam znakova
   * `datasetVersion` iz `data/generated/profile-rules-server.json`, dakle ISTOG sazetka koji
   * endpoint `profile-rules` salje pregledniku uz svaki profil (`src/profiles/profile-rules-contract.ts`).
   * Generator PADA kad artefakt verziju ne nosi; `null` u tipu stiti samo citatelja (podnozje tada
   * pise broj profila bez verzije, ne izmislja je).
   */
  rulesVersion: string | null;
  /**
   * DATUM PROVJERE IZVORA: najsvjeziji `lastVerified` medju BODOVANIM pravilima, iz pohranjenog
   * `data/coverage/scored-coverage.json` (koji `tests/coverage-report.test.ts` drzi jednakim zivom
   * izracunu). ISO `YYYY-MM-DD` ili `null`.
   */
  sourcesCheckedAt: string | null;
}

/** Duljina prikazane verzije pravila; sazetak je sha256, pa sedam znakova razlikuje izdanja. */
const VERZIJA_ZNAKOVA = 7;

/**
 * Verzija pravila iz TEKSTA serverskog artefakta. Parsira se, ne greppa (CLAUDE.md), i vrijednost
 * mora biti sha256 heks; sve drugo daje `null`, ne pogodjenu verziju.
 */
export function rulesVersionFromArtifact(tekst: string): string | null {
  let parsed: unknown;
  try { parsed = JSON.parse(tekst); } catch { return null; }
  const v = typeof parsed === 'object' && parsed !== null ? (parsed as { datasetVersion?: unknown }).datasetVersion : undefined;
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v.slice(0, VERZIJA_ZNAKOVA) : null;
}

/** Najsvjeziji ISO datum `lastVerified` medju celijama; `null` kad nijedna ne nosi datum. */
export function latestSourceCheck(cells: ReadonlyArray<{ lastVerified?: string | null }>): string | null {
  let best: string | null = null;
  for (const cell of cells) {
    const d = cell.lastVerified;
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (best === null || d > best) best = d;
  }
  return best;
}

/**
 * Serverski artefakt je 2 MB i SECURITY-SENSITIVE (`data/classification.json`), pa se ne uvozi
 * kao modul nego cita iz datoteke, i to samo u generatoru i testu (ovaj modul nije u bundleu).
 * U `site-stats.json` ide JEDINO sedam znakova sazetka koji endpoint ionako javno vraca.
 */
function rulesVersionFromDisk(): string {
  // Putanja kroz TEKST `import.meta.url`, ne kroz `new URL(...)`: pod happy-domom je `URL`
  // preglednikov razred, koji `readFileSync` ne prima. Prva izvedba je gresku gutala i vracala
  // `null`, pa je test pod happy-domom racunao drugu vrijednost od generatora; sad greska PADA.
  const artefakt = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/generated/profile-rules-server.json');
  const verzija = rulesVersionFromArtifact(readFileSync(artefakt, 'utf8'));
  // Artefakt je commitan i cuvan (`tests/profile-rules-server.test.ts`); bez verzije je pokvaren,
  // a "Stanje stola" ne smije tiho izgubiti redak zbog pokvarenog artefakta.
  if (verzija === null) throw new Error(`${artefakt}: datasetVersion nije sha256`);
  return verzija;
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
    rulesVersion: rulesVersionFromDisk(),
    sourcesCheckedAt: latestSourceCheck((SCORED_COVERAGE as { cells: Array<{ lastVerified?: string | null }> }).cells),
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
