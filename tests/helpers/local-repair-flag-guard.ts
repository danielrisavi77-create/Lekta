/**
 * Izvorni gard: lokalni popravak (WordReplica) smije se izdati SAMO iza zastavice.
 *
 * Zasto staticki, a ne dinamicki: Edge funkcija `repair-docx` se u Vitestu ne izvrsava (Deno.env,
 * Supabase klijent, pozadinski waitUntil), pa nijedan dinamicki test ne moze posvjedociti da nova
 * grana u toj datoteci nije zaobisla zastavicu. Lansiranje ide bez lokalnog popravka, pa je bas ta
 * dosezljivost ono sto mora ostati dokazano: ako netko sutra doda drugo mjesto koje postavlja
 * `issuedLocalRepair` ili upise `localLaunch` iz drugog izvora, ovaj gard to prijavi.
 *
 * Postupak: izvor se najprije "obezboji" (sadrzaj komentara i nizova se zamijeni razmacima, duljina
 * i indeksi ostaju isti), pa se struktura (zagrade, pridruzivanja) cita iz koda, a imena varijabli
 * okoline iz nizova bez komentara. Bez toga bi komentar koji spominje `issuedLocalRepair =` bio
 * lazna uzbuna, a zagrada u nizu bi pomaknula kraj bloka.
 */

interface Blanked {
  /** Komentari zamijenjeni razmacima, nizovi ostaju (za imena varijabli okoline i import staze). */
  noComments: string;
  /** Komentari I sadrzaj nizova zamijenjeni razmacima (za zagrade i pridruzivanja). */
  codeOnly: string;
}

function blank(source: string): Blanked {
  const noComments = source.split('');
  const codeOnly = source.split('');
  const blankAt = (index: number, alsoNoComments: boolean): void => {
    if (source[index] === '\n' || source[index] === '\r') return;
    codeOnly[index] = ' ';
    if (alsoNoComments) noComments[index] = ' ';
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') { blankAt(i, true); i += 1; }
      continue;
    }
    if (c === '/' && next === '*') {
      blankAt(i, true); blankAt(i + 1, true); i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) { blankAt(i, true); i += 1; }
      blankAt(i, true); blankAt(i + 1, true); i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { blankAt(i, false); i += 1; if (i < source.length) { blankAt(i, false); i += 1; } continue; }
        blankAt(i, false);
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return { noComments: noComments.join(''), codeOnly: codeOnly.join('') };
}

/** Kraj uravnotezene zagrade koja pocinje na `open` (indeks znaka `(` ili `{`). */
function matchingClose(code: string, open: number, openChar: '(' | '{'): number {
  const closeChar = openChar === '(' ? ')' : '}';
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === openChar) depth += 1;
    else if (code[i] === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const FLAG_MODULE_IMPORT = /import\s*\{[^}]*\blocalRepairFlagEnabled\b[^}]*\}\s*from\s*['"][^'"]*local-runner\/feature-flag\.ts['"]/;
