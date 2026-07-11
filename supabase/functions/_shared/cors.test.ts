import { describe, it, expect } from 'vitest';
import { pickAllowedOrigin, corsHeadersFor } from './cors';

// data-flow-07: faculty-request CORS je bio '*'. Sada se reflektira samo dopusteno porijeklo
// (produkcija + localhost), a tudje porijeklo dobije primarno pa preglednik blokira cross-origin.

const ALLOWED = ['https://lektahr.netlify.app'];

describe('pickAllowedOrigin', () => {
  it('reflektira dopusteno produkcijsko porijeklo', () => {
    expect(pickAllowedOrigin('https://lektahr.netlify.app', ALLOWED)).toBe('https://lektahr.netlify.app');
  });

  it('reflektira localhost (dev) na bilo kojem portu', () => {
    expect(pickAllowedOrigin('http://localhost:5173', ALLOWED)).toBe('http://localhost:5173');
    expect(pickAllowedOrigin('http://127.0.0.1:3000', ALLOWED)).toBe('http://127.0.0.1:3000');
  });

  it('tudje porijeklo dobije primarno dopusteno (ne reflektira se)', () => {
    expect(pickAllowedOrigin('https://zlonamjerni.example', ALLOWED)).toBe('https://lektahr.netlify.app');
  });

  it('prazan/nedostajuci Origin dobije primarno dopusteno', () => {
    expect(pickAllowedOrigin(null, ALLOWED)).toBe('https://lektahr.netlify.app');
    expect(pickAllowedOrigin('', ALLOWED)).toBe('https://lektahr.netlify.app');
  });

  it('nikad ne vraca zvjezdicu', () => {
    expect(pickAllowedOrigin('https://bilo.sto', ALLOWED)).not.toBe('*');
  });
});

describe('corsHeadersFor', () => {
  it('slaze pun set s reflektiranim porijeklom i Vary: Origin', () => {
    const h = corsHeadersFor('http://localhost:5173', ALLOWED);
    expect(h['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(h['Vary']).toBe('Origin');
    expect(h['Access-Control-Allow-Methods']).toContain('POST');
    expect(h['Access-Control-Allow-Headers']).toContain('authorization');
  });

  it('tudje porijeklo -> primarno dopusteno, ne zvjezdica', () => {
    const h = corsHeadersFor('https://tudji.sajt', ALLOWED);
    expect(h['Access-Control-Allow-Origin']).toBe('https://lektahr.netlify.app');
  });
});
