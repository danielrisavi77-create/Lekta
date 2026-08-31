import { describe, expect, it } from 'vitest';
import { analyzeRequiredSectionsStructure, isHeadingParagraph, missingRequiredSectionLabels } from './required-sections-structure';

const doc = (body: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
const p = (text: string, style = 'Heading1') => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;

describe('required sections structure', () => {
  it('prepoznaje postojeći Sažetak i predlaže Abstract', () => {
    const xml = doc(`${p('Sažetak')}<w:p><w:r><w:t>Tekst</w:t></w:r></w:p>${p('Uvod')}`);
    const result = analyzeRequiredSectionsStructure({ documentXml: xml, paragraphs: [{ index: 1, text: 'Sažetak', headingLevel: 1 }, { index: 2, text: 'Tekst' }, { index: 3, text: 'Uvod', headingLevel: 1 }], profileRequiredSections: [{ key: 'summary-hr', label: 'Sažetak' }, { key: 'abstract', label: 'Abstract' }] });
    expect(result.candidates.find((x) => x.kind === 'summary-hr')?.present).toBe(true);
    expect(result.candidates.find((x) => x.kind === 'abstract')?.present).toBe(false);
    expect(result.candidates.find((x) => x.kind === 'abstract')?.insertionAnchor).toBeDefined();
  });


  /**
   * INVARIANT KOJI JE UBIO PREDODABIR (2026-08-29).
   *
   * `confidence = present ? 'high' : 'medium'`, pa NEDOSTAJUCI dio nikad nije `high`.
   * `requiredSectionsRepairableItem` gleda iskljucivo nedostajuce dijelove, a predodabirao je uz
   * `confidence === 'high'`, sto je uvjet neispunjiv po konstrukciji: fixer je na 116 stvarnih
   * dokumenata ponudjen 49 puta i nijednom nista nije promijenio.
   *
   * Ovaj test PRIBIJA invariant, da se predodabir vise ne moze vezati uz `high`.
   */
  it('nedostajuci dio NIKAD nije high, nego medium (ili low bez sidra)', () => {
    const xml = doc(`${p('Uvod')}<w:p><w:r><w:t>Tekst</w:t></w:r></w:p>`);
    const result = analyzeRequiredSectionsStructure({
      documentXml: xml,
      paragraphs: [{ index: 1, text: 'Uvod', headingLevel: 1 }, { index: 2, text: 'Tekst' }],
      profileRequiredSections: [{ key: 'abstract', label: 'Abstract' }, { key: 'keywords-en', label: 'Keywords' }],
    });
    const missing = result.candidates.filter((candidate) => !candidate.present);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((candidate) => candidate.confidence !== 'high')).toBe(true);
    // Sidro postoji tocno kad pouzdanost NIJE `low`; na tome pociva novi uvjet predodabira.
    for (const candidate of missing) {
      expect(Boolean(candidate.insertionAnchor)).toBe(candidate.confidence !== 'low');
    }
  });


  /**
   * F3 (2026-08-31), nalaz neovisnog pregleda: popravak je umetao DUPLIKAT naslova.
   *
   * (a) Numerirani naslov `1. SAZETAK` normalizira se u `1 sazetak`, sto nije ni jednako `sazetak`
   *     ni pocinje s `sazetak `, pa je dio proglasen nedostajucim iako postoji.
   * (b) Zastita od dvosmislenosti usporedjivala je EFEKTIVNU oznaku s upozorenjem pisanim
   *     UGRADJENOM, pa kod pregazene oznake nikad nije opalila: analiza nadje dva moguca naslova,
   *     a alat svejedno predodabere umetanje treceg.
   *
   * Oboje je moglo umetnuti vidljivi tekst u studentov rad, sto je najosjetljivija granica alata.
   */
  it('numeriran naslov se prepoznaje kao POSTOJECI dio', () => {
    const xml = doc(`${p('1. SAŽETAK')}${p('Uvod')}`);
    const result = analyzeRequiredSectionsStructure({
      documentXml: xml,
      paragraphs: [{ index: 1, text: '1. SAŽETAK', headingLevel: 1 }, { index: 2, text: 'Uvod', headingLevel: 1 }],
      profileRequiredSections: [{ key: 'summary-hr', label: 'Sažetak' }],
    });
    const candidate = result.candidates.find((x) => x.kind === 'summary-hr');
    expect(candidate?.present, 'numeriran naslov je i dalje taj naslov').toBe(true);
    // Posljedica koja je i bila kvar: nedostajuci dio bi se predodabrao za umetanje.
    expect(candidate?.insertionAnchor).toBeUndefined();
  });

  it('pregazena oznaka ne smije ugasiti zastitu od dvosmislenosti', () => {
    const xml = doc(`${p('Sažetak')}${p('Sažetak 3')}${p('Uvod')}`);
    const result = analyzeRequiredSectionsStructure({
      documentXml: xml,
      paragraphs: [
        { index: 1, text: 'Sažetak', headingLevel: 1 },
        { index: 2, text: 'Sažetak 3', headingLevel: 1 },
        { index: 3, text: 'Uvod', headingLevel: 1 },
      ],
      profileRequiredSections: [{ key: 'summary-hr', label: 'Sažetak' }],
      rules: { labels: { 'summary-hr': 'SAŽETAK RADA' } } as never,
    });
    const candidate = result.candidates.find((x) => x.kind === 'summary-hr');
    expect(candidate?.confidence, 'dva moguca naslova moraju spustiti pouzdanost na low').toBe('low');
    expect(candidate?.insertionAnchor, 'bez sidra nema predodabira, pa ni umetanja duplikata').toBeUndefined();
  });

  it('ne duplicira alias Keywords', () => {
    const xml = doc(`${p('Keywords')}${p('Uvod')}`);
    const result = analyzeRequiredSectionsStructure({ documentXml: xml, paragraphs: [{ index: 1, text: 'Keywords', headingLevel: 1 }, { index: 2, text: 'Uvod', headingLevel: 1 }], profileRequiredSections: [{ key: 'keywords-en', label: 'Keywords' }] });
    expect(result.candidates[0].present).toBe(true);
    expect(result.summary.missing).toBe(0);
  });

  it('koristi verificirani tekst izjave samo kada je profil dao pravilo', () => {
    const result = analyzeRequiredSectionsStructure({ documentXml: doc(p('Uvod')), paragraphs: [{ index: 1, text: 'Uvod', headingLevel: 1 }], rules: { order: ['originality-statement'], labels: { 'originality-statement': 'Izjava' }, contentPolicy: { 'originality-statement': 'verified-statement' }, statementText: { 'originality-statement': 'Službeni tekst.' } } });
    expect(result.candidates[0].verifiedStatement).toBe('Službeni tekst.');
    expect(result.candidates[0].contentPolicy).toBe('verified-statement');
  });
});

