#!/usr/bin/env node
/**
 * Claude Code SessionEnd hook: po zavrsetku sesije pokrece worktree GC u pozadini
 * (odluka vlasnika 2026-10-08, uz SessionStart koji to vec radi).
 *
 * Ne dodaje nikakvu vlastitu logiku brisanja. Sve uvjete sigurnosti (spojeno u master, nema
 * necommitanog ni nepushanog rada, nema zivog procesa ni gate locka, stablo starije od 60 min,
 * tekuce stablo se preskace) provodi `scripts/worktree-gc.mjs`; ovdje se samo poziva isti
 * `runWorktreeGc` kao u bootstrapu. Stablo koje nije uklonjivo ostaje i prijavljuje se u logu.
 *
 * FAIL-OPEN: SessionEnd ima kratak rok, pa hook odmah vraca, a GC tece odvojeno. Greska nikad
 * ne ruši kraj sesije. Ispis je jedan redak na stderr.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWorktreeGc } from '../agents/session-bootstrap.mjs';

const root = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const isDirectRun = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/hooks/session-end-gc.mjs');

if (isDirectRun) {
  console.error(runWorktreeGc({ root }));
}
