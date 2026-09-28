// Priprema ulaznih paketa po izvoru za dokazni AI-audit. Samo cita repozitorij; pise iskljucivo u --out.
// Pokretanje iz korijena stabla: npx vite-node <ovaj put> -- --root <stablo> --out <scratch> [--profiles a,b] [--include-mixed-human]
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const opt = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const root = resolve(opt('--root') ?? process.cwd());
const out = resolve(opt('--out') ?? '');
const onlyProfiles = new Set((opt('--profiles') ?? '').split(',').filter(Boolean));
const includeMixedHuman = argv.includes('--include-mixed-human');
if (!opt('--out')) { console.error('nedostaje --out'); process.exit(2); }

type Rule = Record<string, any> & { ruleId: string };
const OFFICIAL = new Set(['binding', 'program-page', 'general']);
const TARGET_STATUSES = new Set(['needs-ai-evidence', 'needs-recheck', 'not-scored']);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function shape(v: unknown): unknown {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : ['unknown'];
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, shape((v as any)[k])]));
  return typeof v;
}

function jsonFiles(dir: string): string[] {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? jsonFiles(p) : e.isFile() && e.name.endsWith('.json') ? [p] : [];
  });
}

// Profilni nacrti: isti oblik kao apply-ai-evidence-profile.mts (entries ili profiles[id]).
const draftEntries = new Map<string, Rule[]>();
for (const path of jsonFiles(join(root, 'data', 'profiles'))) {
  if (!relative(root, path).split(sep).includes('drafts')) continue;
  let doc: any;
  try { doc = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) continue;
  if (typeof doc.profileId === 'string' && Array.isArray(doc.entries)) {
    if (draftEntries.has(doc.profileId)) throw new Error(`${doc.profileId}: vise nacrta`);
    draftEntries.set(doc.profileId, doc.entries);
  } else if (doc.profiles && typeof doc.profiles === 'object') {
    for (const [id, entries] of Object.entries(doc.profiles)) {
      if (!Array.isArray(entries)) continue;
      if (draftEntries.has(id)) throw new Error(`${id}: vise nacrta`);
      draftEntries.set(id, entries as Rule[]);
    }
  }
}

// Dopustene vrijednosti za nabrojene osi (string ili niz stringova): Lektini identifikatori koje model
// ne moze pogoditi iz teksta izvora (npr. citatni stil `chicago-notes`). Skup je izveden iz svih nacrta.
const allowedByCheck = new Map<string, Set<string>>();
for (const entries of draftEntries.values()) {
  for (const e of entries) {
    if (!e?.checkId) continue;
    const vals = typeof e.value === 'string' ? [e.value] : Array.isArray(e.value) && e.value.every((v: unknown) => typeof v === 'string') ? e.value : [];
    for (const v of vals) (allowedByCheck.get(e.checkId) ?? allowedByCheck.set(e.checkId, new Set()).get(e.checkId)!).add(v);
  }
}
const ENUM_CHECKS = new Set(['citation-style', 'paper-size']);

const worklist = JSON.parse(readFileSync(join(root, 'data', 'verification', 'ai-evidence-worklist.json'), 'utf8'));
const byProfile = new Map<string, any[]>();
for (const r of worklist.rules) {
  if (onlyProfiles.size && !onlyProfiles.has(r.profileId)) continue;
  (byProfile.get(r.profileId) ?? byProfile.set(r.profileId, []).get(r.profileId)!).push(r);
}

// Ciljna pravila: needs-* uvijek; ljudski potvrdjena samo u mijesanim profilima i samo uz zastavicu,
// jer primjena je atomska po profilu i trazi dokaz za SVA bodovana pravila.
const targets: Array<{ profileId: string; rule: Rule; status: string }> = [];
const profilePlan: Record<string, any> = {};
for (const [profileId, rows] of byProfile) {
  const needs = rows.filter((r) => TARGET_STATUSES.has(r.status));
  if (!needs.length) continue;
  const human = rows.filter((r) => r.status === 'human-verified');
  const mixed = human.length > 0;
  const entries = draftEntries.get(profileId);
  if (!entries) { profilePlan[profileId] = { blocked: 'draft-missing' }; continue; }
  const pick = [...needs, ...(mixed && includeMixedHuman ? human : [])];
  for (const r of pick) {
    const rule = entries.find((e) => e.ruleId === r.ruleId);
    if (rule) targets.push({ profileId, rule, status: r.status });
  }
  const scored = entries.filter((e) => e.scored === true).map((e) => e.ruleId);
  profilePlan[profileId] = { mixed, scoredRuleIds: scored, targetRuleIds: pick.map((r) => r.ruleId), humanRuleIds: human.map((r) => r.ruleId) };
}

const sourcesRaw = JSON.parse(readFileSync(join(root, 'data', 'sources', 'source-registry.json'), 'utf8'));
const sources: any[] = Array.isArray(sourcesRaw) ? sourcesRaw : sourcesRaw.sources;
const sourceById = new Map(sources.map((s) => [s.id, s]));

