import { describe, it, expect } from 'vitest';
import {
  validateGuaranteeEvidence,
  EVIDENCE_TEXT_MIN,
  EVIDENCE_TEXT_MAX,
  EVIDENCE_NAME_MAX,
} from './guarantee-evidence';

/**
 * Audit P1-09. Zatecena provjera bila je `hasEvidence: !!evidencePath`, pa je SVAKI neprazan
 * string bio valjan dokaz. Testovi zato prvo gadjaju napad, a tek onda uredan slucaj.
 */

const MOJ = '11111111-1111-4111-8111-111111111111';
const TUDJI = '22222222-2222-4222-8222-222222222222';
const OPIS = 'Referada mi je vratila rad zbog margina, dopis je u prilogu.';

describe('validateGuaranteeEvidence, tekstualni opis', () => {
  it('odbija dokaz "x" koji je stara provjera puštala kroz', () => {
    // Donja granica je postojala SAMO u pregledniku, pa je poziv na endpoint prolazio s bilo cim.
    const out = validateGuaranteeEvidence({ evidencePath: 'x', userId: MOJ });
    expect(out).toEqual({ ok: false, reason: 'evidence_too_short' });
  });

  it('odbija prazan i sam-razmak opis', () => {
    expect(validateGuaranteeEvidence({ evidencePath: '', userId: MOJ }).ok).toBe(false);
    expect(validateGuaranteeEvidence({ evidencePath: '     ', userId: MOJ }))
      .toEqual({ ok: false, reason: 'missing_evidence' });
  });

  it('odbija opis koji nije string (broj, objekt, null)', () => {
    for (const v of [42, {}, [], null, undefined, true]) {
      expect(validateGuaranteeEvidence({ evidencePath: v, userId: MOJ }).ok).toBe(false);
    }
  });

  it('odbija napuhan opis iznad gornje granice', () => {
    const out = validateGuaranteeEvidence({ evidencePath: 'a'.repeat(EVIDENCE_TEXT_MAX + 1), userId: MOJ });
    expect(out).toEqual({ ok: false, reason: 'evidence_too_long' });
  });

  it('prima uredan opis i vraca ga podrezanog', () => {
    const out = validateGuaranteeEvidence({ evidencePath: `  ${OPIS}  `, userId: MOJ });
    expect(out).toEqual({ ok: true, kind: 'text', text: OPIS });
  });

  it('granice su ukljucive', () => {
    expect(validateGuaranteeEvidence({ evidencePath: 'a'.repeat(EVIDENCE_TEXT_MIN), userId: MOJ }).ok).toBe(true);
    expect(validateGuaranteeEvidence({ evidencePath: 'a'.repeat(EVIDENCE_TEXT_MAX), userId: MOJ }).ok).toBe(true);
  });

  it('opis smije sadrzavati kosu crtu i ne postaje time putanja', () => {
    // Zato vrsta mora biti izricita: pogadjanje po obliku stringa pretvorilo bi uredan opis
    // u "putanju" i odbilo ga.
    const opis = 'Vraceno zbog margina, vidi https://referada.example/dopis/2026-08';
    const out = validateGuaranteeEvidence({ evidencePath: opis, userId: MOJ });
    expect(out).toEqual({ ok: true, kind: 'text', text: opis });
  });
});

