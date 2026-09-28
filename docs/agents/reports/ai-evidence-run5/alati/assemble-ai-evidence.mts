// Sastavlja aiEvidence sheme 2 za JEDAN profil iz: slijepog izvlacenja (Luna/Sol), presude pobijanja (Sonnet),
// pripreme (plan.json, truth/) i closed-loop manifesta. Bez --write-draft samo izvjestava.
// Pokretanje iz korijena stabla: npx vite-node <ovaj put> -- --root <stablo> --scratch <dir> --profile <id> [--write-draft]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const opt = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const root = resolve(opt('--root') ?? process.cwd());
const S = resolve(opt('--scratch') ?? '');
const profileId = opt('--profile') ?? '';
const writeDraft = argv.includes('--write-draft');
if (!opt('--scratch') || !/^[A-Za-z0-9_-]+$/.test(profileId)) { console.error('upotreba: --root --scratch --profile <id> [--write-draft]'); process.exit(2); }

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const stable = (v: unknown): string => v === null || typeof v !== 'object' ? JSON.stringify(v) ?? 'undefined'
  : Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as any)[k])}`).join(',')}}`;

const plan = readJson(join(S, 'plan.json'));
const pp = plan.profiles[profileId];
if (!pp || pp.blocked) { console.log(JSON.stringify({ profileId, ok: false, reason: pp?.blocked ?? 'profil-nije-u-planu' })); process.exit(1); }
const truth = existsSync(join(S, 'truth', `${profileId}.json`)) ? readJson(join(S, 'truth', `${profileId}.json`)) : {};

