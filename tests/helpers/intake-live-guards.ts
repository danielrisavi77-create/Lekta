/**
 * GARDOVI ZIVOG LISTA (ALIGNMENT Z32), kao funkcije koje vracaju popis problema.
 *
 * Isti oblik kao ostali gardovi u `tests/helpers/`: baseline nad stvarnim izvorom mjeri
 * `tests/intake-live.test.ts` (mora vratiti prazan popis), a mutacije u memoriji mjeri
 * `tests/gate-mutations.test.ts` (mora vratiti bar jedan problem). Gard koji ne grize je gori od
 * nikakvog, pa svaki ovdje ima oba smjera.
 */
import type { RokStanje } from '../../src/routes/intake/deadline-stamp';

/**
 * Vrata primaju samo rok. `fakultetPotvrden` je u tipu garda NAMJERNO (neobavezno): gard ga salje
 * u oba stanja, pa izvedba koja bi ga opet pocela traziti pada, iako ga stvarna funkcija ne cita.
 */
type Spremnost = (s: { rok: RokStanje; fakultetPotvrden?: boolean }) => { spremno: boolean; natpis: string };

/**
 * VRATA UBACIVANJA (Z32, odluka vlasnika 2026-09-27): otvara ih rok ILI "Još ne znam rok";
 * fakultet NIJE uvjet. Kvar koji imitira: "Još ne znam rok" se ne broji kao odluka, pa student
 * bez roka nikad ne ubaci rad; ili vrata opet traze fakultet, pa posjetitelj bez zapamcenih
 * postavki ne moze ubaciti rad bez odlaska na odabir fakulteta.
 */
export function vrataProblemi(spremnost: Spremnost): string[] {
  const problemi: string[] = [];
  const rokovi: Array<[string, RokStanje, boolean]> = [
    ['bez roka', { datum: null, neznam: false }, false],
    ['s datumom', { datum: '2026-10-15', neznam: false }, true],
    ['"Još ne znam rok"', { datum: null, neznam: true }, true],
    ['nevaljan datum', { datum: '2026-02-30', neznam: false }, false],
  ];
  for (const fakultetPotvrden of [false, true]) {
    for (const [ime, rok, ocekivano] of rokovi) {
      const dobiveno = spremnost({ fakultetPotvrden, rok });
      if (dobiveno.spremno !== ocekivano) {
        problemi.push(`fakultet ${fakultetPotvrden ? 'potvrdjen' : 'nepotvrdjen'}, ${ime}: spremno=${dobiveno.spremno}, ocekivano ${ocekivano}`);
      }
      if (!dobiveno.spremno && dobiveno.natpis === 'ili ispusti dokument ovdje') {
        problemi.push(`zatvorena vrata nose natpis otvorenih (${ime})`);
      }
      if (!dobiveno.spremno && /fakultet/i.test(dobiveno.natpis)) {
        problemi.push(`natpis zatvorenih vrata trazi fakultet (${ime}): "${dobiveno.natpis}"`);
      }
    }
  }
  const bezRoka = spremnost({ fakultetPotvrden: false, rok: { datum: null, neznam: false } }).natpis;
  if (bezRoka !== 'Prvo potvrdi rok') problemi.push(`natpis bez roka nije "Prvo potvrdi rok": "${bezRoka}"`);
  return problemi;
}

type PovratakRoka = (rok: RokStanje, danas: Date) => RokStanje;

/**
 * ISTEKAO ROK SE NE VRACA NA ULAZ. Kvar koji imitira: zapamcen rok proslog rada (datum koji je
 * prosao) sam otvara vrata za novi rad. Rok danas i "Još ne znam rok" se vracaju.
 */