/**
 * F8 (2026-08-31), nalaz neovisnog pregleda: generator krsenja imao je VLASTITU usporedbu
 * (doslovna jednakost cijelog odlomka), pa je os `required-section` prijavljivao prekrsaj i kad
 * dio postoji. Nabrojana su cetiri smjera razilazenja; ovdje su sva cetiri prikovana nad
 * ZAJEDNICKOM funkcijom koju od sada koriste i analiza i generator.
 */
describe('missingRequiredSectionLabels: jedan izvor istine za generator i analizu', () => {
  it('preskace dio oznacen s `required: false`', () => {
    expect(missingRequiredSectionLabels(['Uvod'], [{ key: 'abstract', label: 'Abstract', required: false } as never])).toEqual([]);
  });

  it('preskace oznaku koju analiza ne poznaje kao `kind`', () => {
    expect(missingRequiredSectionLabels(['Uvod'], [{ label: 'Zahvala' } as never])).toEqual([]);
  });

  /**
   * Prva izvedba je koristila `Summary`, sto je VEC ugradjeni alias za `summary-hr`, pa je test
   * prolazio i bez citanja `terms` (drugi krug pregleda dokazao mutacijom). Uzima se izmisljena
   * oznaka koju nijedan ugradjeni alias ne pokriva.
   */
  it('prepoznaje dio preko `terms`/`aliases`, ne samo preko oznake', () => {
    const izmisljeno = 'Uvodni pregled rada';
    // Kontrola: bez `terms` se taj naslov NE prepoznaje.
    expect(missingRequiredSectionLabels([izmisljeno], [{ key: 'summary-hr', label: 'Sažetak' } as never])).toEqual(['Sažetak']);
    expect(missingRequiredSectionLabels([izmisljeno], [{ key: 'summary-hr', label: 'Sažetak', terms: [izmisljeno] } as never])).toEqual([]);
  });

  /**
   * Prva izvedba je koristila `SAZETAK RADA`, koji zbog prefiksnog podudaranja pogadja ugradjeni
   * alias `sazetak `, pa je test prolazio i bez citanja `rules.labels`. Uzima se oznaka koju
   * nijedan ugradjeni alias ne pokriva.
   */
  it('prepoznaje dio uz pregazenu oznaku iz `rules.labels`', () => {
    const pregazeno = 'Kratki pregled';
    const rules = { labels: { 'summary-hr': pregazeno } } as never;
    // Kontrola: bez pregazene oznake se taj naslov NE prepoznaje.
    expect(missingRequiredSectionLabels([pregazeno], [{ key: 'summary-hr', label: 'Sažetak' } as never])).toEqual(['Sažetak']);
    expect(missingRequiredSectionLabels([pregazeno], [{ key: 'summary-hr', label: 'Sažetak' } as never], rules)).toEqual([]);
  });

  it('NEGATIVNA KONTROLA: dio kojeg doista nema se prijavljuje', () => {
    expect(missingRequiredSectionLabels(['Uvod'], [{ key: 'abstract', label: 'Abstract' } as never])).toEqual(['Abstract']);
  });

  it('numeriran naslov se i ovdje priznaje kao postojeci', () => {
    expect(missingRequiredSectionLabels(['1. Abstract'], [{ key: 'abstract', label: 'Abstract' } as never])).toEqual([]);
  });
});

