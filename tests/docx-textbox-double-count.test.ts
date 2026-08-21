/**
 * DOCX-06 (prvi mjerljivi nalaz): tekst u tekstualnom okviru brojao se DVAPUT.
 *
 * Uzrok je bio strukturan, ne rubni slucaj. `els` vraca SVE potomke, a `paragraphText` cita
 * descendant `w:t`. Odlomak unutar `w:txbxContent` zato je ulazio i u popis odlomaka i u tekst
 * SVOG NADREDJENOG odlomka (okvir je usidren unutar `w:p`). Isto za runove (`els(p,'w:r')`), pa
 * je okvirni tekst dvaput ulazio i u tezinsko racunanje dominantnog fonta i velicine.
 *
 * Izmjereno prije popravka: 10 rijeci u okviru dalo je +20 rijeci. Obicni odlomak, content
 * control, hiperveza i praceni umetak dali su tocno +10; obrisani tekst (w:delText) tocno +0.
 * Okvir je bio jedini konstrukt koji je krivo mjeren.
 *
 * Vazno je jer se naslovnice u Wordu redovito slazu u okvirima, a pogodjene su dvije BODOVANE
 * dimenzije: `Profilni opseg rijeci` i `Dominantni font`.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const PROFILE = 'fpzg-politologija-diplomski';
const FMT = { font: 'Times New Roman', sizePt: 12, spacing15: true as const, jc: 'both' as const };

const BODY: ParaSpec[] = [
  { text: 'Uvod', ...FMT },
  { text: 'Alfa beta gama delta epsilon zeta eta theta jota kapa lambda mi.', ...FMT },
  { text: 'Zakljucak', ...FMT },
];

const TEN_WORDS = 'jedan dva tri cetiri pet sest sedam osam devet deset';

/** VML okvir: w:p > w:r > w:pict > v:shape > v:textbox > w:txbxContent > w:p */
const TEXTBOX: ParaSpec = {
  raw:
    '<w:p><w:r><w:pict xmlns:v="urn:schemas-microsoft-com:vml"><v:shape><v:textbox><w:txbxContent>' +
    `<w:p><w:r><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:t xml:space="preserve">${TEN_WORDS}</w:t></w:r></w:p>` +
    '</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>',
};

const PLAIN: ParaSpec = { text: TEN_WORDS, ...FMT };

async function words(extra: ParaSpec[]): Promise<number> {
  const r: any = await analyzeFixture(buildDocxFile({ paragraphs: [...BODY, ...extra] }), { profileId: PROFILE });
  return Number(r.stats?.words);
}

describe('DOCX-06: tekst u okviru se broji jednom', () => {
  it('okvir doprinosi jednako kao obican odlomak s istim tekstom', async () => {
    const base = await words([]);
    const plain = await words([PLAIN]);
    const box = await words([TEXTBOX]);

    expect(plain - base, 'kontrola: obican odlomak mora dodati 10 rijeci').toBe(10);
    expect(box - base, 'okvir je dodao dvostruko (tekst usao i u nadredjeni odlomak)').toBe(10);
  });

  it('odlomak koji SADRZI okvir nema vlastiti tekst', async () => {
    const r: any = await analyzeFixture(buildDocxFile({ paragraphs: [...BODY, TEXTBOX] }), { profileId: PROFILE });
    const paras: Array<{ text: string }> = r.details?.paragraphs ?? r.preview?.paragraphs ?? [];
    if (!paras.length) return; // model pregleda nije izlozen u ovom rezultatu
    const carriers = paras.filter((p) => p.text.includes('jedan dva tri'));
    expect(carriers.length, 'isti tekst se pojavljuje u vise odlomaka').toBe(1);
  });

  it('font iz okvira ne preuzima dominaciju dvostrukim brojanjem', async () => {
    // Tijelo je Times New Roman; okvir nosi Arial na 10 rijeci. Dvostruko brojanje je okvirnom
    // fontu davalo dvostruku tezinu u modeWeighted.
    const r: any = await analyzeFixture(buildDocxFile({ paragraphs: [...BODY, TEXTBOX] }), { profileId: PROFILE });
    const c = (r.checks || []).find((x: any) => x.title === 'Dominantni font');
    expect(c, 'provjera fonta nije pronadjena').toBeTruthy();
    expect(String(c.detail)).toContain('Times New Roman');
  });
});

/**
 * Word od 2010. okvir pise kao `mc:AlternateContent` s DVIJE reprezentacije ISTOG teksta:
 * `mc:Choice` (DrawingML, `wps:txbx`) i `mc:Fallback` (VML, `w:pict`). Citatelj bira jednu,
 * ovisno o tome podrzava li `Requires` namespace; obje nikad nisu obje na ekranu.
 *
 * `ownsNode` rjesava SIDRENI odlomak, ali `els(doc,'w:p')` nalazi oba ugnjezdena odlomka, pa se
 * tekst i dalje brojao dvaput. Izmjereno: +20 rijeci i +3 odlomka za jedan okvir s 10 rijeci.
 * Ovo je CESCI oblik od golog `w:pict`, jer ga Word pise po zadanom.
 */
const ALT_CONTENT: ParaSpec = {
  raw:
    '<w:p><w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"' +
    ' xmlns:v="urn:schemas-microsoft-com:vml"' +
    ' xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
    '<mc:Choice Requires="wps"><w:drawing><wps:txbx><w:txbxContent>' +
    `<w:p><w:r><w:t xml:space="preserve">${TEN_WORDS}</w:t></w:r></w:p>` +
    '</w:txbxContent></wps:txbx></w:drawing></mc:Choice>' +
    '<mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent>' +
    `<w:p><w:r><w:t xml:space="preserve">${TEN_WORDS}</w:t></w:r></w:p>` +
    '</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback>' +
    '</mc:AlternateContent></w:r></w:p>',
};

describe('DOCX-06: mc:AlternateContent se broji jednom', () => {
  it('Choice i Fallback nose isti tekst, pa se broji samo jedna reprezentacija', async () => {
    const base = await words([]);
    const plain = await words([PLAIN]);
    const alt = await words([ALT_CONTENT]);

    expect(plain - base, 'kontrola').toBe(10);
    expect(alt - base, 'Fallback je brojan uz Choice').toBe(10);
  });

  it('ne stvara odlomak za obje reprezentacije', async () => {
    const bare: any = await analyzeFixture(buildDocxFile({ paragraphs: BODY }), { profileId: PROFILE });
    const withAlt: any = await analyzeFixture(buildDocxFile({ paragraphs: [...BODY, ALT_CONTENT] }), { profileId: PROFILE });
    // Sidreni odlomak + JEDNA reprezentacija = 2, ne 3.
    expect(Number(withAlt.stats?.paragraphs) - Number(bare.stats?.paragraphs)).toBe(2);
  });
});
