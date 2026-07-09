import { describe, it, expect } from 'vitest';

import {
  authorsFromOptions, renderTemplate, validateCitationSpec, formatFromSpec,
  type CitationSpec, type AuthorFormatOptions,
} from '../src/citations/citation-spec';
import { parseAuthors } from '../src/tools/citation';

const A1 = parseAuthors('Ivic, Ivan');
const A2 = parseAuthors('Ivic, Ivan; Horvat, Ana');
const A3 = parseAuthors('Ivic, Ivan; Horvat, Ana; Kovac, Marko');
const A7 = parseAuthors('A, Ana; B, Bo; C, Cvi; D, Dan; E, Eva; F, Fil; G, Goran');

describe('authorsFromOptions reproducira sva 4 postojeca ponasanja', () => {
  it('autor-godina (APA-slicno): "Ivic, I., & Horvat, A."', () => {
    const o: AuthorFormatOptions = { order: 'family-first', initials: 'dotted-spaced', separator: ', ', finalJoiner: ', & ' };
    expect(authorsFromOptions(A1, o)).toBe('Ivic, I.');
    expect(authorsFromOptions(A2, o)).toBe('Ivic, I., & Horvat, A.');
    expect(authorsFromOptions(A3, o)).toBe('Ivic, I., Horvat, A., & Kovac, M.');
  });

  it('fusnota (Chicago-slicno): prvi obrnut PUNIM imenom, ostali prirodno, "i"', () => {
    const o: AuthorFormatOptions = { order: 'family-first', firstAuthorOnlyInverted: true, initials: 'none', separator: ', ', finalJoiner: ' i ' };
    expect(authorsFromOptions(A1, o)).toBe('Ivic, Ivan');
    expect(authorsFromOptions(A3, o)).toBe('Ivic, Ivan, Ana Horvat i Marko Kovac');
  });

  it('IEEE: inicijali ispred, "and"', () => {
    const o: AuthorFormatOptions = { order: 'given-first', initials: 'dotted-spaced', separator: ', ', finalJoiner: ' and ' };
    expect(authorsFromOptions(A2, o)).toBe('I. Ivic and A. Horvat');
    expect(authorsFromOptions(A3, o)).toBe('I. Ivic, A. Horvat and M. Kovac');
  });

  it('Vancouver: "Prezime AA", 7+ -> et al.', () => {
    const o: AuthorFormatOptions = { order: 'family-first', initials: 'plain-compact', separator: ', ', finalJoiner: null, etAlAfter: 6, etAlText: 'et al.' };
    expect(authorsFromOptions(A2, o)).toBe('Ivic I, Horvat A');
    expect(authorsFromOptions(A7, o)).toBe('A A, B B, C C, D D, E E, F F, et al.');
  });

  it('institucija ostaje doslovna u svim varijantama', () => {
    const org = parseAuthors('Državni zavod za statistiku');
    for (const initialsMode of ['dotted-spaced', 'none', 'plain-compact'] as const) {
      const o: AuthorFormatOptions = { order: 'family-first', initials: initialsMode, separator: ', ' };
      expect(authorsFromOptions(org, o)).toBe('Državni zavod za statistiku');
    }
  });
});

describe('renderTemplate', () => {
  it('zamjenjuje placeholdere i drop-a [[...]] kad su svi prazni', () => {
    const v = { title: 'Naslov', volume: '', issue: '', pages: '' };
    expect(renderTemplate('{title}[[, {volume}]][[({issue})]][[: {pages}]].', v)).toBe('Naslov.');
  });

  it('zadrzava [[...]] kad je BAR JEDAN placeholder popunjen', () => {
    const v = { title: 'Naslov', volume: '5', issue: '' };
    expect(renderTemplate('{title}[[, {volume}({issue})]].', v)).toBe('Naslov, 5().');
    // () pociste tidy() u formatFromSpec, ne renderTemplate
  });

  it('jednostruke uglate ostaju literal (IEEE [1], Vancouver [Internet])', () => {
    expect(renderTemplate('{title} [Internet]', { title: 'T' })).toBe('T [Internet]');
  });
});

