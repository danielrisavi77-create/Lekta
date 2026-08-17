/**
 * Jedna granica preko sva tri sloja (analiza / lokalni popravak / serverski popravak).
 *
 * Zasto postoji: upload granica JEST bila ujedinjena (docx-budget.DOCX_MAX_UPLOAD_BYTES), ali
 * DEKOMPRESIJA nije i ne moze biti - analiza cita lijeno samo XML dijelove (per-zapis granica),
 * a popravak mora procitati cijeli paket (ukupna granica, stroza). Posljedica je bila obecanje
 * koje se ne moze odrzati: analiza prodje, sucelje ponudi popravak, korisnik da privolu i poslje
 * dokument, pa dobije 422.
 *
 * `docxCapability` to rjesava tako da odgovor zna PRIJE analize, iz zip central directoryja.
 */
import { describe, expect, it } from 'vitest';
import {
  docxCapability,
  repairBlockerMessage,
  DOCX_MAX_UPLOAD_BYTES,
  DOCX_MAX_TOTAL_DECOMPRESSED_BYTES,
  DOCX_MAX_ZIP_ENTRIES,
  DOCX_MAX_DECOMPRESSED_BYTES_PER_ENTRY,
} from '../src/repair/docx-budget';
import { MAX_DECOMPRESSED_BYTES, MAX_ZIP_ENTRIES } from '../src/docx/parser';

const OK = { fileBytes: 2 * 1024 * 1024, entryCount: 20, totalDeclaredBytes: 8 * 1024 * 1024 };

describe('docxCapability: sto se s paketom stvarno moze', () => {
  it('uredan diplomski: i analiza i popravak', () => {
    const cap = docxCapability(OK);
    expect(cap.canAnalyze).toBe(true);
    expect(cap.canRepair).toBe(true);
    expect(cap.repairBlocker).toBeNull();
  });

  it('KLJUCNI SLUCAJ: prolazi analizu, ali se NE moze popraviti (prevelika dekompresija)', () => {
    // Malen upload, ali deklarirana dekompresija iznad ukupnog budzeta popravka. Prije je ovo
    // bio tihi 422 nakon privole; sada se zna unaprijed.
    const cap = docxCapability({ ...OK, totalDeclaredBytes: DOCX_MAX_TOTAL_DECOMPRESSED_BYTES + 1 });
    expect(cap.canAnalyze).toBe(true);
    expect(cap.canRepair).toBe(false);
    expect(cap.repairBlocker).toBe('decompresses-too-large');
  });

  it('prevelik upload: ni analiza ni popravak', () => {
    const cap = docxCapability({ ...OK, fileBytes: DOCX_MAX_UPLOAD_BYTES + 1 });
    expect(cap.canAnalyze).toBe(false);
    expect(cap.canRepair).toBe(false);
    expect(cap.repairBlocker).toBe('upload-too-large');
  });

  it('previse zapisa: ni analiza ni popravak', () => {
    const cap = docxCapability({ ...OK, entryCount: DOCX_MAX_ZIP_ENTRIES + 1 });
    expect(cap.canAnalyze).toBe(false);
    expect(cap.repairBlocker).toBe('too-many-entries');
  });

  it('prazna datoteka nije analizirajuca', () => {
    expect(docxCapability({ ...OK, fileBytes: 0 }).canAnalyze).toBe(false);
  });

  it('tocno NA granici jos prolazi (granice su inkluzivne)', () => {
    const cap = docxCapability({
      fileBytes: DOCX_MAX_UPLOAD_BYTES,
      entryCount: DOCX_MAX_ZIP_ENTRIES,
      totalDeclaredBytes: DOCX_MAX_TOTAL_DECOMPRESSED_BYTES,
    });
    expect(cap.canRepair).toBe(true);
  });

  it('svaki blocker ima korisniku razumljivo objasnjenje', () => {
    for (const blocker of ['upload-too-large', 'too-many-entries', 'decompresses-too-large'] as const) {
      expect(repairBlockerMessage(blocker).length).toBeGreaterThan(20);
    }
  });
});

describe('jedan izvor granica: parser ne smije imati vlastite brojke', () => {
  it('parser cita granice iz docx-budget, ne iz literala', () => {
    expect(MAX_DECOMPRESSED_BYTES).toBe(DOCX_MAX_DECOMPRESSED_BYTES_PER_ENTRY);
    expect(MAX_ZIP_ENTRIES).toBe(DOCX_MAX_ZIP_ENTRIES);
  });

  it('popravak je uze grlo od analize (inace capability nema smisla)', () => {
    expect(DOCX_MAX_TOTAL_DECOMPRESSED_BYTES).toBeLessThan(DOCX_MAX_DECOMPRESSED_BYTES_PER_ENTRY);
  });
});
