// @vitest-environment node
/**
 * pr-intake (skripta 1 od 3, odluka vlasnika 3. 10. 2026): `summarizePr` nad snimljenim
 * sintetickim JSON-om. Test nikad ne pokrece `gh` ni mrezu.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_REDAKA, MODEL_PREGLEDA, MODEL_PREGLEDA_ZASTICENO,
  collectPages, formatSummary, latestCheckRunsByName, summarizePr, touchedProtectedPaths,
  type PrIntakeInput,
} from '../scripts/agents/pr-intake-core.mjs';

const FIXTURE = join(__dirname, 'fixtures', 'pr-intake', 'pr-osnova.json');

function osnova(): PrIntakeInput {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as PrIntakeInput;
}

describe('summarizePr: osnovni fixture', () => {
  it('cita naslov, autora, draft, SHA, mergeable_state i zaostatak za masterom', () => {
    const s = summarizePr(osnova());
    expect(s).toMatchObject({
      broj: 901,
      autor: 'danielrisavi77-create',
      draft: false,
      headSha: 'aaaaaaaa',
      baseSha: 'bbbbbbbb',
      masterSha: 'cccccccc',
      izaMastera: true,
      izaMasteraCommita: 2,
      mergeableState: 'clean',
    });
  });

  it('grupira datoteke po prvom direktoriju i potvrduje potpun dohvat', () => {
    const s = summarizePr(osnova());
    expect(s.datoteke).toMatchObject({ broj: 4, plus: 40, minus: 6, potpune: true });
    expect(s.datoteke.poDirektoriju).toEqual([
      { dir: '.', datoteka: 1, plus: 3, minus: 4 },
      { dir: 'docs', datoteka: 1, plus: 2, minus: 0 },
      { dir: 'scripts', datoteka: 1, plus: 20, minus: 2 },
      { dir: 'tests', datoteka: 1, plus: 15, minus: 0 },
    ]);
  });

  it('tekstualni ispis ima najvise 20 redaka i nema em ni en crtica', () => {
    const retci = formatSummary(summarizePr(osnova()));
    expect(retci.length).toBeGreaterThan(5);
    expect(retci.length).toBeLessThanOrEqual(MAX_REDAKA);
    const crtice = [0x2013, 0x2014].map((k) => String.fromCharCode(k));
    expect(crtice.some((c) => retci.join('\n').includes(c))).toBe(false);
  });

  it('JSON oblik je serijalizabilan', () => {
    const s = summarizePr(osnova());
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('zasticene staze', () => {
  it('bez zasticene staze preporucuje osnovni model', () => {
    const s = summarizePr(osnova());
    expect(s.zasticeneStaze).toEqual([]);
    expect(s.modelPregleda).toBe(MODEL_PREGLEDA);
  });

  it('dira src/docx: popis i jaci model', () => {
    const ulaz = osnova();
    ulaz.files = [...ulaz.files, { filename: 'src/docx/parser.ts', additions: 0, deletions: 0 }];
    ulaz.pr.changed_files = 5;
    const s = summarizePr(ulaz);
    expect(s.zasticeneStaze).toEqual(['src/docx']);
    expect(s.modelPregleda).toBe(MODEL_PREGLEDA_ZASTICENO);
    expect(formatSummary(s).join('\n')).toContain('Zasticene staze: src/docx | model pregleda: gpt-6.1-sol');
  });

  it('usporedba je po prefiksu putanje, ne po podnizu', () => {
    const zasticene = ['src/repair', 'supabase'];
    expect(touchedProtectedPaths([{ filename: 'src/repair-old/x.ts' }], zasticene)).toEqual([]);
    expect(touchedProtectedPaths([{ filename: 'docs/supabase/x.md' }], zasticene)).toEqual([]);
    expect(touchedProtectedPaths([{ filename: 'supabase' }], zasticene)).toEqual(['supabase']);
    expect(touchedProtectedPaths([{ filename: 'supabase/functions/a.ts' }], zasticene)).toEqual(['supabase']);
  });

  it('preimenovanje iz zasticene staze se broji', () => {
    expect(
      touchedProtectedPaths([{ filename: 'lib/x.ts', previous_filename: 'src/repair/x.ts' }], ['src/repair']),
    ).toEqual(['src/repair']);
  });
});

describe('pr-opis retci', () => {
  it('prisutni i brojke se slazu', () => {
    const s = summarizePr(osnova());
    expect(s.prOpis).toEqual({
      netoPrisutan: true, netoPlus: 40, netoMinus: 6, netoSlaze: true,
      ovisnostiPrisutne: true, ovisnosti: 'nema',
    });
  });

  it('brojke se ne slazu: tolerancija 0, i za jedan redak', () => {
    const ulaz = osnova();
    ulaz.pr.body = 'Neto redaka: `+41/-6`\nNove ovisnosti: `left-pad`\r\n';
    const s = summarizePr(ulaz);
    expect(s.prOpis).toMatchObject({ netoPrisutan: true, netoPlus: 41, netoSlaze: false, ovisnosti: 'left-pad' });
    expect(formatSummary(s).join('\n')).toContain('NE SLAZE SE s PR-om +40/-6');
  });

  it('retci nedostaju', () => {
    const ulaz = osnova();
    ulaz.pr.body = null;
    const s = summarizePr(ulaz);
    expect(s.prOpis).toMatchObject({ netoPrisutan: false, netoSlaze: false, ovisnostiPrisutne: false, ovisnosti: null });
    const tekst = formatSummary(s).join('\n');
    expect(tekst).toContain('pr-opis Neto redaka: NEDOSTAJE');
    expect(tekst).toContain('pr-opis Nove ovisnosti: NEDOSTAJE');
  });
});

describe('CI: najnoviji check-run po imenu', () => {
  it('crveni check uz noviji zeleni rerun istog imena: mjerodavan je noviji', () => {
    const s = summarizePr(osnova());
    expect(s.ci).toEqual({
      ukupnoRunova: 7, najnovijihPoImenu: 5, zeleni: 3, crveni: 1, uTijeku: 1, imenaCrvenih: ['orphan'],
    });
  });

  it('najveci id pobjeduje neovisno o redoslijedu u odgovoru', () => {
    const runs = [
      { id: 9, name: 'a', status: 'completed', conclusion: 'failure' },
      { id: 3, name: 'a', status: 'completed', conclusion: 'success' },
    ];
    expect(latestCheckRunsByName(runs).map((r) => r.id)).toEqual([9]);
    expect(latestCheckRunsByName([...runs].reverse()).map((r) => r.id)).toEqual([9]);
  });
});

describe('paginacija', () => {
  it('skuplja vise od 100 datoteka kroz stranice', async () => {
    const sve = Array.from({ length: 230 }, (_, i) => ({ filename: `src/a/f${i}.ts`, additions: 1, deletions: 0 }));
    const trazene: number[] = [];
    const dohvaceno = await collectPages((page) => {
      trazene.push(page);
      return sve.slice((page - 1) * 100, page * 100);
    });
    expect(trazene).toEqual([1, 2, 3]);
    expect(dohvaceno).toHaveLength(230);

    const ulaz = osnova();
    ulaz.files = dohvaceno;
    ulaz.pr.changed_files = 230;
    ulaz.pr.additions = 230;
    ulaz.pr.deletions = 0;
    const s = summarizePr(ulaz);
    expect(s.datoteke).toMatchObject({ broj: 230, potpune: true });
  });

  it('tocno 100 na zadnjoj stranici trazi jos jednu praznu stranicu', async () => {
    const trazene: number[] = [];
    const dohvaceno = await collectPages((page) => {
      trazene.push(page);
      return page === 1 ? Array.from({ length: 100 }, (_, i) => i) : [];
    });
    expect(trazene).toEqual([1, 2]);
    expect(dohvaceno).toHaveLength(100);
  });

  it('djelomican dohvat (samo prva stranica) prijavljuje nepotpune datoteke', () => {
    const ulaz = osnova();
    ulaz.files = ulaz.files.slice(0, 2);
    const s = summarizePr(ulaz);
    expect(s.datoteke.potpune).toBe(false);
    expect(formatSummary(s).join('\n')).toContain('UPOZORENJE: dohvat nepotpun (prijavljeno 4)');
  });

  it('previse stranica rusi dohvat umjesto tihog rezanja', async () => {
    await expect(collectPages(() => Array.from({ length: 100 }, () => 0), { maxPages: 2 })).rejects.toThrow(
      /vise od 2 stranica/,
    );
  });
});

describe('pregledi i komentari', () => {
  it('broji preglede iz komentara i reviewa, zadnja runda i model, blocker i major zadnjeg', () => {
    const s = summarizePr(osnova());
    expect(s.pregledi).toEqual({ broj: 2, zadnjaRunda: 2, zadnjiModel: 'gpt-6.1-sol', blocker: 0, major: 1 });
    expect(s.zadnjiKomentar).toMatchObject({ autor: 'danielrisavi77-create', datum: '2026-10-03T08:30:00Z' });
  });

  it('model iz zagrade kad je zagrada model', () => {
    const ulaz = osnova();
    ulaz.reviews = [];
    const s = summarizePr(ulaz);
    expect(s.pregledi).toEqual({ broj: 1, zadnjaRunda: 1, zadnjiModel: 'gpt-6-sol', blocker: 1, major: 2 });
  });

  it('prvih 120 znakova zadnjeg komentara u jednom retku', () => {
    const ulaz = osnova();
    ulaz.reviews = [];
    ulaz.comments = [{ user: { login: 'danielrisavi77-create' }, created_at: '2026-10-03T10:00:00Z', body: `a\n${'x'.repeat(300)}` }];
    const s = summarizePr(ulaz);
    expect(s.zadnjiKomentar?.pocetak).toHaveLength(120);
    expect(s.zadnjiKomentar?.pocetak.startsWith('a x')).toBe(true);
  });

  it('bez komentara', () => {
    const ulaz = osnova();
    ulaz.comments = [];
    ulaz.reviews = [];
    const s = summarizePr(ulaz);
    expect(s.pregledi).toEqual({ broj: 0, zadnjaRunda: null, zadnjiModel: null, blocker: null, major: null });
    expect(s.zadnjiKomentar).toBeNull();
    const tekst = formatSummary(s).join('\n');
    expect(tekst).toContain('Pregledi drugog providera: 0');
    expect(tekst).toContain('Zadnji komentar: nema');
  });
});
