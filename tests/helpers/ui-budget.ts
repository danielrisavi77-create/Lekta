import fs from 'node:fs';
import path from 'node:path';

/**
 * MJERENJE I PRESUDA ratcheta nad `src/ui`, izdvojeni iz `tests/ui-module-budget.test.ts`
 * 2026-09-13 da ih moze zvati i mutacija u `tests/gate-mutations.test.ts`.
 *
 * Razlog za izdvajanje, a ne za prepisivanje: mutacija koja ima VLASTITU kopiju pravila ne mjeri
 * gard nego samu sebe. Gard i njegova mutacija moraju dijeliti tocno jedan izvor istine.
 *
 * Uvoz same `.test.ts` datoteke NIJE bio opcija: vitest bi njezine `describe` blokove registrirao i
 * u datoteci koja je uvozi, pa bi se isti testovi vrtjeli dvaput.
 */

export const KORIJEN = process.cwd();

/** Koliko datoteka smije biti ISPOD budzeta prije nego ratchet trazi spustanje. */
export const POPUST = 8 * 1024;

/**
 * Velicina se mjeri NAD NORMALIZIRANIM sadrzajem, ne `statSync().size`.
 *
 * Zasto, izmjereno 2026-09-03 na `54bb11e3`: ista datoteka iz ISTOG commita ima dvije velicine,
 * ovisno samo o tome kako je radno stablo materijalizirano (CRLF u svjezem `git worktree add`,
 * LF u dijeljenom stablu i u blobu). Razlika je TOCNO broj redaka, pa bi gard nad sirovim bajtovima
 * mjerio KONFIGURACIJU GITA, ne sadrzaj repozitorija.
 *
 * CR bajtovi se ODBACUJU brojanjem, ne regexom nad tekstom: escape u regexu gradjenom kroz alat zna
 * se izgubiti (poznat razred kvara u ovom repozitoriju), a brojanje bajtova nema tu zamku.
 */
export function bajtova(rel: string): number {
  const sirovo = fs.readFileSync(path.join(KORIJEN, rel));
  let n = 0;
  for (const b of sirovo) if (b !== 0x0d) n += 1;
  return n;
}

