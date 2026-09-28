import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';
import { documentText } from '../src/verification/docx-visible-text.ts';
import { hashRepairSourceTree } from './lib/repair-source-hash.mjs';
import { hashAnalysisSourceTree } from './lib/analysis-source-hash.mjs';
import { stableJson } from '../src/verification/ai-evidence-audit';
import { ruleEvidenceKey } from '../src/verification/worklist';
import {
  resolveAiEvidenceContext,
  type AiEvidenceManifestFile,
  type AiEvidenceSnapshot,
} from '../src/verification/ai-evidence-context';

function containedPath(rootDir: string, relativePath: string): string | null {
  const root = resolve(rootDir);
  const target = resolve(root, relativePath);
  const fromRoot = relative(root, target);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) {
    return null;
  }
  return target;
}

function htmlText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|td|th|br)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}

async function extractSnapshotText(path: string, bytes: Uint8Array): Promise<string> {
  switch (extname(path).toLowerCase()) {
    case '.docx':
      return documentText(bytes);
    case '.pdf':
      return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], {
        input: Buffer.from(bytes),
        maxBuffer: 64 * 1024 * 1024,
      }).toString('utf8');
    case '.txt':
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    case '.html':
    case '.htm':
      return htmlText(bytes);
    default:
      return '';
  }
}

async function readSnapshot(rootDir: string, source: SourceEntry): Promise<AiEvidenceSnapshot | undefined> {
  if (!source.snapshotPath) return undefined;
  const path = containedPath(rootDir, source.snapshotPath);
  if (!path) return undefined;
  try {
    const bytes = new Uint8Array(await readFile(path));
    let text = '';
    if (source.textSnapshotPath) {
      const textPath = containedPath(rootDir, source.textSnapshotPath);
      if (textPath && textSnapshotMatchesSource(source)) {
        try {
          const textBytes = await readFile(textPath);
          const digest = createHash('sha256').update(textBytes).digest('hex');
          if (textSnapshotMatchesSource(source, digest)) {
            text = new TextDecoder('utf-8', { fatal: true }).decode(textBytes);
          }
        } catch {
          // Nedostajući ili neispravan izvadak ostaje prazan: nikad ne vraćaj nepotvrđen tekst.
        }
      }
    } else {
      try {
        text = await extractSnapshotText(path, bytes);
      } catch {
        // Nepodržani/nerazrješivi format ostaje fail-closed: hash bajtova se može mjeriti,
        // ali bez teksta se citat ne može potvrditi.
      }
    }
    return { bytes, text, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch {
    return undefined;
  }
}

export function textSnapshotMatchesSource(source: SourceEntry, digest?: string): boolean {
  return !!(source.textSnapshotHash && source.snapshotHash && /^[a-f0-9]{64}$/.test(source.snapshotHash)
    && source.textSnapshotOf === source.snapshotHash
    && /^[a-f0-9]{64}$/.test(source.textSnapshotHash)
    && (digest === undefined || digest === source.textSnapshotHash));
}

async function readManifestFile(rootDir: string, profileId: string): Promise<AiEvidenceManifestFile | undefined> {
  if (!/^[A-Za-z0-9_-]+$/.test(profileId)) return undefined;
  const path = containedPath(rootDir, `data/verification/closed-loop-manifests/${profileId}.json`);
  if (!path) return undefined;
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.profileId !== 'string' || !Array.isArray(candidate.manifests)) return undefined;
    return { profileId: candidate.profileId, manifests: candidate.manifests };
  } catch {
    return undefined;
  }
}

/** Učitava dokazne ulaze iz repozitorija; sve greške čitanja ostaju eksplicitno nevaljan audit. */
export async function loadRepositoryAiEvidenceContext(
  rootDir: string,
  profiles: readonly ThesisProfile[],
  sources: readonly SourceEntry[],
  options: { targetProfileIds?: readonly string[] } = {},
) {
  const targetProfileIds = new Set(options.targetProfileIds ?? []);
  const needsAiContext = profiles.filter((profile) =>
    targetProfileIds.has(profile.id)
    || (profile.ruleEntries ?? []).some((entry) => entry.confirmedVia === 'ai-evidence-audit'),
  );
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const sourceIds = new Set(needsAiContext.flatMap((profile) =>
    (profile.ruleEntries ?? [])
      .filter((entry) => (targetProfileIds.has(profile.id) || entry.confirmedVia === 'ai-evidence-audit') && entry.sourceId)
      .map((entry) => entry.sourceId!),
  ));
  const snapshots: Record<string, AiEvidenceSnapshot> = {};
  for (const sourceId of sourceIds) {
    const source = sourceById.get(sourceId);
    if (!source) continue;
    const snapshot = await readSnapshot(rootDir, source);
    if (snapshot) snapshots[sourceId] = snapshot;
  }

  const manifestFiles: Record<string, AiEvidenceManifestFile | undefined> = {};
  for (const profile of needsAiContext) {
    manifestFiles[profile.id] = await readManifestFile(rootDir, profile.id);
  }

  const ruleValueHashesByRule: Record<string, string> = {};
  for (const profile of needsAiContext) {
    for (const entry of profile.ruleEntries ?? []) {
      ruleValueHashesByRule[ruleEvidenceKey(profile.id, entry.ruleId)] =
        createHash('sha256').update(stableJson(entry.value), 'utf8').digest('hex');
    }
  }
  let currentRepairSourceHash: string | undefined;
  let currentAnalysisSourceHash: string | undefined;
  try {
    currentRepairSourceHash = hashRepairSourceTree(resolve(rootDir, 'src', 'repair'));
  } catch {
    // Nepostojeci kod popravka ne moze dati valjan izvrsni dokaz.
  }
  try {
    currentAnalysisSourceHash = hashAnalysisSourceTree(rootDir);
  } catch {
    // Missing analysis code cannot validate a detector manifest.
  }

  return resolveAiEvidenceContext(profiles, sources, {
    snapshotsBySourceId: snapshots,
    manifestFilesByProfileId: manifestFiles,
    currentRepairSourceHash,
    currentAnalysisSourceHash,
    ruleValueHashesByRule,
  });
}
