#!/usr/bin/env node
// Red pregleda drugog providera: jedna dugotrajna sesija na radnoj stanici uzima PR-ove s oznakom
// `grok-review` ili `codex-review`, pregleda samo deltu od zadnjeg pregleda, objavi nalaze na PR-u
// i skine oznaku. Niti samo stavljaju oznaku. Posao ide serijski (jedna teska provjera odjednom),
// svaki u vlastitom odvojenom worktreeju izvan repozitorija. Samo pretplata (grok login, codex login).
//
//   node scripts/agents/review-queue.mjs --once      jedan prolaz pa izlaz
//   node scripts/agents/review-queue.mjs             petlja, prolaz svakih --interval sekundi (60)
//   node scripts/agents/review-queue.mjs --dry-run   samo ispisi sto bi se pregledalo
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveProviderInvocation } from './cli.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  buildCommand, buildPrompt, shimInvocation, codexModel, extractGrokText, forbiddenEnv, formatComment, GROK_MODEL,
  labelForProvider, MAX_FAILURES, pickDeltaBase, reviewKey, selectNext, touchesProtected, truncateDiff,
} from './review-queue-core.mjs';

const REPO = process.env.LEKTA_REVIEW_REPO ?? 'danielrisavi77-create/Lekta';
const ROOT = resolve(process.cwd());
const WT_DIR = resolve(ROOT, '..', 'lekta-wt');
const STATE_DIR = join(ROOT, '.artifacts', 'review-queue');
const STATE_FILE = join(STATE_DIR, 'state.json');
const LOCK_FILE = join(STATE_DIR, 'lock');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const intervalSec = Number(argv[argv.indexOf('--interval') + 1]) > 0 ? Number(argv[argv.indexOf('--interval') + 1]) : 60;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  return r;
}
const gh = (args) => {
  const r = run('gh', args);
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(' ')} pao: ${(r.stderr || '').trim().slice(0, 300)}`);
  return r.stdout;
};
const git = (args, cwd = ROOT) => run('git', args, { cwd });
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

function loadState() {
  try { return { reviewed: {}, failures: {}, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) }; } catch { return { reviewed: {}, failures: {} }; }
}
const saveState = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

function listLabelled() {
  const fields = 'number,title,body,headRefOid,baseRefName,labels,files';
  const byNumber = new Map();
  for (const label of ['grok-review', 'codex-review']) {
    const out = gh(['pr', 'list', '--repo', REPO, '--state', 'open', '--label', label, '--json', fields, '--limit', '50']);
    for (const pr of JSON.parse(out)) byNumber.set(pr.number, pr);
  }
  return [...byNumber.values()];
}

function review(pr, provider) {
  const key = reviewKey(pr.number, provider);
  const wt = join(WT_DIR, `review-pr${pr.number}-${provider}`);
  const files = (pr.files ?? []).map((f) => f.path);
  const prot = touchesProtected(files, ['src/repair', 'src/citations', 'src/docx', 'supabase', 'security']);
  mkdirSync(WT_DIR, { recursive: true });
  try {
    const fetch = git(['fetch', 'origin', `pull/${pr.number}/head`, pr.baseRefName]);
    if (fetch.status !== 0) throw new Error(`git fetch pao: ${fetch.stderr.trim().slice(0, 300)}`);
    const head = git(['rev-parse', 'FETCH_HEAD']).stdout.trim();
    if (head !== pr.headRefOid) throw new Error('glava PR-a se promijenila tijekom dohvata, sljedeci prolaz');
    const state = loadState();
    const last = state.reviewed[key];
    const lastIsAncestor = Boolean(last) && git(['merge-base', '--is-ancestor', last, head]).status === 0;
    const mergeBase = git(['merge-base', `origin/${pr.baseRefName}`, head]).stdout.trim();
    const { base } = pickDeltaBase({ lastReviewedSha: last, lastIsAncestor, mergeBase });
    const add = git(['worktree', 'add', '--detach', wt, head]);
    if (add.status !== 0) throw new Error(`worktree add pao: ${add.stderr.trim().slice(0, 300)}`);
    const { diff, truncated } = truncateDiff(git(['diff', `${base}..${head}`], wt).stdout);
    const model = provider === 'grok' ? GROK_MODEL : codexModel(prot);
    const promptFile = join(STATE_DIR, `prompt-pr${pr.number}-${provider}.md`);
    const outFile = join(STATE_DIR, `out-pr${pr.number}-${provider}.md`);
    const prompt = buildPrompt({ pr, provider, base, diff, truncated, isProtected: prot });
    writeFileSync(promptFile, prompt);
    const cmd = buildCommand({ provider, model, worktree: wt, promptFile, outFile });
    log(`PR #${pr.number} ${provider} ${model} delta ${base.slice(0, 7)}..${head.slice(0, 7)} (${diff.length} B)`);
    const inv = shimInvocation(cmd.command, cmd.args, { platform: process.platform, resolved: resolveProviderInvocation(cmd.command) });
    const r = run(inv.command, inv.args, { cwd: wt, input: cmd.stdin ? prompt : undefined, timeout: 30 * 60 * 1000, killSignal: 'SIGKILL' });
    if (r.status !== 0) throw new Error(`${provider} izasao sa ${r.status}: ${(r.stderr || '').trim().slice(0, 300)}`);
    const text = provider === 'grok' ? extractGrokText(r.stdout) : (existsSync(outFile) ? readFileSync(outFile, 'utf8') : r.stdout);
    const bodyFile = join(STATE_DIR, `comment-pr${pr.number}-${provider}.md`);
    writeFileSync(bodyFile, formatComment({ provider, model, base, head, text, isProtected: prot }));
    gh(['pr', 'review', String(pr.number), '--repo', REPO, '--comment', '--body-file', bodyFile]);
    gh(['pr', 'edit', String(pr.number), '--repo', REPO, '--remove-label', labelForProvider(provider)]);
    state.reviewed[key] = head;
    state.failures[key] = 0;
    saveState(state);
    log(`PR #${pr.number} ${provider}: objavljeno, oznaka skinuta`);
  } finally {
    git(['worktree', 'remove', '--force', wt]);
    rmSync(wt, { recursive: true, force: true });
    git(['worktree', 'prune']);
  }
}

