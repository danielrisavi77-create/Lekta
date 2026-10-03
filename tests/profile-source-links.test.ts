import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('public faculty source addresses', () => {
  it('contains document URLs, without prose appended to the address', () => {
    const profiles = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../data/profiles/verified-profiles.json'), 'utf8'));
    let checked = 0;
    for (const profile of profiles) {
      for (const source of profile.sources ?? []) {
        if (source.url === undefined) continue; // A source may have a title without a public address.
        expect(source.url, `${profile.id}: ${source.title}`).not.toMatch(/\s/);
        const url = new URL(source.url);
        expect(['https:', 'http:']).toContain(url.protocol);
        expect(url.username + url.password).toBe('');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
