// @vitest-environment node
/**
 * T58: dva obvezna retka opisa PR-a. `scripts/agents/pr-lines.mjs` je cist modul; ovaj test nikad
 * ne pokrece git. Svaki slucaj ima i cisti baseline i pokvaren ulaz koji mora pasti.
 */
import { describe, expect, it } from 'vitest';
import {
  jeDependabot, netoRedaka, noveOvisnosti, promijenjeneOvisnosti, provjeriOpisPr, provjeriPrZaAutora,
  retciDependabot, retciOpisa,
} from '../scripts/agents/pr-lines.mjs';

describe('netoRedaka', () => {
  it('cita dodano i uklonjeno iz punog shortstata', () => {
    expect(netoRedaka(' 5 files changed, 120 insertions(+), 4 deletions(-)\n')).toBe('+120/-4');
  });

  it('jednina i izostavljeni dijelovi daju nulu za taj dio', () => {
    expect(netoRedaka(' 1 file changed, 1 insertion(+)')).toBe('+1/-0');
    expect(netoRedaka(' 1 file changed, 1 deletion(-)')).toBe('+0/-1');
    expect(netoRedaka(' 2 files changed, 3 insertions(+), 1 deletion(-)\r\n')).toBe('+3/-1');
  });

  it('prazan diff je +0/-0', () => {
    expect(netoRedaka('')).toBe('+0/-0');
    expect(netoRedaka('  \n')).toBe('+0/-0');
  });

  it('ulaz koji nije shortstat rusi mjerenje umjesto da da +0/-0', () => {
    expect(() => netoRedaka('fatal: bad revision')).toThrow(/shortstat/);
    expect(() => netoRedaka(' 5 files changed, 12 insertions(+) i jos nesto')).toThrow();
    expect(() => netoRedaka(undefined as unknown as string)).toThrow(TypeError);
  });
});

describe('noveOvisnosti', () => {
  const base = { dependencies: { a: '^1.0.0' }, devDependencies: { vitest: '^3.0.0' } };

  it('bez promjene nema novih', () => {
    expect(noveOvisnosti(base, base)).toEqual([]);
  });

  it('nova ovisnost u dependencies i devDependencies se prijavljuje, sortirano', () => {
    const head = {
      dependencies: { a: '^1.0.0', zod: '^4.0.0' },
      devDependencies: { vitest: '^3.0.0', 'left-pad': '1.0.0' },
    };
    expect(noveOvisnosti(base, head)).toEqual(['left-pad', 'zod']);
  });

  it('promjena verzije, uklanjanje i premjestanje izmedju sekcija nisu nove ovisnosti', () => {
    const head = { dependencies: { a: '^2.0.0', vitest: '^3.0.0' } };
    expect(noveOvisnosti(base, head)).toEqual([]);
  });

  it('prima JSON string i null bazu', () => {
    expect(noveOvisnosti(JSON.stringify(base), JSON.stringify({ dependencies: { a: '1', b: '1' } }))).toEqual(['b']);
    expect(noveOvisnosti(null, { devDependencies: { x: '1' } })).toEqual(['x']);
  });

  it('pokvaren package.json rusi provjeru', () => {
    expect(() => noveOvisnosti(base, '{nije json')).toThrow();
    expect(() => noveOvisnosti(base, { dependencies: ['a'] })).toThrow(/dependencies/);
  });
});

describe('retciOpisa', () => {
  it('daje oba retka u obliku koji provjera prihvaca', () => {
    const retci = retciOpisa({
      diffShortstat: ' 3 files changed, 10 insertions(+), 2 deletions(-)',
      basePkg: { dependencies: {} },
      headPkg: { dependencies: { zod: '1' } },
    });
    expect(retci).toEqual(['Neto redaka: +10/-2', 'Nove ovisnosti: zod']);
    expect(provjeriOpisPr(retci.join('\n'), ['zod'])).toEqual([]);
  });
});

