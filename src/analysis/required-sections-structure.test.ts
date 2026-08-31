import { describe, expect, it } from 'vitest';
import { analyzeRequiredSectionsStructure, missingRequiredSectionLabels } from './required-sections-structure';

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

  it('prepoznaje dio preko `terms`/`aliases`, ne samo preko oznake', () => {
    expect(missingRequiredSectionLabels(['Summary'], [{ key: 'summary-hr', label: 'Sažetak', terms: ['Summary'] } as never])).toEqual([]);
  });

  it('prepoznaje dio uz pregazenu oznaku iz `rules.labels`', () => {
    const rules = { labels: { 'summary-hr': 'SAŽETAK RADA' } } as never;
    expect(missingRequiredSectionLabels(['SAŽETAK RADA'], [{ key: 'summary-hr', label: 'Sažetak' } as never], rules)).toEqual([]);
  });

  it('NEGATIVNA KONTROLA: dio kojeg doista nema se prijavljuje', () => {
    expect(missingRequiredSectionLabels(['Uvod'], [{ key: 'abstract', label: 'Abstract' } as never])).toEqual(['Abstract']);
  });

  it('numeriran naslov se i ovdje priznaje kao postojeci', () => {
    expect(missingRequiredSectionLabels(['1. Abstract'], [{ key: 'abstract', label: 'Abstract' } as never])).toEqual([]);
  });
});