export function povratakRokaProblemi(povratak: PovratakRoka): string[] {
  const danas = new Date(2026, 8, 27, 10);
  const slucajevi: Array<[string, RokStanje, RokStanje]> = [
    ['jucer', { datum: '2026-09-26', neznam: false }, { datum: null, neznam: false }],
    ['prije godinu dana', { datum: '2025-09-27', neznam: false }, { datum: null, neznam: false }],
    ['danas', { datum: '2026-09-27', neznam: false }, { datum: '2026-09-27', neznam: false }],
    ['sutra', { datum: '2026-09-28', neznam: false }, { datum: '2026-09-28', neznam: false }],
    ['"Još ne znam rok"', { datum: null, neznam: true }, { datum: null, neznam: true }],
    ['prazno', { datum: null, neznam: false }, { datum: null, neznam: false }],
  ];
  const problemi: string[] = [];
  for (const [ime, rok, ocekivano] of slucajevi) {
    const dobiveno = povratak(rok, danas);
    if (JSON.stringify(dobiveno) !== JSON.stringify(ocekivano)) {
      problemi.push(`rok ${ime}: ${JSON.stringify(dobiveno)}, ocekivano ${JSON.stringify(ocekivano)}`);
    }
  }
  return problemi;
}

type PecatRoka = (s: RokStanje, danas: Date) => string | null;

/**
 * PECAT ROKA: poznati slucajevi s tocnim tekstom. Kvar koji imitira: racun po satima umjesto po
 * kalendaru (ljetno vrijeme daje dan manje), ili sklonidba koja kaze "21 dana".
 */
export function pecatRokaProblemi(pecatRoka: PecatRoka): string[] {
  const slucajevi: Array<[RokStanje, Date, string | null]> = [
    [{ datum: '2026-10-15', neznam: false }, new Date(2026, 8, 23, 12), 'Rok 15. 10. · 22 dana'],
    // 25. 10. 2026. zavrsava ljetno vrijeme: dan od 25 sati ne smije pojesti dan.
    [{ datum: '2026-10-26', neznam: false }, new Date(2026, 9, 24, 23, 30), 'Rok 26. 10. · 2 dana'],
    [{ datum: '2026-03-30', neznam: false }, new Date(2026, 2, 28, 0, 5), 'Rok 30. 3. · 2 dana'],
    [{ datum: '2026-10-14', neznam: false }, new Date(2026, 8, 23, 9), 'Rok 14. 10. · 21 dan'],
    [{ datum: '2026-09-23', neznam: false }, new Date(2026, 8, 23, 23, 59), 'Rok 23. 9. · danas'],
    [{ datum: '2026-09-22', neznam: false }, new Date(2026, 8, 23, 0, 1), 'Rok 22. 9. · prošao'],
    [{ datum: '2026-10-15', neznam: true }, new Date(2026, 8, 23), 'Rok nije zadan'],
    [{ datum: null, neznam: false }, new Date(2026, 8, 23), null],
  ];
  const problemi: string[] = [];
  for (const [rok, danas, ocekivano] of slucajevi) {
    const dobiveno = pecatRoka(rok, danas);
    if (dobiveno !== ocekivano) problemi.push(`${JSON.stringify(rok)} @ ${danas.toString()}: "${dobiveno}", ocekivano "${ocekivano}"`);
  }
  return problemi;
}

/** Tijelo prvog poziva `ime(` do uravnotezene zagrade, bez komentara. */
function tijeloPoziva(izvor: string, ime: string): string | null {
  const cist = izvor.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const pocetak = cist.indexOf(`${ime}(`);
  if (pocetak < 0) return null;
  let dubina = 0;
  for (let i = pocetak + ime.length; i < cist.length; i += 1) {
    if (cist[i] === '(') dubina += 1;
    else if (cist[i] === ')') { dubina -= 1; if (dubina === 0) return cist.slice(pocetak, i + 1); }
  }
  return null;
}

/**
 * OZICENJE ULAZA: `main.ts` montira zivi list i predaje kontroleru SVE cetiri kuke, te povezuje
 * ispustanje izvan lista. Kvar koji imitira: kuka `canAccept` ispusti iz poziva, pa su vrata na
 * ekranu zatvorena a klik i ispustanje ipak primaju dokument bez odlucenog roka.
 */
