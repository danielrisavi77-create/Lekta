import { describe, it, expect } from 'vitest';
import { extractBearerToken, timingSafeEqual, isCronAuthorized } from './cron-auth';

// P0-02a (security-01): send-reminders je bio javno okidljiv (samo provjera POST
// metode). Ovaj test zakljucava novu autorizaciju: bez ispravne cron tajne poziv
// NIJE autoriziran (handler vraca 401 i ne dira bazu ni Resend), a bez postavljene
// tajne je fail-closed.

function reqWithAuth(value: string | null): { headers: Headers } {
  const headers = new Headers();
  if (value !== null) headers.set('Authorization', value);
  return { headers };
}

describe('extractBearerToken', () => {
  it('izvlaci token iz Bearer sheme', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });
  it('podnosi visak razmaka i drukciju velicinu slova', () => {
    expect(extractBearerToken('  bearer   tok-en  ')).toBe('tok-en');
  });
  it('vraca null bez zaglavlja ili krive sheme', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
  });
});

describe('timingSafeEqual', () => {
  it('true za jednake, false za razlicite ili razlicite duljine', () => {
    expect(timingSafeEqual('tajna', 'tajna')).toBe(true);
    expect(timingSafeEqual('tajna', 'tajnb')).toBe(false);
    expect(timingSafeEqual('tajna', 'tajna-duze')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('isCronAuthorized', () => {
  const SECRET = 'super-tajni-cron-kljuc';

  it('fail-closed: bez postavljene tajne nista nije autorizirano', () => {
    expect(isCronAuthorized(reqWithAuth(`Bearer ${SECRET}`), '')).toBe(false);
    expect(isCronAuthorized(reqWithAuth(`Bearer ${SECRET}`), undefined)).toBe(false);
    expect(isCronAuthorized(reqWithAuth(`Bearer ${SECRET}`), null)).toBe(false);
  });

  it('401 slucaj: bez zaglavlja ili s krivom tajnom nije autorizirano', () => {
    expect(isCronAuthorized(reqWithAuth(null), SECRET)).toBe(false);
    expect(isCronAuthorized(reqWithAuth('Bearer kriva-tajna'), SECRET)).toBe(false);
    expect(isCronAuthorized(reqWithAuth(SECRET), SECRET)).toBe(false); // fali "Bearer "
  });

  it('autorizirano samo uz tocnu tajnu u Bearer shemi', () => {
    expect(isCronAuthorized(reqWithAuth(`Bearer ${SECRET}`), SECRET)).toBe(true);
  });
});
