import { describe, it, expect } from 'vitest';
import { parseAppStats } from '../src/docx/quick-stats';

/** Minimalni app.xml kakav Word pise (Words/Pages). */
const appXml = (words: string, pages: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Properties><Template>Normal.dotm</Template><Pages>${pages}</Pages><Words>${words}</Words><Characters>90000</Characters></Properties>`;

describe('parseAppStats: peek rijeci i stranica iz app.xml', () => {
  it('cita Words i Pages', () => {
    const s = parseAppStats(appXml('18426', '52'));
    expect(s.words).toBe(18426);
    expect(s.pages).toBe(52);
  });

  it('nedostajuce vrijednosti daju null', () => {
    const s = parseAppStats('<Properties><Template>Normal</Template></Properties>');
    expect(s.words).toBeNull();
    expect(s.pages).toBeNull();
  });

  it('nula ili nevaljano se tretira kao null (bez laznog prikaza)', () => {
    const s = parseAppStats('<Properties><Words>0</Words><Pages>x</Pages></Properties>');
    expect(s.words).toBeNull();
    expect(s.pages).toBeNull();
  });
});
