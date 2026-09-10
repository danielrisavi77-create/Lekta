import { describe, expect, it } from 'vitest';

import {
  EXPECTED_NETLIFY_SITE_ID,
  EXPECTED_NETLIFY_SITE_URL,
  assertNetlifyLinkedSiteStatus,
} from '../scripts/local-repair-runner-publish';

describe('Netlify global-auth fallback za local-repair release', () => {
  it('prihvaca samo povezani kanonski Lekta site bez kopiranja auth tokena', () => {
    expect(assertNetlifyLinkedSiteStatus({
      siteData: {
        'site-id': EXPECTED_NETLIFY_SITE_ID,
        'site-url': EXPECTED_NETLIFY_SITE_URL,
      },
    })).toEqual({ siteId: EXPECTED_NETLIFY_SITE_ID, siteUrl: EXPECTED_NETLIFY_SITE_URL });

    expect(() => assertNetlifyLinkedSiteStatus({
      siteData: {
        'site-id': EXPECTED_NETLIFY_SITE_ID,
        'site-url': 'https://wrong-site.netlify.app',
      },
    })).toThrow(/lektahr\.netlify\.app/i);
    expect(() => assertNetlifyLinkedSiteStatus({
      siteData: {
        'site-id': 'wrong-site-id',
        'site-url': EXPECTED_NETLIFY_SITE_URL,
      },
    })).toThrow(/site-id|kanonski/i);
    expect(() => assertNetlifyLinkedSiteStatus({ siteData: {} })).toThrow(/povezan|site/i);
  });
});