export function ozicenjeUlazaProblemi(mainIzvor: string): string[] {
  const problemi: string[] = [];
  if (!tijeloPoziva(mainIzvor, 'mountIntakeLive')) problemi.push('main.ts ne montira zivi list');
  const kontroler = tijeloPoziva(mainIzvor, 'mountIntakeController');
  if (!kontroler) return [...problemi, 'main.ts ne montira kontroler'];
  for (const kuka of ['canAccept', 'onBlocked', 'onFileChosen', 'onSessionStored']) {
    if (!new RegExp(`\\b${kuka}\\s*:\\s*live\\.${kuka}\\b`).test(kontroler)) problemi.push(`kontroler ne dobiva kuku ${kuka}`);
  }
  if (!tijeloPoziva(mainIzvor, 'live.poveziOdabir')) problemi.push('ispustanje izvan lista nije povezano s kontrolerom');
  const cist = mainIzvor.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (cist.indexOf('mountIntakeLive(') > cist.indexOf('mountIntakeController(')) {
    problemi.push('zivi list se montira POSLIJE kontrolera; prvi klik ne bi imao vrata');
  }
  return problemi;
}

/** Tijelo arrow funkcije `const <ime> = (...) => { ... }`, bez komentara; `null` kad je nema. */
function tijeloArrowFunkcije(izvor: string, ime: string): string | null {
  const cist = izvor.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const pocetak = cist.indexOf(`const ${ime} = `);
  if (pocetak < 0) return null;
  const otvori = cist.indexOf('{', cist.indexOf('=>', pocetak));
  if (otvori < 0) return null;
  let dubina = 0;
  for (let i = otvori; i < cist.length; i += 1) {
    if (cist[i] === '{') dubina += 1;
    else if (cist[i] === '}') { dubina -= 1; if (dubina === 0) return cist.slice(otvori, i + 1); }
  }
  return null;
}

/**
 * ISPUSTANJE KAD SU VRATA ZATVORENA SE ODBIJA, na listu i izvan njega. Dvije su staze, pa su dvije
 * provjere: kontroler (`intake-controller.ts`, ispustanje NA list) prije `selectFile` pita
 * `accepts()`, a zivi list (`intake-live.ts`, ispustanje IZVAN lista) prije predaje kontroleru
 * pita spremnost i zove `onBlocked`. Ponasanje mjeri `tests/intake-live.test.ts`; ovaj gard drzi
 * da provjera u izvoru stoji PRIJE predaje dokumenta. Kvar koji imitira: provjera ispadne iz
 * `onDrop`, pa ispusten rad prolazi kroz zatvorena vrata bez roka.
 */
export function ispustanjeProblemi(kontrolerIzvor: string, liveIzvor: string): string[] {
  const problemi: string[] = [];
  const k = tijeloArrowFunkcije(kontrolerIzvor, 'onDrop');
  if (!k) problemi.push('kontroler nema onDrop');
  else {
    const vrata = k.indexOf('accepts()');
    const predaja = k.indexOf('selectFile(');
    if (vrata < 0 || predaja < 0 || vrata > predaja) problemi.push('kontroler prima ispusten dokument bez provjere vrata');
  }
  const l = tijeloArrowFunkcije(liveIzvor, 'onDrop');
  if (!l) problemi.push('zivi list nema onDrop');
  else {
    const vrata = l.search(/if\s*\(\s*!spremnost\(\)\.spremno\s*\)\s*\{\s*onBlocked\(\);\s*return;\s*\}/);
    const predaja = l.indexOf('odabir?.(');
    if (vrata < 0 || predaja < 0 || vrata > predaja) problemi.push('ispustanje izvan lista prolazi kroz zatvorena vrata');
  }
  return problemi;
}

/**
 * DETEKCIJA NA `/rad/` NE GAZI FAKULTET POTVRDJEN NA ULAZU (Z32 popravak). `applyDetectedContext`
 * mora, prije nego dira izbornik fakulteta, pitati `detekcijaSmije` (`src/ui/confirmed-faculty.ts`)
 * i odustati kad ne smije; `applyFacultyIds` mora spustiti `_profileConfirmed`, jer studij nije
 * potvrdjen; `primijeniFakultetUlaza` (`confirmed-faculty.ts`) mora POSLIJE postavljanja obrasca
 * postaviti bravu (`zakljucajFakultet`); a `/rad/` (`src/routes/workspace/main.ts`) mora potvrdu
 * bez studija voditi kroz `primijeniFakultetUlaza`, ne ravno na `applyFacultyIds`. Kvar koji
 * imitira: provjera ispadne, pa student koji je na `/` potvrdio FER na `/rad/` dobije fakultet koji
 * je detekcija pogodila iz teksta; ili se fakultet bez studija oznaci kao potvrdjen profil.
 *
 * Nalaz pregleda Z32: brava je prije zivjela u `app.ts`, koji je time prerastao ratchet velicine,
 * pa je presla u `confirmed-faculty.ts`; gard zato cita tri izvora umjesto jednog.
 */