const loaderUrl = pathToFileURL(join(root, 'scripts', 'ai-evidence-context-loader.ts')).href;
const { loadRepositoryAiEvidenceContext } = await import(loaderUrl);
const profilesMin = [...new Set(targets.map((t) => t.profileId))].map((id) => ({ id, ruleEntries: draftEntries.get(id) }));
const ctx = await loadRepositoryAiEvidenceContext(root, profilesMin, sources, { targetProfileIds: profilesMin.map((p) => p.id) });
const texts: Record<string, string> = ctx.gateContext.snapshotTextsBySourceId;
const bytes: Record<string, Uint8Array> = ctx.gateContext.snapshotBytesBySourceId;

for (const d of ['in', 'snap', 'truth', 'out', 'val', 'verdict', 'accepted']) mkdirSync(join(out, d), { recursive: true });

const blocked: any[] = [];
const unscored: any[] = [];
const bundles = new Map<string, any>();
const truth: Record<string, any> = {};
for (const { profileId, rule, status } of targets) {
  const block = (code: string) => blocked.push({ profileId, ruleId: rule.ruleId, sourceId: rule.sourceId ?? null, code });
  const src = rule.sourceId ? sourceById.get(rule.sourceId) : undefined;
  // Nebodovano pravilo ne blokira atomsku primjenu profila, ali ga postojeci apply alat ne moze
  // promaknuti (filtrira scored === true). Vodi se zasebno kao praznina u kodu.
  // Od #146 primjena promice i nebodovana pending pravila s valjanim dokazom, pa ih ukljuci; retired i advisory ne.
  const PROMOTABLE = new Set(['draft', 'needs-recheck', 'verified', 'ai-confirmed']);
  if (rule.scored !== true && !PROMOTABLE.has(rule.status)) { unscored.push({ profileId, ruleId: rule.ruleId, sourceId: rule.sourceId ?? null, status }); continue; }
  if (!src) { block('source-missing'); continue; }
  if (!OFFICIAL.has(rule.authority)) { block('unofficial-source'); continue; }
  if (!src.snapshotPath || !src.snapshotHash) { block('source-snapshot-missing'); continue; }
  const b = bytes[src.id];
  if (!b || sha256(b) !== src.snapshotHash) { block('snapshot-content-hash-mismatch'); continue; }
  const text = texts[src.id] ?? '';
  if (!text.trim()) { block('snapshot-text-unreadable'); continue; }
  if (!rule.sourcePage?.trim()) { block('source-page-missing'); continue; }
  if (!rule.quote?.trim()) { block('quote-missing'); continue; }
  const nt = norm(text);
  const nq = norm(rule.quote);
  const contexts: string[] = [];
  for (let i = nt.indexOf(nq); i >= 0 && contexts.length < 3; i = nt.indexOf(nq, i + 1)) {
    contexts.push(nt.slice(Math.max(0, i - 1200), Math.min(nt.length, i + nq.length + 1200)));
  }
  if (!contexts.length) { block('quote-not-found'); continue; }

  if (!bundles.has(src.id)) {
    writeFileSync(join(out, 'snap', `${src.id}.txt`), text, 'utf8');
    bundles.set(src.id, {
      source: { id: src.id, url: src.url, fetchedAt: src.fetchedAt, snapshotHash: src.snapshotHash, snapshotTextPath: join(out, 'snap', `${src.id}.txt`) },
      rules: [],
    });
  }
  bundles.get(src.id).rules.push({
    profileId, ruleId: rule.ruleId, checkId: rule.checkId, label: rule.label, sourcePage: rule.sourcePage,
    quote: rule.quote, valueShape: shape(rule.value), contexts, priorStatus: status,
    ...(ENUM_CHECKS.has(rule.checkId) && allowedByCheck.has(rule.checkId) ? { allowedValues: [...allowedByCheck.get(rule.checkId)!].sort() } : {}),
  });
  (truth[profileId] ??= {})[rule.ruleId] = { value: rule.value, modality: rule.modality ?? null, scope: rule.scope ?? null };
}

for (const [id, bundle] of bundles) writeFileSync(join(out, 'in', `${id}.json`), JSON.stringify(bundle, null, 2), 'utf8');
// Istina profila ostaje izvan in/: izvlacenje je slijepo, usporedba je deterministicka.
for (const [pid, rules] of Object.entries(truth)) writeFileSync(join(out, 'truth', `${pid}.json`), JSON.stringify(rules, null, 2), 'utf8');

const blockedByProfile = new Set(blocked.map((b) => b.profileId));
const reachable = Object.entries(profilePlan)
  .filter(([id, p]) => !p.blocked && !blockedByProfile.has(id) && (!p.mixed || includeMixedHuman))
  .map(([id]) => id);
const plan = {
  root, includeMixedHuman,
  sources: [...bundles.keys()].sort(),
  ruleCount: [...bundles.values()].reduce((n, b) => n + b.rules.length, 0),
  blocked,
  unscored,
  blockedCounts: blocked.reduce((m: any, b) => ((m[b.code] = (m[b.code] ?? 0) + 1), m), {}),
  profiles: profilePlan,
  reachableProfiles: reachable,
};
writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 2), 'utf8');
console.log(JSON.stringify({ sources: plan.sources.length, rules: plan.ruleCount, blocked: plan.blockedCounts, unscored: unscored.length, profiles: Object.keys(profilePlan).length, reachable: reachable.length }));
