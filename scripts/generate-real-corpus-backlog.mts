/** CLI: generira rangirani backlog profila bez stvarnog DOCX uzorka za real-corpus testiranje. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRealCorpusBacklog, renderRealCorpusBacklogMarkdown } from '../tests/helpers/real-corpus-backlog';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const report = buildRealCorpusBacklog();
const outDir = join(root, 'docs', 'generated');

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'real-corpus-backlog.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(outDir, 'real-corpus-backlog.md'), renderRealCorpusBacklogMarkdown(report));

console.log('=== Real-corpus backlog ===');
console.log(`profila bez uzorka: ${report.profilesWithoutSample}/${report.totalProfiles}`);
console.log(`top 3: ${report.entries.slice(0, 3).map((e) => `${e.profileId} (${e.offeredOptionCount})`).join(', ')}`);
console.log(`zapisano: ${join(outDir, 'real-corpus-backlog.json')}, ${join(outDir, 'real-corpus-backlog.md')}`);
