/**
 * Testovi PDF preflight heuristike (izvucene iz monolita). Sinteticki PDF-oliki bajtovi
 * pokrivaju zaglavlje, EOF, sifriranje, PDF/A, A4, fontove, JavaScript i S5 granicu skeniranja.
 */
import { describe, it, expect } from 'vitest';
import { pdfPreflight, pdfLiteral, MAX_PDF_SCAN_BYTES } from '../src/pdf/pdf-preflight';

const enc = (s: string) => new TextEncoder().encode(s);

/** Minimalan valjan-izgledan PDF s A4 MediaBox, ugradjenim fontom i tekstom. */
const validPdf =
  '%PDF-1.7\n' +
  '/Type /Page /MediaBox [0 0 595 842]\n' +
  '/Type /Font /FontFile2 123\n' +
  '(BT) Tj\n' +
  '/Title (Diplomski rad) /Author (Ana Anic)\n' +
  '%%EOF';

describe('pdfPreflight: osnovna heuristika', () => {
  it('valjan PDF: header, eof, A4, font, tekst, naslov/autor', () => {
    const r = pdfPreflight(enc(validPdf), 'rad.pdf', 1234);
    expect(r.header).toBe(true);
    expect(r.eof).toBe(true);
    expect(r.encrypted).toBe(false);
    expect(r.valid).toBe(true);
    expect(r.version).toBe('1.7');
    expect(r.a4Share).toBe(1);
    expect(r.embeddedFontFiles).toBeGreaterThan(0);
    expect(r.textOperators).toBeGreaterThan(0);
    expect(r.title).toBe('Diplomski rad');
    expect(r.author).toBe('Ana Anic');
    expect(r.scanTruncated).toBe(false);
  });

  it('nedostaje EOF i zaglavlje -> nevaljan, error nota', () => {
    const r = pdfPreflight(enc('nije pdf uopce'), 'x.pdf', 10);
    expect(r.header).toBe(false);
    expect(r.eof).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.notes.some((n) => n.level === 'error')).toBe(true);
  });

  it('sifriran PDF -> encrypted + nevaljan', () => {
    const r = pdfPreflight(enc('%PDF-1.5\n/Encrypt 9 0 R\n%%EOF'), 'e.pdf', 20);
    expect(r.encrypted).toBe(true);
    expect(r.valid).toBe(false);
  });

  it('JavaScript i obrazac -> upozorenja', () => {
    const r = pdfPreflight(enc('%PDF-1.6\n/JavaScript 1\n/AcroForm 2\n%%EOF'), 'j.pdf', 20);
    expect(r.hasJavascript).toBe(true);
    expect(r.hasForms).toBe(true);
    expect(r.notes.filter((n) => n.level === 'warning').length).toBeGreaterThanOrEqual(2);
  });

  it('font bez ugradjenog FontFile -> upozorenje', () => {
    const r = pdfPreflight(enc('%PDF-1.7\n/Type /Font 1\n%%EOF'), 'f.pdf', 20);
    expect(r.fontObjects).toBeGreaterThan(0);
    expect(r.embeddedFontFiles).toBe(0);
    expect(r.notes.some((n) => /ugrađenih fontova/.test(n.text))).toBe(true);
  });

  it('ne-A4 MediaBox -> a4Share < 1 i upozorenje', () => {
    const r = pdfPreflight(enc('%PDF-1.7\n/MediaBox [0 0 612 792]\n%%EOF'), 'letter.pdf', 20);
    expect(r.a4Share).toBe(0);
    expect(r.notes.some((n) => /A4 format/.test(n.text))).toBe(true);
  });
});

describe('pdfPreflight: S5 granica skeniranja', () => {
  it('EOF se cita s kraja i kad je sadrzaj odsjecen', () => {
    // glava valjana, ogroman "sadrzaj" preko granice, EOF na samom kraju
    const padding = 'a'.repeat(MAX_PDF_SCAN_BYTES + 1024);
    const bytes = enc('%PDF-1.7\n' + padding + '\n%%EOF');
    const r = pdfPreflight(bytes, 'big.pdf', bytes.length);
    expect(r.scanTruncated).toBe(true);
    expect(r.header).toBe(true);
    expect(r.eof).toBe(true); // tail se cita zasebno s pravog kraja
  });
});

describe('pdfLiteral', () => {
  it('cita literal i odmata escape (staje na prvom nezasticenom ")")', () => {
    expect(pdfLiteral('/Title (Zavrsni rad)', 'Title')).toBe('Zavrsni rad');
    // escapean "(" se odmata; regex staje na prvom ")" (naslijedjeno ponasanje)
    expect(pdfLiteral('/Title (A \\(B)', 'Title')).toBe('A (B');
    expect(pdfLiteral('nema', 'Title')).toBeNull();
  });
});
