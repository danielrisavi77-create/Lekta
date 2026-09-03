import { describe, expect, it } from 'vitest';
import { buildStandaloneReport } from '../src/ui/app';

/**
 * XSS U IZVEZENOM IZVJESTAJU (PRE_LAUNCH_CHECKLIST, sekcija 5, P0).
 *
 * Izvjestaj se preuzima kao SAMOSTALAN `.html` i otvara izvan aplikacije, dakle bez ijedne zastite
 * koju stranica inace ima (CSP, sanitizacija pri renderu). Sve sto u njega udje iz korisnickog
 * dokumenta, a nije escapano, izvodi se kod onoga tko izvjestaj otvori: mentora, kolege, komisije.
 *
 * Stavka je u checklisti stajala kao P0 s nula oznaka, a mjerenjem se pokazalo da testa NEMA
 * NIJEDNOG: `buildStandaloneReport` se nigdje ne uvozi, ni u jednom testu. Put jest pisan obrambeno
 * (28 poziva `escapeHtml` na 51 interpolaciju), ali "izgleda ispravno" nije dokaz; upravo je to
 * razlika koju ovaj repozitorij inace inzistira mjeriti.
 *
 * Funkcija je zato izvezena, i to je jedina promjena u `app.ts`.
 */

const ZLONAMJERAN = '<script>alert(1)</script>';
const NAVODNIK = 'rad" onload="alert(2)';

function rezultat(): any {
  return {
    file: { name: `${ZLONAMJERAN}.docx`, size: 1234 },
    profile: NAVODNIK,
    profileStatus: 'generic',
    score: 72,
    issueTotal: 1,
    stats: { words: 5000, references: 10, citations: 12 },
    checks: [{ id: 'x.y', title: ZLONAMJERAN, status: 'fail', earned: 0, max: 4, detail: NAVODNIK }],
    issues: [{ severity: 'error', title: ZLONAMJERAN, detail: NAVODNIK, category: 'structure' }],
    details: {},
  };
}

describe('samostalan HTML izvjestaj: korisnicki tekst se ne izvodi', () => {
  const html = buildStandaloneReport(rezultat());

  it('mjerenje nije vakuumsko: izvjestaj je stvarno nastao', () => {
    expect(html.length, 'prazan izvjestaj ne dokazuje nista').toBeGreaterThan(500);
    expect(html).toContain('<html');
  });

  it('nijedan `<script>` iz korisnickog teksta ne zavrsi kao oznaka', () => {
    // Tolerira se `<script>` koji je dio SAMOG izvjestaja; trazi se doslovno nas ubaceni niz.
    expect(html, 'zlonamjeran naslov je zavrsio kao izvrsna oznaka').not.toContain('<script>alert(1)</script>');
  });

  it('ubaceni tekst JE prisutan, ali escapan', () => {
    // Bez ove tvrdnje test bi prosao i da izvjestaj tekst tiho izbaci, sto nije sigurnost nego gubitak.
    expect(html, 'tekst je nestao umjesto da bude escapan').toContain('&lt;script&gt;');
  });

  it('navodnik ne moze izaci iz atributa', () => {
    expect(html, 'navodnik iz korisnickog teksta bi razbio atribut').not.toContain('onload="alert(2)"');
  });
});
