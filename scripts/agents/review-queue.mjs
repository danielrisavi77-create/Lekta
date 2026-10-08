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
import { setTimeout as sleep } from 'node:timers/promises';
import {
  buildCommand, buildPrompt, codexModel, DELTA_FILE, extractGrokText, forbiddenEnv, formatComment, GROK_MODEL,
  gateRefused, grokNeedsCodex, implementersOf, independenceProblem, labelForProvider, MAX_FAILURES, pickDeltaBase, reviewKey, reviewStamp,
  scrubEnv, selectNext, touchesProtected, truncateDiff,
} from './review-queue-core.mjs';

const REPO = process.env.LEKTA_REVIEW_REPO ?? 'danielrisavi77-create/Lekta';
const ROOT = resolve(process.cwd());
// Zasticene staze dolaze iz kanonske konfiguracije, ne iz privatne kopije.
const PROTECTED = JSON.parse(readFileSync(join(ROOT, 'config', 'agent-routing.json'), 'utf8')).protectedPaths;
const WT_DIR = resolve(ROOT, '..', 'lekta-wt');
const STATE_DIR = join(ROOT, '.artifacts', 'review-queue');
const STATE_FILE = join(STATE_DIR, 'state.json');
const LOCK_FILE = join(STATE_DIR, 'lock');
const GATE_WRAPPER = join(ROOT, 'scripts', 'with-gate-lock.mjs');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const intervalSec = Number(argv[argv.indexOf('--interval') + 1]) > 0 ? Number(argv[argv.indexOf('--interval') + 1]) : 60;

/** Posao koji se ne racuna kao kvar: privremeno odgodjen (zauzet stroj, ceka Codex, glava se mijenja). */
class Deferred extends Error {}

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
const gitOk = (args, cwd = ROOT) => {
  const r = git(args, cwd);
  if (r.status !== 0) throw new Error(`git ${args[0]} pao: ${(r.stderr || '').trim().slice(0, 300)}`);
  return r.stdout;
};
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

function loadState() {
  try { return { reviewed: {}, failures: {}, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) }; } catch { return { reviewed: {}, failures: {} }; }
}
const saveState = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

function listLabelled() {
  const fields = 'number,title,body,headRefOid,baseRefName,labels,commits';
  const byNumber = new Map();
  for (const label of ['grok-review', 'codex-review']) {
    const out = gh(['pr', 'list', '--repo', REPO, '--state', 'open', '--label', label, '--json', fields, '--limit', '50']);
    for (const pr of JSON.parse(out)) byNumber.set(pr.number, pr);
  }
  return [...byNumber.values()];
}

const removeLabel = (number, provider) => gh(['pr', 'edit', String(number), '--repo', REPO, '--remove-label', labelForProvider(provider)]);

/** Prva podudarnost iz PATH-a, trazena iz pouzdanog korijena (ne iz radnog stabla PR-a). */
function resolveExecutable(name) {
  const r = run(process.platform === 'win32' ? 'where' : 'which', [name], { cwd: ROOT });
  const first = r.status === 0 ? r.stdout.split(/\r?\n/).find(Boolean) : null;
  if (!first) throw new Error(`${name} nije pronadjen u PATH-u`);
  return first.trim();
}

function postFile(name, text) {
  const f = join(STATE_DIR, name);
  writeFileSync(f, text);
  return f;
}

