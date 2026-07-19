/**
 * CLI: generiraj coverage izvjestaj i gap-backlog (faza 6).
 *   npm run corpus:coverage
 * Zapisuje u tests/corpus/reports/: check-coverage.json, check-coverage.md, gap-backlog.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildCoverage, renderCoverageMarkdown, renderGapBacklog } from '../coverage/coverage-report';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../reports');

const rep = buildCoverage();
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'check-coverage.json'), JSON.stringify(rep, null, 2) + '\n');
writeFileSync(resolve(OUT, 'check-coverage.md'), renderCoverageMarkdown(rep));
writeFileSync(resolve(OUT, 'gap-backlog.md'), renderGapBacklog(rep));

const s = rep.summary;
console.log('=== Lekta Error Corpus coverage ===');
console.log(`Bodovane provjere s atomskim fail-om: ${s.scoredWithAtomic}/${s.scoredChecks} (${s.scoredAtomicPct}%)`);
console.log(`Valid-control provjere: ${s.checksWithValidControl} | boundary: ${s.checksWithBoundary}`);
console.log(`Slucajevi: atomic ${s.atomicCases}, valid ${s.validControlCases}, boundary ${s.boundaryCases}`);
console.log(`Gap-backlog: ${rep.gaps.length} (P1 ${rep.gaps.filter((g) => g.priority === 'P1').length}, P2 ${rep.gaps.filter((g) => g.priority === 'P2').length}, P3 ${rep.gaps.filter((g) => g.priority === 'P3').length})`);
console.log(`Artefakti u ${OUT}/`);
