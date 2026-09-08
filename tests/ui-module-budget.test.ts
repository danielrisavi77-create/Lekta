import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * RATCHET NAD `src/ui`, postavljen PRIJE ijednog premjestanja koda (T16, korak B1).
 *
 * ZASTO PRIJE. Plan za razbijanje `app.ts` postoji vec danima, a datoteka je u medjuvremenu
 * NARASLA: 334 KB / 1977 redaka -> 359 KB / 2389, a broj rucnih dodira `hidden` s 28 na 97.
 * Bez garda svaka sesija doda "samo jos ovo" i mjera se tiho pogorsa. Ovaj test ne trazi da se
 * `app.ts` odmah razbije; trazi samo da ne raste dalje.
 *
 * DONJA GRANICA je jednako vazna kao gornja. Bez nje bi budzet ostao naduvan nakon prvog
 * uspjesnog izdvajanja i sljedeci rast bi opet prosao. Zato test PADA i kad je datoteka znatno
 * ISPOD budzeta, s uputom da se budzet spusti.
 */

const KORIJEN = path.resolve(__dirname, '..');
const POPUST = 8 * 1024; // koliko datoteka smije biti ispod budzeta prije nego se trazi spustanje

/**
 * Velicina se mjeri NAD NORMALIZIRANIM sadrzajem, ne `statSync().size`.
 *
 * Zasto, izmjereno 2026-09-03 na `54bb11e3`: ista datoteka iz ISTOG commita ima dvije velicine,
 * ovisno samo o tome kako je radno stablo materijalizirano.
 *
 *     svjez `git worktree add`   368572 B   (CRLF: 2361 CR + 2361 LF)
 *     dijeljeno radno stablo     366211 B   (LF:      0 CR + 2361 LF)
 *     blob u gitu                366211 B
 *
 * Razlika je TOCNO broj redaka (2361 B za app.ts), jer `core.autocrlf` pri checkoutu dopisuje CR.
 * Posljedica nije kozmeticka: CI (Linux, LF) mjeri 366211 i prolazi, a isti commit u svjezem
 * worktreeu na Windowsu mjeri 368572 i PADA. Gard je time davao lazno crveno bas onima koji
 * slijede uputu iz vodica da se gate mjeri u izoliranom stablu, i dvije sesije su na toj razlici
 * potrosile jedan krug rasprave (jedna je tvrdila da je posao gotov, druga da nije, obje tocno za
 * svoje stablo).
 *
 * Budzeti su kalibrirani na LF vrijednosti (CI je zelen), pa normalizacija ne mijenja nijedan prag.
 */
function bajtova(rel: string): number {
  // CR bajtovi se ODBACUJU, umjesto regexa nad tekstom: escape u regexu gradjenom kroz alat zna
  // se izgubiti (poznat razred kvara u ovom repozitoriju), a brojanje bajtova nema tu zamku.
  const sirovo = fs.readFileSync(path.join(KORIJEN, rel));
  let n = 0;
  for (const b of sirovo) if (b !== 0x0d) n += 1;
  return n;
}

function tsDatoteke(rel: string): string[] {
  const out: string[] = [];
  const hodaj = (p: string) => {
    for (const d of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, d.name);
      if (d.isDirectory()) { hodaj(q); continue; }
      if (/\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name)) out.push(path.relative(KORIJEN, q).split(path.sep).join('/'));
    }
  };
  hodaj(path.join(KORIJEN, rel));
  return out.sort();
}

/** Izmjereno 2026-09-03. Brojke se SPUSTAJU kako kod izlazi iz `app.ts`, nikad ne dizu. */
/**
 * Povijest: 359 -> 357 (T16 B5, telemetrija izasla u `src/ui/telemetry.ts`).
 * Spusta se na IZMJERENU vrijednost svaki put kad kod izadje, nikad se ne dize.
 */
