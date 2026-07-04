/**
 * Cuva sinkronizaciju CSP script-src sha256 hasha s jedinom inline skriptom (FOUC prekidac
 * teme u index.html). Ako se skripta promijeni a hash ne, CSP bi blokirao boot teme u
 * produkciji - ovaj test to hvata prije deploya.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('CSP hash inline skripte', () => {
  it('sha256 iz _headers odgovara inline skripti u index.html', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const headers = readFileSync(join(root, 'public', '_headers'), 'utf8');

    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBe(1); // tocno jedna inline skripta; nova bi trebala novi hash

    const hash = 'sha256-' + createHash('sha256').update(scripts[0], 'utf8').digest('base64');
    expect(headers).toContain(`'${hash}'`);
    expect(headers).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});
