import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scratch = dirname(fileURLToPath(import.meta.url));
const root = 'C:/Users/PC/lekta-wt/ai-evidence';
const run = join(scratch, 'run5');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const plan = read(join(run, 'plan.json'));
const accepted = new Set();
const refuted = new Set();
for (const name of readdirSync(join(run, 'verdict')).filter((name) => name.endsWith('.json'))) {
  const verdict = read(join(run, 'verdict', name));
  for (const id of verdict.accepted ?? []) accepted.add(id);
  for (const row of verdict.refuted ?? []) refuted.add(row.ruleId);
}
const eligible = [];
const skipped = [];
for (const [profileId, profile] of Object.entries(plan.profiles)) {
  const ids = profile.targetRuleIds ?? [];
  const missing = ids.filter((id) => !accepted.has(id));
  const rejected = ids.filter((id) => refuted.has(id));
  if (profile.blocked) skipped.push({ profileId, reason: `plan-blocked:${JSON.stringify(profile.blocked)}` });
  else if (!ids.length) skipped.push({ profileId, reason: 'no-target-rules' });
  else if (rejected.length) skipped.push({ profileId, reason: `refuted:${rejected.join(',')}` });
  else if (missing.length) skipped.push({ profileId, reason: `missing-accepted-verdict:${missing.join(',')}` });
  else eligible.push({ profileId, ruleIds: ids });
}
const ledger = read(join(root, 'docs/generated/completion-ledger.json'));
const worklist = read(join(root, 'data/verification/ai-evidence-worklist.json'));
const baseline = {
  facultyAtLeastB: ledger.facultyMinimumB.facultyAtLeastB,
  facultyBelowB: ledger.facultyMinimumB.facultyBelowB,
  aiEvidenceVerified: worklist.statusCounts['ai-evidence-verified'],
};
const output = { planProfiles: Object.keys(plan.profiles).length, planRuleCount: plan.ruleCount,
  verdictAccepted: accepted.size, verdictRefuted: refuted.size, eligible, skipped, baseline };
writeFileSync(join(scratch, 'run5-preflight.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ planProfiles: output.planProfiles, accepted: accepted.size,
  refuted: refuted.size, eligible, skipped: skipped.length, baseline: {
    facultyAtLeastB: baseline.facultyAtLeastB, aiEvidenceVerified: baseline.aiEvidenceVerified,
  } }));