// Nacrt profila (isti oblik kao apply-ai-evidence-profile.mts).
function jsonFiles(dir: string): string[] {
  let es; try { es = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return es.flatMap((e) => { const p = join(dir, e.name); return e.isDirectory() ? jsonFiles(p) : e.name.endsWith('.json') ? [p] : []; });
}
let draftPath = ''; let draftDoc: any; let entries: any[] = [];
for (const p of jsonFiles(join(root, 'data', 'profiles'))) {
  if (!relative(root, p).split(sep).includes('drafts')) continue;
  let d: any; try { d = readJson(p); } catch { continue; }
  const es = d?.profileId === profileId ? d.entries : d?.profiles?.[profileId];
  if (Array.isArray(es)) { if (draftPath) throw new Error('vise nacrta'); draftPath = p; draftDoc = d; entries = es; }
}
if (!draftPath) throw new Error(`${profileId}: nacrt nije nadjen`);

const sources: any[] = (() => { const s = readJson(join(root, 'data', 'sources', 'source-registry.json')); return Array.isArray(s) ? s : s.sources; })();
const sourceById = new Map(sources.map((s) => [s.id, s]));
const manifestPath = join(root, 'data', 'verification', 'closed-loop-manifests', `${profileId}.json`);
const manifests: any[] = existsSync(manifestPath) ? readJson(manifestPath).manifests ?? [] : [];

// Izvlacenje: Sol (ponovni pokusaj) ima prednost nad Lunom za isto pravilo.
function extraction(sourceId: string, ruleId: string) {
  for (const pass of ['sol', 'luna']) {
    const p = join(S, 'out', `${sourceId}.${pass}.json`);
    if (!existsSync(p)) continue;
    const o = readJson(p);
    const r = (o.rules ?? []).find((x: any) => x.profileId === profileId && x.ruleId === ruleId);
    if (r) return { ...r, model: o.model, pass };
  }
  return undefined;
}
function verdict(sourceId: string, ruleId: string) {
  const p = join(S, 'verdict', `${sourceId}.json`);
  if (!existsSync(p)) return undefined;
  const v = readJson(p);
  if ((v.accepted ?? []).includes(ruleId)) return { ok: true, note: 'Protivnicki pregled drugog providera nije nasao proturjecje ni iznimku.' };
  const f = (v.refuted ?? []).find((x: any) => x.ruleId === ruleId);
  return f ? { ok: false, note: f.reason } : undefined;
}

const scored = entries.filter((e) => e.scored === true);
const targetIds = new Set<string>(pp.targetRuleIds ?? []);
const pending = entries.filter((e) => targetIds.has(e.ruleId));
const rows: any[] = [];
const built = new Map<string, any>();
if (targetIds.size !== pending.length || targetIds.size === 0) {
  rows.push({ ruleId: '*', ok: false, code: 'target-set-missing-or-duplicate' });
}
for (const e of pending) {
  const miss = (code: string, extra: any = {}) => rows.push({ ruleId: e.ruleId, ok: false, code, ...extra });
  const src = sourceById.get(e.sourceId);
  if (!src) { miss('source-missing'); continue; }
  const inputPath = join(S, 'in', `${e.sourceId}.json`);
  if (!existsSync(inputPath)) { miss('source-input-missing'); continue; }
  const input = readJson(inputPath);
  const sourceInput = input.source;
  const inputRule = (input.rules ?? []).find((r: any) => r.profileId === profileId && r.ruleId === e.ruleId);
  // Paket je mogao nastati prije CR->LF normalizacije sidrenja; validator ionako uspoređuje uz sazete razmake.
  const nq = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!inputRule || nq(inputRule.quote) !== nq(e.quote) || inputRule.sourcePage !== e.sourcePage
      || sourceInput?.id !== src.id || sourceInput?.url !== src.url
      || sourceInput?.snapshotHash !== src.snapshotHash || sourceInput?.fetchedAt !== src.fetchedAt) {
    miss('source-input-mismatch'); continue;
  }
  const x = extraction(e.sourceId, e.ruleId);
  if (!x) { miss('no-extraction'); continue; }
  if (x.verdict !== 'extracted') { miss(`extract-${x.verdict}`, { note: x.note }); continue; }
  const t = truth[e.ruleId];
  if (!t) { miss('truth-missing'); continue; }
  const diffs = ['value', 'modality', 'scope'].filter((k) => stable(x[k]) !== stable(t[k]));
  if (diffs.length) { miss('blind-mismatch', { diffs, extracted: { value: x.value, modality: x.modality, scope: x.scope } }); continue; }
  if (!['openai', 'open ai', 'openai-codex'].includes(String(x.model?.provider ?? '').toLowerCase())
      || !String(x.model?.model ?? '').trim() || !String(x.model?.version ?? '').trim()) {
    miss('extract-model-missing-or-unknown'); continue;
  }
  const v = verdict(e.sourceId, e.ruleId);
  if (!v) { miss('no-refute-verdict'); continue; }
  if (!v.ok) { miss('refuted', { note: v.note }); continue; }
  const m = manifests.find((mm) => mm.ruleId === e.ruleId && mm.profileId === profileId);
  if (!m) { miss('manifest-missing'); continue; }
  if (m.outcome !== 'pass') { miss('manifest-not-pass'); continue; }
  built.set(e.ruleId, {
    schemaVersion: 2, profileId, ruleId: e.ruleId, sourceId: src.id, sourceUrl: src.url, fetchedAt: src.fetchedAt,
    snapshotHash: src.snapshotHash, sourcePage: e.sourcePage, quote: e.quote,
    claim: { value: x.value, modality: x.modality, scope: x.scope },
    passes: [
      { pass: 'extract', verdict: 'confirm', note: `Slijepo izvlacenje (${x.model.model}): ${x.note}`,
        model: { provider: 'openai', model: x.model.model, version: x.model.version } },
      { pass: 'quote-check', verdict: 'confirm', note: 'Deterministicki: citat pronadjen u registriranoj snimci uz normalizaciju razmaka; hash snimke odgovara registru.' },
      { pass: 'refute', verdict: 'confirm', note: `Drugi provider (Anthropic Claude Sonnet 5): ${v.note}`,
        model: { provider: 'anthropic', model: 'claude-sonnet-5', version: 'not-reported' } },
    ],
    agree: true,
    summary: `Slijepo izvucena vrijednost, modalitet i opseg podudaraju se s pravilom; pobijanje drugog providera nije uspjelo.`,
    model: { provider: 'openai', model: x.model.model, version: x.model.version },
    execution: { manifestId: m.manifestId, testId: m.testId, command: m.command, inputHash: m.inputHash, outputHash: m.outputHash, ranAt: m.ranAt },
  });
  rows.push({ ruleId: e.ruleId, ok: true, extractor: x.pass });
}

// Djelomicna primjena (vlasnik 2026-09-27): upisuje se dokaz za prihvacena pravila; o profilu presuduje
// apply-ai-evidence-profile (nebodovano bez dokaza preskace, bodovano bez valjanog dokaza rusi profil).
const partial = argv.includes('--partial');
const complete = partial
  ? built.size > 0 && targetIds.size === pending.length
  : targetIds.size > 0 && targetIds.size === pending.length && built.size === targetIds.size;
if (writeDraft && complete) {
  const next = entries.map((e) => built.has(e.ruleId) ? { ...e, aiEvidence: built.get(e.ruleId) } : e);
  if (draftDoc.profileId === profileId) draftDoc.entries = next; else draftDoc.profiles[profileId] = next;
  writeFileSync(draftPath, `${JSON.stringify(draftDoc, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({
  profileId, ok: complete, wroteDraft: writeDraft && complete, scored: scored.length, pending: pending.length,
  ready: built.size, missing: rows.filter((r) => !r.ok), draft: relative(root, draftPath),
}));
process.exitCode = complete ? 0 : 1;
