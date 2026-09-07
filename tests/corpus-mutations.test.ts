/**
 * GARD NAD KATALOGOM STUDENTSKE NEUREDNOSTI (`scripts/corpus-gen/mutations.mts`).
 *
 * Mjeri se IZVOR (Flat ODF) prije nego ga alat spremi, jer je to jedina razina koju test moze
 * provjeriti bez LibreOfficea; ovaj gard zato vrti i u CI-ju. Da mutacija PREZIVI pretvorbu dokazuje
 * se tek nad gotovim .docx-om, kroz `detectShapes` i sidecar (`shapes.claimed`), a to je rucni korak
 * na Windowsu, isto kao Tier 2 za Word.
 *
 * Tvrdnje su namjerno dvostruke: da mutacija NESTO promijeni, i da brojac odgovara onome sto je
 * stvarno umetnuto. Brojac koji ne prati zahvat je gori od nikakvog, jer se poslije usporedjuje s
 * mjerenjem nad izlazom i tiho ga "potvrdjuje".
 */
import { describe, expect, it } from 'vitest';
import { MUTATIONS, mutationById, applyMutations, shapeForMutation } from '../scripts/corpus-gen/mutations.mts';
import { DOCX_SHAPE_IDS } from '../src/corpus/docx-shapes';
import { buildFodt } from '../scripts/corpus-gen/prose-scenario.mts';
import type { ProseBody } from '../src/corpus/prose-schema';

/** Malen ali valjan rad; svaka mutacija radi nad njim. */
function proba(): ProseBody {
  return {
    id: 'proba--final--prijediplomski',
    unitId: 'proba',
    workType: 'final',
    level: 'prijediplomski',
    program: 'Prijediplomski studij Proba',
    family: 'social',
    topic: 'Proba',
    authoring: { method: 'test fixture', tool: 'vitest', date: '2026-09-06' },
    titlePage: { author: 'Ana Anic', mentor: 'Ivan Ivic', title: 'Proba', label: 'ZAVRSNI RAD' },
    abstract: { hr: 'Sazetak.', en: 'Abstract.' },
    keywords: { hr: ['a', 'b', 'c'], en: ['a', 'b', 'c'] },
    chapters: [
      { level: 1, title: '1. Uvod', paragraphs: ['Prvi odlomak uvoda.', 'Drugi odlomak uvoda.'] },
      { level: 1, title: '2. Razrada', paragraphs: ['Prvi odlomak razrade.', 'Drugi odlomak razrade.'] },
      { level: 2, title: '2.1. Pojmovi', paragraphs: ['Odlomak o pojmovima.'] },
      { level: 1, title: '3. Zakljucak', paragraphs: ['Zakljucni odlomak.'] },
    ],
    tables: [{ n: 1, caption: 'Tablica 1. Proba', rows: [['a', 'b']], source: 'Izrada autora.' }],
    figures: [{ n: 1, caption: 'Slika 1. Proba', source: 'Izrada autora.' }],
    footnotes: ['Biljeska.'],
    bibliography: [{ text: 'Anic, A. (2019). Naslov.', doiKind: 'none' }],
  };
}

const PRAVILA = {
  font: ['Times New Roman'],
  size: [12],
  spacing: 1.5,
  margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
  justify: true,
  requireToc: true,
  requirePageNumbers: true,
};

const fodt = () => buildFodt(proba(), { titleLines: ['Sveuciliste', 'ZAVRSNI RAD'], rules: PRAVILA });

describe('graditelj: oblik dolazi iz PRAVILA, ne iz proze', () => {
  it('font, velicina, prored i poravnanje dolaze iz pravila profila', () => {
    const x = buildFodt(proba(), {
      titleLines: [],
      rules: { ...PRAVILA, font: ['Arial'], size: [11], spacing: 2, justify: false },
    });
    expect(x).toContain('style:font-name="Arial"');
    expect(x).toContain('fo:font-size="11pt"');
    expect(x).toContain('fo:line-height="200%"');
    expect(x).toContain('fo:text-align="start"');
    expect(x).not.toContain('fo:text-align="justify"');
  });

  it('format stranice i margine dolaze iz pravila', () => {
    const a4 = buildFodt(proba(), { titleLines: [], rules: PRAVILA });
    expect(a4).toContain('fo:page-width="21cm"');
    const letter = buildFodt(proba(), { titleLines: [], rules: { ...PRAVILA, paperSizes: ['Letter'] } });
    expect(letter).toContain('fo:page-width="21.59cm"');
  });

  it('sadrzaj i broj stranice se izostavljaju kad ih profil ne trazi', () => {
    const bez = buildFodt(proba(), {
      titleLines: [],
      rules: { ...PRAVILA, requireToc: false, requirePageNumbers: false },
    });
    expect(bez).not.toContain('<text:table-of-content');
    expect(bez).not.toContain('<text:page-number');
    expect(fodt()).toContain('<text:table-of-content');
    expect(fodt()).toContain('<text:page-number');
  });

  it('tekst iz proze zavrsi u dokumentu, i to escapan', () => {
    const body = proba();
    body.chapters[0].paragraphs[0] = 'Odlomak s <oznakom> i & znakom.';
    const x = buildFodt(body, { titleLines: [], rules: PRAVILA });
    expect(x).toContain('Odlomak s &lt;oznakom&gt; i &amp; znakom.');
  });
});

