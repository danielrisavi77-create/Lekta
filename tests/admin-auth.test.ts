import { describe, it, expect, beforeEach } from 'vitest';
import { consumeMagicLinkFragment, currentAdminSession, adminSessionStore } from '../src/admin/admin-auth';

function fakeJwt(claims: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(claims)}.fakesignature`;
}

beforeEach(() => {
  adminSessionStore.save(null);
  window.location.hash = '';
});

describe('consumeMagicLinkFragment', () => {
  it('bez fragmenta u URL-u vraca null, ne sprema nista', () => {
    expect(consumeMagicLinkFragment()).toBeNull();
    expect(currentAdminSession()).toBeNull();
  });

  it('fragment bez access_token/refresh_token vraca null', () => {
    window.location.hash = '#type=magiclink&expires_in=3600';
    expect(consumeMagicLinkFragment()).toBeNull();
    expect(currentAdminSession()).toBeNull();
  });

  it('valjan fragment gradi sesiju iz JWT claimova (email/sub) i sprema je', () => {
    const token = fakeJwt({ sub: 'user-123', email: 'admin@primjer.hr', is_anonymous: false, exp: 9999999999 });
    window.location.hash = `#access_token=${token}&refresh_token=refresh-abc&expires_in=3600&token_type=bearer&type=magiclink`;

    const now = 1_000_000;
    const session = consumeMagicLinkFragment(now);

    expect(session).not.toBeNull();
    expect(session?.accessToken).toBe(token);
    expect(session?.refreshToken).toBe('refresh-abc');
    expect(session?.email).toBe('admin@primjer.hr');
    expect(session?.userId).toBe('user-123');
    expect(session?.isAnonymous).toBe(false);
    expect(session?.expiresAt).toBe(now + 3600 * 1000);

    // sprema se u store, ne samo vraca
    expect(currentAdminSession()).toEqual(session);
  });

  it('cisti URL fragment nakon uspjesnog konzumiranja (tokeni ne ostaju u adresnoj traci)', () => {
    const token = fakeJwt({ sub: 'u1', email: 'a@b.hr' });
    window.location.hash = `#access_token=${token}&refresh_token=r1`;
    consumeMagicLinkFragment();
    expect(window.location.hash).toBe('');
  });

  it('neispravan JWT (nije parsabilan) i dalje sprema sesiju, samo bez email/userId', () => {
    window.location.hash = '#access_token=not-a-real-jwt&refresh_token=r1';
    const session = consumeMagicLinkFragment();
    expect(session).not.toBeNull();
    expect(session?.accessToken).toBe('not-a-real-jwt');
    expect(session?.email).toBe('');
    expect(session?.userId).toBe('');
  });

  it('nedostaje expires_in koristi razuman default (3600s), ne baca gresku', () => {
    const token = fakeJwt({ sub: 'u1', email: 'a@b.hr' });
    window.location.hash = `#access_token=${token}&refresh_token=r1`;
    const now = 5000;
    const session = consumeMagicLinkFragment(now);
    expect(session?.expiresAt).toBe(now + 3600 * 1000);
  });
});
