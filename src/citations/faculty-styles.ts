/**
 * Fakultet -> verificirani citatni stil za KLIJENTSKI alat (citat.html).
 *
 * Isti izvor istine kao generator (data/tools/citation-specs/verified/*.json), samo ucitan
 * u pregledniku preko import.meta.glob (kao profile-registry i verification-console). Fakultet
 * se bira iz izbornika, a njegov stil se formatira: custom-spec preko formatFromSpec (vjeran
 * predlozak iz sluzbenih uputa), style-pin preko obiteljskog motora (spec nema vlastite
 * predloske, samo dokazuje KOJI stil vrijedi). Fakulteti bez verificiranog speca se NE nude
 * ovdje (za njih ostaje opci izbor stila) - u skladu s disciplinom "samo provjereno izlazi".
 */
import rawCatalog from '../../data/catalog/zagreb-catalog.json';
import { engineStyleFor } from './citation-web';
import { formatFromSpec, type CitationSpec } from './citation-spec';
import { formatCitation, type CitationInput, type CitationResult, type CitationStyle } from '../tools/citation';

const specModules = import.meta.glob('../../data/tools/citation-specs/verified/*.json', {
  eager: true,
}) as Record<string, { default: CitationSpec }>;

export interface FacultyStyle {
  label: string;
  sourceLabel: string;
  verifiedAt: string | null;
  /** style-pin: obiteljski motor + dokaz; custom-spec: vlastiti predlosci (formatFromSpec). */
  pin: boolean;
  engineStyle: CitationStyle | null;
  spec: CitationSpec;
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
  for (const mod of Object.values(specModules)) {
    const spec = mod.default;
    if (!spec || !spec.facultyId) continue;
    const pin = spec.outcome === 'style-pin';
    (byFac[spec.facultyId] ??= []).push({
      label: spec.label,
      sourceLabel: spec.sourceLabel,
      verifiedAt: spec.verifiedAt,
      pin,
      engineStyle: engineStyleFor(spec.styleToken),
      spec,
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

/** Vjeran render po fakultetskom stilu: custom-spec -> formatFromSpec, pin -> obiteljski motor. */
export function formatForFaculty(style: FacultyStyle, inp: CitationInput): CitationResult {
  if (style.spec && !style.pin) return formatFromSpec(style.spec, inp);
  return formatCitation(inp, style.engineStyle || 'autor-godina');
}