describe('katalog mutacija: svaka stvarno mijenja izvor', () => {
  it('svaka mutacija gadja postojeci oblik i ima obrazlozenje', () => {
    const poznati = new Set<string>(DOCX_SHAPE_IDS);
    for (const m of MUTATIONS) {
      expect(poznati.has(m.shape), `${m.id} gadja nepoznat oblik ${m.shape}`).toBe(true);
      expect(m.why.length, `${m.id} nema obrazlozenje`).toBeGreaterThan(40);
    }
    expect(new Set(MUTATIONS.map((m) => m.id)).size).toBe(MUTATIONS.length);
  });

  it.each(MUTATIONS.map((m) => m.id))('%s mijenja izvor i vraca brojac vec od nule', (id) => {
    const prije = fodt();
    const { fodt: poslije, count } = mutationById(id).apply(prije);
    expect(count, `${id}: brojac je nula, mehanizam je mrtav`).toBeGreaterThan(0);
    expect(poslije, `${id}: izvor je nepromijenjen`).not.toBe(prije);
  });

  it('tabInHeading umece tabulator IZA broja naslova, ne bilo gdje', () => {
    const { fodt: x, count } = mutationById('tabInHeading').apply(fodt());
    expect(x).toContain('>1.<text:tab/>Uvod<');
    // Cetiri, ne tri: "2.1. Pojmovi" je takodjer numeriran naslov. Prva tvrdnja je rekla tri i pala,
    // sto je bila greska tvrdnje, ne koda; podnaslovi su upravo mjesto gdje se tabulator i javlja.
    expect(count).toBe(4);
    expect(x).toContain('>2.1.<text:tab/>Pojmovi<');
  });

  it('manualToc UKLANJA zivi indeks, inace dokument ima i polje i rucni popis', () => {
    const prije = fodt();
    expect(prije).toContain('<text:table-of-content');
    const { fodt: x } = mutationById('manualToc').apply(prije);
    expect(x).not.toContain('<text:table-of-content');
    expect(x).toContain('>Sadržaj<');
    expect(x).toContain('<text:tab/>3<');
  });

  it('allLevelThree spusta SVE naslove na razinu 3, a predloske sadrzaja ne dira', () => {
    const { fodt: x } = mutationById('allLevelThree').apply(fodt());
    const naslovi = x.match(/<text:h[^>]*>/g) ?? [];
    expect(naslovi.length).toBeGreaterThan(0);
    for (const h of naslovi) expect(h).toContain('text:outline-level="3"');
    // `text:outline-level="1"` i dalje postoji, ali u PREDLOSKU stavke sadrzaja, sto nije naslov.
    // Prva tvrdnja je gledala cijeli dokument i pala na tome; mjeri se ono sto se mijenja.
    expect(x).toContain('<text:table-of-content-entry-template text:outline-level="1"');
  });

  it('emptyParagraphBurst broji UMETNUTE prazne odlomke, ne dirnute naslove', () => {
    const prije = fodt();
    const { fodt: x, count } = mutationById('emptyParagraphBurst').apply(prije);
    const praznihPrije = (prije.match(/<text:p text:style-name="Text_20_body"\/>/g) ?? []).length;
    const praznihPoslije = (x.match(/<text:p text:style-name="Text_20_body"\/>/g) ?? []).length;
    expect(praznihPoslije - praznihPrije).toBe(count);
    expect(count).toBeGreaterThan(20);
  });

  it('dotLeaderTabs upisuje tockastu vodilicu, a ne samo stil bez uporabe', () => {
    const { fodt: x, count } = mutationById('dotLeaderTabs').apply(fodt());
    expect(x).toContain('style:leader-style="dotted"');
    expect(x).toContain('text:style-name="SVodilicom"');
    expect(count).toBeGreaterThan(0);
  });

  it('biblioAsHeading dodaje numerirane zapise koje motor moze zamijeniti za naslov', () => {
    const { fodt: x } = mutationById('biblioAsHeading').apply(fodt());
    expect(x).toMatch(/8\. Lezaic A\./);
  });

  it('applyMutations lancano primjenjuje i vraca brojac po mutaciji', () => {
    const { fodt: x, counters } = applyMutations(fodt(), ['tabInHeading', 'emptyParagraphBurst']);
    expect(Object.keys(counters).sort()).toEqual(['emptyParagraphBurst', 'tabInHeading']);
    for (const [id, n] of Object.entries(counters)) expect(n, id).toBeGreaterThan(0);
    expect(x).toContain('<text:tab/>');
  });

  it('nepoznata mutacija je GRESKA, ne tiho preskakanje', () => {
    expect(() => mutationById('nepostojeca')).toThrow(/Nepoznata mutacija/);
  });

  it('preslikavanje na oblike pokriva svaku mutaciju', () => {
    const map = shapeForMutation();
    for (const m of MUTATIONS) expect(map[m.id]).toBe(m.shape);
  });
});

