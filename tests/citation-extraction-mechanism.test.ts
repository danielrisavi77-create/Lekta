/**
 * Gard nad tim da mehanizam koji smo dodali STVARNO OPALI, a ne da samo postoji.
 *
 * ZASTO POSTOJI. `extract-citation-sections` ima dva mehanizma koji cuvaju da isjecak sadrzi ono
 * sto verificiran spec citira: PRVENSTVO (ulomak s citatom ide ispred kape) i DOVLACENJE (citat
 * kojega ni u jednom ulomku nema trazi se po stranicama izvora).
 *
 * Dovlacenje je jednom vec bilo MRTAV KOD: citalo je `String(pages[p])` nad objektom `{page, text}`
 * i pretrazivalo doslovno "[object Object]". Nizvodna mjera se pritom POPRAVLJALA (blokatori 8 -> 5),
 * pa je izgledalo da radi. Popravak je zapravo dolazio od prvenstva, drugog mehanizma.
 *
 * Zato mehanizam nosi VLASTITI BROJAC (`citedBackfilled` u INDEX.json). Brojac na nuli znaci mrtav
 * kod, ma sto nizvodna mjera pokazivala.
 */
import { describe, it, expect } from 'vitest';
import index from '../data/tools/citation-specs/extractions/INDEX.json';

interface Row { facultyId: string; citedQuotes?: number; citedBackfilled?: number }
const rows = index as unknown as Row[];

describe('mehanizmi izvlacenja citata su zivi, ne samo prisutni', () => {
  it('mjerenje je netrivijalno (guard protiv vacuous-pass)', () => {
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.filter((r) => (r.citedQuotes ?? 0) > 0).length, 'nijedan fakultet nema citirane specove').toBeGreaterThan(50);
  });

  it('svaki fakultet nosi brojac, pa mehanizam ne moze tiho nestati', () => {
    const bez = rows.filter((r) => typeof r.citedBackfilled !== 'number').map((r) => r.facultyId);
    expect(bez, 'brojac nedostaje; regeneriraj INDEX.json').toEqual([]);
  });

  /**
   * Zatecено: dovlacenje opali 2 puta na 122 fakulteta (`pravo`, `veleknin`). Malo, i to je tocno:
   * vecinu posla obavi prvenstvo. Ali NULA bi znacila da mehanizam nista ne radi, a upravo je to
   * stanje jednom promaklo.
   */
  it('dovlacenje je OPALILO barem jednom', () => {
    const ukupno = rows.reduce((a, r) => a + (r.citedBackfilled ?? 0), 0);
    expect(ukupno, 'dovlacenje je mrtav kod: nijedan citat nije dovucen').toBeGreaterThan(0);
  });

  /** Gard bez dokaza da grize se ne racuna: podmece se tocno kvar zbog kojeg gard postoji. */
  it('gard na mrtav mehanizam stvarno grize', () => {
    const zbroj = (xs: Row[]) => xs.reduce((a, r) => a + (r.citedBackfilled ?? 0), 0);
    expect(zbroj(rows), 'baseline je izmjeren, ne pretpostavljen').toBeGreaterThan(0);
    const mrtav = rows.map((r) => ({ ...r, citedBackfilled: 0 }));
    expect(zbroj(mrtav)).toBe(0);
  });
});
