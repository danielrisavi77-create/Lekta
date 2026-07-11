import { describe, it, expect } from 'vitest';

import { formatCitation, parseAuthors, type CitationInput, type CitationStyle } from '../src/tools/citation';
import { parseReference, type BulkStyle } from '../src/citations/parse-reference';

/**
 * ROUND-TRIP ("generator koji uci program"): vjerni izlazni rendereri (formatCitation) su ORACLE.
 * Renderiraj poznata polja kroz stil -> parsiraj natrag istim stilom -> mora se vratiti isto.
 * Neslaganje = rupa u parseru. Ovime se pokrivenost siri automatski (svaki tip x svaki stil),
 * bez rucnog pisanja svakog slucaja, i zakljucava se protiv regresija.
 *
 * GRANICA (posteno): testira SAMO oblike koje NAS renderer emitira. Necist real-world unos
 * (Scholar/Word/Hrcak, drukciji razmaci/veznici, izgubljena dijakritika) i dalje treba stvarne
 * korpuse (vidi 'korpus' testove). Ovo je nuzan, ne dovoljan, uvjet ispravnosti.
 */

const norm = (s: string | undefined): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
const surnames = (a: string | undefined): string => parseAuthors(a || '').map((x) => norm(x.last)).join('|');

function proj(f: Partial<CitationInput>): Record<string, string> {
  return {
    aut: surnames(f.authors), god: f.year || '', nas: norm(f.title),
    cas: norm(f.container), vol: f.volume || '', broj: f.issue || '',
    str: (f.pages || '').replace(/\s/g, ''), mj: norm(f.place), izd: norm(f.publisher), inst: norm(f.institution),
  };
}

interface Seed extends Partial<CitationInput> { type: CitationInput['type']; }

const SEEDS: Seed[] = [
  { type: 'knjiga', authors: 'Milas, G.', title: 'Istrazivacke metode', year: '2009', place: 'Zagreb', publisher: 'Naklada Slap' },
  { type: 'knjiga', authors: 'Petz, B.; Kolesaric, V.; Ivanec, D.', title: 'Statistika', year: '2012', place: 'Zagreb', publisher: 'Slap' },
  { type: 'clanak', authors: 'Kardum, I.; Knezevic, J.', title: 'Osobine licnosti', container: 'Psihologijske teme', volume: '21', issue: '2', pages: '235-256', year: '2012' },
  { type: 'clanak', authors: 'Smith, J.', title: 'Deep learning', container: 'Nature', volume: '5', pages: '1-10', year: '2020' },
  { type: 'clanak', authors: 'He, K.; Zhang, X.; Ren, S.; Sun, J.', title: 'Residual learning', container: 'IEEE Trans', volume: '39', issue: '5', pages: '770-778', year: '2016' },
  { type: 'poglavlje', authors: 'Sverko, B.', title: 'Vrednote', editor: 'J. Obradovic', container: 'Psihologija', pages: '45-78', place: 'Zagreb', publisher: 'GM', year: '2004' },
  { type: 'zavrsni', authors: 'Lukic, A.', title: 'Komunikacija', institution: 'Sveuciliste u Puli', year: '2016' },
  { type: 'mrezni', authors: 'DZS', title: 'Popis', url: 'https://dzs.hr', year: '2021' },
];

const STYLE: Record<Exclude<BulkStyle, 'auto'>, CitationStyle> = {
  apa: 'autor-godina', chicago: 'fusnota', ieee: 'ieee', vancouver: 'vancouver',
};

// Koji stilovi imaju smisla za koji tip (IEEE knjiga bez navodnika je poznat slab slucaj -> preskoci).
const APPLIES: Record<string, Array<Exclude<BulkStyle, 'auto'>>> = {
  knjiga: ['apa', 'chicago', 'vancouver'],
  clanak: ['apa', 'chicago', 'ieee', 'vancouver'],
  poglavlje: ['apa', 'chicago'],
  zavrsni: ['apa', 'vancouver'],
  mrezni: ['apa'],
};

describe('round-trip: render -> parse mora vratiti ista polja', () => {
  for (const seed of SEEDS) {
    for (const style of APPLIES[seed.type]) {
      it(`[${style}] ${seed.type}: ${seed.title}`, () => {
        const rendered = formatCitation(seed, STYLE[style]).citation;
        const back = parseReference(rendered, style).fields;
        const a = proj(seed), b = proj(back);
        // usporedi samo polja koja je seed imao (parser ne izmislja prazna)
        for (const k of Object.keys(a)) {
          if (a[k]) expect(`${k}=${b[k]} (render: ${rendered})`).toBe(`${k}=${a[k]} (render: ${rendered})`);
        }
      });
    }
  }
});
