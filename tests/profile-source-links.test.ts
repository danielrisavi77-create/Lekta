import { describe, expect, it } from 'vitest';
import { acceptedInvalidUrls, committedSourceAddresses, findSourceUrlProblems, NEVALJANE_ADRESE } from './helpers/source-url-checks';

describe('javne adrese izvora fakulteta', () => {
  it('lagani i teski profili te registar sadrze adrese dokumenata, bez proze uz adresu i bez gole domene', () => {
    const files = committedSourceAddresses();
    expect(Object.keys(files)).toEqual(['verified-profiles.json', 'verified-profiles-heavy.json', 'source-registry.json']);
    for (const [file, sources] of Object.entries(files)) {
      const withUrl = sources.filter((s) => s.url !== undefined).length;
      // Sentinel: prazno citanje ne smije proci kao cisto.
      expect(withUrl, `${file}: premalo provjerenih adresa`).toBeGreaterThan(100);
      const problems = findSourceUrlProblems(sources);
      expect(problems, problems.join('\n')).toEqual([]);
    }
  });

  it('validator adresa (src/shared/source-url.mjs) odbija svaku klasu nevaljane adrese', () => {
    expect(NEVALJANE_ADRESE.length).toBeGreaterThan(0);
    expect(acceptedInvalidUrls()).toEqual([]);
  });

  it('gola domena bez dokumenta je problem, adresa stranice s upitom nije', () => {
    expect(findSourceUrlProblems([{ label: 'x', url: 'https://www.unidu.hr' }])).toEqual(['x: gola domena bez dokumenta (https://www.unidu.hr)']);
    expect(findSourceUrlProblems([{ label: 'x', url: 'https://hrri.erf.unizg.hr/?page_id=17' }])).toEqual([]);
    expect(findSourceUrlProblems([{ label: 'x' }])).toEqual([]);
  });
});
