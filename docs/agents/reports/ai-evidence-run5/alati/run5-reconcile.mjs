import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scratch = dirname(fileURLToPath(import.meta.url));
const root = 'C:/Users/PC/lekta-wt/ai-evidence';
const run = join(scratch, 'run5');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sources = new Map(read(join(root, 'data/sources/source-registry.json')).map((row) => [row.id, row]));
const eligibility = read(join(scratch, 'run5-preflight.json')).eligible;
const normalize = (value) => value.replace(/\r\n?/g, '\n');
function findDraft(profileId) {
  for (const faculty of readdirSync(join(root, 'data/profiles'), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dir = join(root, 'data/profiles', faculty.name, 'drafts');
    let names;
    try { names = readdirSync(dir).filter((name) => name.endsWith('.json')); } catch { continue; }
    for (const name of names) {
      const doc = read(join(dir, name));
      const entries = doc.profileId === profileId ? doc.entries : doc.profiles?.[profileId];
      if (Array.isArray(entries)) return entries;
    }
  }
  throw new Error(`draft missing: ${profileId}`);
}
for (const { profileId, ruleIds } of eligibility) {
  const entries = new Map(findDraft(profileId).map((e) => [e.ruleId, e]));
  let manifests = [];
  try { manifests = read(join(root, 'data/verification/closed-loop-manifests', `${profileId}.json`)).manifests ?? []; } catch { /* none */ }
  const details = [];
  for (const ruleId of ruleIds) {
    const entry = entries.get(ruleId);
    const source = sources.get(entry.sourceId);
    const input = read(join(run, 'in', `${entry.sourceId}.json`));
    const inputRule = input.rules.find((e) => e.profileId === profileId && e.ruleId === ruleId);
    const manifest = manifests.find((e) => e.ruleId === ruleId);
    details.push({ ruleId, quoteExact: entry.quote === inputRule?.quote,
      quoteCanonical: entry.quote === normalize(inputRule?.quote ?? ''),
      quoteDraftCR: entry.quote.includes('\r'), quoteInputCR: inputRule?.quote?.includes('\r'),
      sourcePageSame: entry.sourcePage === inputRule?.sourcePage,
      sourceIdSame: input.source.id === source.id,
      sourceUrlSame: input.source.url === source.url,
      sourceHashSame: input.source.snapshotHash === source.snapshotHash,
      sourceFetchedSame: input.source.fetchedAt === source.fetchedAt,
      manifest: manifest?.outcome ?? 'missing' });
  }
  console.log(JSON.stringify({ profileId, details }));
}
