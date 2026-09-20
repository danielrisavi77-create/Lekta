import { describe, expect, it } from 'vitest';
import { canonicalJson, canonicalUtf8, fromBase64Url, sha256Hex, toBase64Url } from '../src/repair/contract';

describe('Repair Contract kanonski zapis', () => {
  it('sortira kljuceve, ali cuva redoslijed niza', () => {
    expect(canonicalJson({ z: 1, a: ['drugi', 'prvi'], m: { b: true, a: null } }))
      .toBe('{"a":["drugi","prvi"],"m":{"a":null,"b":true},"z":1}');
  });

  it('daje isti zapis bez obzira na redoslijed umetanja kljuceva', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });

  it('cuva hrvatski tekst u UTF-8', () => {
    expect(new TextDecoder().decode(canonicalUtf8({ naziv: 'Sadrzaj, čćžšđ' })))
      .toBe('{"naziv":"Sadrzaj, čćžšđ"}');
  });

  it('odbija NaN, Infinity, undefined, Date, cikluse i opasne kljuceve', () => {
    for (const value of [NaN, Infinity, undefined, new Date()] as unknown[]) {
      expect(() => canonicalJson(value as never)).toThrow();
    }

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic as never)).toThrow();
    expect(() => canonicalJson(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow();
  });

  it('odbija rijetke nizove, accessor elemente i dodatna svojstva niza', () => {
    const sparse = new Array(2);
    const accessor = ['sigurno'];
    Object.defineProperty(accessor, '0', { enumerable: true, get: () => 'izvrseno' });
    const withExtra = ['vrijednost'] as string[] & { command?: string };
    withExtra.command = 'Start-Process';
    const withSymbol = ['vrijednost'] as string[] & Record<symbol, string>;
    withSymbol[Symbol('command')] = 'Start-Process';

    for (const value of [sparse, accessor, withExtra, withSymbol]) {
      expect(() => canonicalJson(value as never)).toThrow();
    }
  });

  it('ima povratni base64url i poznati SHA-256 vektor', async () => {
    const bytes = new TextEncoder().encode('abc');
    expect(await sha256Hex(bytes)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it('odbija nekanonske base64url znakove', () => {
    for (const value of ['YQ==', 'YQ+', 'YQ/', 'YQ\n']) {
      expect(() => fromBase64Url(value)).toThrow();
    }
  });
});
