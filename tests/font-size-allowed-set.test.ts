/**
 * Skup dopustenih velicina slova NIJE izmisljena ciljana vrijednost.
 *
 * Tri profila (`mef-diplomski`, `pmf-biologija-graduate`, `ptfos-diplomski`) nose `value: [11, 12]`
 * jer im izvor doslovno dopusta oboje ("velicina fonta: 11 ili 12"). Revizija bodovanih pravila je
 * to prijavljivala kao "vrijednost je SKUP, ne ciljana vrijednost", pod premisom da brojcane osi ne
 * znaju za skup, pa da je jedna od dvije vrijednosti nuzno izmisljena.
 *
 * Za velicinu slova ta premisa NE vrijedi. Engine usporedjuje clanstvo u skupu
 * (`profile.size.some(...)`) i tako i formulira poruku (`profile.size.join(' ili ')`), pa rad na
 * bilo kojoj dopustenoj velicini prolazi. Premisa vrijedi za prored (`near(x, profile.spacing)`)
 * i margine (`profile.margins[side]`), koji stvarno primaju jedan broj.
 *
 * Test postoji da ta tvrdnja ne ostane samo u obrazlozenju revizije: obje dopustene velicine moraju
 * proci s PUNIM bodovima, a nedopustena pasti. Bez ovoga bi svako suzavanje `profile.size` na jednu
 * vrijednost proslo gate, a kaznilo rad koji tocno slijedi svoju uputu.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';

const TITLE = 'Veličina osnovnog teksta';
const PROFILES = ['mef-diplomski', 'pmf-biologija-graduate', 'ptfos-diplomski'] as const;

const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);

/** Dovoljno teksta da dominantna velicina bude ocitljiva, sve u istoj velicini. */
function body(sizePt: number): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  return Array.from({ length: 12 }, () => ({ text: sentence.repeat(6), sizePt, jc: 'both' as const }));
}

async function sizeCheck(profileId: string, sizePt: number) {
  const file = buildDocxFile({ paragraphs: body(sizePt) }, `velicina-${sizePt}.docx`);
  const result: any = await analyzeFixture(file, { profileId });
  const c = check(result, TITLE);
  expect(c, `${profileId} @ ${sizePt} pt: provjera "${TITLE}" mora postojati u rezultatu`).toBeTruthy();
  return c;
}

describe('velicina slova: skup dopustenih vrijednosti je pravilo, ne izbor jedne strane', () => {
  for (const profileId of PROFILES) {
    it(`${profileId}: profil nosi OBJE dopustene velicine i bodovan je`, () => {
      const p: any = resolveProfile(profileId);
      expect(p.size, `${profileId}: skup dopustenih velicina`).toEqual([11, 12]);
      expect(p.checkSize, `${profileId}: velicina mora ostati bodovana`).not.toBe(false);
    });

    for (const pt of [11, 12]) {
      it(`${profileId}: ${pt} pt prolazi s punim bodovima`, async () => {
        const c = await sizeCheck(profileId, pt);
        expect(c.status, `${profileId} @ ${pt} pt: ${c.detail}`).toBe('pass');
        expect(c.earned, `${profileId} @ ${pt} pt: puni bodovi`).toBe(c.max);
      }, 20000);
    }

    it(`${profileId}: 13 pt je izvan skupa i pada`, async () => {
      const c = await sizeCheck(profileId, 13);
      expect(c.status, `${profileId} @ 13 pt: ${c.detail}`).toBe('fail');
      expect(c.earned, `${profileId} @ 13 pt: ne smije nositi pune bodove`).toBeLessThan(c.max);
    }, 20000);
  }
});
