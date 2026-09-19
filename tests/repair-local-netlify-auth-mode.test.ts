import { describe, expect, it } from 'vitest';

import {
  EXPECTED_NETLIFY_SITE_ID,
  EXPECTED_NETLIFY_SITE_URL,
  selectNetlifyReleaseAuthorization,
} from '../scripts/local-repair-runner-publish';

const linked = {
  siteData: {
    'site-id': EXPECTED_NETLIFY_SITE_ID,
    'site-url': EXPECTED_NETLIFY_SITE_URL,
  },
};

describe('Netlify release authorization odabir', () => {
  it('preferira kompletne env vjerodajnice, a inace koristi provjereni globalni link', () => {
    expect(selectNetlifyReleaseAuthorization({
      env: { NETLIFY_AUTH_TOKEN: 'token', NETLIFY_SITE_ID: EXPECTED_NETLIFY_SITE_ID },
      linkedStatus: linked,
    })).toEqual({
      mode: 'environment',
      siteId: EXPECTED_NETLIFY_SITE_ID,
      siteUrl: EXPECTED_NETLIFY_SITE_URL,
    });
    expect(selectNetlifyReleaseAuthorization({ env: {}, linkedStatus: linked })).toEqual({
      mode: 'linked-cli',
      siteId: EXPECTED_NETLIFY_SITE_ID,
      siteUrl: EXPECTED_NETLIFY_SITE_URL,
    });
  });

  it('fail-closed odbija polovicne env vjerodajnice i pogresan globalni link', () => {
    expect(() => selectNetlifyReleaseAuthorization({
      env: { NETLIFY_AUTH_TOKEN: 'token' },
      linkedStatus: linked,
    })).toThrow(/NETLIFY_SITE_ID/);
    expect(() => selectNetlifyReleaseAuthorization({
      env: { NETLIFY_AUTH_TOKEN: 'token', NETLIFY_SITE_ID: 'wrong-site-id' },
    })).toThrow(/NETLIFY_SITE_ID|kanonski/i);
    expect(() => selectNetlifyReleaseAuthorization({
      env: { NETLIFY_AUTH_TOKEN: 'token', NETLIFY_SITE_ID: EXPECTED_NETLIFY_SITE_ID },
    })).toThrow(/status|site/i);
    expect(() => selectNetlifyReleaseAuthorization({
      env: { NETLIFY_AUTH_TOKEN: 'token', NETLIFY_SITE_ID: EXPECTED_NETLIFY_SITE_ID },
      linkedStatus: {
        siteData: { 'site-id': EXPECTED_NETLIFY_SITE_ID, 'site-url': 'https://wrong.netlify.app' },
      },
    })).toThrow(/lektahr\.netlify\.app/i);
    expect(() => selectNetlifyReleaseAuthorization({
      env: {},
      linkedStatus: {
        siteData: { 'site-id': EXPECTED_NETLIFY_SITE_ID, 'site-url': 'https://wrong.netlify.app' },
      },
    })).toThrow(/lektahr\.netlify\.app/i);
  });
});