/** Sve `.ts`/`.tsx` datoteke pod `rel`, bez testova, kao repo-relativne staze s `/`. */
export function tsDatoteke(rel: string): string[] {
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

/**
 * Presuda ratcheta nad jednom izmjerenom velicinom. Prazan niz znaci "uredu".
 *
 * DVIJE GRANE, i donja je jednako vazna kao gornja: bez nje bi budzet ostao naduvan nakon prvog
 * uspjesnog izdvajanja i sljedeci rast bi opet prosao neprimijeceno.
 */
export function presudaRatcheta(velicina: number, budzet: number): string[] {
  const out: string[] = [];
  if (velicina > budzet) out.push('preko-budzeta');
  if (velicina <= budzet - POPUST) out.push('budzet-naduvan');
  return out;
}

/**
 * PRAGOVI ZIVE OVDJE, uz `presudaRatcheta`, a ne u testu koji ih troši.
 *
 * Razlog je izmjeren 2026-09-13: mutacija `ui-budzet/rast-i-naduvan-budzet` je prvo vjezbala
 * presudu nad IZMISLJENIM budzetima, pa je ostajala zelena i kad se `BUDZET_APP` naduva na
 * `999 * 1024`, dakle na tocno onaj kvar koji imenuje. Mutacija koja ima vlastitu kopiju broja
 * ne mjeri gard nego samu sebe. Izvoz je zato jedan, i mutacija i gard citaju isti.
 */
/** Izmjereno 2026-09-03. Brojke se SPUSTAJU kako kod izlazi iz `app.ts`, nikad ne dizu. */
/**
 * Povijest: 359 -> 357 (T16 B5, telemetrija izasla u `src/ui/telemetry.ts`).
 * Spusta se na IZMJERENU vrijednost svaki put kad kod izadje, nikad se ne dize.
 */
// 2026-09-13 (zadatak B): 357 -> 347 KB. Tri javna demo izvjestaja (`DEMO_VARIANTS`, `demoResult`,
// `demoResultFpzg/Pravo/Seminar`, `demoAssemble`) izasla su u `src/demo/sample-results.ts`, dakle
// IZVAN `src/ui`. Selidba unutar `src/ui` ne bi oslobodila nista: donji budzet broji SVE .ts
// datoteke tog stabla, pa bi nova datoteka samo dodala zaglavlje uvoza.
// Izmjereno: app.ts 365332 -> 353286 B (-12046; 11 B od toga je uvoz `makeCheck`, koji je selidbom
// ostao neiskoristen). Budzet 355328 B ostavlja 2042 B zraka, pa gard grize na sljedeci rast, a
// jos je 6150 B IZNAD donje granice (355328 - 8192), pa ne trazi odmah novo spustanje.
export const BUDZET_APP = 347 * 1024;
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
// DUG NAPLACEN ISTOG DANA: `src/ui/hero-demo.ts` (8,6 KB) je obrisan. Bio je MRTAV: trazio je
// `.hero-demo` i `#heroReplay`, kojih nema ni u `index.html` ni u `rad/index.html`, pa je
// odmah izlazio, a oba produkcijska ulaza su ga svejedno uvozila. Prototip ima vlastiti
// `analyzer-hero-demo.ts` i `.css` i nikad ga nije koristio. Zato ono dizanje NIJE potrosen
// prostor: brisanje je vratilo vise nego sto je cetvrto dizanje uzelo.
//
// (Taj je zapis 2026-09-07 bio OSTECEN: svi nazivi u kosim navodnicima su nestali, pa je recenica
// glasila "DUG NAPLACEN ISTOG DANA:  (8,6 KB) je obrisan". Uzrok je poznat razred iz ovog
// repozitorija: backtick unutar template literala u alatu kojim je komentar pisan. Vraceno
// 2026-09-08, iz istog izvora iz kojeg je i napisan.)
//
// 2026-09-08: 831 -> 839 KB za KOREKTORSKI STOL, drugu polovicu pete tocke vlasnikova pregleda
// ("Digitalni korektor koji sjedi uz tvoj Word"). Dva nova modula u `src/ui/results/`:
//   `desk-view.ts`   5,2 KB  jedan nalaz odjednom, traka o opsegu, navigacija koja NE omata
//   `desk-mount.ts`  7,2 KB  ozicenje oba smjera klika, delegacija koja prezivi ponovno crtanje
//
// OVO DIZANJE NIJE NAPLACENO, i to se pise doslovno da se ne bi citalo kao da jest. Prethodna
// cetiri kruga su svaki put nasla mrtav kod ili selidbu koja vrati vise nego sto uzme; ovdje
// takvog duga nije bilo. Rast je nova funkcionalnost koju je vlasnik trazio, mjerena bez
// preglednika (28 testova), a ne rast monolita: `app.ts` je i dalje ispod svog budzeta, sto je
// ono sto ratchet primarno cuva.
//
// Izmjereno 858629 B; budzet 859136 B ostavlja 507 B, pa gard grize na sljedeci rast.
// 2026-09-08: 839 -> 846 KB za OZICENJE korektorskog stola, cime peta tocka vlasnikova pregleda
// prvi put nesto pokazuje korisniku. Rast po dijelovima:
//   +2,0 KB  `environment-signals.ts`: SELIDBA iz `app.ts` (motionReduced, withViewTransition,
//            deviceMemoryGb, coarsePointer, isLikelyMobile, effectiveUploadCap). `app.ts` je time
//            smrsavio 1438 B, sto je i bio uvjet: ratchet za probijen `app.ts` propisuje selidbu,
//            ne dizanje. Klaster do tada nije imao NIJEDAN test, iako o njemu ovisi kada se mijenja
//            ekran i koliki se dokument prima; sada ima 11.
//   +1,5 KB  `results-cockpit.ts`: stol zamjenjuje popis tri kartice kad ima nalaza
//   +1,2 KB  `app.ts`: predaja izvora stola (nalazi + zastavice + lijeni renderer dokumenta)
//   +0,3 KB  `topFindings` postaje genericki, da pozivatelj ne gubi tip i ne vraca ga kastom
//
// I OVO DIZANJE NIJE NAPLACENO, drugo zaredom, i to se pise otvoreno umjesto da se zagladi.
// Trazio sam cime platiti i nasao TRI modula u `src/ui` koje uvozi ISKLJUCIVO njihov vlastiti
// test, ukupno oko 20 KB:
//
//     verification-console.ts   11,1 KB   pripada zasebnoj stranici (verification.html)
//     triage-view.ts             5,2 KB   `#triagePanel` puni `findingCardHtml`, ne on
//     source-cross-check-view.ts 3,7 KB   placena opt-in dopuna, nikad ozicena
//
// NIJEDAN NIJE OBRISAN. Za `triage-view` se ne da utvrditi je li NADIDJEN ili nikad spojen: on
// prikazuje os POPRAVLJIVOSTI (auto/asistirano/rucno), koju kartica nalaza ne pokazuje, pa bi
// brisanje moglo ukloniti namjeru, a ne mrtav kod. Ostala dva su jos jasnije tudja odluka.
// Razlika prema `hero-demo`, koji JEST obrisan: ondje je bilo dokazano da mu selektori ne postoje
// nigdje, dakle da ne moze raditi nista. Ovdje takav dokaz ne postoji, pa odluka ide vlasniku.
// 846 -> 848 KB, isti dan, treci put: `desk-document.ts` (2,5 KB), koji montira faksimil u pano
// stola i UKLAPA GA PO SIRINI. To nije nova znacajka nego popravak kvara: bez uklapanja se A4
// stranica rezala po desnom rubu i rijeci su se lomile nasred retka, pa je dokument bio necitljiv
// u alatu koji sluzi citanju. Kvar je prosao SVE testove (faksimil vidljiv, omjer stupaca tocan,
// oba mjerena) i vidio se tek na snimci ekrana; sada ga cuva tvrdnja o prelijevanju, cija je
// mutacija izmjerena na 22%. `app.ts` je pritom SMANJEN za 114 B, jer je zatvorenje preselilo.
// 2026-09-13 (zadatak B): 848 -> 838 KB, ista selidba. Ukupno 868334 -> 856288 B (-12046),
// tocno koliko i app.ts, jer kod nije presao u drugu datoteku unutar `src/ui` nego je otisao van.
// Budzet 858112 B ostavlja 1824 B zraka.
export const BUDZET_UI_UKUPNO = 838 * 1024;