/**
 * DRUGI KRUG PREGLEDA (2026-08-31): moja prva izvedba `withoutLeadingNumber` imala je DVA kvara,
 * oba izmjerena nad stvarnim ulazom.
 *
 * 1. `normalize` brise interpunkciju PRIJE stripa, pa su `[.]` i `[.)]` bili mrtvi:
 *    `2.1 Sazetak` -> `2 1 sazetak` -> skida se samo `2 ` -> `1 sazetak`. Viserazinska numeracija
 *    je i dalje davala DUPLIKAT naslova.
 * 2. Rimska grana bez obavezne interpunkcije gutala je obicne rijeci, pa su `Vidi prilog 3`,
 *    `Ili prilozi` i `Civil appendices` proglasavali `Prilozi` POSTOJECIM. To je obrnut i gori
 *    kvar: dio koji doista nedostaje nikad se ne bi ponudio.
 */
describe('numeracija naslova: oba smjera', () => {
  const req = [{ key: 'summary-hr', label: 'Sažetak' } as never];
  const prilozi = [{ key: 'appendices', label: 'Prilozi' } as never];

  /**
   * Svih devet oblika koje je treci krug pregleda nabrojao. `I Sazetak` i `II SAZETAK` su bili
   * REGRESIJA iz drugog kruga: zahtjev za interpunkcijom uz rimski broj slomio je standardni
   * hrvatski oblik naslova. Razlikovni kriterij je velicina slova, ne interpunkcija.
   */
  it.each([
    ['1. Sažetak'], ['2.1 Sažetak'], ['3.2.1 Sažetak'], ['2) Sažetak'],
    ['IV. Sažetak'], ['I Sažetak'], ['II SAŽETAK'],
    ['A. Sažetak'], ['C. Sažetak'], ['Poglavlje 2. Sažetak'],
  ])('numeriran naslov %s se prepoznaje kao postojeci', (heading) => {
    expect(missingRequiredSectionLabels([heading], req)).toEqual([]);
  });

  /**
   * Suprotan smjer, i ovdje je tisina opasnija: dio koji doista nedostaje nikad se ne bi ponudio.
   * `Cl.` je `Cl.` (clanak) bez dijakritike, sto je u pravnom korpusu ovog proizvoda ocekivano.
   */
  it.each([['Vidi prilog 3'], ['Ili prilozi'], ['Civil appendices'], ['Cl. prilozi'], ['Div. prilozi']])(
    'obicna recenica %s NE smije proglasiti dio postojecim',
    (line) => {
      expect(missingRequiredSectionLabels([line], prilozi)).toEqual(['Prilozi']);
    },
  );

  it('dva podudaranja su DVOJBA, ne nalaz (ista presuda kao u analizi)', () => {
    expect(missingRequiredSectionLabels(['Sažetak', 'Sažetak rada'], req)).toEqual(['Sažetak']);
  });

  /**
   * PORAZENO PONASANJE JE UGRADJENO U TEST, pa vakuumskost postaje nemoguca.
   *
   * Osam testova u ovom radu prolazilo je i s vracenom produkcijskom izmjenom, a pet ih je
   * napisano bas dok se taj razred lovio. Uzrok je uvijek isti: tvrdnja opisuje ISHOD, pa ju moze
   * zadovoljiti i kod koji do njega dolazi slucajno.
   *
   * Ovdje se stara izvedba racuna U TESTU i tvrdi se da je KRIVA. Ako je netko vrati u produkciju,
   * ove tvrdnje padaju bez ijedne rucne mutacije, i to bez diranja datoteka na disku (ugovor
   * `tests/gate-mutations.test.ts`, tocka 1).
   */
  describe('stara izvedba je ugradjena i dokazano kriva', () => {
    /** Prva izvedba: strip nad VEC normaliziranim tekstom, rimska grana bez obavezne interpunkcije. */
    const staraIzvedba = (raw: string): string =>
      raw.toLocaleLowerCase('hr-HR').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
        .replace(/^(?:[0-9]+(?:[.][0-9]+)*|[ivxlcdm]+)[.)]?\s+/i, '').trim();

    it('stara izvedba NE bi skinula viserazinsku numeraciju', () => {
      expect(staraIzvedba('2.1 Sažetak')).toBe('1 sazetak');
      expect(missingRequiredSectionLabels(['2.1 Sažetak'], req)).toEqual([]);
    });

    it('stara izvedba BI progutala obicnu rijec kao rimski broj', () => {
      expect(staraIzvedba('Ili prilozi')).toBe('prilozi');
      expect(missingRequiredSectionLabels(['Ili prilozi'], prilozi)).toEqual(['Prilozi']);
    });
  });
});

