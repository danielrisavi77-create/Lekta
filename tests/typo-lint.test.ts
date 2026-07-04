import { describe, it, expect } from 'vitest';
import {
  typoLint,
  typoLintSummary,
  KIND_DVOSTRUKI_RAZMAK,
  KIND_RAZMAK_PRIJE_INTERPUNKCIJE,
  KIND_EM_EN_CRTICA,
  KIND_NAVODNICI_NEDOSLJEDNI,
  KIND_HOMOGLIF_CIRILICA,
  KIND_DECIMALNI_SEPARATOR,
  KIND_VISESTRUKE_TOCKE,
  KIND_RAZMAK_UZ_ZAGRADU,
} from '../src/tools/typo-lint';

// Pomocnik: nalazi samo trazene vrste, da provjere ne smetaju jedna drugoj.
function byKind(paragraphs: string[], kind: string) {
  return typoLint(paragraphs).filter((f) => f.kind === kind);
}

describe('typoLint: dvostruki razmak', () => {
  it('prijavljuje dva uzastopna razmaka', () => {
    const f = byKind(['Ovo je  dvostruki razmak.'], KIND_DVOSTRUKI_RAZMAK);
    expect(f).toHaveLength(1);
    expect(f[0].paragraphIndex).toBe(0);
    expect(f[0].excerpt).toContain('dvostruki');
  });
  it('ne prijavljuje uredan tekst s jednostrukim razmacima', () => {
    expect(byKind(['Ovo je uredan tekst.'], KIND_DVOSTRUKI_RAZMAK)).toHaveLength(0);
  });
});

describe('typoLint: razmak prije interpunkcije', () => {
  it('prijavljuje razmak prije zareza', () => {
    const f = byKind(['Rečenica , s razmakom prije zareza.'], KIND_RAZMAK_PRIJE_INTERPUNKCIJE);
    expect(f).toHaveLength(1);
    expect(f[0].suggestion).toContain('ukloni razmak');
  });
  it('ne prijavljuje tekst bez razmaka prije interpunkcije', () => {
    expect(byKind(['Rečenica, bez razmaka.'], KIND_RAZMAK_PRIJE_INTERPUNKCIJE)).toHaveLength(0);
  });
  it('ne prijavljuje razmak prije crtice ni prije zagrada', () => {
    const p = ['tekst \u2013 nastavak (u zagradi) i kraj'];
    expect(byKind(p, KIND_RAZMAK_PRIJE_INTERPUNKCIJE)).toHaveLength(0);
  });
});

describe('typoLint: em i en crtica', () => {
  it('prijavljuje em crticu i predlaze zarez, dvotocku ili zagrade', () => {
    const f = byKind(['Rad je gotov \u2014 skoro.'], KIND_EM_EN_CRTICA);
    expect(f).toHaveLength(1);
    expect(f[0].suggestion).toContain('zarezom');
    // Poruka ne smije sadrzavati samu crticu; excerpt smije jer citira ulaz.
    expect(f[0].suggestion).not.toContain('\u2014');
    expect(f[0].suggestion).not.toContain('\u2013');
  });
  it('prijavljuje en crticu u rasponu godina', () => {
    const f = byKind(['raspon 2010\u20132015 godina'], KIND_EM_EN_CRTICA);
    expect(f).toHaveLength(1);
    expect(f[0].suggestion).toContain('en crticu');
  });
  it('ne prijavljuje obicnu spojnicu', () => {
    expect(byKind(['dvadeset-prvi rok'], KIND_EM_EN_CRTICA)).toHaveLength(0);
  });
});

describe('typoLint: nedosljedni navodnici (globalno)', () => {
  it('prijavljuje mijesanje ravnih i hrvatskih navodnika na odlomku gdje se ocituje', () => {
    const p = ['On kaže "ovo" jasno.', 'Ona kaže „ono“ tiho.'];
    const f = byKind(p, KIND_NAVODNICI_NEDOSLJEDNI);
    expect(f).toHaveLength(1);
    expect(f[0].paragraphIndex).toBe(1);
  });
  it('ne prijavljuje dokument samo s ravnim navodnicima', () => {
    const p = ['Samo "ravni" navodnici.', 'Opet "ravni" navodnici.'];
    expect(byKind(p, KIND_NAVODNICI_NEDOSLJEDNI)).toHaveLength(0);
  });
  it('ne prijavljuje dokument samo s hrvatskim navodnicima', () => {
    const p = ['Samo „hrvatski“ navodnici.'];
    expect(byKind(p, KIND_NAVODNICI_NEDOSLJEDNI)).toHaveLength(0);
  });
});

describe('typoLint: cirilicni homoglifi', () => {
  it('prijavljuje cirilicno slovo unutar latinicne rijeci', () => {
    // "prаvo": cirilicno a (U+0430) usred latinicnih slova.
    const f = byKind(['Ovo je prаvo pitanje.'], KIND_HOMOGLIF_CIRILICA);
    expect(f).toHaveLength(1);
    expect(f[0].excerpt).toContain('prаvo');
    expect(f[0].suggestion).toContain('ćirilične');
  });
  it('ne prijavljuje cisto latinicnu rijec', () => {
    expect(byKind(['Ovo je pravo pitanje.'], KIND_HOMOGLIF_CIRILICA)).toHaveLength(0);
  });
  it('ne prijavljuje cisto cirilicnu rijec (stvarni citat)', () => {
    const p = ['Grad Москва je velik.'];
    expect(byKind(p, KIND_HOMOGLIF_CIRILICA)).toHaveLength(0);
  });
});

