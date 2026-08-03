/**
 * Cuva pokrivenost favicona (BL-P3-10): svaka stranica referencira /favicon.svg + /favicon.ico
 * (legacy fallback, bez njega browseri traze /favicon.ico i dobiju 404) + /apple-touch-icon.png
 * (iOS home-screen). Provjerava i da referencirani rasteri postoje i imaju ispravne magicne bajtove.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = [
  'index.html',
  'citat.html',
  'kartice.html',
  'naslovnica.html',
  'literatura.html',
  'izjava.html',
  'alati.html',
  'landing_usporedba.html',
  'landing_benchmark.html',
];

describe.each(PAGES)('favicon: %s', (page) => {
  const html = readFileSync(join(root, page), 'utf8');
  it('ima svg + ico + apple-touch link', () => {
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
    expect(html).toMatch(/<link rel="icon" href="\/favicon\.ico"/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/);
  });
});

describe('favicon rasteri postoje i validni su', () => {
  it('public/favicon.ico je pravi ICO (magicni bajtovi 00 00 01 00)', () => {
    const buf = readFileSync(join(root, 'public', 'favicon.ico'));
    expect([...buf.subarray(0, 4)]).toEqual([0x00, 0x00, 0x01, 0x00]);
    expect(statSync(join(root, 'public', 'favicon.ico')).size).toBeGreaterThan(200);
  });

  it('public/apple-touch-icon.png je pravi PNG', () => {
    const buf = readFileSync(join(root, 'public', 'apple-touch-icon.png'));
    expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(statSync(join(root, 'public', 'apple-touch-icon.png')).size).toBeGreaterThan(200);
  });
});
