import { describe, it, expect } from 'vitest';
import {
  redactErrorText, buildErrorReport, makeIncidentId, INCIDENT_ID_RE,
  ERROR_MESSAGE_MAX, ERROR_STACK_MAX,
} from '../src/report/error-redaction';

/**
 * Audit P1-28. `errorEndpoint` je bio prazan, pa greske koje se dogadjaju SAMO korisnicima nikad
 * nisu stizale timu. Ali ukljuciti sabirnicu nije bezopasno: poruka i stack su SLOBODAN tekst.
 *
 * Testovi zato gadjaju NACINE NA KOJE SADRZAJ PROCURI, jedan po jedan, a tek onda provjeravaju da
 * korisna dijagnostika prezivi. Tvrdo pravilo projekta je da sadrzaj rada ne napusta preglednik.
 */

describe('redactErrorText: sto NE SMIJE otici s uredjaja', () => {
  it('ime datoteke nosi ime studenta, pa ispada', () => {
    const out = redactErrorText('Failed to parse Ivan_Horvat_diplomski_2026.docx at offset 12', 500);
    expect(out).not.toMatch(/Ivan_Horvat/);
    expect(out).toContain('<datoteka>');
    // Ostatak poruke je dijagnostika i mora prezivjeti.
    expect(out).toContain('Failed to parse');
    expect(out).toContain('offset 12');
  });

  it('hvata sve poznate nastavke dokumenata', () => {
    for (const n of ['rad.docx', 'rad.doc', 'rad.pdf', 'rad.odt', 'rad.rtf', 'biljeske.txt']) {
      expect(redactErrorText(`greska u ${n}`, 500)).toBe('greska u <datoteka>');
    }
  });

  it('e-mail ispada', () => {
    expect(redactErrorText('slanje na ivan.horvat@student.fpzg.hr nije uspjelo', 500))
      .toBe('slanje na <email> nije uspjelo');
  });

  it('JWT i Bearer token ispadaju', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123';
    expect(redactErrorText(`401 za ${jwt}`, 500)).toBe('401 za <jwt>');
    expect(redactErrorText('Authorization: Bearer abc.def-ghi_jkl', 500))
      .toBe('Authorization: Bearer <token>');
  });

  it('tajna u upitu ispada, i to po imenu parametra', () => {
    expect(redactErrorText('GET /x?apikey=tajna123&b=1', 500)).toContain('apikey=<redigirano>');
    expect(redactErrorText('password=Pa$$w0rd', 500)).toContain('password=<redigirano>');
  });

  it('upit u URL-u ispada, putanja ostaje', () => {
    const out = redactErrorText('fetch https://lekta.example/rest/v1/repair_jobs?select=*&user=x pao', 500);
    expect(out).toContain('https://lekta.example/rest/v1/repair_jobs?<upit>');
    expect(out).not.toMatch(/select=/);
  });

  it('uuid ispada (moze biti user_id ili job_id)', () => {
    expect(redactErrorText('job 11111111-1111-4111-8111-111111111111 nije nadjen', 500))
      .toBe('job <uuid> nije nadjen');
  });

  it('dug niz znamenki ispada (OIB, JMBAG), kratki brojevi ostaju', () => {
    expect(redactErrorText('OIB 12345678901 nije valjan', 500)).toBe('OIB <broj> nije valjan');
    // Redak, stupac i velicina su za dijagnostiku vrijedni i NE SMIJU nestati.
    expect(redactErrorText('greska na retku 42, stupac 7, velicina 1024', 500))
      .toBe('greska na retku 42, stupac 7, velicina 1024');
  });

  it('dug base64 blok ispada (to je sadrzaj dokumenta ili slike)', () => {
    const blob = 'A'.repeat(120);
    expect(redactErrorText(`upload ${blob} pao`, 500)).toBe('upload <blob> pao');
  });

  it('kontrolni znakovi ne prezive', () => {
    expect(redactErrorText('a\u0000b\u0007c\u001fd', 500)).toBe('a b c d');
  });

  it('skracuje TEK NAKON redakcije, da rez ne ostavi pola tajne', () => {
    // Da se rezalo prije, ostala bi prva polovica JWT-a, neprepoznata i neredigirana.
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123';
    const out = redactErrorText(`${'x'.repeat(60)} ${jwt}`, 70);
    expect(out).not.toMatch(/eyJ/);
  });

  it('postuje gornju granicu', () => {
    const out = redactErrorText('y'.repeat(5000), 100);
    expect(out.length).toBeLessThanOrEqual(101); // +1 za znak kracenja
  });

  it('ne puca na ne-stringu', () => {
    for (const v of [null, undefined, 42, {}, [], true]) {
      expect(typeof redactErrorText(v, 100)).toBe('string');
    }
  });
});

