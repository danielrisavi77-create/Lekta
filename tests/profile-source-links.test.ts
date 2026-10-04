import { describe, expect, it } from 'vitest';
import { publicSourceUrl } from '../src/shared/source-url.mjs';
import { sourceLinkHtml } from '../scripts/generate-faculty-pages.mjs';
import { acceptedInvalidUrls, committedSourceAddresses, countDocumentUrls, findSourceUrlProblems, NEVALJANE_ADRESE, POZNATE_GOLE_DOMENE } from './helpers/source-url-checks';

describe('javne adrese izvora fakulteta', () => {
  it('lagani i teski profili te registar sadrze adrese dokumenata, bez proze uz adresu i bez gole domene', () => {
    const files = committedSourceAddresses();
    expect(Object.keys(files)).toEqual(['verified-profiles.json', 'verified-profiles-heavy.json', 'source-registry.json']);
    for (const [file, sources] of Object.entries(files)) {
      // Sentinel: prazno citanje ne smije proci kao cisto; broje se samo ciste dokumentne adrese.
      expect(countDocumentUrls(sources), `${file}: premalo cistih dokumentnih adresa`).toBeGreaterThan(100);
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

  it('poznate gole domene prikazuju se kao nedostupan izvor i ne broje se kao cista adresa (#238 N1)', () => {
    expect(POZNATE_GOLE_DOMENE.size).toBeGreaterThan(0);
    for (const url of POZNATE_GOLE_DOMENE) {
      expect(publicSourceUrl(url), url).toBeNull();
      const html = sourceLinkHtml({ title: 'Naputak', url });
      expect(html, url).not.toContain('href=');
      expect(html, url).toContain('Poveznica nije dostupna');
      expect(countDocumentUrls([{ label: 'x', url }]), url).toBe(0);
    }
  });
});