const SYNTHETIC: CitationSpec = {
  facultyId: 'testfak',
  styleToken: 'test-token',
  status: 'draft',
  outcome: 'custom-spec',
  label: 'Test stil',
  sourceId: 'test-izvor',
  sourceLabel: 'Testne upute',
  verifiedAt: null,
  verifiedBy: null,
  verifiedHash: null,
  authorFormat: { order: 'family-first', initials: 'dotted-spaced', separator: ', ', finalJoiner: ' i ' },
  inText: {
    mode: 'author-year',
    template: '({authorsShort} {year})', // BEZ zareza — (Lovric 1988) oblik
    withPagesTemplate: '({authorsShort} {year}: {pages})',
    authorsShort: { twoJoiner: ' i ', etAlAfter: 3, etAlText: 'i sur.' },
  },
  numbering: null,
  bibliography: { sort: 'alphabetical' },
  sourceTypes: [
    { type: 'knjiga', template: '{authors} ({year}) {title}. {place}: {publisher}.', provenance: { kind: 'worked-example', quoteRaw: 'x', sourcePage: 'str. 1' } },
    { type: 'poglavlje', template: '{authors} ({year}) {title}[[, u: {editor} (ur.), {container}]].[[ {place}: {publisher}.]]', provenance: { kind: 'rule-text', quoteRaw: 'x', sourcePage: 'str. 1' } },
    { type: 'clanak', template: '{authors} ({year}) {title}. {container}[[, {volume}]][[({issue})]][[: {pages}]].[[ {doiUrl}]]', provenance: { kind: 'worked-example', quoteRaw: 'x', sourcePage: 'str. 2' } },
    { type: 'mrezni', template: '{authors} ({year}) {title}.[[ {link}]][[ (pristupljeno {accessed})]]', provenance: { kind: 'worked-example', quoteRaw: 'x', sourcePage: 'str. 2' } },
    { type: 'zavrsni', template: '{authors} ({year}) {title}. Zavrsni rad. {institution}.', provenance: { kind: 'derived', quoteRaw: 'x', sourcePage: null, note: 'izvedeno' } },
    { type: 'propis', template: '{title}[[, {container}]][[, {issue}]].', provenance: { kind: 'derived', quoteRaw: 'x', sourcePage: null, note: 'izvedeno' } },
  ],
};

describe('formatFromSpec (sinteticki spec)', () => {
  it('knjiga po templateu, s tidy cleanupom', () => {
    const r = formatFromSpec(SYNTHETIC, { type: 'knjiga', authors: 'Ivic, Ivan', title: 'Ustavno pravo', year: '2020', place: 'Zagreb', publisher: 'NN' });
    expect(r.citation).toBe('Ivic, I. (2020) Ustavno pravo. Zagreb: NN.');
  });

  it('clanak: opcionalne grupe rade s djelomicnim poljima', () => {
    const full = formatFromSpec(SYNTHETIC, { type: 'clanak', authors: 'Kovac, Marko', title: 'Rad', container: 'Casopis', volume: '5', issue: '2', year: '2021', pages: '10-20' });
    expect(full.citation).toBe('Kovac, M. (2021) Rad. Casopis, 5(2): 10-20.');
    const partial = formatFromSpec(SYNTHETIC, { type: 'clanak', authors: 'Kovac, Marko', title: 'Rad', container: 'Casopis', year: '2021' });
    expect(partial.citation).toBe('Kovac, M. (2021) Rad. Casopis.');
  });

  it('in-text: bez zareza izmedju autora i godine, s pages varijantom', () => {
    const r = formatFromSpec(SYNTHETIC, { type: 'knjiga', authors: 'Lovric, Ivo', year: '1988' });
    expect(r.inText).toBe('(Lovric 1988)');
    const rp = formatFromSpec(SYNTHETIC, { type: 'knjiga', authors: 'Lovric, Ivo', year: '1988', pages: '45' });
    expect(rp.inText).toBe('(Lovric 1988: 45)');
  });

  it('bez godine uz autora -> "bez dat." u in-textu', () => {
    const r = formatFromSpec(SYNTHETIC, { type: 'knjiga', authors: 'Ivic, Ivan' });
    expect(r.inText).toBe('(Ivic bez dat.)');
  });

  it('missing polja iz RECOMMENDED fallbacka', () => {
    const r = formatFromSpec(SYNTHETIC, { type: 'knjiga', title: 'Samo naslov' });
    expect(r.missing).toContain('autor');
    expect(r.missing).toContain('godina');
  });
});

describe('validateCitationSpec', () => {
  it('sinteticki spec je valjan (draft)', () => {
    expect(validateCitationSpec(SYNTHETIC)).toEqual([]);
  });

  it('hvata nepoznat placeholder, tip koji fali, derived bez note, verified bez hasha', () => {
    const bad = JSON.parse(JSON.stringify(SYNTHETIC)) as CitationSpec;
    bad.sourceTypes[0].template = '{autor} {naslov}';
    bad.sourceTypes = bad.sourceTypes.filter((t) => t.type !== 'propis');
    bad.sourceTypes[4].provenance.note = undefined as unknown as string;
    bad.status = 'verified';
    const errs = validateCitationSpec(bad);
    expect(errs.some((e) => e.includes('nepoznat placeholder {autor}'))).toBe(true);
    expect(errs.some((e) => e.includes('ne pokriva "propis"'))).toBe(true);
    expect(errs.some((e) => e.includes('derived bez note'))).toBe(true);
    expect(errs.some((e) => e.includes('verified bez verifiedHash'))).toBe(true);
  });

  it('style-pin ne trazi sourceTypes', () => {
    const pin: CitationSpec = {
      ...SYNTHETIC, outcome: 'style-pin', styleToken: 'apa7', sourceTypes: [],
      authorFormat: SYNTHETIC.authorFormat, inText: { mode: 'author-year' },
    };
    expect(validateCitationSpec(pin)).toEqual([]);
  });
});