/**
 * F6 (2026-08-31, treci krug): tvrdnja "populacija je izjednacena" bila je NETOCNA na isti nacin
 * kao ranija "jedan izvor istine".
 *
 * `isHeading` je DISJUNKCIJA triju uvjeta, a dijeljena funkcija je zrcalila samo trecu granu.
 * IZMJERENO: naslov sa stilom `Heading1`, dug 127 znakova i sa zavrsnom tockom, analiza broji kao
 * naslov (`present: true`), a tekstualna heuristika ga odbija. Generator je isti dokument
 * prijavljivao kao da dio NEDOSTAJE, sto vodi u umetanje duplikata.
 */
describe('isHeadingParagraph: sve tri grane, ne samo tekstualna', () => {
  const dug = 'Sažetak ovoga rada obuhvaća pregled literature, metodologiju i glavne nalaze istraživanja provedenoga tijekom akademske godine.';

  it('BASELINE: sam tekst takvog naslova NE prolazi tekstualnu heuristiku', () => {
    expect(dug.length).toBeGreaterThan(100);
    expect(isHeadingParagraph({ text: dug })).toBe(false);
  });

  it('stil naslova ga cini naslovom', () => {
    expect(isHeadingParagraph({ text: dug, styleId: 'Heading1' })).toBe(true);
    expect(isHeadingParagraph({ text: dug, styleId: 'Naslov2' })).toBe(true);
  });

  it('razina naslova ga cini naslovom', () => {
    expect(isHeadingParagraph({ text: dug, headingLevel: 1 })).toBe(true);
  });

  it('obican stil ga ne cini naslovom', () => {
    expect(isHeadingParagraph({ text: dug, styleId: 'Normal' })).toBe(false);
  });

  /**
   * Zajednicka funkcija mora dati ISTU presudu kao analiza nad istim dokumentom; bez ove tvrdnje
   * bi se dvije strane opet mogle razici a da to nitko ne primijeti.
   */
  it('daje istu presudu kao analiza nad istim dokumentom', () => {
    const xml = doc(`${p(dug, 'Heading1')}${p('Uvod')}`);
    const result = analyzeRequiredSectionsStructure({
      documentXml: xml,
      paragraphs: [{ index: 1, text: dug, headingLevel: 1 }, { index: 2, text: 'Uvod', headingLevel: 1 }],
      profileRequiredSections: [{ key: 'summary-hr', label: 'Sažetak' }],
    });
    expect(result.candidates.find((x) => x.kind === 'summary-hr')?.present).toBe(true);
    const heading = [{ text: dug, styleId: 'Heading1' }, { text: 'Uvod' }]
      .filter((x) => isHeadingParagraph(x))
      .map((x) => x.text);
    expect(missingRequiredSectionLabels(heading, [{ key: 'summary-hr', label: 'Sažetak' } as never])).toEqual([]);
  });
});
