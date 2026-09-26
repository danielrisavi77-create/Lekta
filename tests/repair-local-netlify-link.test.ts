import { describe, expect, it } from 'vitest';

import { assertNetlifyLinkedSiteStatus } from '../scripts/local-repair-runner-publish';

describe('Netlify global-auth fallback za local-repair release', () => {
  it('prihvaca samo povezani kanonski Lekta site bez kopiranja auth tokena', () => {
    expect(assertNetlifyLinkedSiteStatus({
      siteData: {
        'site-id': 'site-123',
        'site-url': 'https://lektahr.netlify.app',
      },
    })).toEqual({ siteId: 'site-123', siteUrl: 'https://lektahr.netlify.app' });

    expect(() => assertNetlifyLinkedSiteStatus({
      siteData: {
        'site-id': 'site-456',
        'site-url': 'https://wrong-site.netlify.app',
      },
    })).toThrow(/lektahr\.netlify\.app/i);
    expect(() => assertNetlifyLinkedSiteStatus({ siteData: {} })).toThrow(/povezan|site/i);
  });
});