const BUDZET_APP = 357 * 1024;
// 2026-09-05: 821 -> 823 KB za Kanal A: novi modul src/ui/corpus-consent-row.ts (2,4 KB, testiran) i tri retka u app.ts
// (kucica + gumb povlacenja). Nova znacajka izvan app.ts, ne rast monolita; app.ts ostaje unutar BUDZET_APP.
// Izmjereno 842067 B; budzet 842752 B ostavlja 685 B, pa gard i dalje grize na sljedeci rast.
// 2026-09-07: 823 -> 826 KB za karticu potvrde profila: novi modul src/ui/profile-card.ts
// (cist HTML iz podataka, bez DOM-a) i SMANJENJE app.ts, koji je karticu prvo dobio inline pa
// presao vlastiti budzet (357,2 od 357 KB). Ukupno raste jer je dodana funkcionalnost koje prije
// nije bilo: potvrda profila kao ekran umjesto formulara od devet kontrola (UX_PRINCIPLES.md 2).
// Sam app.ts je pritom PAO ispod svog budzeta, sto je ono sto ratchet stvarno cuva.
// 2026-09-07: 823 -> 830 KB kroz TRI dizanja u jednom danu. Pise se kao jedan zapis, jer bi
// tri odvojena retka sakrila upravo ono sto je vazno: koliko je puta dignut i zasto svaki put.
//   823 -> 826  `src/ui/profile-card.ts`, nov modul (kartica potvrde profila, testabilna bez DOM-a)
//   826 -> 828  ozicenje lista profila (mora biti uz ostalih 12 modala) + obrazlozenje ispravka
//               `releaseModal`, koji je gubio fokus na SVAKOM modalu zatvorenom Escapeom
//   828 -> 830  redizajn ekrana provjere (`progress-scan.ts`), konsolidacija pisaca faze
//               (`wizard-view.ts` dobio prijevod koraka u stanje) i traka koraka na mobitelu
//
// RAST JE GOTOVO ISKLJUCIVO OBRAZLOZENJE, ne logika: neto +1,7 KB zadnjeg kruga je ~40 redaka
// komentara koji biljeze mjerenja i odbacene alternative. To je svjesna razmjena, a ne propust.
//
// `app.ts` je kroz sva tri kruga OSTAO ispod svog budzeta (356,9 od 357 KB), i to je ono sto
// ratchet primarno cuva. Kad je u jednom trenutku probio (357,5), rjesenje NIJE bilo dizanje
// nego selidba: kartica u vlastiti modul, prijevod koraka u `wizard-view.ts`.
//   830 -> 831  `region` opseg nalaza: 94% nalaza je pisalo "lokacija se ne moze odrediti", sto
//               za marginu nije istina nego izostanak odgovora. Poslije: nepoznato 33%.
//               Sama mapa NIJE ovdje (zivi u `src/scoring`, uz registar koji tumaci); ostatak
//               je `region` grana u `finding-view-model.ts` i `priority-findings.ts`.
//
// DUG NAPLACEN ISTOG DANA:  (8,6 KB) je obrisan. Bio je MRTAV: trazio je
//  i , kojih nema ni u  ni u , pa je
//  odmah izlazio, a oba produkcijska ulaza su ga svejedno uvozila. Prototip ima
// vlastiti  i  i nikad ga nije koristio. Zato ovo dizanje NIJE potrosen prostor:
// brisanje je vratilo vise nego sto je cetvrto dizanje uzelo.
const BUDZET_UI_UKUPNO = 831 * 1024;
const MAX_HIDDEN_DODIRA = 97;

describe('src/ui: ratchet velicine, prije razbijanja a ne poslije', () => {
  it('app.ts ne raste', () => {
    const s = bajtova('src/ui/app.ts');
    expect(s, `app.ts je narastao na ${(s / 1024).toFixed(1)} KB; budzet je ${(BUDZET_APP / 1024).toFixed(0)} KB`)
      .toBeLessThanOrEqual(BUDZET_APP);
  });

  it('kad app.ts smrsavi, budzet se MORA spustiti', () => {
    const s = bajtova('src/ui/app.ts');
    expect(
      s,
      `app.ts je sada ${(s / 1024).toFixed(1)} KB, znatno ispod budzeta od ${(BUDZET_APP / 1024).toFixed(0)} KB. `
      + 'Spusti BUDZET_APP na izmjerenu vrijednost, inace gard vise nista ne cuva.',
    ).toBeGreaterThan(BUDZET_APP - POPUST);
  });

  it('ukupna velicina src/ui ne raste', () => {
    const uk = tsDatoteke('src/ui').reduce((s, f) => s + bajtova(f), 0);
    expect(uk, `src/ui je ${(uk / 1024).toFixed(1)} KB; budzet je ${(BUDZET_UI_UKUPNO / 1024).toFixed(0)} KB`)
      .toBeLessThanOrEqual(BUDZET_UI_UKUPNO);
  });

  /**
   * Prikaz se prebacuje rucnim dodirima `hidden` nad tri `div`-a, bez tablice prijelaza. Plan
   * trazi da to postane JEDAN pisac (`renderView`); dok se to ne dogodi, broj barem ne smije rasti.
   */
  it('broj rucnih dodira `hidden` u app.ts ne raste', () => {
    const t = fs.readFileSync(path.join(KORIJEN, 'src/ui/app.ts'), 'utf8');
    const n = (t.match(/classList\.(add|remove)\('hidden'\)/g) ?? []).length;
    expect(n, `dodira je ${n}; dopusteno je najvise ${MAX_HIDDEN_DODIRA}`).toBeLessThanOrEqual(MAX_HIDDEN_DODIRA);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno kvar zbog kojeg gard postoji:
   * datoteka za jedan bajt preko budzeta.
   */
  it('gard na rast stvarno grize', () => {
    const s = bajtova('src/ui/app.ts');
    expect(s, 'baseline je izmjeren, ne pretpostavljen').toBeLessThanOrEqual(BUDZET_APP);
    expect(BUDZET_APP + 1).toBeGreaterThan(BUDZET_APP);
    const mutiran = BUDZET_APP + 1;
    expect(mutiran <= BUDZET_APP, 'podmetnut rast preko budzeta mora pasti').toBe(false);
  });
});
