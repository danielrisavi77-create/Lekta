// Data gate za citatne specove (data/tools/citation-specs/): zivi u `npm run check`,
// pa neverificiran/driftan spec rusi CI, ne samo generator. Vidi data/tools/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { validateCitationSpec, formatFromSpec, type CitationSpec } from '../src/citations/citation-spec';
import type { CitationInput } from '../src/tools/citation';

const ROOT = path.resolve(__dirname, '..');
const DRAFTS = path.join(ROOT, 'data/tools/citation-specs/drafts');
const VERIFIED = path.join(ROOT, 'data/tools/citation-specs/verified');
const REGISTRY = path.join(ROOT, 'data/sources/source-registry.json');

function jsonFiles(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
}
function load(dir: string, f: string): CitationSpec {
  return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as CitationSpec;
}
// Ista normalizacija kao u dossier skripti (pdftotext gubi dijakritike).
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
    .replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
}

describe('citation-specs data gate', () => {
  it('svi draftovi i verified specovi prolaze shemu', () => {
    for (const [dir, files] of [[DRAFTS, jsonFiles(DRAFTS)], [VERIFIED, jsonFiles(VERIFIED)]] as const) {
      for (const f of files) {
        const errs = validateCitationSpec(load(dir, f));
        expect(errs, `${path.basename(dir)}/${f}: ${errs.join('; ')}`).toEqual([]);
      }
    }
  });

  it('drafts/ sadrzi SAMO status draft ili needs-recheck (verified ide u verified/)', () => {
    for (const f of jsonFiles(DRAFTS)) {
      expect(['draft', 'needs-recheck'], `drafts/${f}`).toContain(load(DRAFTS, f).status);
    }
  });

  it('verified/: status verified, verifiedBy/At/Hash prisutni, nijedan flagirani predlozak', () => {
    for (const f of jsonFiles(VERIFIED)) {
      const s = load(VERIFIED, f);
      expect(s.status, `verified/${f}`).toBe('verified');
      expect(s.verifiedBy, `verified/${f} verifiedBy`).toBeTruthy();
      expect(s.verifiedAt, `verified/${f} verifiedAt`).toBeTruthy();
      expect(s.verifiedHash, `verified/${f} verifiedHash`).toBeTruthy();
      const flagged = (s.sourceTypes ?? []).filter((t) => (t as { recheck?: boolean }).recheck);
      expect(flagged, `verified/${f} flagirani predlosci`).toEqual([]);
    }
  });

  it('verified/: sourceId postoji u registryju i verifiedHash == snapshotHash (freshness, fail-closed)', () => {
    const files = jsonFiles(VERIFIED);
    if (!files.length) return; // jos nista verificirano
    const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf-8')) as Array<{ id: string; snapshotHash: string | null }>;
    for (const f of files) {
      const s = load(VERIFIED, f);
      const src = registry.find((r) => r.id === s.sourceId);
      expect(src, `verified/${f}: orphan sourceId ${s.sourceId}`).toBeTruthy();
      expect(src?.snapshotHash, `verified/${f}: izvor bez snapshota`).toBeTruthy();
      expect(s.verifiedHash, `verified/${f}: hash drift (izvor promijenjen nakon verifikacije, reverificiraj)`)
        .toBe(src?.snapshotHash);
    }
  });

  it('GOLDEN FIDELITY: renderer reproducira svaki worked-example (drafts i verified)', () => {
    for (const [dir, files] of [[DRAFTS, jsonFiles(DRAFTS)], [VERIFIED, jsonFiles(VERIFIED)]] as const) {
      for (const f of files) {
        const s = load(dir, f);
        for (const st of s.sourceTypes ?? []) {
          if (!st.example || !st.example.input) continue;
          const res = formatFromSpec(s, st.example.input as unknown as CitationInput);
          expect(norm(res.citation), `${path.basename(dir)}/${f} ${st.type}`).toBe(norm(st.example.expected));
        }
      }
    }
  });
});