const FLAG_FROM_FUNCTION = /const\s+LOCAL_REPAIR_ENABLED\s*=\s*localRepairFlagEnabled\s*\(/;
const ENV_NAMES = /REPAIR_LOCAL_(?:ENABLED|DISABLED)/g;
const ISSUED_ASSIGNMENT = /issuedLocalRepair\s*=(?!=)/g;
/** Deklaracija s pocetnom vrijednoscu (`let issuedLocalRepair: T | null = null;`) je dopustena. */
const ISSUED_DECLARATION = /\blet\s+issuedLocalRepair\b[^;=]*=/;

/**
 * Popis problema u izvoru Edge funkcije `repair-docx`. Prazan popis znaci: zastavica dolazi iz
 * `localRepairFlagEnabled`, varijable okoline se citaju samo u tom pozivu, `issuedLocalRepair` se
 * postavlja samo unutar `if (LOCAL_REPAIR_ENABLED ...)` bloka i `localLaunch` u odgovoru dolazi
 * iskljucivo iz `issuedLocalRepair`.
 */
export function localRepairFlagProblems(source: string): string[] {
  const problems: string[] = [];
  const { noComments, codeOnly } = blank(source);

  if (!FLAG_MODULE_IMPORT.test(noComments)) {
    problems.push('nedostaje import localRepairFlagEnabled iz src/repair/local-runner/feature-flag.ts');
  }

  const flagCall = FLAG_FROM_FUNCTION.exec(codeOnly);
  if (!flagCall) {
    problems.push('LOCAL_REPAIR_ENABLED se ne racuna pozivom localRepairFlagEnabled(...)');
  }
  const callOpen = flagCall ? codeOnly.indexOf('(', flagCall.index) : -1;
  const callClose = callOpen >= 0 ? matchingClose(codeOnly, callOpen, '(') : -1;
  for (const hit of noComments.matchAll(ENV_NAMES)) {
    const at = hit.index ?? 0;
    if (callOpen < 0 || callClose < 0 || at < callOpen || at > callClose) {
      problems.push(`varijabla okoline ${hit[0]} se cita izvan poziva localRepairFlagEnabled(...)`);
    }
  }

  const branch = codeOnly.indexOf('if (LOCAL_REPAIR_ENABLED');
  if (branch < 0) {
    problems.push('nema grane `if (LOCAL_REPAIR_ENABLED ...)` koja ogradjuje izdavanje lokalnog popravka');
  }
  const branchOpen = branch >= 0 ? codeOnly.indexOf('{', branch) : -1;
  const branchClose = branchOpen >= 0 ? matchingClose(codeOnly, branchOpen, '{') : -1;
  const declaration = ISSUED_DECLARATION.exec(codeOnly);
  for (const hit of codeOnly.matchAll(ISSUED_ASSIGNMENT)) {
    const at = hit.index ?? 0;
    const isDeclaration = declaration !== null
      && at >= declaration.index
      && at < declaration.index + declaration[0].length;
    if (isDeclaration) continue;
    if (branchOpen < 0 || branchClose < 0 || at < branchOpen || at > branchClose) {
      problems.push('issuedLocalRepair se postavlja izvan grane koja provjerava LOCAL_REPAIR_ENABLED');
    }
  }

  const launchLines = codeOnly.split('\n').filter((line) => line.includes('localLaunch'));
  if (launchLines.length === 0) problems.push('odgovor vise ne nosi polje localLaunch');
  for (const line of launchLines) {
    if (!line.includes('issuedLocalRepair')) {
      problems.push('localLaunch u odgovoru ne dolazi iz issuedLocalRepair');
    }
  }

  return problems;
}

const OFFER_BRANCH = /if\s*\(\s*out\.localRepair\s*\)\s*\{/;
const OFFER_MODULE = /local-repair-runner-download/g;
const OFFER_RENDER = /renderLocalRepairRunnerOffer|localRepairRunnerConfig/g;

/**
 * Popis problema u `src/ui/app.ts`: ponuda lokalnog runnera (modul, dinamicki import i render) smije
 * se spominjati SAMO unutar grane `if(out.localRepair){ ... }`. Kad server ne izda launch (zastavica
 * iskljucena), `out.localRepair` je null, pa se modul nikad ni ne dohvaca.
 *
 * Staticki, jer je grana zakopana u zatvaracu `go()` u app.ts: da bi se izvela, treba cijeli tok
 * uploada (prijava, mreza, DOM carobnjaka). Ovo NIJE dokaz izvodjenja, nego dokaz dosezljivosti.
 */
export function localRepairOfferProblems(source: string): string[] {
  const problems: string[] = [];
  const { codeOnly } = blank(source);

  const branch = OFFER_BRANCH.exec(codeOnly);
  if (!branch) {
    problems.push('nema grane `if(out.localRepair){` koja ogradjuje ponudu lokalnog runnera');
  }
  const branchOpen = branch ? codeOnly.indexOf('{', branch.index) : -1;
  const branchClose = branchOpen >= 0 ? matchingClose(codeOnly, branchOpen, '{') : -1;

  const outside = (at: number): boolean => branchOpen < 0 || branchClose < 0 || at < branchOpen || at > branchClose;
  for (const hit of source.matchAll(OFFER_MODULE)) {
    if (outside(hit.index ?? 0)) {
      problems.push('modul local-repair-runner-download se dohvaca izvan grane if(out.localRepair)');
    }
  }
  for (const hit of codeOnly.matchAll(OFFER_RENDER)) {
    if (outside(hit.index ?? 0)) {
      problems.push('ponuda lokalnog runnera se poziva izvan grane if(out.localRepair)');
    }
  }
  return problems;
}
