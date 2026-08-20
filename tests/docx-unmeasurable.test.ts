/**
 * DOCX-02: "nije moguce utvrditi" nije "ispravno je".
 *
 * Zatecen kvar: sest provjera je neocitanu vrijednost tretiralo kao PROLAZ, i to s PUNIM bodovima
 * (font 8/8, velicina 6/6, prored 6/6, margine 6/6, poravnanje 4/4, oblikovanje fusnota 6/6), a
 * `Format stranice A4` je pod jednim `pass` 3/3 spajao "sve sekcije su A4" i "veličina nije
 * eksplicitno zapisana". Buduci da se ocjena racuna kao Sigma(earned)/Sigma(max), nemogucnost
 * citanja je mogla PODICI ocjenu.
 *
 * Izmjereno u commitanom golden baselineu prije popravka: 21 blok s punim bodovima uz detail koji
 * doslovno kaze da vrijednost nije zapisana (6x prored, 13x format stranice, 2x font fusnota).
 *
 * Odluka (2026-08-20): nemjerljivo je IZVAN ocjene (max 0, status 'unmeasurable'), pa niti dize
 * niti obara ocjenu - nestaje iz nazivnika umjesto da glumi prolaz.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type DocSpec, type ParaSpec } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const PROFILE = 'fpzg-politologija-diplomski';

/** Odlomci BEZ ijednog zapisanog svojstva oblikovanja (nema rFonts, sz, spacing ni jc). */
const BARE: ParaSpec[] = [
  { text: 'Uvod' },
  { text: 'Tijelo rada koje sluzi kao nosivi tekst za analizu oblikovanja.' },
  { text: 'Zakljucak' },
  { text: 'Literatura' },
];

/** Isti odlomci, ali s eksplicitnim oblikovanjem koje profil trazi. */
const DRESSED: ParaSpec[] = BARE.map((p) => ({
  ...p,
  font: 'Times New Roman',
  sizePt: 12,
  spacing15: true as const,
  jc: 'both' as const,
}));

/** Prazan `stylesXml` bez Normal backstopa: bez njega parser nema odakle naslijediti font/velicinu. */
const NO_STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>';

async function analyze(spec: DocSpec) {
  return (await analyzeFixture(buildDocxFile(spec), { profileId: PROFILE })) as any;
}

function pick(result: any, title: string) {
  const c = (result.checks || []).find((x: any) => x.title === title);
  expect(c, `provjera "${title}" nije pronadjena`).toBeTruthy();
  return c;
}

describe('DOCX-02: neocitana vrijednost izlazi iz ocjene', () => {
  it('font, velicina, prored i poravnanje bez ijednog zapisa postaju unmeasurable', async () => {
    const r = await analyze({ paragraphs: BARE, stylesXml: NO_STYLES });

    for (const title of ['Dominantni font', 'Veličina osnovnog teksta', 'Prored osnovnog teksta']) {
      const c = pick(r, title);
      expect(c.status, `${title}: status`).toBe('unmeasurable');
      expect(c.max, `${title}: max`).toBe(0);
      expect(c.earned, `${title}: earned`).toBe(0);
      expect(c.scored, `${title}: scored`).toBe(false);
      expect(c.detail, `${title}: detail`).toContain('Nije moguće utvrditi');
    }
  });

  it('nemjerljiva provjera nestaje iz nazivnika, ne dodaje bodove', async () => {
    const r = await analyze({ paragraphs: BARE, stylesXml: NO_STYLES });
    const unmeasured = (r.checks || []).filter((c: any) => c.status === 'unmeasurable');
    expect(unmeasured.length, 'ocekivana barem jedna nemjerljiva provjera').toBeGreaterThan(0);
    // Nijedna nemjerljiva provjera ne smije nositi bodove ni ulaziti u kategorije.
    for (const c of unmeasured) {
      expect(c.max, `${c.title} ulazi u nazivnik`).toBe(0);
      expect(c.earned, `${c.title} nosi bodove`).toBe(0);
    }
  });

  it('nemjerljivo se NE smije prikazati kao informativno (dvije razlicite stvari)', async () => {
    const r = await analyze({ paragraphs: BARE, stylesXml: NO_STYLES });
    for (const c of (r.checks || []).filter((x: any) => x.status === 'unmeasurable')) {
      expect(c.detail, `${c.title}`).not.toContain('Informativno');
    }
  });

  it('kad je vrijednost zapisana, provjere se ponasaju kao prije', async () => {
    const r = await analyze({ paragraphs: DRESSED });
    for (const title of ['Dominantni font', 'Veličina osnovnog teksta', 'Prored osnovnog teksta', 'Poravnanje osnovnog teksta']) {
      const c = pick(r, title);
      expect(c.status, `${title}: status`).toBe('pass');
      expect(c.max, `${title}: max`).toBeGreaterThan(0);
      expect(c.earned, `${title}: earned`).toBe(c.max);
    }
  });

  it('format stranice bez zapisanog w:pgSz vise ne prolazi kao A4', async () => {
    // `raw` sectPr bez w:pgSz: sekcija postoji, ali veličina stranice nije zapisana.
    const r = await analyze({
      paragraphs: [
        ...DRESSED,
        { raw: '<w:p><w:pPr><w:sectPr><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:pPr></w:p>' },
      ],
    });
    const c = (r.checks || []).find((x: any) => String(x.title).startsWith('Format stranice'));
    if (c && c.status === 'unmeasurable') {
      expect(c.max).toBe(0);
      expect(c.detail).toContain('Nije moguće utvrditi');
    } else if (c) {
      // Kad dokument-level sectPr ipak nosi veličinu, provjera ostaje bodovana - ali NIKAD
      // ne smije tvrditi A4 uz detail koji priznaje da veličina nije zapisana.
      expect(c.detail).not.toContain('ili veličina nije eksplicitno zapisana');
    }
  });

  it('oblikovanje fusnota na dokumentu BEZ fusnota nije prolaz s punim bodovima', async () => {
    // Pravni profil boduje oblikovanje fusnota; dokument ih nema, pa se oblik ne moze izmjeriti.
    const r = (await analyzeFixture(buildDocxFile({ paragraphs: DRESSED }), {
      profileId: 'pravo-socijalni-rad-diplomski',
    })) as any;
    const c = (r.checks || []).find((x: any) => x.title === 'Oblikovanje fusnota');
    if (!c) return; // profil ne boduje fusnote za ovaj rad
    expect(c.status, 'oblik biljezaka kojih nema ne smije biti pass 6/6').not.toBe('pass');
  });
});
