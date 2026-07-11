import { describe, it, expect } from 'vitest';
import {
  registerLint,
  registerLintSummary,
  KIND_DUGA_RECENICA,
  KIND_OD_STRANE,
  KIND_KOLOKVIJALIZAM,
  KIND_PRVO_LICE,
} from '../src/audits/register';

const kinds = (fs: { kind: string }[]) => fs.map((f) => f.kind);

describe('registerLint: duge recenice', () => {
  it('oznacava recenicu iznad praga, kratku ne', () => {
    const long = Array.from({ length: 45 }, (_, i) => `rijec${i}`).join(' ') + '.';
    const out = registerLint([long, 'Ovo je kratka recenica.']);
    const dl = out.filter((f) => f.kind === KIND_DUGA_RECENICA);
    expect(dl).toHaveLength(1);
    expect(dl[0].paragraphIndex).toBe(0);
    expect(dl[0].suggestion).toContain('45');
  });

  it('vise kratkih recenica u istom odlomku se ne oznacava', () => {
    const out = registerLint(['Prva recenica. Druga recenica. Treca kratka.']);
    expect(out.filter((f) => f.kind === KIND_DUGA_RECENICA)).toHaveLength(0);
  });
});

describe('registerLint: od strane', () => {
  it('oznacava "od strane"', () => {
    const out = registerLint(['Analiza je provedena od strane autora.']);
    expect(kinds(out)).toContain(KIND_OD_STRANE);
  });
});

describe('registerLint: kolokvijalizmi', () => {
  it('oznacava "puno" i predlaze "mnogo"', () => {
    const out = registerLint(['Ovo je puno primjera u radu.']);
    const c = out.find((f) => f.kind === KIND_KOLOKVIJALIZAM);
    expect(c).toBeTruthy();
    expect(c!.suggestion).toContain('mnogo');
  });

  it('ne oznacava podniz unutar vece rijeci (punomoc)', () => {
    const out = registerLint(['Dana je punomoc odvjetniku.']);
    expect(out.filter((f) => f.kind === KIND_KOLOKVIJALIZAM)).toHaveLength(0);
  });

  it('oznacava viseclani izraz "vezano uz"', () => {
    const out = registerLint(['Vezano uz temu, autor navodi izvore.']);
    const c = out.find((f) => f.kind === KIND_KOLOKVIJALIZAM);
    expect(c).toBeTruthy();
    expect(c!.suggestion).toContain('u vezi s');
  });
});

describe('registerLint: prvo lice (agregatno)', () => {
  it('jedan agregatni nalaz s brojem pojava', () => {
    const out = registerLint(['Smatram da je tako.', 'Napravio sam pregled izvora.']);
    const fp = out.filter((f) => f.kind === KIND_PRVO_LICE);
    expect(fp).toHaveLength(1);
    expect(fp[0].count).toBe(2);
    expect(fp[0].paragraphIndex).toBe(0);
  });

  it('bezlicni tekst nema nalaz prvog lica', () => {
    const out = registerLint(['Rad analizira izvore i donosi zakljucke.']);
    expect(out.filter((f) => f.kind === KIND_PRVO_LICE)).toHaveLength(0);
  });
});

describe('registerLintSummary', () => {
  it('broji po vrsti', () => {
    const out = registerLint(['Ovo je puno primjera od strane autora.']);
    const s = registerLintSummary(out);
    expect(s.total).toBe(out.length);
    expect(s.byKind[KIND_KOLOKVIJALIZAM]).toBe(1);
    expect(s.byKind[KIND_OD_STRANE]).toBe(1);
  });

  it('cist akademski tekst ne daje nalaze', () => {
    const out = registerLint(['Rad se bavi analizom izvora. Zakljucci proizlaze iz podataka.']);
    expect(out).toHaveLength(0);
  });
});
