/**
 * FAKSIMIL: SVE U JEDNOM (ALIGNMENT Z35). Gardovi iz `tests/helpers/facsimile-live-guard.ts` (novi:
 * doslovna objasnjenja slojeva, tocke loma iz Z37) i postojeci gardovi Z33/Z34 primijenjeni na Z35
 * (pokret, lijena granica, copy, cijena, bodovi po zahvatu). Svaki ima cisti BASELINE nad stvarnim
 * datotekama i MUTACIJU koja ga obara, pa gard koji tiho prestane mjeriti ne prolazi.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyProblems, liveBoundaryProblems, motionCssProblems } from './helpers/analysis-live-guard';
import { cijenaProblems, plusBodIzvorProblems } from './helpers/result-live-guard';
import { fxTipIzPredloska, fxTipProblems, rutaFaksimilaProblems, tockeLomaProblems } from './helpers/facsimile-live-guard';
import { SIRINA_BILJESKI, SIRINA_KARTICE } from '../src/ui/facsimile-live/facsimile-live-model';

const citaj = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8').split('\r\n').join('\n');

describe('Z35 faksimil: gardovi grizu', () => {
  const css = citaj('src/ui/facsimile-live/facsimile-live.css');
  const modul = citaj('src/ui/facsimile-live/facsimile-live.ts');
  const predlozak = citaj('design/templates/facsimile-live/FacsimileLive.dc.html');
  const STOL = 'src/ui/result-live/result-live.ts';
  const MODUL = '../facsimile-live/facsimile-live';
  const KOKPIT = 'src/ui/results/results-cockpit.ts';
  const SAMOSTALNO = '../facsimile-live/samostalno';
  const izvori = {
    [STOL]: citaj(STOL),
    [KOKPIT]: citaj(KOKPIT),
    'src/ui/app.ts': citaj('src/ui/app.ts'),
  };
  const tocke = [SIRINA_BILJESKI, SIRINA_KARTICE];
  // Gard rute cita CIJELI `src/`: ulaz u Z9 moze se pojaviti u bilo kojem modulu, ne samo u poznatima.
  const svi: Record<string, string> = Object.fromEntries(
    (readdirSync(resolve(__dirname, '..', 'src'), { recursive: true }) as string[])
      .filter((f) => f.endsWith('.ts'))
      .map((f) => `src/${f.split('\\').join('/')}`)
      .map((ime) => [ime, citaj(ime)]),
  );
  const backlog = citaj('docs/agents/orchestrator-backlog.md');
  const DOKUMENT = 'src/ui/results/desk-document.ts';

  it('BASELINE: stvarni list, ulaz, kostur, objasnjenja i tocke loma su cisti', () => {
    expect(motionCssProblems(css)).toEqual([]);
    expect(liveBoundaryProblems(izvori, STOL, MODUL)).toEqual([]);
    expect(copyProblems(modul, predlozak, [])).toEqual([]);
    expect(fxTipIzPredloska(predlozak)).toHaveLength(5);
    expect(fxTipProblems(modul, predlozak)).toEqual([]);
    expect(tockeLomaProblems(css, tocke)).toEqual([]);
    expect(cijenaProblems({ 'src/ui/facsimile-live/facsimile-live.ts': modul, 'src/ui/facsimile-live/facsimile-live.css': css })).toEqual([]);
    expect(plusBodIzvorProblems({ 'src/ui/facsimile-live/facsimile-live.ts': modul })).toEqual([]);
    expect(liveBoundaryProblems(izvori, KOKPIT, SAMOSTALNO)).toEqual([]);
    expect(rutaFaksimilaProblems(svi, backlog)).toEqual([]);
    expect(Object.keys(svi).length, 'gard rute cita cijeli src/').toBeGreaterThan(300);
    expect(liveBoundaryProblems(izvori, KOKPIT, './desk-document')).toEqual([]);
  });

  it('MUTACIJA kartice: Z9 mimo rute ili prije nje obara gard rute', () => {
    const app = svi['src/ui/app.ts'];
    const ruta = "otvoriRutuFaksimila($('#resultCockpit'),closePreview,()=>setPreviewMode('faksimil'),toast)";
    expect(app).toContain(ruta);
    const s = (novi: string) => rutaFaksimilaProblems({ ...svi, 'src/ui/app.ts': novi }, backlog);
    expect(s(app.replace(ruta, "setPreviewMode('faksimil')"))).toEqual(['kartica Faksimil ne ide kroz rutu Z35', 'kartica crta Z9 mimo rute']);
    // Stari oblik prije odluke vlasnika: Z9 kad ruta odbije (rezultat bez nalaza, pregled bez teksta).
    const stari = "otvoriRutuFaksimila($('#resultCockpit'),closePreview,()=>{},toast)||setPreviewMode('faksimil')";
    expect(s(app.replace(ruta, stari))).toEqual(['ruta ne dobiva Z9 kao povratni poziv za legacy', 'kartica crta Z9 mimo rute']);
    const drugi = app.replace('function closePreview(){', "function closePreview(){setPreviewMode('faksimil');");
    expect(drugi).not.toBe(app);
    expect(s(drugi)).toEqual(['Z9 ima 1 ulaz mimo rute']);
    expect(s('bez kartice const _desk={items:')).toEqual(['kartica Faksimil nema rukovatelja']);
    const drugiUvoz = app.replace('function closePreview(){', "function closePreview(){void import('../preview/render-facsimile');");
    expect(s(drugiUvoz)).toEqual(['src/ui/app.ts: 2 uvoza renderera Z9']);
  });

  it('MUTACIJA mjesta 2 (rezultat bez nalaza): ruta pada na Z9 ili app.ts ne preda pregled', () => {
    const kokpit = svi[KOKPIT];
    const poruka = "else javi('Faksimil nije dostupan: pregled nema teksta rada.');";
    expect(kokpit).toContain(poruka);
    const s = (izmjena: Record<string, string>) => rutaFaksimilaProblems({ ...svi, ...izmjena }, backlog);
    expect(s({ [KOKPIT]: kokpit.replace(poruka, 'else staroZ9();') })).toEqual(['ruta crta Z9 izvan legacy prekidaca: else staroZ9();']);
    const legacy = "if (resultRendererFor(mount?.ownerDocument ?? document) === 'legacy') { staroZ9(); return; }";
    expect(kokpit).toContain(legacy);
    expect(s({ [KOKPIT]: kokpit.replace(legacy, '') })).toEqual(['ruta ne crta Z9 ni iza legacy']);
    const app = svi['src/ui/app.ts'];
    expect(app).toContain('const _desk={items:_deskItems,');
    expect(s({ 'src/ui/app.ts': app.replace('const _desk={items:_deskItems,', 'const _desk=_deskItems.length?{items:_deskItems,') }))
      .toEqual(['app.ts ne predaje pregled ruti Z35 kad rezultat nema nalaza']);
  });

  it('MUTACIJA mjesta 1 (stol Z8): pano koji opet montira Z9 obara gard rute', () => {
    const z9 = "const { renderFacsimile } = await import('../../preview/render-facsimile');\n";
    const mutant = svi[DOKUMENT].replace("  const { montirajStranice } = await import('../facsimile-live/stol-stranice');\n", z9);
    expect(mutant).not.toBe(svi[DOKUMENT]);
    expect(rutaFaksimilaProblems({ ...svi, [DOKUMENT]: mutant }, backlog))
      .toEqual([`${DOKUMENT}: ulaz u Z9 (render-facsimile) mimo legacy prekidaca`]);
    const kokpit = svi[KOKPIT].replace("import('./desk-document')", "import('../../preview/render-facsimile.ts')");
    expect(kokpit).not.toBe(svi[KOKPIT]);
    expect(rutaFaksimilaProblems({ ...svi, [KOKPIT]: kokpit }, backlog))
      .toEqual([`${KOKPIT}: ulaz u Z9 (render-facsimile) mimo legacy prekidaca`]);
    // Komentar koji imenuje renderer nije ulaz.
    expect(rutaFaksimilaProblems({ ...svi, [DOKUMENT]: `// import('../../preview/render-facsimile')\n${svi[DOKUMENT]}` }, backlog)).toEqual([]);
  });

  it('MUTACIJA mjesta 3 (usporedba popravka): Z9 bez F stavke u backlogu obara gard rute', () => {
    const red = backlog.split('\n').find((r) => r.startsWith('| F55 |'));
    expect(red, 'F55 zapisuje zasto usporedba ostaje na Z9').toBeDefined();
    expect(rutaFaksimilaProblems(svi, backlog.replace(red!, ''))).toEqual(['src/ui/repair-diff.ts: Z9 bez F stavke u backlogu']);
    // Usporedba bez renderera Z9 ne treba iznimku.
    const bez = svi['src/ui/repair-diff.ts'].replace("import { renderFacsimile } from '../preview/render-facsimile.ts';", '');
    expect(bez).not.toBe(svi['src/ui/repair-diff.ts']);
    expect(rutaFaksimilaProblems({ ...svi, 'src/ui/repair-diff.ts': bez }, backlog.replace(red!, ''))).toEqual([]);
  });

  it('MUTACIJA: staticki uvoz dokumenta stola u ljusku rezultata obara gard lijene granice', () => {
    const dinamicki = "import('./desk-document')";
    const src = izvori[KOKPIT];
    expect(src).toContain(dinamicki);
    const mutant = { ...izvori, [KOKPIT]: "import { montirajDokumentStola } from './desk-document';\n" + src.replaceAll(dinamicki, 'Promise.resolve({ montirajDokumentStola })') };
    expect(liveBoundaryProblems(mutant, KOKPIT, './desk-document')).toEqual([
      `${KOKPIT}: staticki uvoz ./desk-document`,
      `${KOKPIT}: nema dinamickog uvoza ./desk-document`,
    ]);
  });

  it('MUTACIJA: staticki uvoz samostalnog faksimila u ljusku rezultata obara gard lijene granice', () => {
    const dinamicki = `import('${SAMOSTALNO}')`;
    const src = izvori[KOKPIT];
    expect(src).toContain(dinamicki);
    const mutant = { ...izvori, [KOKPIT]: `import { otvoriSamostalno } from '${SAMOSTALNO}';\n` + src.replaceAll(dinamicki, 'Promise.resolve({ otvoriSamostalno })') };
    expect(liveBoundaryProblems(mutant, KOKPIT, SAMOSTALNO)).toEqual([
      `${KOKPIT}: staticki uvoz ${SAMOSTALNO}`,
      `${KOKPIT}: nema dinamickog uvoza ${SAMOSTALNO}`,
    ]);
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