describe('validateGuaranteeEvidence, putanja u Storageu', () => {
  it('ODBIJA tudji prefiks (IDOR prema tudjem dokumentu)', () => {
    const out = validateGuaranteeEvidence({
      kind: 'storage', evidencePath: `${TUDJI}/dopis.pdf`, userId: MOJ,
    });
    expect(out).toEqual({ ok: false, reason: 'evidence_path_not_owned' });
  });

  it('odbija prefiks koji samo POCINJE korisnikovim uuid-om', () => {
    // `<uid>-nesto/` prolazi kroz naivnu `startsWith` provjeru, a tudji je direktorij.
    const out = validateGuaranteeEvidence({
      kind: 'storage', evidencePath: `${MOJ}-tudje/dopis.pdf`, userId: MOJ,
    });
    expect(out).toEqual({ ok: false, reason: 'evidence_path_not_owned' });
  });

  it('odbija izlazak iz prefiksa (`..`) u svim oblicima', () => {
    for (const p of [
      `${MOJ}/../${TUDJI}/dopis.pdf`,
      `../${TUDJI}/dopis.pdf`,
      `${MOJ}/..`,
      `..`,
    ]) {
      expect(validateGuaranteeEvidence({ kind: 'storage', evidencePath: p, userId: MOJ }).ok).toBe(false);
    }
  });

  it('odbija ugnijezdjene putanje, vodecu i zavrsnu kosu crtu, obrnutu crtu', () => {
    for (const p of [
      `${MOJ}/pod/dopis.pdf`,
      `/${MOJ}/dopis.pdf`,
      `${MOJ}/`,
      `${MOJ}\\dopis.pdf`,
      'dopis.pdf',
    ]) {
      expect(validateGuaranteeEvidence({ kind: 'storage', evidencePath: p, userId: MOJ }).ok).toBe(false);
    }
  });

  it('odbija kontrolne znakove i NUL u imenu', () => {
    for (const p of [`${MOJ}/dop\u0000is.pdf`, `${MOJ}/dop\u0001is.pdf`, `${MOJ}/dop\nis.pdf`]) {
      expect(validateGuaranteeEvidence({ kind: 'storage', evidencePath: p, userId: MOJ }))
        .toEqual({ ok: false, reason: 'evidence_path_invalid' });
    }
  });

  it('odbija tip koji nije dokaz referade, ukljucujuci sam rad (.docx)', () => {
    for (const name of ['rad.docx', 'rad.doc', 'skripta.js', 'arhiva.zip', 'bez-nastavka']) {
      expect(validateGuaranteeEvidence({ kind: 'storage', evidencePath: `${MOJ}/${name}`, userId: MOJ }))
        .toEqual({ ok: false, reason: 'evidence_type_not_allowed' });
    }
  });

  it('odbija predugacko ime', () => {
    const name = `${'a'.repeat(EVIDENCE_NAME_MAX)}.pdf`;
    expect(validateGuaranteeEvidence({ kind: 'storage', evidencePath: `${MOJ}/${name}`, userId: MOJ }))
      .toEqual({ ok: false, reason: 'evidence_path_invalid' });
  });

  it('prima vlastitu putanju dopustenog tipa', () => {
    for (const name of ['dopis.pdf', 'snimka.PNG', 'slika.jpeg', 'zaslon.webp']) {
      const out = validateGuaranteeEvidence({ kind: 'storage', evidencePath: `${MOJ}/${name}`, userId: MOJ });
      expect(out).toEqual({ ok: true, kind: 'storage', path: `${MOJ}/${name}` });
    }
  });

  it('bez identiteta nema vlasnistva, pa ni dokaza', () => {
    expect(validateGuaranteeEvidence({ kind: 'storage', evidencePath: `${MOJ}/dopis.pdf`, userId: '' }))
      .toEqual({ ok: false, reason: 'evidence_path_not_owned' });
  });
});

describe('vrsta dokaza', () => {
  it('nepoznata vrsta se ODBIJA, ne svodi tiho na tekst', () => {
    const out = validateGuaranteeEvidence({ kind: 'datoteka', evidencePath: OPIS, userId: MOJ });
    expect(out).toEqual({ ok: false, reason: 'evidence_kind_invalid' });
  });

  it('vrsta koja nedostaje ostaje tekst (zatecen ugovor starih klijenata)', () => {
    expect(validateGuaranteeEvidence({ evidencePath: OPIS, userId: MOJ }).ok).toBe(true);
    expect(validateGuaranteeEvidence({ kind: null, evidencePath: OPIS, userId: MOJ }).ok).toBe(true);
    expect(validateGuaranteeEvidence({ kind: '', evidencePath: OPIS, userId: MOJ }).ok).toBe(true);
  });

  it('putanja poslana kao tekst NE dobiva povlastice putanje', () => {
    // Ako netko posalje tudju putanju bez `kind: 'storage'`, ona je samo prekratak opis:
    // ne smije zavrsiti u bazi kao da je provjerena putanja.
    const out = validateGuaranteeEvidence({ evidencePath: `${TUDJI}/x.pdf`, userId: MOJ });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.kind).toBe('text');
  });
});
