/**
 * Ulaz za `npm run laya:eval`; sva logika je u eval-run.ts (testovi je uvoze bez pokretanja).
 * vite-node iz process.argv izbacuje putanju skripte, pa su argumenti od indeksa 2.
 */
import { runEvalCli } from './eval-run.ts';

runEvalCli(process.argv.slice(2).filter((a) => a !== '--')).then(
  (code) => { process.exitCode = code; },
  (error: unknown) => { console.error(error instanceof Error ? error.message : 'Laya eval nije uspio.'); process.exitCode = 1; },
);