export function detekcijaFakultetaProblemi(appIzvor: string, fakultetIzvor: string, workspaceMain: string): string[] {
  const problemi: string[] = [];
  const cist = appIzvor.replace(/^[ \t]*\/\/.*$/gm, ' ');
  const primjena = /export function applyFacultyIds\([^)]*\)[^{]*\{([^\n]*)\}\n/.exec(cist)?.[1] ?? null;
  if (primjena === null) problemi.push('app.ts nema applyFacultyIds');
  else if (!/_profileConfirmed=false/.test(primjena)) problemi.push('fakultet bez studija oznacen kao potvrdjen profil');
  const fak = fakultetIzvor.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const odFak = fak.indexOf('export function primijeniFakultetUlaza(');
  if (odFak < 0) problemi.push('confirmed-faculty.ts nema primijeniFakultetUlaza');
  else {
    const tijeloFak = fak.slice(odFak, fak.indexOf('\n}', odFak));
    const obrazac = tijeloFak.indexOf('postaviObrazac(ids)');
    const brava = tijeloFak.search(/return zakljucajFakultet\(ids\.unit,/);
    if (brava < 0) problemi.push('primjena fakulteta ne postavlja bravu');
    else if (obrazac < 0 || obrazac > brava) problemi.push('brava se postavlja prije nego obrazac prihvati fakultet');
  }
  const main = workspaceMain.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  if (!/applyFaculty:\s*\(ids\)\s*=>\s*primijeniFakultetUlaza\(ids,\s*applyFacultyIds\)/.test(main)) {
    problemi.push('/rad/ primjenjuje fakultet s ulaza bez brave');
  }
  const pocetak = cist.indexOf('async function applyDetectedContext(');
  if (pocetak < 0) return [...problemi, 'app.ts nema applyDetectedContext'];
  const tijelo = cist.slice(pocetak, cist.indexOf('\n}', pocetak));
  const straza = tijelo.search(/\|\|!detekcijaSmije\(ctx\.unitId\)\)return;/);
  const izbornik = tijelo.indexOf("setOptionIfExists($('#unitSelect')");
  if (straza < 0) problemi.push('detekcija ne postuje fakultet potvrdjen na ulazu');
  else if (izbornik >= 0 && straza > izbornik) problemi.push('detekcija dira izbornik fakulteta prije provjere potvrde');
  return problemi;
}

/**
 * PRIGUSEN POKRET I POKRET IZVAN POGLEDA (Z31 za Z32): tragovi olovke se pod OBA oblika
 * prigusenja (sustavni upit i rucni `data-motion="reduce"`) ne prikazuju, linija skeniranja nosi
 * `data-motion-offscreen`, a ui-boot taj atribut stvarno promatra.
 */
export function pokretProblemi(css: string, html: string, uiBoot: string): string[] {
  const problemi: string[] = [];
  const cist = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const upit = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(cist)?.[1] ?? '';
  if (!/\.intake-tragovi\{display:none\}/.test(upit)) problemi.push('tragovi olovke se prikazuju pod prefers-reduced-motion');
  if (!/:root\[data-motion="reduce"\] \.intake-tragovi\{display:none\}/.test(cist)) problemi.push('tragovi olovke se prikazuju pod rucnim prigusenjem pokreta');
  if (/animation[^;{}]*infinite/i.test(cist)) problemi.push('beskonacna animacija na ulazu');
  if (!/class="intake-sken"[^>]*data-motion-offscreen/.test(html)) problemi.push('linija skeniranja ne nosi data-motion-offscreen');
  if (!/MOTION_OFFSCREEN_SELECTOR\s*=\s*'[^']*\[data-motion-offscreen\]/.test(uiBoot)) problemi.push('ui-boot ne promatra [data-motion-offscreen]');
  return problemi;
}

/**
 * REDOSLIJED NA `/rad/`: potvrda s ulaza se primjenjuje POSLIJE obnove sesijskog profila i PRIJE
 * `restoreDocument`, cija bi detekcija iz dokumenta inace pregazila potvrdjeni fakultet.
 */
