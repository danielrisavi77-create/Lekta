import { describe, expect, it } from 'vitest';

import { selectNetlifyReleaseAuthorization } from '../scripts/local-repair-runner-publish';

const linked = {
  siteData: {
    'site-id': 'site-123',
    'site-url': 'https://lektahr.netlify.app',
  },
};

describe('Netlify release authorization odabir', () => {
  it('preferira kompletne env vjerodajnice, a inace koristi provjereni globalni link', () => {
    expect(selectNetlifyReleaseAuthorization({
      env: { NETLIFY_AUTH_TOKEN: 'token', NETLIFY_SITE_ID: 'site-id' },
    })).toEqual({ mode: 'environment' });
    expect(selectNetlifyReleaseAuthorization({ env: {}, linkedStatus: linked })).toEqual({
      mode: 'linked-cli',
      siteId: 'site-123',
      siteUrl: 'https://lektahr.netlify.app',
    });
  });

  it('fail-closed odbija polovicne env vjerodajnice i pogresan globalni link', () => {
    expect(() => selectNetlifyReleaseAuthorization({
      env: { NETLIFY_AUTH_TOKEN: 'token' },
      linkedStatus: linked,
    })).toThrow(/NETLIFY_SITE_ID/);
    expect(() => selectNetlifyReleaseAuthorization({
      env: {},
      linkedStatus: { siteData: { 'site-id': 'x', 'site-url': 'https://wrong.netlify.app' } },
    })).toThrow(/lektahr\.netlify\.app/i);
  });
});
