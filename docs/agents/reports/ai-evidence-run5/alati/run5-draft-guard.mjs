import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scratch = dirname(fileURLToPath(import.meta.url));
const root = 'C:/Users/PC/lekta-wt/ai-evidence';
const [mode, id] = process.argv.slice(2);
if (!['backup', 'assembly', 'applied', 'restore'].includes(mode) || !['vus-diplomski', 'vus-zavrsni'].includes(id)) throw new Error('usage: <backup|assembly|applied|restore> <vus-profile>');
const path = join(root, 'data/profiles/vus/drafts', `${id}.json`);
const backupDir = join(scratch, 'run5-backups');
const backupPath = join(backupDir, `${id}.json`);
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
if (mode === 'backup') {
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(backupPath, readFileSync(path));
  console.log(JSON.stringify({ id, backedUp: backupPath }));
} else if (mode === 'restore') {
  writeFileSync(path, readFileSync(backupPath));
  console.log(JSON.stringify({ id, restoredByteIdentically: true }));
} else {
  const before = read(backupPath);
  const after = read(path);
  const targets = new Set(read(join(scratch, 'run5-preflight.json')).eligible.find((row) => row.profileId === id).ruleIds);
  if (before.profileId !== after.profileId || before.entries.length !== after.entries.length) throw new Error('draft shape changed');
  const protectedFields = ['value', 'modality', 'scope', 'quote', 'sourcePage'];
  for (let i = 0; i < before.entries.length; i++) {
    const old = before.entries[i], next = after.entries[i];
    if (old.ruleId !== next.ruleId) throw new Error(`rule order changed: ${i}`);
    for (const field of protectedFields) if (JSON.stringify(old[field]) !== JSON.stringify(next[field])) throw new Error(`${old.ruleId}: ${field} changed`);
    if (mode === 'assembly') {
      const previous = structuredClone(old), current = structuredClone(next);
      if (targets.has(old.ruleId)) {
        delete previous.aiEvidence; delete current.aiEvidence;
        if (next.aiEvidence?.schemaVersion !== 2) throw new Error(`${old.ruleId}: no schema 2 evidence`);
      }
      if (JSON.stringify(previous) !== JSON.stringify(current)) throw new Error(`${old.ruleId}: non-evidence field changed during assembly`);
    }
  }
  console.log(JSON.stringify({ id, mode, protectedFieldsUnchanged: true, targetRules: targets.size }));
}