describe('typoLint: decimalni separator (globalno)', () => {
  it('prijavljuje mijesanje decimalne tocke i zareza na odlomku gdje se ocituje', () => {
    const p = ['Vrijednost je 3.14 posto.', 'Druga je 2,5 posto.'];
    const f = byKind(p, KIND_DECIMALNI_SEPARATOR);
    expect(f).toHaveLength(1);
    expect(f[0].paragraphIndex).toBe(1);
    expect(f[0].suggestion).toContain('decimalni');
  });
  it('ne prijavljuje dosljedan decimalni zarez', () => {
    expect(byKind(['Vrijednosti su 3,14 i 2,5.'], KIND_DECIMALNI_SEPARATOR)).toHaveLength(0);
  });
  it('ignorira godine i nabrajanja s tockom', () => {
    const p = ['1. 2. 3. su stavke nabrajanja.', 'Godine 2020. i 2021. su prošle.', 'Vrijednost je 2,5.'];
    expect(byKind(p, KIND_DECIMALNI_SEPARATOR)).toHaveLength(0);
  });
  it('ignorira datume poput 2.7.2026.', () => {
    const p = ['Pristupljeno 2.7.2026. u arhivu.', 'Vrijednost je 2,5.'];
    expect(byKind(p, KIND_DECIMALNI_SEPARATOR)).toHaveLength(0);
  });
  it('ne stvara lazni nalaz zbog URL-a s verzijom', () => {
    const p = ['Vidi https://example.com/v1.2 za detalje.', 'Vrijednost je 2,5.'];
    expect(byKind(p, KIND_DECIMALNI_SEPARATOR)).toHaveLength(0);
  });
});

describe('typoLint: visestruke tocke', () => {
  it('prijavljuje dvostruku tocku koja nije trotocka', () => {
    const f = byKind(['Kraj rečenice.. Nova rečenica.'], KIND_VISESTRUKE_TOCKE);
    expect(f).toHaveLength(1);
    expect(f[0].suggestion).toContain('trotočkom');
  });
  it('ne prijavljuje trotocku', () => {
    expect(byKind(['Nastavak slijedi... uskoro.'], KIND_VISESTRUKE_TOCKE)).toHaveLength(0);
  });
  it('ne prijavljuje cetiri tocke (trotocka plus tocka recenice)', () => {
    expect(byKind(['Kraj misli.... Nova misao.'], KIND_VISESTRUKE_TOCKE)).toHaveLength(0);
  });
  it('ne stvara lazni nalaz zbog dviju tocaka u URL-u', () => {
    const p = ['Putanja https://example.com/a..b radi uredno.'];
    expect(byKind(p, KIND_VISESTRUKE_TOCKE)).toHaveLength(0);
  });
});

describe('typoLint: razmak uz zagradu', () => {
  it('prijavljuje razmak nakon otvorene zagrade', () => {
    const f = byKind(['Navod ( s razmakom) unutra.'], KIND_RAZMAK_UZ_ZAGRADU);
    expect(f).toHaveLength(1);
  });
  it('prijavljuje razmak prije zatvorene zagrade', () => {
    const f = byKind(['Navod (s razmakom ) unutra.'], KIND_RAZMAK_UZ_ZAGRADU);
    expect(f).toHaveLength(1);
  });
  it('ne prijavljuje urednu zagradu', () => {
    expect(byKind(['Navod (bez razmaka) unutra.'], KIND_RAZMAK_UZ_ZAGRADU)).toHaveLength(0);
  });
});

describe('typoLint: opcenito ponasanje', () => {
  it('tolerira trotocku s razmakom ispred (bez nalaza razmaka prije interpunkcije)', () => {
    const p = ['Riječ ... nastavak teksta.'];
    expect(byKind(p, KIND_RAZMAK_PRIJE_INTERPUNKCIJE)).toHaveLength(0);
    expect(byKind(p, KIND_VISESTRUKE_TOCKE)).toHaveLength(0);
  });
  it('excerpt je kratak isjecak okoline (do 60 znakova)', () => {
    const dugi = 'Na početku vrlo dugog odlomka nalazi se mnogo teksta, a onda  dvostruki razmak, pa još mnogo teksta do samog kraja odlomka.';
    const f = byKind([dugi], KIND_DVOSTRUKI_RAZMAK);
    expect(f).toHaveLength(1);
    expect(f[0].excerpt.length).toBeLessThanOrEqual(60);
  });
  it('prazan ulaz i uredni odlomci ne daju nalaze', () => {
    expect(typoLint([])).toHaveLength(0);
    expect(typoLint(['Uredan odlomak bez pogrešaka.'])).toHaveLength(0);
  });
});

describe('typoLintSummary', () => {
  it('zbraja ukupno i po vrsti', () => {
    const findings = typoLint(['Dvostruki  razmak i razmak , prije zareza.']);
    const s = typoLintSummary(findings);
    expect(s.total).toBe(2);
    expect(s.byKind[KIND_DVOSTRUKI_RAZMAK]).toBe(1);
    expect(s.byKind[KIND_RAZMAK_PRIJE_INTERPUNKCIJE]).toBe(1);
  });
  it('prazan popis nalaza daje prazan sazetak', () => {
    const s = typoLintSummary([]);
    expect(s.total).toBe(0);
    expect(s.byKind).toEqual({});
  });
});
