import { describe, it, expect } from 'vitest';
import {
  detectTitleWorkTypeMarker,
  estimateWorkType,
  unambiguousMismatch,
  profileToReportWorkType,
} from '../src/report/work-type-estimate';

describe('detectTitleWorkTypeMarker', () => {
  it('prepoznaje diplomski rad s naslovnice', () => {
    expect(detectTitleWorkTypeMarker('Sveučilište u Zagrebu\nDIPLOMSKI RAD\nZagreb, 2025.')).toBe('graduate');
  });
  it('NE oznaci diplomski kad je rijec o preddiplomskom studiju uz zavrsni rad', () => {
    expect(detectTitleWorkTypeMarker('Preddiplomski studij Politologija\nZAVRŠNI RAD')).toBe('final');
  });
  it('NE oznaci diplomski kad je rijec o prijediplomskom studiju bez "rad"', () => {
    expect(detectTitleWorkTypeMarker('Integrirani prijediplomski i diplomski studij Pravo')).toBeNull();
  });
  it('prepoznaje diplomski rad i uz integrirani studij', () => {
    expect(detectTitleWorkTypeMarker('Integrirani preddiplomski i diplomski studij\nDIPLOMSKI RAD')).toBe('graduate');
  });
  it('prepoznaje doktorski / disertaciju', () => {
    expect(detectTitleWorkTypeMarker('DOKTORSKI RAD')).toBe('doctoral');
    expect(detectTitleWorkTypeMarker('Doktorska disertacija')).toBe('doctoral');
  });
  it('prepoznaje seminarski i specijalisticki', () => {
    expect(detectTitleWorkTypeMarker('SEMINARSKI RAD')).toBe('seminar');
    expect(detectTitleWorkTypeMarker('Specijalistički rad')).toBe('specialist');
  });
  it('vraca null bez markera', () => {
    expect(detectTitleWorkTypeMarker('Naslov rada bez oznake vrste')).toBeNull();
    expect(detectTitleWorkTypeMarker('')).toBeNull();
  });
});

describe('estimateWorkType', () => {
  it('marker ima prednost (visoka pouzdanost)', () => {
    const e = estimateWorkType({ words: 2000, titleMarker: 'graduate' });
    expect(e.workType).toBe('diplomski');
    expect(e.confidence).toBe('high');
  });
  it('bez markera klasificira po opsegu rijeci', () => {
    expect(estimateWorkType({ words: 2000 }).workType).toBe('seminarski');
    expect(estimateWorkType({ words: 12000 }).workType).toBe('diplomski');
    expect(estimateWorkType({ words: 40000 }).workType).toBe('doktorski');
  });
  it('bez opsega vraca nisku pouzdanost', () => {
    expect(estimateWorkType({ words: null }).confidence).toBe('low');
  });
});

describe('unambiguousMismatch', () => {
  it('blokira jeftiniji tier kad naslovnica kaze visu vrstu', () => {
    expect(unambiguousMismatch('seminarski', { words: 3000, titleMarker: 'graduate' })).toBe(true);
    expect(unambiguousMismatch('seminarski', { words: 3000, titleMarker: 'doctoral' })).toBe(true);
  });
  it('blokira kad je opseg NEDVOSMISLENO iznad stropa vrste', () => {
    expect(unambiguousMismatch('seminarski', { words: 20000 })).toBe(true); // >9000*2
    expect(unambiguousMismatch('diplomski', { words: 65000 })).toBe(true); // >30000*2
  });
  it('NE blokira granicne posteni radove (dug seminar, kratak diplomski)', () => {
    expect(unambiguousMismatch('seminarski', { words: 8000 })).toBe(false);
    expect(unambiguousMismatch('diplomski', { words: 40000 })).toBe(false);
  });
  it('NE blokira kad je marker iste ili nize razine', () => {
    expect(unambiguousMismatch('diplomski', { words: 12000, titleMarker: 'graduate' })).toBe(false);
    expect(unambiguousMismatch('diplomski', { words: 12000, titleMarker: 'seminar' })).toBe(false);
  });
  it('doktorski (najvisi tier) se nikad ne blokira', () => {
    expect(unambiguousMismatch('doktorski', { words: 200000, titleMarker: 'doctoral' })).toBe(false);
  });
  it('nepoznat tier ne blokira', () => {
    expect(unambiguousMismatch('nesto', { words: 999999 })).toBe(false);
  });
});

describe('profileToReportWorkType', () => {
  it('mapira profilske u naplatne vrste', () => {
    expect(profileToReportWorkType('graduate')).toBe('diplomski');
    expect(profileToReportWorkType('specialist')).toBe('diplomski');
    expect(profileToReportWorkType('final')).toBe('zavrsni');
    expect(profileToReportWorkType('seminarski')).toBe('seminarski'); // vec naplatna
    expect(profileToReportWorkType('nepoznato')).toBe('zavrsni');
  });
});
