import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const scratch = dirname(fileURLToPath(import.meta.url));
const original = join(scratch, 'run5');
const derived = join(scratch, 'run5-canonical');
const root = 'C:/Users/PC/lekta-wt/ai-evidence';
const profileIds = ['vus-diplomski', 'vus-zavrsni'];
const sourceId = 'vus-pravilnik-zavrsni-diplomski-2023';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const folder of ['', 'in', 'out', 'verdict', 'truth']) mkdirSync(join(derived, folder), { recursive: true });
copyFileSync(join(original, 'plan.json'), join(derived, 'plan.json'));
for (const profileId of profileIds) copyFileSync(join(original, 'truth', `${profileId}.json`), join(derived, 'truth', `${profileId}.json`));
copyFileSync(join(original, 'verdict', `${sourceId}.json`), join(derived, 'verdict', `${sourceId}.json`));
for (const provider of ['luna', 'sol']) {
  const name = `${sourceId}.${provider}.json`;
  if (existsSync(join(original, 'out', name))) copyFileSync(join(original, 'out', name), join(derived, 'out', name));
}
const inputPath = join(original, 'in', `${sourceId}.json`);
const sourceBytes = readFileSync(inputPath);
const input = JSON.parse(sourceBytes.toString('utf8'));
const targets = new Map();
for (const profileId of profileIds) {
  const draft = read(join(root, 'data', 'profiles', 'vus', 'drafts', `${profileId}.json`));
  const planned = read(join(original, 'plan.json')).profiles[profileId].targetRuleIds;
  for (const ruleId of planned) {
    const entry = draft.entries.find((row) => row.ruleId === ruleId);
    if (!entry) throw new Error(`missing draft rule: ${ruleId}`);
    targets.set(ruleId, { profileId, quote: entry.quote, sourcePage: entry.sourcePage });
  }
}
const changed = [];
for (const row of input.rules) {
  const target = targets.get(row.ruleId);
  if (!target || row.profileId !== target.profileId) continue;
  if (row.sourcePage !== target.sourcePage) throw new Error(`source page differs: ${row.ruleId}`);
  const canonical = row.quote.replace(/\r\n?/g, '\n');
  if (canonical !== target.quote || row.quote === canonical) throw new Error(`not a pure CR normalization: ${row.ruleId}`);
  row.quote = canonical;
  changed.push(row.ruleId);
}
if (changed.length !== targets.size) throw new Error(`normalized ${changed.length}/${targets.size} target rules`);
const derivedPath = join(derived, 'in', `${sourceId}.json`);
writeFileSync(derivedPath, `${JSON.stringify(input, null, 2)}\n`);
const note = { originalInput: inputPath, originalSha256: digest(sourceBytes),
  derivedInput: derivedPath, derivedSha256: digest(readFileSync(derivedPath)),
  transform: 'CRLF and CR to LF in quote of exactly eight VUS target rules; no other parsed values changed',
  changedRuleIds: changed };
writeFileSync(join(derived, 'CANONICALIZATION.json'), `${JSON.stringify(note, null, 2)}\n`);
console.log(JSON.stringify({ derived, changed: changed.length, originalSha256: note.originalSha256,
  derivedSha256: note.derivedSha256 }));
