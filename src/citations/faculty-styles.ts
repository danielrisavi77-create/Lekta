/**
 * Fakultet -> verificirani citatni stil za KLIJENTSKI alat (citat.html).
 *
 * Isti izvor istine kao generator (data/tools/citation-specs/verified/*.json), samo ucitan
 * u pregledniku. Populacija izbornika (fakultet -> stil) koristi LAGANI indeks
 * (verified-index.json, ~24 KB, generiran scripts/gen-citation-specs-index.mjs); pun spec
 * (evidence, sourceTypes, bibliography...) je LIJENO ucitan preko import.meta.glob BEZ
 * eager:true - Vite svaku od 71 datoteke kodno dijeli u zaseban chunk, umjesto da svih ~479 KB
 * uveze u citat-*.js glavni chunk (perf audit: 'facultyId' se pojavljivao 144x u bundleu prije
 * ovog splita). ensureFacultySpecsLoaded() pokrece dohvat svih chunkova ODMAH (fire-and-forget,
 * ne top-level await - glavni chunk se ne smije blokirati mrežnim krugom) i mutira .spec polje
 * postojecih FacultyStyle objekata in-place (isti obrazac kao ensureProfileRules/ensureTemplatesHeavy).
 *
 * Fakultet se bira iz izbornika, a njegov stil se formatira: custom-spec preko formatFromSpec
 * (vjeran predlozak iz sluzbenih uputa, treba pun spec), style-pin preko obiteljskog motora
 * (spec nema vlastite predloske, samo dokazuje KOJI stil vrijedi - .spec se NIKAD ne cita).
 * Fakulteti bez verificiranog speca se NE nude ovdje (za njih ostaje opci izbor stila) - u
 * skladu s disciplinom "samo provjereno izlazi".
 */
import rawIndex from '../../data/tools/citation-specs/verified-index.json';
import rawCatalog from '../../data/catalog/zagreb-catalog.json';
import { engineStyleFor } from './citation-web';
import { formatFromSpec, type CitationSpec } from './citation-spec';
import { formatCitation, type CitationInput, type CitationResult, type CitationStyle } from '../tools/citation';

interface LightSpecEntry {
  file: string;
  facultyId: string;
  styleToken: string;
  outcome: string;
  label: string;
  sourceLabel: string;
  verifiedAt: string | null;
}
const LIGHT_INDEX = rawIndex as unknown as LightSpecEntry[];

// Non-eager: vraca loader funkcije (put -> () => Promise<modul>), Vite svaku ucitava kao
// zaseban chunk TEK kad se loader stvarno pozove (ensureFacultySpecsLoaded).
const specLoaders = import.meta.glob('../../data/tools/citation-specs/verified/*.json') as Record<
  string,
  () => Promise<{ default: CitationSpec }>
>;

export interface FacultyStyle {
  label: string;
  sourceLabel: string;
  verifiedAt: string | null;
  /** style-pin: obiteljski motor + dokaz; custom-spec: vlastiti predlosci (formatFromSpec). */
  pin: boolean;
  engineStyle: CitationStyle | null;
  /** null dok se lijeni chunk ne ucita (ensureFacultySpecsLoaded); pin stilovi ga nikad ne trebaju. */
  spec: CitationSpec | null;
  /** interno: ime izvorne datoteke, za spajanje lijenog chunka natrag u ovaj objekt. */
  file: string;
}

export interface FacultyOption {
  id: string;
  name: string;
  instName: string;
  styles: FacultyStyle[];
}

// unitId -> {ime fakulteta, ime sveucilista} iz kataloga (za izbornik grupiran po sveucilistu).
// Uz to instById: neki specovi imaju facultyId na razini USTANOVE (npr. "unipu", "unin",
// veleucilista) koja nije zasebna jedinica; tada uzimamo ime ustanove kao ime fakulteta.
const unitMeta: Record<string, { name: string; instName: string }> = {};
const instById: Record<string, string> = {};
for (const inst of rawCatalog as Array<{ id: string; name: string; units?: Array<{ id: string; name: string }> }>) {
  instById[inst.id] = inst.name;
  for (const u of inst.units || []) unitMeta[u.id] = { name: u.name, instName: inst.name };
}
function metaFor(id: string): { name: string; instName: string } {
  if (unitMeta[id]) return unitMeta[id];
  if (instById[id]) return { name: instById[id], instName: instById[id] };
  return { name: id, instName: 'Ostalo' };
}

let cache: FacultyOption[] | null = null;

/** Fakulteti s bar jednim verificiranim specom, abecedno, sa svim svojim stilovima. */
export function buildFacultyOptions(): FacultyOption[] {
  if (cache) return cache;
  const byFac: Record<string, FacultyStyle[]> = {};
  for (const entry of LIGHT_INDEX) {
    if (!entry.facultyId) continue;
    (byFac[entry.facultyId] ??= []).push({
      label: entry.label,
      sourceLabel: entry.sourceLabel,
      verifiedAt: entry.verifiedAt,
      pin: entry.outcome === 'style-pin',
      engineStyle: engineStyleFor(entry.styleToken),
      spec: null,
      file: entry.file,
    });
  }
  cache = Object.keys(byFac)
    .map((id) => {
      const meta = metaFor(id);
      const styles = byFac[id].slice().sort((a, b) => a.label.localeCompare(b.label, 'hr'));
      return { id, name: meta.name, instName: meta.instName, styles };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'hr'));
  return cache;
}

let _specsReady: Promise<void> | null = null;
/**
 * Lijeno ucita pune specove i spoji ih (mutacija .spec in place) u vec izgradjene FacultyStyle
 * objekte iz buildFacultyOptions(). Memoizirano: svih 71 chunka se dohvaca tocno jednom.
 * Pozovi fire-and-forget cim se citat-page.ts ucita (init) - NE tek na odabir fakulteta, korisnik
 * dotad tek bira fakultet i tipka polja, vremena je vise nego dosta da svih ~24 KB stigne.
 * Pin stilovi ne trebaju spec (formatForFaculty koristi obiteljski motor); ovaj poziv ionako
 * pokriva sve, granularnije gasenje po fakultetu nije vrijedno dodatne slozenosti.
 */
export function ensureFacultySpecsLoaded(): Promise<void> {
  if (!_specsReady) {
    const byFile = new Map<string, FacultyStyle>();
    for (const opt of buildFacultyOptions()) for (const style of opt.styles) byFile.set(style.file, style);
    _specsReady = Promise.all(
      Object.entries(specLoaders).map(([key, loader]) => {
        const file = key.split('/').pop() as string;
        const style = byFile.get(file);
        if (!style) return Promise.resolve();
        return loader().then((mod) => { style.spec = mod.default; });
      }),
    ).then(() => {});
  }
  return _specsReady;
}

/** Vjeran render po fakultetskom stilu: custom-spec -> formatFromSpec, pin -> obiteljski motor.
 *  Dok se lijeni spec jos ucitava (spec===null), custom-spec stilovi privremeno padaju na
 *  obiteljski motor (priblizan, ali ne pogresan format) - ensureFacultySpecsLoaded() korigira
 *  prikaz ponovnim render() cim chunk stigne (v. citat-page.ts init()). */
export function formatForFaculty(style: FacultyStyle, inp: CitationInput): CitationResult {
  if (style.spec && !style.pin) return formatFromSpec(style.spec, inp);
  return formatCitation(inp, style.engineStyle || 'autor-godina');
}
