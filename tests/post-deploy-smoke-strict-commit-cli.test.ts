/**
 * "STROGI SMOKE ODBIJA POGRESNU VERZIJU" (plan T19, Definition of Done) mora biti ISTINA, a ne namjera.
 *
 * Do 2026-09-13 nije bila: `--expect-commit` je na neslaganje ispisivao `::warning::` i izlazio s 0, i
 * to i uz `--require-build-info` (ta zastavica hvata samo 404 na `build-info.json`, nikad krivi sha).
 * Stanje "objavljena je druga verzija od one koja se tvrdi" tako nije zaustavljalo nista.
 *
 * Blagi mod se pritom NE SMIJE promijeniti: cron nadzor (post-deploy-smoke.yml) salje `github.sha`
 * mastera nad ZAKLJUCANOM objavom koja namjerno zaostaje, pa bi pad ondje bio stalna crvena koju svi
 * nauce ignorirati (odluka vlasnika 2026-09-09). Zato je strogi mod OPT-IN: `--strict-commit`.
 *
 * Mjeri se PRAVA ulazna tocka nad pravim lokalnim posluziteljem: i blagi smjer (izlaz 0) i strogi
 * (izlaz 1), jer bi gard koji samo pada bio jednako beskoristan kao gard koji samo prolazi.
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { LEGAL_PAGES } from '../scripts/lib/legal-pages.mjs';

const SCRIPT = resolve(process.cwd(), 'scripts', 'post-deploy-smoke.mjs');
const OBJAVLJEN = 'a'.repeat(40);
const DRUGI = 'b'.repeat(40);
const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'self'; script-src 'self' 'sha256-x'",
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
};

let server: Server;
let origin = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/build-info.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ commit: OBJAVLJEN, builtAt: '2026-09-13T00:00:00.000Z' }));
      return;
    }
    if (url.pathname.endsWith('/health')) {
      if (req.method === 'POST') { res.writeHead(405); res.end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', dependencies: { database: { ok: true } } }));
      return;
    }
    if (url.pathname.endsWith('/repair-docx')) { res.writeHead(401); res.end(); return; }
    if (url.pathname.endsWith('.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(''); return; }
    const pravna = LEGAL_PAGES.find(([f]: [string, string]) => url.pathname.endsWith(`/${f}`));
    res.writeHead(200, HEADERS);
    res.end(pravna ? `<html><body>${pravna[1]}</body></html>` : '<html><head><script type="module" src="/assets/a.js"></script></head></html>');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const addr = server.address();
  origin = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';
});
afterAll(() => server?.close());

// ASINKRONO, ne spawnSync: posluzitelj zivi u OVOM procesu, pa bi spawnSync blokirao petlju dogadjaja
// i CLI bi cekao odgovor koji nikad ne stigne (ista zamka kao u post-deploy-smoke-build-info-cli).
function run(...extra: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [SCRIPT, '--site', origin, '--functions', `${origin}/functions/v1`, ...extra]);
    let out = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { out += String(d); });
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on('close', (code) => { clearTimeout(timer); ok({ code, out }); });
  });
}

describe('post-deploy-smoke: objavljena verzija naspram ocekivane', () => {
  it('BASELINE: podudaran sha prolazi i u strogom modu', async () => {
    const r = await run('--require-build-info', '--expect-commit', OBJAVLJEN, '--strict-commit');
    expect(r.out).toContain('objavljena stranica nosi ocekivani commit');
    expect(r.code, r.out).toBe(0);
  }, 90_000);

  it('MUTACIJA: drugi sha uz --strict-commit je PAD, uz imenovana oba commita', async () => {
    const r = await run('--require-build-info', '--expect-commit', DRUGI, '--strict-commit');
    expect(r.out).toContain('FAIL: strogi nadzor (--strict-commit)');
    expect(r.out).toContain(OBJAVLJEN.slice(0, 12));
    expect(r.out).toContain(DRUGI.slice(0, 12));
    expect(r.code, r.out).toBe(1);
  }, 90_000);

  it('KONTROLA U SUPROTNOM SMJERU: isti sha BEZ stroge zastavice ostaje upozorenje, izlaz 0', async () => {
    const r = await run('--expect-commit', DRUGI);
    expect(r.out).toContain('::warning::objavljena stranica je');
    expect(r.out).not.toContain('FAIL');
    expect(r.code, r.out).toBe(0);
  }, 90_000);

  it('--strict-commit bez --expect-commit je pad, ne tihi no-op', async () => {
    const r = await run('--strict-commit');
    expect(r.out).toContain('--strict-commit trazi i --expect-commit');
    expect(r.code, r.out).toBe(1);
  }, 90_000);
});