describe('buildErrorReport: oblik koji smije otici', () => {
  const SADA = '2026-08-24T02:00:00.000Z';

  it('odbacuje SVAKO polje izvan dogovorenog oblika', () => {
    const out = buildErrorReport({
      kind: 'error', message: 'x'.repeat(30), stack: 's',
      // Ovo su polja koja bi izravan POST mimo aplikacije mogao dodati.
      ...({ documentText: 'cijeli rad studenta', userEmail: 'a@b.hr', cookies: 'session=x' } as object),
    } as never, 'LEK-ABCD1234', SADA);
    expect(Object.keys(out).sort()).toEqual(
      ['feature', 'incidentId', 'kind', 'message', 'path', 'stack', 'timestamp', 'version'],
    );
    expect(JSON.stringify(out)).not.toMatch(/rad studenta|a@b\.hr|session=/);
  });

  it('putanja gubi upit i fragment (ondje zavrsavaju magic-link tokeni)', () => {
    const out = buildErrorReport({ path: '/prijava?token=tajna#access_token=jwt' }, 'LEK-ABCD1234', SADA);
    expect(out.path).toBe('/prijava');
  });

  it('nepoznata vrsta se svodi na error, ne odbija', () => {
    expect(buildErrorReport({ kind: 'izmisljeno' }, 'LEK-ABCD1234', SADA).kind).toBe('error');
    expect(buildErrorReport({ kind: 'unhandledrejection' }, 'LEK-ABCD1234', SADA).kind).toBe('unhandledrejection');
  });

  it('nepoznata znacajka se svodi na nepoznato (slobodan tekst tu ne treba)', () => {
    expect(buildErrorReport({ feature: 'sto god' }, 'LEK-ABCD1234', SADA).feature).toBe('nepoznato');
    expect(buildErrorReport({ feature: 'popravak' }, 'LEK-ABCD1234', SADA).feature).toBe('popravak');
  });

  it('granice poruke i stacka vrijede i ovdje', () => {
    const out = buildErrorReport({ message: 'm'.repeat(9999), stack: 's'.repeat(9999) }, 'LEK-ABCD1234', SADA);
    expect(out.message.length).toBeLessThanOrEqual(ERROR_MESSAGE_MAX + 1);
    expect(out.stack.length).toBeLessThanOrEqual(ERROR_STACK_MAX + 1);
  });
});

describe('makeIncidentId', () => {
  it('ima dogovoren oblik', () => {
    expect(makeIncidentId(() => 0.5)).toMatch(INCIDENT_ID_RE);
  });

  it('izbjegava znakove koji se brkaju preko telefona (I, L, O)', () => {
    // Korisnik ga cita podrsci naglas, pa 1/I i 0/O ne smiju biti dvojbeni.
    let sve = '';
    for (let i = 0; i < 33; i++) sve += makeIncidentId(() => i / 33).slice(4);
    expect(sve).not.toMatch(/[ILO]/);
  });

  it('ne sadrzi nista osobno: izveden je iz slucajnosti, ne iz korisnika', () => {
    const a = makeIncidentId(() => 0.1);
    const b = makeIncidentId(() => 0.9);
    expect(a).not.toBe(b);
  });
});
