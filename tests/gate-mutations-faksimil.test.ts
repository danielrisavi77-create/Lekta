/**
 * FAKSIMIL: SVE U JEDNOM (ALIGNMENT Z35). Gardovi iz `tests/helpers/facsimile-live-guard.ts` (novi:
 * doslovna objasnjenja slojeva, tocke loma iz Z37) i postojeci gardovi Z33/Z34 primijenjeni na Z35
 * (pokret, lijena granica, copy, cijena, bodovi po zahvatu). Svaki ima cisti BASELINE nad stvarnim
 * datotekama i MUTACIJU koja ga obara, pa gard koji tiho prestane mjeriti ne prolazi.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyProblems, liveBoundaryProblems, motionCssProblems } from './helpers/analysis-live-guard';
import { cijenaProblems, plusBodIzvorProblems } from './helpers/result-live-guard';
import { fxTipIzPredloska, fxTipProblems, tockeLomaProblems } from './helpers/facsimile-live-guard';
import { SIRINA_BILJESKI, SIRINA_KARTICE } from '../src/ui/facsimile-live/facsimile-live-model';

const citaj = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8').split('\r\n').join('\n');

describe('Z35 faksimil: gardovi grizu', () => {
  const css = citaj('src/ui/facsimile-live/facsimile-live.css');
  const modul = citaj('src/ui/facsimile-live/facsimile-live.ts');
  const predlozak = citaj('design/templates/facsimile-live/FacsimileLive.dc.html');
  const STOL = 'src/ui/result-live/result-live.ts';
  const MODUL = '../facsimile-live/facsimile-live';
  const izvori = {
    [STOL]: citaj(STOL),
    'src/ui/results/results-cockpit.ts': citaj('src/ui/results/results-cockpit.ts'),
    'src/ui/app.ts': citaj('src/ui/app.ts'),
  };
  const tocke = [SIRINA_BILJESKI, SIRINA_KARTICE];

  it('BASELINE: stvarni list, ulaz, kostur, objasnjenja i tocke loma su cisti', () => {
    expect(motionCssProblems(css)).toEqual([]);
    expect(liveBoundaryProblems(izvori, STOL, MODUL)).toEqual([]);
    expect(copyProblems(modul, predlozak, [])).toEqual([]);
    expect(fxTipIzPredloska(predlozak)).toHaveLength(5);
    expect(fxTipProblems(modul, predlozak)).toEqual([]);
    expect(tockeLomaProblems(css, tocke)).toEqual([]);
    expect(cijenaProblems({ 'src/ui/facsimile-live/facsimile-live.ts': modul, 'src/ui/facsimile-live/facsimile-live.css': css })).toEqual([]);
    expect(plusBodIzvorProblems({ 'src/ui/facsimile-live/facsimile-live.ts': modul })).toEqual([]);
  });

  it('MUTACIJA: prijelaz visine na biljesci obara gard pokreta', () => {
    const mutant = css.replace('transition: opacity .25s;', 'transition: opacity .25s, top .3s;');
    expect(mutant).not.toBe(css);
    expect(motionCssProblems(mutant)).toEqual(['transition mijenja top']);
  });

  it('MUTACIJA: staticki uvoz faksimila u stol Z34 obara gard lijene granice', () => {
    const dinamicki = "import('../facsimile-live/facsimile-live')";
    const src = izvori[STOL];
    expect(src).toContain(dinamicki);
    const mutant = { ...izvori, [STOL]: "import { otvoriFaksimil } from '../facsimile-live/facsimile-live';\n" + src.replaceAll(dinamicki, 'Promise.resolve({ otvoriFaksimil })') };
    expect(liveBoundaryProblems(mutant, STOL, MODUL)).toEqual([
      `${STOL}: staticki uvoz ../facsimile-live/facsimile-live`,
      `${STOL}: nema dinamickog uvoza ../facsimile-live/facsimile-live`,
    ]);
  });

  it('MUTACIJA: preformuliran natpis gumba obara gard copyja', () => {
    const mutant = modul.replace('>Napravit ću sam</button>', '>Popravit ću sam</button>');
    expect(mutant).not.toBe(modul);
    expect(copyProblems(mutant, predlozak, [])).toEqual(['natpis "Popravit ću sam" nije u predlosku']);
  });

  it('MUTACIJA: preformulirano objasnjenje sloja obara gard FX_TIP', () => {
    const mutant = modul.replace("t: 'Duh pravilnika'", "t: 'Duh pravila'");
    expect(mutant).not.toBe(modul);
    expect(fxTipProblems(mutant, predlozak)).toEqual(['ghost: naslov "Duh pravilnika" nije doslovno u kodu']);
    const skracen = modul.replace('Klik otvara nalaz u kartici.', 'Klik otvara nalaz.');
    expect(skracen).not.toBe(modul);
    expect(fxTipProblems(skracen, predlozak)).toEqual(['notes: opis nije doslovno u kodu']);
    expect(fxTipProblems(modul, 'bez predloska')).toEqual(['predlozak nema FX_TIP']);
  });

  it('MUTACIJA: izmisljena tocka loma ili raskorak s modelom obara gard tocaka loma', () => {
    const nova = css.replace('@media (min-width: 900px)', '@media (min-width: 880px)');
    expect(nova).not.toBe(css);
    expect(tockeLomaProblems(nova, tocke)).toEqual(['tocka loma 880px nije u Z37', 'CSS nema tocku loma modela 900px']);
    expect(tockeLomaProblems(css, [SIRINA_BILJESKI, 1024])).toEqual(['CSS nema tocku loma modela 1024px']);
  });

  it('MUTACIJA: cijena iz predloska u retku plana obara gard cijene; +N obara gard bodova', () => {
    const redak = modul.replace('<span>${esc(redak)}</span>', '<span>${esc(redak)} · 14,99 €</span>');
    expect(redak).not.toBe(modul);
    expect(cijenaProblems({ 'src/ui/facsimile-live/facsimile-live.ts': redak })).toEqual(['src/ui/facsimile-live/facsimile-live.ts: znak eura']);
    const plus = modul.replace('>Uključi u plan</button>', '>Uključi u plan · +7</button>');
    expect(plus).not.toBe(modul);
    expect(plusBodIzvorProblems({ 'src/ui/facsimile-live/facsimile-live.ts': plus })).toEqual([
      'src/ui/facsimile-live/facsimile-live.ts: "+7" u tekstu',
    ]);
  });
});