function review(pr, provider, deferred) {
  const key = reviewKey(pr.number, provider);
  const stamp = reviewStamp(pr);
  const bad = forbiddenEnv(process.env, provider);
  if (bad.length) throw new Error(`Odbijeno: ${bad.join(', ')} u okolini (samo pretplata: grok login, codex login)`);

  const commitText = (pr.commits ?? []).map((c) => `${c.messageHeadline ?? ''}\n${c.messageBody ?? ''}`).join('\n');
  const implementers = implementersOf(`${pr.title}\n${pr.body ?? ''}\n${commitText}`);
  const problem = independenceProblem(implementers, provider);
  if (problem) {
    const f = postFile(`reject-pr${pr.number}-${provider}.md`,
      `Pregled (${provider}) odbijen: ${problem}, pa pregled ne bi bio dokazano neovisan. Oznaka je skinuta; dodaj potpis implementatora ili stavi oznaku drugog providera.\n\n_Savjetodavni pregled drugog providera._`);
    gh(['pr', 'comment', String(pr.number), '--repo', REPO, '--body-file', f]);
    removeLabel(pr.number, provider);
    log(`PR #${pr.number} ${provider}: ${problem}, oznaka skinuta`);
    return;
  }

  const wt = join(WT_DIR, `review-pr${pr.number}-${provider}`);
  mkdirSync(WT_DIR, { recursive: true });
  try {
    gitOk(['fetch', 'origin', `pull/${pr.number}/head`, pr.baseRefName]);
    const head = gitOk(['rev-parse', 'FETCH_HEAD']).trim();
    if (head !== pr.headRefOid) throw new Deferred('glava PR-a se promijenila tijekom dohvata, sljedeci prolaz');
    const state = loadState();
    const last = state.reviewed[key];
    const lastSha = last ? last.split('@')[0] : undefined;
    const lastIsAncestor = Boolean(lastSha) && git(['merge-base', '--is-ancestor', lastSha, head]).status === 0;
    const mergeBase = gitOk(['merge-base', `origin/${pr.baseRefName}`, head]).trim();
    if (!mergeBase) throw new Error('merge-base prazan, delta nedostupna');
    const { base } = pickDeltaBase({ lastReviewedSha: lastSha, lastIsAncestor, mergeBase });
    const files = gitOk(['diff', '--name-only', `${base}..${head}`]).split('\n').filter(Boolean);
    const prot = touchesProtected(files, PROTECTED);
    if (grokNeedsCodex({ provider, isProtected: prot, reviewed: state.reviewed, number: pr.number, stamp })) {
      deferred.add(key);
      throw new Deferred('zasticena delta: Grok je samo trece misljenje, ceka uspjesan Codex pregled iste glave');
    }
    gitOk(['worktree', 'add', '--detach', wt, head]);
    const fullDiff = gitOk(['diff', `${base}..${head}`], wt);
    writeFileSync(join(wt, DELTA_FILE), fullDiff);
    const { diff, truncated } = truncateDiff(fullDiff);
    const model = provider === 'grok' ? GROK_MODEL : codexModel(prot);
    const promptFile = join(STATE_DIR, `prompt-pr${pr.number}-${provider}.md`);
    const outFile = join(STATE_DIR, `out-pr${pr.number}-${provider}.md`);
    rmSync(outFile, { force: true });
    const prompt = buildPrompt({ pr: { ...pr, headRefOid: head }, provider, base, diff, truncated, isProtected: prot });
    writeFileSync(promptFile, prompt);
    const cmd = buildCommand({ provider, model, worktree: wt, promptFile, outFile });
    log(`PR #${pr.number} ${provider} ${model} delta ${base.slice(0, 7)}..${head.slice(0, 7)} (${fullDiff.length} B, ${files.length} datoteka)`);
    // Dijeljeni gate lock (teski posao jedan po jedan); ljuska u omotacu rjesava npm shimove na Windowsu.
    // Apsolutna putanja providera iz pouzdanog korijena: ljuska u radnom stablu PR-a ne smije naci vlastiti `grok.cmd`.
    const exe = resolveExecutable(cmd.command);
    const r = run('node', [GATE_WRAPPER, `review-pr${pr.number}`, '--', exe, ...cmd.args], {
      cwd: wt, env: scrubEnv(process.env), input: cmd.stdin ? prompt : undefined, timeout: 30 * 60 * 1000, killSignal: 'SIGKILL',
    });
    if (gateRefused(r.status, r.stderr)) {
      deferred.add(key);
      throw new Deferred('stroj zauzet (gate lock), pregled se odgada');
    }
    if (r.status !== 0) throw new Error(`${provider} izasao sa ${r.status}: ${(r.stderr || '').trim().slice(0, 300)}`);
    let text;
    if (provider === 'grok') text = extractGrokText(r.stdout);
    else {
      text = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
      if (!text.trim()) throw new Error('codex nije vratio tekst odgovora');
    }
    const current = JSON.parse(gh(['pr', 'view', String(pr.number), '--repo', REPO, '--json', 'headRefOid,baseRefName']));
    if (reviewStamp(current) !== stamp) throw new Deferred('glava ili ciljna grana promijenjena tijekom pregleda, oznaka ostaje za novu rundu');
    const bodyFile = postFile(`comment-pr${pr.number}-${provider}.md`, formatComment({ provider, model, base, head, text, isProtected: prot, implementers }));
    gh(['pr', 'review', String(pr.number), '--repo', REPO, '--comment', '--body-file', bodyFile]);
    const after = loadState();
    after.reviewed[key] = stamp;
    after.failures[key] = 0;
    saveState(after);
    removeLabel(pr.number, provider);
    log(`PR #${pr.number} ${provider}: objavljeno, oznaka skinuta`);
  } finally {
    git(['worktree', 'remove', '--force', wt]);
    rmSync(wt, { recursive: true, force: true });
    git(['worktree', 'prune']);
  }
}

