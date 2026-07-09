/**
 * Signal potraznje za nepokrivene fakultete (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcija 7).
 *
 * Cita ZIVI agregat faculty_request_counts (service role) i rangira nepokrivene fakultete/celije
 * po potraznji, kao overlay nad determinstickim discovery worklistom. NAMJERNO odvojeno od
 * generate-coverage.mjs koji je golden-deterministican (konstantan generatedAt, bez mreze) pa ga
 * zivi podaci ne smiju zagaditi.
 *
 * Izlaz: discovery/out/{demand-signal.json, DEMAND.md}.
 * Pokretanje (zivo):   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node discovery/demand-signal.mjs
 * Pokretanje (offline): node discovery/demand-signal.mjs --from-file <counts.json>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { restEnv, fetchCounts } from './lib/rest.mjs';
import { rankCells, rollupByFaculty, summarizeDemand, renderDemandMarkdown } from './lib/demand.mjs';

function parseArgs(argv) {
  const out = { fromFile: null, outDir: 'discovery/out' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from-file') out.fromFile = argv[++i];
    else if (argv[i] === '--out') out.outDir = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();

  let counts;
  if (args.fromFile) {
    counts = JSON.parse(readFileSync(args.fromFile, 'utf8'));
    console.log(`Offline: ${counts.length} redaka iz ${args.fromFile}`);
  } else {
    counts = await fetchCounts(restEnv());
    console.log(`Zivo: ${counts.length} redaka iz faculty_request_counts`);
  }

  const cells = rankCells(counts);
  const faculties = rollupByFaculty(cells);
  const summary = summarizeDemand(cells, faculties);

  mkdirSync(args.outDir, { recursive: true });
  const json = { meta: { generatedAt, source: 'faculty_request_counts', summary }, faculties, cells };
  writeFileSync(`${args.outDir}/demand-signal.json`, JSON.stringify(json, null, 2) + '\n');
  writeFileSync(`${args.outDir}/DEMAND.md`, renderDemandMarkdown(cells, faculties, summary, generatedAt));

  console.log(
    `Gotovo: ${summary.faculties} fakulteta, ${summary.cells} celija, ${summary.totalRequests} zahtjeva ` +
      `(${summary.withEmail} s e-mailom, ${summary.outsideCatalog} izvan kataloga). Izlaz u ${args.outDir}/.`,
  );
}

main().catch((e) => {
  console.error('[demand-signal]', e.message || e);
  process.exit(1);
});
