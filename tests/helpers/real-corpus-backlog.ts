import { buildFacultyMatrixReport, type FacultyMatrixReport } from './faculty-matrix';

/**
 * Profil bez ijednog stvarnog DOCX uzorka, s dovoljno konteksta za prioritizaciju
 * (koji fakultet, koliko ponudjenih repair opcija bi taj uzorak potvrdio).
 */
export interface RealCorpusBacklogEntry {
  profileId: string;
  unitId: string;
  facultyLabel: string;
  offeredOptionCount: number;
}

export interface RealCorpusBacklogReport {
  generatedFrom: string;
  totalProfiles: number;
  profilesWithoutSample: number;
  entries: RealCorpusBacklogEntry[];
}

/**
 * Rangira profile BEZ stvarnog DOCX uzorka silazno po offeredOptionCount (najvise
 * ponudjenih opcija prvo - gdje bi sljedeci stvarni uzorak najvise vrijedio), uz stabilan
 * tie-break po profileId. Cita iz vec izgradjene fakultetske matrice, ne racuna nista novo.
 */
export function buildRealCorpusBacklog(report: FacultyMatrixReport = buildFacultyMatrixReport()): RealCorpusBacklogReport {
  const entries: RealCorpusBacklogEntry[] = [];
  for (const faculty of report.faculties) {
    for (const profile of faculty.profiles) {
      if (profile.realDocxSampleCount > 0) continue;
      entries.push({
        profileId: profile.profileId,
        unitId: faculty.unitId,
        facultyLabel: faculty.facultyLabel,
        offeredOptionCount: profile.offeredOptionCount,
      });
    }
  }
  entries.sort((a, b) => b.offeredOptionCount - a.offeredOptionCount || a.profileId.localeCompare(b.profileId));

  return {
    generatedFrom: 'docs/generated/faculty-matrix.json',
    totalProfiles: report.summary.profileCount,
    profilesWithoutSample: entries.length,
    entries,
  };
}

/** Grupira po fakultetu, cuvajuci silazni redoslijed ranga (prva pojava odredjuje redoslijed naslova). */
export function renderRealCorpusBacklogMarkdown(rep: RealCorpusBacklogReport): string {
  const L: string[] = [];
  L.push('# Lekta Repair Engine - real-corpus backlog (auto-generirano)', '');
  L.push(
    '> Profili bez ijednog stvarnog DOCX uzorka za real-corpus testiranje, rangirani silazno po ' +
      'broju ponudjenih repair opcija (offeredOptionCount) - gdje bi sljedeci stvarni uzorak ' +
      'najvise vrijedio. Izvor: ' + rep.generatedFrom + ' (`npm run repair-faculty-matrix`).',
    '',
  );
  L.push(`Ukupno profila bez uzorka: **${rep.profilesWithoutSample}/${rep.totalProfiles}**.`, '');

  const seenUnits = new Set<string>();
  for (const entry of rep.entries) {
    if (seenUnits.has(entry.unitId)) continue;
    seenUnits.add(entry.unitId);
    L.push(`## ${entry.facultyLabel} (${entry.unitId})`, '');
    for (const row of rep.entries.filter((candidate) => candidate.unitId === entry.unitId)) {
      L.push(`- **${row.profileId}** — ${row.offeredOptionCount} ponudjenih opcija`);
    }
    L.push('');
  }
  return L.join('\n');
}
