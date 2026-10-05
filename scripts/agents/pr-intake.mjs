#!/usr/bin/env node
// Tanki CLI nad `pr-intake-core.mjs`: `node scripts/agents/pr-intake.mjs <broj PR-a> [--json]`.
// Jedini dio koji dira mrezu (`gh api`). Sva logika sazimanja je u cistoj `summarizePr`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPages, formatSummary, summarizePr } from './pr-intake-core.mjs';

const KORIJEN = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PER_PAGE = 100;

/** @param {string} putanja */
function ghApi(putanja) {
  const izlaz = execFileSync('gh', ['api', putanja], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(izlaz);
}

/**
 * @param {string} putanja
 * @param {(odgovor: unknown) => unknown[]} [izvuci]
 */
function sveStranice(putanja, izvuci = (o) => /** @type {unknown[]} */ (o)) {
  const spoj = putanja.includes('?') ? '&' : '?';
  return collectPages((page) => izvuci(ghApi(`${putanja}${spoj}per_page=${PER_PAGE}&page=${page}`)), {
    perPage: PER_PAGE,
  });
}

async function main() {
  const argumenti = process.argv.slice(2);
  const json = argumenti.includes('--json');
  const broj = argumenti.find((a) => /^\d+$/.test(a));
  if (!broj) {
    console.error('Uporaba: node scripts/agents/pr-intake.mjs <broj PR-a> [--json]');
    process.exit(2);
  }
  const routing = JSON.parse(readFileSync(join(KORIJEN, 'config', 'agent-routing.json'), 'utf8'));
  const protectedPaths = Array.isArray(routing.protectedPaths) ? routing.protectedPaths : [];

  const repo = 'repos/{owner}/{repo}';
  const pr = ghApi(`${repo}/pulls/${broj}`);
  const compare = ghApi(`${repo}/compare/${encodeURIComponent(pr.base.ref)}...${pr.head.sha}?per_page=1`);
  const files = await sveStranice(`${repo}/pulls/${broj}/files`);
  const checkRuns = await sveStranice(
    `${repo}/commits/${pr.head.sha}/check-runs`,
    (o) => /** @type {{ check_runs: unknown[] }} */ (o).check_runs,
  );
  const comments = await sveStranice(`${repo}/issues/${broj}/comments`);
  const reviews = await sveStranice(`${repo}/pulls/${broj}/reviews`);

  const sazetak = summarizePr(
    /** @type {import('./pr-intake-core.mjs').PrIntakeInput} */ (
      /** @type {unknown} */ ({ pr, compare, files, checkRuns, comments, reviews, protectedPaths })
    ),
  );
  if (json) console.log(JSON.stringify(sazetak));
  else console.log(formatSummary(sazetak).join('\n'));
}

main().catch((greska) => {
  console.error(`pr-intake: ${greska instanceof Error ? greska.message : String(greska)}`);
  process.exit(1);
});
