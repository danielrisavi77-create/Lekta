/**
 * GARDOVI ZIVOG LISTA (ALIGNMENT Z32), kao funkcije koje vracaju popis problema.
 *
 * Isti oblik kao ostali gardovi u `tests/helpers/`: baseline nad stvarnim izvorom mjeri
 * `tests/intake-live.test.ts` (mora vratiti prazan popis), a mutacije u memoriji mjeri
 * `tests/gate-mutations.test.ts` (mora vratiti bar jedan problem). Gard koji ne grize je gori od
 * nikakvog, pa svaki ovdje ima oba smjera.
 */
import type { RokStanje } from '../../src/routes/intake/deadline-stamp';

type Spremnost = (s: { fakultetPotvrden: boolean; rok: RokStanje }) => { spremno: boolean; natpis: string };

/**
 * VRATA UBACIVANJA (Z32 tocka 3): tablica svih kombinacija fakulteta i roka.
 * Kvar koji imitira: "Još ne znam rok" se ne broji kao odluka, pa student bez roka nikad ne ubaci
 * rad; ili fakultet se preskoci, pa se boduje po nepotvrdjenom profilu.
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
    for (const [ime, rok, rokOk] of rokovi) {
      const ocekivano = fakultetPotvrden && rokOk;
      const dobiveno = spremnost({ fakultetPotvrden, rok });
      if (dobiveno.spremno !== ocekivano) {
        problemi.push(`fakultet ${fakultetPotvrden ? 'potvrdjen' : 'nepotvrdjen'}, ${ime}: spremno=${dobiveno.spremno}, ocekivano ${ocekivano}`);
      }
      if (!dobiveno.spremno && dobiveno.natpis === 'ili ispusti dokument ovdje') {
        problemi.push(`zatvorena vrata nose natpis otvorenih (${ime})`);
      }
    }
  }
  const oboje = spremnost({ fakultetPotvrden: false, rok: { datum: null, neznam: false } }).natpis;
  if (oboje !== 'Prvo potvrdi fakultet i rok') problemi.push(`natpis bez oboje nije iz predloska: "${oboje}"`);
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
 * ekranu zatvorena a klik i ispustanje ipak primaju dokument bez potvrdjenog fakulteta.
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

type PotvrdaVrijedi = (
  potvrda: { unit: string; program: string | null; workType: string | null; sesija: string | null; at: number } | null,
  sesija: { id: string; imaProfil: boolean },
  obrazac: { unit: string; program: string; workType: string },
) => boolean;

/**
 * POTVRDA S ULAZA SMIJE VRIJEDITI SAMO ZA SVOJ RAD. Kvar koji imitira: provjera id-a sesije
 * ispadne, pa potvrda iz proslog posjeta tiho oznaci profil potvrdjenim na drugom dokumentu;
 * ili potvrda bez studija (link s `?unit=`) zakljuca abecedni fallback izbornika.
 */
export function potvrdaSesijeProblemi(vrijedi: PotvrdaVrijedi): string[] {
  const potvrda = { unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: 's-1', at: 1 };
  const obrazac = { unit: 'fpzg', program: 'Politologija', workType: 'graduate' };
  const problemi: string[] = [];
  if (!vrijedi(potvrda, { id: 's-1', imaProfil: false }, obrazac)) problemi.push('ispravna potvrda za svoju sesiju ne vrijedi');
  if (vrijedi(potvrda, { id: 's-2', imaProfil: false }, obrazac)) problemi.push('potvrda vrijedi za TUDJU sesiju');
  if (vrijedi({ ...potvrda, sesija: null }, { id: 's-1', imaProfil: false }, obrazac)) problemi.push('nevezana potvrda vrijedi');
  if (vrijedi({ ...potvrda, program: null }, { id: 's-1', imaProfil: false }, obrazac)) problemi.push('potvrda bez studija zakljucava fallback');
  if (vrijedi(potvrda, { id: 's-1', imaProfil: true }, obrazac)) problemi.push('potvrda gazi vlastiti profil sesije');
  if (vrijedi(potvrda, { id: 's-1', imaProfil: false }, { ...obrazac, unit: 'efzg' })) problemi.push('potvrda vrijedi uz drugi fakultet u obrascu');
  return problemi;
}
