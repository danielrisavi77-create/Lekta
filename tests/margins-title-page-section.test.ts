/**
 * Naslovnica kao vlastita sekcija UPOZORAVA, ne obara provjeru margina.
 *
 * Test je najprije zakljucao ZATECENO ponasanje (pad 0/6), po pravilu iz CLAUDE.md, pa je tek onda
 * ponasanje promijenjeno. Ovo su tvrdnje NAKON promjene; povijest ostaje zapisana jer objasnjava
 * zasto prag i zasto upozorenje.
 *
 * Sto je bilo izmjereno PRIJE popravka: `src/analysis/analyze-docx.ts` provjerava SVAKU zivu sekciju protiv jedne
 * profilne vrijednosti i oduzima 1,5 boda po odstupajucoj strani. Cim naslovnica ima vlastiti
 * `w:sectPr` s drugacijim marginama, sve cetiri strane odstupaju i provjera pada sa 6/6 na 0/6.
 *
 * Zasto je to vazno: tri izvora to IZRICITO dopustaju, i to doslovno u recenici iz koje je pravilo
 * i preuzeto - `grf-doktorski`, `fhs-doktorski` i `agr-doktorski` citiraju "Naslovnica ima drugacije
 * margine." Rad koji tocno slijedi svoju uputu time gubi svih 6 bodova.
 *
 * Ucinak NIJE ogranicen na te profile: mjereno je i na `efzg-specijalisticki`, koji o naslovnici ne
 * govori nista, pa je rijec o opcem ponasanju motora, ne o profilnom podatku.
 *
 * Napomena o dosegu: ucinak se javlja samo kad je naslovnica VLASTITA sekcija. Kad je rijesena preko
 * `w:titlePg` (razlicito prvo zaglavlje unutar iste sekcije), margine ostaju jedne i provjera prolazi.
 *
 * POPRAVAK: odstupanje PRVE sekcije nosi jednu odbitnicu (6 -> 5, status `warn`), ne pad. Prag
 * `TITLE_PAGE_MAX_PARAGRAPHS` postoji da se pod "naslovnicu" ne bi moglo sakriti pola rada: prva
 * sekcija dulja od praga boduje se normalno, sto pokriva zadnja tvrdnja.
 */
import { describe, expect, it } from 'vitest';
import { buildDocxFile, type DocSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const cm = (v: number) => Math.round(v * 567);

/** Naslovnica kao vlastita sekcija: ugnijezdeni `w:sectPr` u odlomku, margine 3,5 cm. */
const COVER_SECTION =
  `<w:p><w:pPr><w:sectPr>` +
  `<w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="${cm(3.5)}" w:right="${cm(3.5)}" w:bottom="${cm(3.5)}" w:left="${cm(3.5)}"/>` +
  `</w:sectPr></w:pPr><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>`;

const body = Array.from({ length: 40 }, (_, i) => ({
  text: `Tijelo rada, odlomak ${i + 1}. `.repeat(6),
}));

async function marginCheck(profileId: string, withCover: boolean) {
  const spec = {
    paragraphs: withCover ? [{ raw: COVER_SECTION }, ...body] : body,
    marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    fontName: 'Times New Roman',
    fontSizePt: 12,
    lineSpacing: 1.5,
  } as unknown as DocSpec;
  const result: any = await analyzeFixture(buildDocxFile(spec, 'naslovnica.docx'), { profileId });
  return (result.checks || []).find((c: any) => String(c.title).startsWith('Margine'));
}

describe('margine i naslovnica kao vlastita sekcija', () => {
  // Profili cija uputa IZRICITO dopusta drugacije margine naslovnice, plus jedan koji o tome sutii
  // (efzg) - da se vidi da je rijec o ponasanju motora, ne o profilnom podatku.
  const profiles = ['grf-doktorski', 'fhs-doktorski', 'agr-doktorski', 'efzg-specijalisticki'];

  it('bez zasebne naslovnice provjera prolazi', async () => {
    for (const profileId of profiles) {
      const check = await marginCheck(profileId, false);
      expect(check, profileId).toBeTruthy();
      expect(`${profileId}: ${check.status} ${check.earned}/${check.max}`).toBe(`${profileId}: pass 6/6`);
    }
  }, 120000);

  it('sa zasebnom naslovnicom UPOZORAVA umjesto da padne', async () => {
    for (const profileId of profiles) {
      const check = await marginCheck(profileId, true);
      // Prije popravka je ovdje stajalo `fail 0/6`, i to za svaki od cetiri profila.
      expect(`${profileId}: ${check.status} ${check.earned}/${check.max}`).toBe(`${profileId}: warn 5/6`);
      // Poruka mora imenovati naslovnicu, inace korisnik ne zna sto da provjeri.
      expect(String(check.detail), profileId).toContain('Naslovnica');
      expect(String(check.detail), profileId).toContain('Tijelo rada odgovara profilu');
    }
  }, 120000);

  it('duga prva sekcija se NE prolazi kao naslovnica', async () => {
    // Isti dokument, ali naslovnica nosi 12 odlomaka, dakle vise od praga. Ondje blazi tretman ne
    // smije vrijediti, inace bi se pod "naslovnicu" moglo sakriti pola rada.
    const long = Array.from({ length: 12 }, (_, i) => ({ text: `Uvodni odlomak ${i + 1}.` }));
    const spec = {
      paragraphs: [...long, { raw: COVER_SECTION }, ...body],
      marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
      fontName: 'Times New Roman',
      fontSizePt: 12,
      lineSpacing: 1.5,
    } as unknown as DocSpec;
    const result: any = await analyzeFixture(buildDocxFile(spec, 'duga-prva.docx'), {
      profileId: 'grf-doktorski',
    });
    const check = (result.checks || []).find((c: any) => String(c.title).startsWith('Margine'));
    expect(`${check.status} ${check.earned}/${check.max}`).toBe('fail 0/6');
  }, 120000);
});