function recordFailure(pr, provider, err) {
  const key = reviewKey(pr.number, provider);
  const state = loadState();
  state.failureStamps ??= {};
  const stamp = reviewStamp(pr);
  if (state.failureStamps[key] !== stamp) state.failures[key] = 0;
  state.failureStamps[key] = stamp;
  state.failures[key] = (state.failures[key] ?? 0) + 1;
  saveState(state);
  log(`PR #${pr.number} ${provider} nije uspio (${state.failures[key]}/${MAX_FAILURES}): ${err.message}`);
}

/** Objava kvara i skidanje oznake nakon MAX_FAILURES; ponavlja se u svakom prolazu dok ne uspije. */
function cleanupExhausted(pr, provider) {
  const key = reviewKey(pr.number, provider);
  const f = postFile(`fail-pr${pr.number}-${provider}.md`,
    `Pregled (${provider}) nije uspio ${MAX_FAILURES} puta zaredom pa je oznaka skinuta. Ponovno stavi oznaku nakon sto se uzrok ukloni.\n\n_Savjetodavni pregled drugog providera._`);
  gh(['pr', 'comment', String(pr.number), '--repo', REPO, '--body-file', f]);
  removeLabel(pr.number, provider);
  const state = loadState();
  state.failures[key] = 0;
  saveState(state);
  log(`PR #${pr.number} ${provider}: kvar objavljen, oznaka skinuta`);
}

/** Jedan posao; vraca true ako je nesto napredovalo (ima smisla odmah traziti sljedeci). */
function pass(deferred) {
  const prs = listLabelled();
  const next = selectNext(prs, loadState(), deferred);
  if (!next) return false;
  const pr = prs.find((p) => p.number === next.number);
  if (flag('--dry-run')) {
    log(`bi obradio PR #${next.number} (${next.provider})${next.noDelta ? ' [nema delte]' : ''}${next.cleanup ? ' [ciscenje kvara]' : ''}`);
    deferred.add(reviewKey(next.number, next.provider));
    return true;
  }
  try {
    if (next.cleanup) { cleanupExhausted(pr, next.provider); return true; }
    if (next.noDelta) {
      removeLabel(next.number, next.provider);
      log(`PR #${next.number} ${next.provider}: nema nove delte od zadnjeg pregleda, oznaka skinuta`);
      return true;
    }
    review(pr, next.provider, deferred);
    return true;
  } catch (e) {
    if (e instanceof Deferred) {
      deferred.add(reviewKey(next.number, next.provider));
      log(`PR #${next.number} ${next.provider} odgodjen: ${e.message}`);
      return true;
    }
    if (next.cleanup) {
      deferred.add(reviewKey(next.number, next.provider));
      log(`PR #${next.number} ${next.provider}: ciscenje kvara nije uspjelo, ponovno u sljedecem krugu: ${e.message}`);
      return true;
    }
    recordFailure(pr, next.provider, e);
    return true;
  }
}

async function main() {
  mkdirSync(STATE_DIR, { recursive: true });
  let fd;
  try { fd = openSync(LOCK_FILE, 'wx'); } catch { throw new Error(`Red vec radi (zakljucano: ${LOCK_FILE}). Ako je ostalo od pada, obrisi datoteku.`); }
  closeSync(fd);
  const release = () => { try { unlinkSync(LOCK_FILE); } catch { /* vec uklonjeno */ } };
  process.on('SIGINT', () => { release(); process.exit(130); });
  process.on('SIGTERM', () => { release(); process.exit(143); });
  const single = flag('--once') || flag('--dry-run');
  try {
    log(`Red pregleda ${REPO}; ${single ? 'jedan prolaz' : `petlja svakih ${intervalSec} s`}`);
    for (;;) {
      const deferred = new Set();
      let worked = true;
      while (worked) {
        try { worked = pass(deferred); } catch (e) { log(`prolaz pao: ${e.message}`); worked = false; }
      }
      if (single) break;
      await sleep(intervalSec * 1000);
    }
  } finally { release(); }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