function fail(pr, provider, err) {
  const key = reviewKey(pr.number, provider);
  const state = loadState();
  state.failures[key] = (state.failures[key] ?? 0) + 1;
  saveState(state);
  log(`PR #${pr.number} ${provider} nije uspio (${state.failures[key]}/${MAX_FAILURES}): ${err.message}`);
  if (state.failures[key] >= MAX_FAILURES) {
    try {
      const f = join(STATE_DIR, `fail-pr${pr.number}-${provider}.md`);
      writeFileSync(f, `Pregled (${provider}) nije uspio ${MAX_FAILURES} puta zaredom pa je oznaka skinuta. Ponovno stavi oznaku nakon sto se uzrok ukloni.\n\n_Savjetodavni pregled drugog providera._`);
      gh(['pr', 'comment', String(pr.number), '--repo', REPO, '--body-file', f]);
      gh(['pr', 'edit', String(pr.number), '--repo', REPO, '--remove-label', labelForProvider(provider)]);
      state.failures[key] = 0;
      saveState(state);
    } catch (e) { log(`objava kvara pala: ${e.message}`); }
  }
}

function pass() {
  const state = loadState();
  const next = selectNext(listLabelled(), state);
  if (!next) return false;
  const pr = listLabelled().find((p) => p.number === next.number);
  const key = reviewKey(next.number, next.provider);
  if (flag('--dry-run')) { log(`bi pregledao PR #${next.number} (${next.provider})${next.noDelta ? ' [nema delte]' : ''}`); return false; }
  if (next.noDelta) {
    gh(['pr', 'edit', String(next.number), '--repo', REPO, '--remove-label', labelForProvider(next.provider)]);
    log(`PR #${next.number} ${next.provider}: nema nove delte od zadnjeg pregleda, oznaka skinuta`);
    return true;
  }
  try { review(pr, next.provider); } catch (e) { fail(pr, next.provider, e); }
  return true;
}

async function main() {
  const bad = forbiddenEnv(process.env);
  if (bad.length) throw new Error(`Odbijeno: ${bad.join(', ')} u okolini (samo pretplata: grok login, codex login)`);
  mkdirSync(STATE_DIR, { recursive: true });
  let fd;
  try { fd = openSync(LOCK_FILE, 'wx'); } catch { throw new Error(`Red vec radi (zakljucano: ${LOCK_FILE}). Ako je ostalo od pada, obrisi datoteku.`); }
  closeSync(fd);
  const release = () => { try { unlinkSync(LOCK_FILE); } catch { /* vec uklonjeno */ } };
  process.on('SIGINT', () => { release(); process.exit(130); });
  process.on('SIGTERM', () => { release(); process.exit(143); });
  try {
    log(`Red pregleda ${REPO}; ${flag('--once') || flag('--dry-run') ? 'jedan prolaz' : `petlja svakih ${intervalSec} s`}`);
    const single = flag('--once') || flag('--dry-run');
    for (;;) {
      let worked = true;
      while (worked) {
        try { worked = pass(); } catch (e) { log(`prolaz pao: ${e.message}`); worked = false; }
        if (flag('--dry-run')) break;
      }
      if (single) break;
      await sleep(intervalSec * 1000);
    }
  } finally { release(); }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
