#!/usr/bin/env node
// scripts/verify-release-proof.mjs
//
// SAMO gate dokaza izdanja i identiteta artefakta, bez gradnje i bez ostalih provjera `dist/`.
//
// Ista odluka koju pri deployu donosi `verify-deploy-dist.mjs` (oboje zove `collectReleaseGate`),
// ali kao zasebna, brza naredba. Dvije stvarne upotrebe:
//
//   1. POSTUPAK CISTE OVJERE I PROOF-ONLY COMMITA (docs/deploy/RELEASE_PROOF_WORKFLOW.md): nakon sto
//      `release:check` ispece dokaz i dokaz se commita sam, ovim se potvrdjuje da je i dalje svjez,
//      bez ponovne visesatne gradnje.
//   2. DOKAZ DA GATE GRIZE. Gate koji zivi samo unutar linearne deploy skripte moze se mjeriti samo
//      nad stvarnim `dist/` repozitorija, pa se u praksi mjerila cista funkcija a ne ozicenje.
//      Ovdje se isti lanac vrti kao PRAVI proces nad zadanim stablom, pa test mjeri izlazni kod i
//      poruku (tests/verify-release-proof-cli.test.ts).
//
// IZLAZ IDE PREKO `process.exitCode`, ne `process.exit()` (CLAUDE.md, master-ci).
//
// Pokretanje:
//   node scripts/verify-release-proof.mjs
//   node scripts/verify-release-proof.mjs --root <stablo> --dist <stablo>/dist
//   LEKTA_REQUIRE_RELEASE_PROOF=1 node scripts/verify-release-proof.mjs   # "ne znam" je tada pad
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectReleaseGate } from './release-gate-core.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

export function main(argv = process.argv.slice(2), env = process.env, log = console) {
  const rootDir = path.resolve(arg(argv, 'root') ?? DEFAULT_ROOT);
  const distArg = arg(argv, 'dist');
  const distDir = distArg ? path.resolve(distArg) : path.join(rootDir, 'dist');
  const gate = collectReleaseGate({ rootDir, distDir, env });

  for (const n of gate.notes) log.log(`[verify-release-proof] ${n}`);
  for (const w of gate.warnings) {
    log.warn(`[verify-release-proof] UPOZORENJE: ${w}`);
    log.warn('  Pokreni `npm run release:check`, pa postavi LEKTA_REQUIRE_RELEASE_PROOF=1 da gate postane tvrd.');
  }
  if (gate.failures.length) {
    for (const f of gate.failures) log.error(`[verify-release-proof] FAIL: ${f}`);
    return 1;
  }
  log.log(
    `[verify-release-proof] OK: identitet artefakta i dokaz izdanja stoje${gate.required ? '' : ' (gate je MEK: LEKTA_REQUIRE_RELEASE_PROOF nije 1)'}.`,
  );
  return 0;
}

// STRAZA IDE PREKO `pathToFileURL`, NIKAD PREKO `file://` + staze (vidi post-deploy-smoke.mjs i CLAUDE.md).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