describe('graditelj: prikazi nose izvor i popise, jer to provjere traze', () => {
  /**
   * `element.source` broji odlomke koji POCINJU s "Izvor:" i trazi ih barem koliko ima prikaza
   * (tablice + slike). Pilot je vratio "0 oznaka Izvor/Source za 6 elemenata".
   */
  it('svaki prikaz dobiva redak koji pocinje s "Izvor:"', () => {
    const x = fodt();
    const izvori = (x.match(/>Izvor: /g) ?? []).length;
    const body = proba();
    expect(izvori).toBe(body.tables.length + body.figures.length);
  });

  it('prefiks se ne udvostrucuje kad ga proza vec nosi', () => {
    const body = proba();
    body.tables[0].source = 'Izvor: Drzavni zavod za statistiku.';
    const x = buildFodt(body, { titleLines: [], rules: PRAVILA });
    expect(x).toContain('>Izvor: Drzavni zavod za statistiku.<');
    expect(x).not.toContain('Izvor: Izvor:');
  });

  /**
   * `element.lists` trazi SEKCIJU "Popis tablica" odnosno "Popis slika" kad dokument ima prikaze.
   * To je struktura koju u stvarnom radu radi uredjivac, pa je gradi graditelj, ne proza.
   */
  it('dokument s prikazima dobiva popis tablica i popis slika', () => {
    const x = fodt();
    expect(x).toContain('>Popis tablica<');
    expect(x).toContain('>Popis slika<');
  });

  it('bez prikaza nema ni popisa, da se ne izmislja prazna sekcija', () => {
    const body = proba();
    body.tables = [];
    body.figures = [];
    const x = buildFodt(body, { titleLines: [], rules: PRAVILA });
    expect(x).not.toContain('Popis tablica');
    expect(x).not.toContain('Popis slika');
  });
});

/**
 * Sadrzaj se trazi iz DVIJE zastavice, ne jedne.
 *
 * Izmjereno 2026-09-07 na `effectus-seminarski`: profil ima `requireToc: false`, ali u
 * `requiredSections` trazi dio "sadrzaj". Da graditelj gleda samo prvu zastavicu, dokument bi ispao
 * bez sadrzaja i pao na obveznim dijelovima, a uzrok bi izgledao kao kvar motora umjesto kao propust
 * graditelja. Zastavice govore o dvjema stvarima: prva o ZIVOM POLJU, druga o postojanju DIJELA.
 */
describe('graditelj: sadrzaj kad ga trazi obvezni dio, a ne zastavica', () => {
  const bezPolja = { ...PRAVILA, requireToc: false };

  it('bez oboje nema sadrzaja', () => {
    const x = buildFodt(proba(), { titleLines: [], rules: bezPolja });
    expect(x).not.toContain('<text:table-of-content');
  });

  it('obvezni dio "sadrzaj" ga vraca i kad je zastavica polja false', () => {
    const x = buildFodt(proba(), {
      titleLines: [],
      rules: { ...bezPolja, requiredSections: [{ key: 'sadrzaj', label: 'sadržaj', terms: ['sadržaj', 'sadrzaj'] }] },
    });
    expect(x).toContain('<text:table-of-content');
  });

  it('obvezni dio koji NIJE sadrzaj ga ne vraca', () => {
    const x = buildFodt(proba(), {
      titleLines: [],
      rules: { ...bezPolja, requiredSections: [{ key: 'uvod', label: 'uvodni dio', terms: ['uvod'] }] },
    });
    expect(x).not.toContain('<text:table-of-content');
  });
});