export function redoslijedPotvrdeProblemi(workspaceMain: string): string[] {
  const cist = workspaceMain.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const redoslijed = ['initAnalyzerApp(', 'profil.restore(', 'primijeniPotvrduUlaza(', 'restoreDocument('];
  const poz = redoslijed.map((p) => cist.indexOf(p));
  const problemi: string[] = [];
  redoslijed.forEach((p, i) => { if (poz[i] < 0) problemi.push(`nema poziva ${p}`); });
  if (problemi.length) return problemi;
  for (let i = 1; i < redoslijed.length; i += 1) {
    if (poz[i - 1] > poz[i]) problemi.push(`${redoslijed[i - 1]} mora doci prije ${redoslijed[i]}`);
  }
  return problemi;
}

type Potvrda = { unit: string; program: string | null; workType: string | null; sesija: string | null; at: number };
type PotvrdaVrijedi = (potvrda: Potvrda | null, sesija: { id: string; imaProfil: boolean }) => boolean;
type CijeliProfil = (potvrda: Potvrda, obrazac: { unit: string; program: string; workType: string }) => boolean;

/**
 * POTVRDA S ULAZA SMIJE VRIJEDITI SAMO ZA SVOJ RAD, i vrijedi i BEZ studija. Kvar koji imitira:
 * provjera id-a sesije ispadne, pa potvrda iz proslog posjeta tiho oznaci fakultet potvrdjenim na
 * drugom dokumentu; ili potvrda fakulteta iz `?unit=` (bez studija) ne vrijedi, pa `/rad/`
 * potvrdjeni fakultet pita ponovo i detekcija ga smije promijeniti (nalaz pregleda Z32).
 */
export function potvrdaSesijeProblemi(vrijedi: PotvrdaVrijedi): string[] {
  const potvrda: Potvrda = { unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: 's-1', at: 1 };
  const problemi: string[] = [];
  if (!vrijedi(potvrda, { id: 's-1', imaProfil: false })) problemi.push('ispravna potvrda za svoju sesiju ne vrijedi');
  if (!vrijedi({ ...potvrda, program: null, workType: null }, { id: 's-1', imaProfil: false })) {
    problemi.push('potvrda fakulteta bez studija (?unit=) ne vrijedi');
  }
  if (vrijedi(potvrda, { id: 's-2', imaProfil: false })) problemi.push('potvrda vrijedi za TUDJU sesiju');
  if (vrijedi({ ...potvrda, sesija: null }, { id: 's-1', imaProfil: false })) problemi.push('nevezana potvrda vrijedi');
  if (vrijedi(potvrda, { id: 's-1', imaProfil: true })) problemi.push('potvrda gazi vlastiti profil sesije');
  if (vrijedi(null, { id: 's-1', imaProfil: false })) problemi.push('nepostojeca potvrda vrijedi');
  return problemi;
}

/**
 * CIJELI PROFIL SAMO UZ POTVRDJEN STUDIJ I ISTI OBRAZAC. Kvar koji imitira: potvrda bez studija
 * primijeni se kao potvrdjen PROFIL, pa `/rad/` kao potvrdjen oznaci abecedni fallback izbornika
 * studija; ili se primijeni uz obrazac koji pokazuje drugi fakultet.
 */
export function cijeliProfilProblemi(nosi: CijeliProfil): string[] {
  const potvrda: Potvrda = { unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: 's-1', at: 1 };
  const obrazac = { unit: 'fpzg', program: 'Politologija', workType: 'graduate' };
  const problemi: string[] = [];
  if (!nosi(potvrda, obrazac)) problemi.push('potvrda sa studijem uz isti obrazac ne nosi profil');
  if (nosi({ ...potvrda, program: null }, obrazac)) problemi.push('potvrda bez studija zakljucava fallback');
  if (nosi(potvrda, { ...obrazac, unit: 'efzg' })) problemi.push('potvrda vrijedi uz drugi fakultet u obrascu');
  if (nosi(potvrda, { ...obrazac, program: 'Novinarstvo' })) problemi.push('potvrda vrijedi uz drugi studij u obrascu');
  if (nosi(potvrda, { ...obrazac, workType: 'final' })) problemi.push('potvrda vrijedi uz drugu razinu u obrascu');
  return problemi;
}