describe('provjeriOpisPr', () => {
  const dobar = '## Sto i zasto\n\nNesto.\n\nNeto redaka: +10/-2\nNove ovisnosti: nema\n';

  it('baseline: ispravan opis nema gresaka', () => {
    expect(provjeriOpisPr(dobar, [])).toEqual([]);
    expect(provjeriOpisPr(dobar.replace(/\n/g, '\r\n'), [])).toEqual([]);
    expect(provjeriOpisPr('- Neto redaka: +0/-0\n- Nove ovisnosti: `zod`', ['zod'])).toEqual([]);
  });

  it('nedostaje neto redaka', () => {
    const g = provjeriOpisPr(dobar.replace('Neto redaka: +10/-2', ''), []);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatch(/Neto redaka/);
  });

  it('neto redaka bez brojki ne vrijedi', () => {
    expect(provjeriOpisPr(dobar.replace('+10/-2', '+<dodano>/-<uklonjeno>'), [])).toHaveLength(1);
  });

  it('nedostaje nove ovisnosti', () => {
    const g = provjeriOpisPr(dobar.replace('Nove ovisnosti: nema', ''), []);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatch(/Nove ovisnosti/);
  });

  it('"nema" dok package.json dodaje paket pada', () => {
    const g = provjeriOpisPr(dobar, ['zod']);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatch(/zod/);
  });

  it('redak ostavljen kao predlozak ili u HTML komentaru ne vrijedi', () => {
    expect(provjeriOpisPr(dobar.replace('Nove ovisnosti: nema', 'Nove ovisnosti: nema | <popis paketa>'), [])).toHaveLength(1);
    expect(provjeriOpisPr('<!--\nNeto redaka: +1/-1\nNove ovisnosti: nema\n-->', [])).toHaveLength(2);
  });

  it('prazno tijelo daje obje greske', () => {
    expect(provjeriOpisPr('', [])).toHaveLength(2);
    expect(provjeriOpisPr(null as unknown as string, [])).toHaveLength(2);
  });
});

describe('Dependabot autor (koordinator lekta-37)', () => {
  const DEPENDABOT = { login: 'dependabot[bot]', type: 'Bot' };
  const LJUDSKI = { login: 'danielrisavi77-create', type: 'User' };

  it('prepoznaje Dependabot samo po loginu I tipu Bot', () => {
    expect(jeDependabot(DEPENDABOT)).toBe(true);
    expect(jeDependabot(LJUDSKI)).toBe(false);
    expect(jeDependabot({ login: 'dependabot[bot]', type: 'User' })).toBe(false);
    expect(jeDependabot({ login: 'dependabot', type: 'Bot' })).toBe(false);
    expect(jeDependabot({ login: '', type: '' })).toBe(false);
    expect(jeDependabot(null)).toBe(false);
  });

  it('isti opis bez redaka: Dependabot prolazi, ljudski autor pada', () => {
    const tijelo = 'Bumps vite from 7.1.0 to 7.1.2.';
    expect(provjeriPrZaAutora(tijelo, [], DEPENDABOT)).toEqual([]);
    expect(provjeriPrZaAutora(tijelo, [], LJUDSKI).length).toBe(2);
  });

  it('za ljudskog autora ponasanje je jednako provjeriOpisPr', () => {
    const tijelo = 'Neto redaka: +1/-1\nNove ovisnosti: nema';
    expect(provjeriPrZaAutora(tijelo, ['zod'], LJUDSKI)).toEqual(provjeriOpisPr(tijelo, ['zod']));
    expect(provjeriPrZaAutora(tijelo, [], LJUDSKI)).toEqual([]);
  });

  it('promijenjene ovisnosti: nova i promijenjena verzija kao ime@verzija, nepromijenjena izostavljena', () => {
    const base = { dependencies: { vite: '7.1.0', zod: '3.0.0' }, devDependencies: { vitest: '4.0.0' } };
    const head = { dependencies: { vite: '7.1.2', zod: '3.0.0' }, devDependencies: { vitest: '4.0.0', 'left-pad': '1.3.0' } };
    expect(promijenjeneOvisnosti(base, head)).toEqual(['left-pad@1.3.0', 'vite@7.1.2']);
    expect(promijenjeneOvisnosti(base, base)).toEqual([]);
  });

  it('retci za Dependabot su izracunati iz diffa i prolaze provjeru za ljudskog autora', () => {
    const r = retciDependabot({
      diffShortstat: ' 2 files changed, 5 insertions(+), 5 deletions(-)',
      basePkg: { dependencies: { vite: '7.1.0' } },
      headPkg: { dependencies: { vite: '7.1.2' } },
    });
    expect(r).toEqual(['Neto redaka: +5/-5', 'Nove ovisnosti: vite@7.1.2']);
    expect(provjeriOpisPr(r.join('\n'), [])).toEqual([]);
    expect(retciDependabot({ diffShortstat: '', basePkg: null, headPkg: null })).toEqual(['Neto redaka: +0/-0', 'Nove ovisnosti: nema']);
  });
});
