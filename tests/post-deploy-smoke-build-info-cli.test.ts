/**
 * `build-info.json` 404 na zivoj stranici je NEPOZNAT identitet objave, ne ispad.
 *
 * Izmjereno 2026-09-09: zakazani smoke (run 34320334583) bio je crven ISKLJUCIVO zbog tog 404, jer
 * zakljucana objava od 2026-09-06 prethodi `write-build-info` iz PR-a #61, dok su ostalih 27 provjera
 * prolazile. Stalna crvena bez operativnog znacenja se nauci ignorirati, pa CLI sada razlikuje dvije
 * tvrdnje i dvije zastavice:
 *   - `--expect-commit <sha>` (cron salje `github.sha`): usporedba s masterom, nepoznat identitet i
 *     neslaganje commita su UPOZORENJE, izlaz 0;
 *   - `--require-build-info`: provjera KONKRETNE objave koja tvrdi da nosi build-info; 404 je PAD, izlaz 1.
 *
 * Test dize pravi lokalni HTTP posluzitelj koji glumi zdravu stranicu bez build-info.json i Edge funkcije,
 * pa pokrece STVARNU ulaznu tocku (ne runSmoke izravno): mjeri se izlazni kod i ispis CLI-ja.
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { LEGAL_PAGES } from '../scripts/lib/legal-pages.mjs';

const SCRIPT = resolve(process.cwd(), 'scripts', 'post-deploy-smoke.mjs');
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
    if (url.pathname === '/build-info.json') { res.writeHead(404); res.end('Not found'); return; }
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

// ASINKRONO, ne spawnSync: posluzitelj zivi u OVOM procesu, a spawnSync bi mu blokirao petlju dogadjaja pa
// bi CLI cekao odgovor koji nikad ne stigne (izmjereno: 60 s tisine i samo prvi redak ispisa).
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

describe('post-deploy-smoke CLI: build-info 404', () => {
  it('uz --expect-commit je upozorenje i izlaz 0 (periodicki nadzor ne smije biti stalno crven)', async () => {
    const r = await run('--expect-commit', 'a'.repeat(40));
    expect(r.out).toContain('????  build-info');
    expect(r.out).toContain('::warning::identitet objavljenog builda je NEPOZNAT');
    expect(r.out).toContain('1 s nepoznatim ishodom');
    expect(r.code, r.out).toBe(0);
  }, 90_000);

  it('uz --require-build-info je pad i izlaz 1 (konkretna objava mora dokazati identitet)', async () => {
    const r = await run('--require-build-info');
    expect(r.out).toContain('FAIL: trazen je build-info.json');
    expect(r.code, r.out).toBe(1);
  }, 90_000);
});
