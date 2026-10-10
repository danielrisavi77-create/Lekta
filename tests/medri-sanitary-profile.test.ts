// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sources from '../data/sources/source-registry.json';
import profiles from '../data/profiles/verified-profiles.json';
import draft from '../data/profiles/medri/drafts/medri-sanitarno-diplomski.json';

describe('MEDRI sanitarno inženjerstvo, diplomski profil', () => {
  it('veže samo pravila iz aktualnih uputa i zadržava profil kao djelomičan', () => {
    const profile = profiles.find((item) => item.id === 'medri-sanitarno-diplomski');
    expect(profile?.unitId).toBe('medri');
    expect(profile?.workTypes).toEqual(['graduate']);
    expect(profile?.status).toBe('partial');
    expect(profile?.programs).toContain('Sanitarno inženjerstvo');

    const source = sources.find((item) => item.id === 'medri-sanitarno-diplomski-2025-26');
    expect(source?.url).toBe('https://medri.uniri.hr/wp-content/uploads/2026/01/Upute-o-pisanju-diplomskog-rada-2025_26.pdf');
    expect(createHash('sha256').update(readFileSync(source!.snapshotPath)).digest('hex')).toBe(source?.snapshotHash);

    const entries = draft.entries;
    expect(entries.find((entry) => entry.checkId === 'paper-size')?.value).toBe('A4');
    expect(entries.find((entry) => entry.checkId === 'margins')?.value).toEqual({ top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 });
    expect(entries.find((entry) => entry.checkId === 'line-spacing')?.value).toBe(1.5);
    expect(entries.find((entry) => entry.checkId === 'font-size')?.value).toEqual([12]);
    expect(entries.find((entry) => entry.checkId === 'font')?.value).toEqual(['Times New Roman']);
    expect(entries.find((entry) => entry.checkId === 'page-count')?.value).toEqual({ min: 40, max: 90 });
    expect(entries.every((entry) => entry.scored === false)).toBe(true);
    expect(entries.filter((entry) => entry.checkId !== 'citation-style').every((entry) => entry.status === 'needs-recheck')).toBe(true);
  });
});
