/**
 * Cista, DOM-free jezgra detekcije profila iz teksta dokumenta (BL-P0-05-8). Izvucena iz app.ts
 * (detectDocxContext) da bude jedinicno testabilna i da detekcija POKUSAVA sve institucije kataloga,
 * ne samo unizg. NE ulazi u analyzeDocx ni golden-entry (golden koristi fiksne profile), pa je bez
 * golden rizika: ovo je iskljucivo pred-popunjavanje UI izbornika, uvijek ispravljivo.
 */
import { normalize } from '../utils/helpers';

export interface DetectUnit {
  id: string;
  name: string;
  programs?: string[];
  institutionId?: string;
  institutionName?: string;
}

export interface DetectedContext {
  institutionId: string | null;
  institutionName: string | null;
  unitId: string;
  unitName: string;
  program: string | null;
  workType: string | null;
}

// Vrsta rada iz normaliziranog teksta (bez dijakritike, bez razmaka). Redoslijed je specificnost:
// doktorski/disertacija prije diplomskog, itd.
const WORK_TYPE_RULES: [string, RegExp][] = [
  ['doctoral', /doktorsk|disertacij/],
  ['specialist', /specijalisticki/],
  ['graduate', /diplomskirad/],
  ['final', /zavrsnirad/],
  ['seminar', /seminarskirad/],
];

/**
 * Heuristicki pogodi (institucija, fakultet, studij, vrsta rada) iz teksta dokumenta preko SVIH
 * jedinica kataloga. Longest-match po normaliziranom nazivu jedinice (guard duljine 6, cuva najduzi
 * pogodak) da kratki/genericki nazivi ne daju lazni pozitiv. Vraca null ako nista ne prepozna
 * (nikad ne baca, nikad ne blokira analizu).
 */
export function detectContextFromText(units: DetectUnit[], rawText: string): DetectedContext | null {
  const n = normalize(rawText || '');
  if (!n) return null;
  let unit: DetectUnit | null = null;
  let best = 0;
  for (const u of units) {
    const key = normalize(u.name);
    if (key.length >= 6 && key.length > best && n.includes(key)) {
      unit = u;
      best = key.length;
    }
  }
  if (!unit) return null;
  let workType: string | null = null;
  for (const [wt, re] of WORK_TYPE_RULES) {
    if (re.test(n)) { workType = wt; break; }
  }
  let program: string | null = null;
  let pbest = 0;
  for (const p of unit.programs || []) {
    if (/^Opći/.test(p) || /studij/i.test(p)) continue;
    const key = normalize(p);
    if (key.length >= 5 && key.length > pbest && n.includes(key)) {
      program = p;
      pbest = key.length;
    }
  }
  return {
    institutionId: unit.institutionId ?? null,
    institutionName: unit.institutionName ?? null,
    unitId: unit.id,
    unitName: unit.name,
    program,
    workType,
  };
}

/**
 * Treba li potvrda profila prije analize: verificiran (scored, fakultetski specifican) profil koji
 * korisnik nije svjesno potvrdio (nije mijenjao izbornike, nema spremljenih preferenci, nije bilo
 * detekcije iz dokumenta). Sprjecava da netaknuti default (npr. FPZG) tiho zabodova tudji rad.
 */
export function needsProfileConfirmation(statusKey: string, confirmed: boolean): boolean {
  return statusKey === 'verified' && !confirmed;
}

/**
 * Je li automatska detekcija dovoljno pouzdana da se profil smatra korisnicki potvrdjenim BEZ
 * eksplicitne radnje. Samo kad je studij (program) stvarno prepoznat iz teksta dokumenta: kad
 * detekcija pogodi ustanovu/fakultet ali ne i program, izbornik studija ostaje na proizvoljnom
 * (alfabetski prvom) fallbacku iz populatePrograms, pa taj slucaj NE smije tiho ugasiti
 * needsProfileConfirmation gate za verificirane profile (AUDIT_MASTER.md, poglavlje 7).
 */
export function isConfidentDetection(ctx: DetectedContext | null): boolean {
  return !!ctx?.program;
}
