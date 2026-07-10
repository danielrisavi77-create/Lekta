/** URL parametri alata naslovnice: parse/serialize round-trip i tolerancija na smece. */
import { describe, it, expect } from 'vitest';
import { parseTitlePageParams, serializeTitlePageParams } from '../src/title-pages/title-page-params';

describe('parseTitlePageParams', () => {
  it('cita fakultet, razinu (slug -> WorkType) i smjer', () => {
    expect(parseTitlePageParams('?fakultet=fpzg&razina=diplomski&smjer=Politologija')).toEqual({
      unitId: 'fpzg',
      level: 'graduate',
      program: 'Politologija',
    });
  });
  it('nepoznata razina i prazna polja se ispustaju', () => {
    expect(parseTitlePageParams('?razina=nepostojeca&fakultet=&smjer=')).toEqual({});
    expect(parseTitlePageParams('')).toEqual({});
  });
});

describe('serializeTitlePageParams', () => {
  it('round-trip s parse', () => {
    const params = { unitId: 'pravo', level: 'doctoral' as const, program: 'Pravo' };
    expect(parseTitlePageParams('?' + serializeTitlePageParams(params))).toEqual(params);
  });
  it('prazni parametri daju prazan string', () => {
    expect(serializeTitlePageParams({})).toBe('');
  });
});
