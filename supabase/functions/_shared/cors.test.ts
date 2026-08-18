import { describe, it, expect } from 'vitest';
import { pickAllowedOrigin, corsHeadersFor } from './cors';

/**
 * CORS je obrana u dubinu za anonimne Edge endpointe: sprjecava da tudja stranica iz
 * korisnikovog preglednika zove nase funkcije s njegovim identitetom (data-flow-07).
 *
 * OCEKIVANJA PROMIJENJENA 2026-08-17 (audit SEC-11, SEC-12). Prijasnji testovi su kodirali
 * ponasanje koje je audit prepoznao kao rupu, pa su tvrdnje sada obrnute:
 *
 *   1. localhost je bio dopusten BEZUVJETNO, i u produkciji. Bilo koja lokalna web aplikacija
 *      na korisnikovu racunalu mogla je zvati produkcijske funkcije iz njegovog preglednika.
 *      Sada je vezan uz izricitu env zastavicu (`LEKTA_ALLOW_LOCALHOST_CORS=1`).
 *   2. nedopusteno porijeklo dobivalo je primarno dopusteno porijeklo kao ACAO. Preglednik bi
 *      to blokirao jer se origini ne podudaraju, ali odgovor je tvrdio nesto sto nije istina.
 *      Sada se header NE SALJE, sto je i tocnije i lakse citljivo u dijagnostici.
 */

const ALLOWED = ['https://lektahr.netlify.app', 'https://lekta.example'];

describe('pickAllowedOrigin', () => {
  it('reflektira dopusteno produkcijsko porijeklo', () => {
    expect(pickAllowedOrigin('https://lektahr.netlify.app', ALLOWED)).toBe('https://lektahr.netlify.app');
    expect(pickAllowedOrigin('https://lekta.example', ALLOWED)).toBe('https://lekta.example');
  });

  it('ne reflektira tudje porijeklo (prazno = header se ne salje)', () => {
    expect(pickAllowedOrigin('https://zlonamjerni.example', ALLOWED)).toBe('');
    // Podniz dopustenog hosta nije dopusten host.
    expect(pickAllowedOrigin('https://lektahr.netlify.app.evil.example', ALLOWED)).toBe('');
  });

  it('prazan ili nedostajuci Origin ne proizvodi header', () => {
    expect(pickAllowedOrigin(null, ALLOWED)).toBe('');
    expect(pickAllowedOrigin(undefined, ALLOWED)).toBe('');
    expect(pickAllowedOrigin('', ALLOWED)).toBe('');
  });

  it('localhost je odbijen dok nije izricito dopusten', () => {
    expect(pickAllowedOrigin('http://localhost:5173', ALLOWED)).toBe('');
    expect(pickAllowedOrigin('http://127.0.0.1:3000', ALLOWED)).toBe('');
    expect(pickAllowedOrigin('http://localhost:5173', ALLOWED, { allowLocalhost: true })).toBe('http://localhost:5173');
    expect(pickAllowedOrigin('http://127.0.0.1:3000', ALLOWED, { allowLocalhost: true })).toBe('http://127.0.0.1:3000');
  });

  /**
   * Zastavica za lokalni razvoj ne smije postati rupa: dopusta iskljucivo localhost preko http,
   * nikad proizvoljno porijeklo ni tudji host koji localhost samo sadrzi u imenu.
   */
  it('dopustanje localhosta ne otvara ostala porijekla', () => {
    expect(pickAllowedOrigin('https://zlonamjerni.example', ALLOWED, { allowLocalhost: true })).toBe('');
    expect(pickAllowedOrigin('http://localhost.evil.example', ALLOWED, { allowLocalhost: true })).toBe('');
    expect(pickAllowedOrigin('https://localhost', ALLOWED, { allowLocalhost: true })).toBe('');
  });

  it('nikad ne vraca zvjezdicu', () => {
    expect(pickAllowedOrigin('https://bilo.sto', ALLOWED)).not.toBe('*');
    expect(pickAllowedOrigin('https://lekta.example', ALLOWED)).not.toBe('*');
  });
});

describe('corsHeadersFor', () => {
  it('slaze pun set s reflektiranim porijeklom i Vary: Origin', () => {
    const h = corsHeadersFor('https://lekta.example', ALLOWED);
    expect(h['Access-Control-Allow-Origin']).toBe('https://lekta.example');
    expect(h['Vary']).toBe('Origin');
    expect(h['Access-Control-Allow-Methods']).toContain('POST');
    expect(h['Access-Control-Allow-Headers']).toContain('authorization');
  });

  it('tudje porijeklo NE dobiva Access-Control-Allow-Origin uopce', () => {
    const h = corsHeadersFor('https://tudji.sajt', ALLOWED);
    expect('Access-Control-Allow-Origin' in h).toBe(false);
    // Ostali headeri ostaju, pa preflight i dalje ima smislen oblik odgovora.
    expect(h['Vary']).toBe('Origin');
    expect(h['Access-Control-Allow-Methods']).toContain('OPTIONS');
  });
});
