/**
 * Izvorni gard: lokalni popravak (WordReplica) smije se izdati SAMO iza zastavice.
 *
 * Zasto staticki, a ne dinamicki: Edge funkcija `repair-docx` se u Vitestu ne izvrsava (Deno.env,
 * Supabase klijent, pozadinski waitUntil), pa nijedan dinamicki test ne moze posvjedociti da nova
 * grana u toj datoteci nije zaobisla zastavicu. Lansiranje ide bez lokalnog popravka, pa je bas ta
 * dosezljivost ono sto mora ostati dokazano: ako netko sutra doda drugo mjesto koje izdaje posao,
 * postavi `issuedLocalRepair` ili upise launch u odgovor iz drugog izvora, ovaj gard to prijavi.
 *
 * Postupak: izvor se najprije "obezboji" (sadrzaj komentara, nizova I REGEX LITERALA se zamijeni
 * razmacima, duljina i indeksi ostaju isti), pa se struktura (zagrade, pridruzivanja) cita iz koda,
 * a imena varijabli okoline i staze modula iz nizova bez komentara. Bez toga bi komentar koji
 * spominje `issuedLocalRepair =` bio lazna uzbuna, a zagrada u nizu bi pomaknula kraj bloka.
 *
 * REGEX LITERALI I PREDLOSCI (pregled 2026-09-23): prva verzija nije poznavala ni jedno ni drugo.
 * Navodnik unutar regexa u `src/ui/app.ts` otvarao je laznu nisku i parsiranje se desinkroniziralo
 * (109 slijepih kod-linija, medju njima cijeli blok "Moji popravci"), a cijeli predlozak s
 * povratnim navodnikom bio je "niz", pa je i kod u supstitucijama `${...}` ispadao iz pregleda
 * (jos 389 slijepih kod-linija; app.ts HTML gradi bas tako). Zato je obezbojivac mali tokenizator:
 * regex je vlastita vrsta tokena (s razredima `[...]` u kojima `/` ne zavrsava literal), a predlozak
 * ima stog u kojem je tekst niz, a `${...}` opet kod. Mjera je sweep umetanja poziva ponude u svaki
 * redak: neulovljena smiju ostati samo mjesta unutar komentara i unutar dopustene grane.
 */

interface Blanked {
  /** Komentari zamijenjeni razmacima, nizovi ostaju (za imena varijabli okoline i staze modula). */
  noComments: string;
  /** Komentari I sadrzaj nizova/regexa zamijenjeni razmacima (za zagrade i pridruzivanja). */
  codeOnly: string;
}

/**
 * Smije li `/` na ovom mjestu zapoceti regex literal? Odlucuje zadnji znacajan token prije njega:
 * iza vrijednosti (ime, broj, `)`, `]`) to je dijeljenje, iza operatora ili otvorene zagrade regex.
 * `}` se broji kao mjesto gdje regex smije poceti (kraj bloka pa nova naredba); dijeljenje odmah
 * iza `}` u ovom kodu ne postoji.
 */
const REGEX_AFTER_PUNCT = new Set(['(', '[', '{', ',', ';', ':', '=', '!', '&', '|', '?', '+', '-', '*', '%', '~', '^', '<', '>', '}']);
const REGEX_AFTER_KEYWORD = /(?:^|[^\w$.])(?:return|typeof|instanceof|in|of|new|delete|void|do|else|case|yield|await|throw)$/;
/** Zagrada koju otvara glava upravljacke naredbe; iza njezinog `)` regex SMIJE poceti. */
const CONTROL_HEAD = /(?:^|[^\w$.])(?:if|while|for|switch|catch)\s*$/;

function blank(source: string): Blanked {
  const noComments = source.split('');
  const codeOnly = source.split('');
  const blankAt = (index: number, alsoNoComments: boolean): void => {
    if (source[index] === '\n' || source[index] === '\r') return;
    codeOnly[index] = ' ';
    if (alsoNoComments) noComments[index] = ' ';
  };
  /** Zadnjih nekoliko znacajnih znakova koda (bez nizova, regexa i komentara) za odluku o regexu. */
  let tail = '';
  const pushTail = (text: string): void => {
    tail = (tail + text).slice(-24);
  };
  /**
   * Stog okvira. `'template'` znaci da smo u TEKSTU predloska, broj znaci da smo u supstituciji
   * `${...}` i koliko je viticastih zagrada unutar nje otvoreno. Prazan stog je obican kod.
   *
   * Bez ovoga bi cijeli predlozak bio "niz", pa bi kod u `${...}` (a app.ts gradi HTML upravo tako)
   * ispao iz pregleda. Izmjereno na app.ts: takvih slijepih kod-linija je bilo 389.
   */
  const stack: Array<'template' | number> = [];
  /** Za svaku otvorenu oblu zagradu: je li ju otvorila glava upravljacke naredbe. */
  const parens: boolean[] = [];
  let lastCloseWasControl = false;
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    const top = stack.length > 0 ? stack[stack.length - 1] : null;

    if (top === 'template') {
      if (c === '\\') { blankAt(i, false); i += 1; if (i < source.length) { blankAt(i, false); i += 1; } continue; }
      if (c === '`') { stack.pop(); pushTail('x'); i += 1; continue; }
      if (c === '$' && next === '{') { stack.push(0); pushTail('('); i += 2; continue; }
      blankAt(i, false);
      i += 1;
      continue;
    }

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
    if (c === '`') {
      stack.push('template');
      i += 1;
      continue;
    }
    if (c === '{') {
      if (typeof top === 'number') stack[stack.length - 1] = top + 1;
      pushTail('{');
      i += 1;
      continue;
    }
    if (c === '}') {
      if (typeof top === 'number') {
        if (top === 0) { stack.pop(); pushTail('x'); i += 1; continue; }
        stack[stack.length - 1] = top - 1;
      }
      pushTail('}');
      i += 1;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { blankAt(i, false); i += 1; if (i < source.length) { blankAt(i, false); i += 1; } continue; }
        blankAt(i, false);
        i += 1;
      }
      i += 1;
      // Niz je vrijednost: `/` iza njega je dijeljenje, ne pocetak regexa.
      pushTail('x');
      continue;
    }
    if (c === '(') {
      parens.push(CONTROL_HEAD.test(tail));
      pushTail('(');
      i += 1;
      continue;
    }
    if (c === ')') {
      lastCloseWasControl = parens.pop() === true;
      pushTail(')');
      i += 1;
      continue;
    }
    if (c === '/') {
      const trimmed = tail.replace(/\s+$/, '');
      const last = trimmed.slice(-1);
      const startsRegex = trimmed === ''
        || REGEX_AFTER_PUNCT.has(last)
        || REGEX_AFTER_KEYWORD.test(trimmed)
        // `if (x) /re/.test(y)`: iza zatvorene glave upravljacke naredbe regex smije poceti.
        || (last === ')' && lastCloseWasControl);
      if (startsRegex) {
        i += 1;
        let inClass = false;
        while (i < source.length && source[i] !== '\n') {
          const r = source[i];
          if (r === '\\') { blankAt(i, false); i += 1; if (i < source.length) { blankAt(i, false); i += 1; } continue; }
          if (r === '[') inClass = true;
          else if (r === ']') inClass = false;
          else if (r === '/' && !inClass) break;
          blankAt(i, false);
          i += 1;
        }
        i += 1;
        // Zastavice (g, i, m, s, u, y) preskacemo da ne postanu imena u kodu.
        while (i < source.length && /[a-z]/.test(source[i])) { blankAt(i, false); i += 1; }
        pushTail('x');
        continue;
      }
      pushTail('/');
      i += 1;
      continue;
    }
    pushTail(c);
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

/** Rasponi svih podudaranja obrasca; sluze kao popis DOPUSTENIH polozaja tokena. */
function spans(code: string, pattern: RegExp): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  for (const hit of code.matchAll(pattern)) {
    const at = hit.index ?? 0;
    found.push([at, at + hit[0].length]);
  }
  return found;
}

function within(ranges: Array<[number, number]>, at: number): boolean {
  return ranges.some(([from, to]) => at >= from && at < to);
}

const FLAG_MODULE_IMPORT = /import\s*\{[^}]*\blocalRepairFlagEnabled\b[^}]*\}\s*from\s*['"][^'"]*local-runner\/feature-flag\.ts['"]/;
const FLAG_FROM_FUNCTION = /const\s+LOCAL_REPAIR_ENABLED\s*=\s*localRepairFlagEnabled\s*\(/;
/** Lokalna definicija istog imena bi presjekla uvoz i uvijek vracala sto autor hoce. */
const FLAG_LOCAL_DEFINITION = /\b(?:function|const|let|var|class)\s+localRepairFlagEnabled\b/;
/** Zastavica se smije citati SAMO iz okoline, i to obje varijable. */
const ENV_READ = /Deno\.env\.get\(\s*['"]REPAIR_LOCAL_(ENABLED|DISABLED)['"]\s*\)/g;
/** `=`, ali i `||=`, `??=`, `&&=`: logicko pridruzivanje je isto pridruzivanje. */
const ISSUED_ASSIGNMENT = /issuedLocalRepair\s*(?:\|\||\?\?|&&)?=(?!=)/g;
/** Deklaracija s pocetnom vrijednoscu (`let issuedLocalRepair: T | null = null;`) je dopustena. */
const ISSUED_DECLARATION = /\blet\s+issuedLocalRepair\b[^;=]*=/;
/** Svaki SPOMEN izdavaca, ne samo poziv: alias (`const issue = provisionLocalRepairJob`) je isto. */
const PROVISION_MENTION = /\bprovisionLocalRepairJob\b/g;
const PROVISION_IMPORT = /import\s*\{[^}]*\bprovisionLocalRepairJob\b[^}]*\}\s*from\s*['"][^'"]*['"]/g;
/** Izracunati kljuc objekta (`['local' + 'Repair']:`) sakriva ime polja u niz, koji gard ne cita. */
const COMPUTED_KEY = /\[[^\]\n]*\]\s*:/g;
/** Jedini dopusteni izvor argumenta `localLaunch` za settleRepairStorageHandoff. */
const LAUNCH_ARGUMENT = /\blocalLaunch\s*:\s*issuedLocalRepair\?\.launch\s*\?\?\s*null\b/g;
const LAUNCH_TOKEN = /\blocalLaunch\b/g;
/** Jedini dopusteni oblik polja u ODGOVORU: `localRepair: handoff.localRepair`. */
const RESPONSE_FIELD = /\blocalRepair\s*:\s*handoff\.localRepair\s*(?=[,\n}])/g;
const RESPONSE_TOKEN = /\blocalRepair\b/g;
const HANDOFF_SOURCE_G = /\bconst\s+handoff\s*=\s*await\s+settleRepairStorageHandoff\s*\(/g;
const HANDOFF_ASSIGNMENT = /\bhandoff\s*=(?!=)/g;
const HANDOFF_FIELD_ASSIGNMENT = /\bhandoff\.\w+\s*=(?!=)/g;
const HANDOFF_TOKEN = /\bhandoff\b/g;
const HANDOFF_STORAGE_PENDING = /\bhandoff\.storagePending\b/g;

/**
 * Popis problema u izvoru Edge funkcije `repair-docx`. Prazan popis znaci da lanac drzi na sve
 * cetiri karike:
 *  1. zastavica dolazi iz `localRepairFlagEnabled`, a varijable okoline se citaju samo u tom pozivu,
 *  2. posao se izdaje (`provisionLocalRepairJob`) i `issuedLocalRepair` se postavlja samo unutar
 *     grane `if (LOCAL_REPAIR_ENABLED ...)`,
 *  3. argument `localLaunch` za `settleRepairStorageHandoff` dolazi iskljucivo iz `issuedLocalRepair`,
 *  4. polje u ODGOVORU (`localRepair:`) dolazi iskljucivo iz `handoff.localRepair`, a `handoff` iz
 *     `settleRepairStorageHandoff` i nigdje se naknadno ne prepisuje.
 *
 * Karika 4 je dodana 2026-09-23 nakon pregleda: prva verzija je gledala samo redak s tokenom
 * `localLaunch` (dakle ARGUMENT poziva), pa je mutacija koja mijenja bas polje odgovora
 * (`localRepair: handoff.localRepair` u bilo sto drugo) prolazila s praznim popisom. Klijent bi
 * tada dobio valjan launch uz ugasenu zastavicu, a gate bi ostao zelen.
 *
 * Da lanac 3 do 4 nema rupu jamci `src/repair/local-runner/storage-handoff.ts`: `localRepair` u
 * rezultatu je iskljucivo proslijedjeni `localLaunch` (inace null).
 *
 * Adversarijalni pregled drugog alata (2026-09-23) dodao je jos sest provjera, svaku uz vlastitu
 * negativnu kontrolu u `tests/repair-local-edge-flag-source.test.ts`: lokalna definicija zastavice
 * umjesto uvoza, poziv koji ne cita `Deno.env.get`, uvjet grane u kojem zastavica nije nuzna
 * (`|| true`), logicko pridruzivanje i alias izdavaca, izracunat kljuc objekta i svaki spomen
 * `handoff` izvan dopustena tri oblika.
 *
 * Granica: gard cita tekst jedne datoteke. Preimenovanje svih sudionika ili premjestanje izdavanja
 * u drugi modul pod neutralnim imenom on ne vidi; to pokrivaju testovi tih modula.
 */
export function localRepairFlagProblems(source: string): string[] {
  const problems: string[] = [];
  const { noComments, codeOnly } = blank(source);

  if (!FLAG_MODULE_IMPORT.test(noComments)) {
    problems.push('nedostaje import localRepairFlagEnabled iz src/repair/local-runner/feature-flag.ts');
  }
  if (FLAG_LOCAL_DEFINITION.test(codeOnly)) {
    problems.push('localRepairFlagEnabled je definiran lokalno umjesto da se uvozi');
  }

  const flagCall = FLAG_FROM_FUNCTION.exec(codeOnly);
  if (!flagCall) {
    problems.push('LOCAL_REPAIR_ENABLED se ne racuna pozivom localRepairFlagEnabled(...)');
  }
  const callOpen = flagCall ? codeOnly.indexOf('(', flagCall.index) : -1;
  const callClose = callOpen >= 0 ? matchingClose(codeOnly, callOpen, '(') : -1;
  const envRead = new Set<string>();
  for (const hit of noComments.matchAll(ENV_READ)) {
    const at = hit.index ?? 0;
    if (callOpen < 0 || callClose < 0 || at < callOpen || at > callClose) {
      problems.push(`varijabla okoline REPAIR_LOCAL_${hit[1]} se cita izvan poziva localRepairFlagEnabled(...)`);
    } else {
      envRead.add(hit[1]);
    }
  }
  for (const name of ['ENABLED', 'DISABLED']) {
    if (!envRead.has(name)) {
      problems.push(`poziv localRepairFlagEnabled(...) ne cita Deno.env.get('REPAIR_LOCAL_${name}')`);
    }
  }

  for (const _hit of codeOnly.matchAll(COMPUTED_KEY)) {
    problems.push('izracunat kljuc objekta sakriva ime polja od garda; ovdje su dopusteni samo doslovni kljucevi');
  }

  const branchHeads = [...codeOnly.matchAll(/if \(LOCAL_REPAIR_ENABLED[^)\n]*\)/g)];
  if (branchHeads.length > 1) {
    problems.push('vise od jedne grane `if (LOCAL_REPAIR_ENABLED ...)`; gard ne zna koja stvarno ogradjuje izdavanje');
  }
  const head = branchHeads[0]?.[0] ?? '';
  if (head !== '' && !/^if \(LOCAL_REPAIR_ENABLED(?: &&[^)]*)?\)$/.test(head)) {
    problems.push('uvjet grane nije oblika `LOCAL_REPAIR_ENABLED && ...`, pa zastavica vise nije nuzan uvjet');
  }
  const branch = codeOnly.indexOf('if (LOCAL_REPAIR_ENABLED');
  if (branch < 0) {
    problems.push('nema grane `if (LOCAL_REPAIR_ENABLED ...)` koja ogradjuje izdavanje lokalnog popravka');
  }
  const branchOpen = branch >= 0 ? codeOnly.indexOf('{', branch) : -1;
  const branchClose = branchOpen >= 0 ? matchingClose(codeOnly, branchOpen, '{') : -1;
  const outsideBranch = (at: number): boolean =>
    branchOpen < 0 || branchClose < 0 || at < branchOpen || at > branchClose;

  const declaration = ISSUED_DECLARATION.exec(codeOnly);
  for (const hit of codeOnly.matchAll(ISSUED_ASSIGNMENT)) {
    const at = hit.index ?? 0;
    const isDeclaration = declaration !== null
      && at >= declaration.index
      && at < declaration.index + declaration[0].length;
    if (isDeclaration) continue;
    if (outsideBranch(at)) {
      problems.push('issuedLocalRepair se postavlja izvan grane koja provjerava LOCAL_REPAIR_ENABLED');
    }
  }

  const provisionImports = spans(codeOnly, PROVISION_IMPORT);
  let provisionInBranch = 0;
  for (const hit of codeOnly.matchAll(PROVISION_MENTION)) {
    const at = hit.index ?? 0;
    if (within(provisionImports, at)) continue;
    if (outsideBranch(at)) {
      problems.push('provisionLocalRepairJob se spominje izvan grane koja provjerava LOCAL_REPAIR_ENABLED');
    } else {
      provisionInBranch += 1;
    }
  }
  if (provisionInBranch === 0) {
    problems.push('nema poziva provisionLocalRepairJob; izdavanje lokalnog popravka vise ne prolazi ovuda');
  }

  const launchArguments = spans(codeOnly, LAUNCH_ARGUMENT);
  if (launchArguments.length === 0) {
    problems.push('argument localLaunch vise ne dolazi iz issuedLocalRepair?.launch ?? null');
  }
  for (const hit of codeOnly.matchAll(LAUNCH_TOKEN)) {
    if (!within(launchArguments, hit.index ?? 0)) {
      problems.push('localLaunch se predaje iz izvora koji nije issuedLocalRepair');
    }
  }

  const handoffSource = spans(codeOnly, HANDOFF_SOURCE_G);
  if (handoffSource.length !== 1) {
    problems.push('handoff se ne dobiva tocno jednom iz settleRepairStorageHandoff(...)');
  }
  if ([...codeOnly.matchAll(HANDOFF_ASSIGNMENT)].length > 1) {
    problems.push('handoff se prepisuje nakon settleRepairStorageHandoff(...)');
  }
  for (const _hit of codeOnly.matchAll(HANDOFF_FIELD_ASSIGNMENT)) {
    problems.push('polje objekta handoff se prepisuje nakon settleRepairStorageHandoff(...)');
  }

  const responseFields = spans(codeOnly, RESPONSE_FIELD);
  if (responseFields.length === 0) {
    problems.push('odgovor vise ne nosi polje localRepair: handoff.localRepair');
  }
  for (const hit of codeOnly.matchAll(RESPONSE_TOKEN)) {
    if (!within(responseFields, hit.index ?? 0)) {
      problems.push('polje localRepair u odgovoru dolazi iz izvora koji nije handoff.localRepair');
    }
  }

  /**
   * Svaki spomen `handoff` mora biti u jednom od tri dopustena oblika. Bez toga bi
   * `Object.assign(handoff, ...)` ili `Reflect.set(handoff, ...)` prepisao polje prije odgovora, a
   * redak s odgovorom ostao doslovno isti.
   */
  const handoffUses = [...handoffSource, ...spans(codeOnly, HANDOFF_STORAGE_PENDING), ...responseFields];
  for (const hit of codeOnly.matchAll(HANDOFF_TOKEN)) {
    if (!within(handoffUses, hit.index ?? 0)) {
      problems.push('handoff se koristi na nacin koji gard ne moze pratiti (dopusteni su samo storagePending i localRepair)');
    }
  }

  return problems;
}

const OFFER_BRANCH = /if\s*\(\s*out\.localRepair\s*\)\s*\{/g;
/** Staticki uvoz ponude bi je ucitao bezuvjetno, prije nego se za launch uopce zna. */
const OFFER_STATIC_IMPORT = /\bimport\b[^;\n]*from\s*['"][^'"]*local-repair-runner[^'"]*['"]/;
/** Dinamicki import ciji naziv modula NIJE doslovan niz; gard ne moze znati sto ucitava. */
const DYNAMIC_IMPORT_ANY = /\bimport\s*\(/g;
const DYNAMIC_IMPORT_LITERAL = /\bimport\s*\(\s*['"][^'"]+['"]\s*\)/g;
/** Imena iz modula ponude (render i config) i svaki njihov omotac istog korijena. */
const OFFER_IDENTIFIER = /\b\w*LocalRepairRunner\w*\b|\blocalRepairRunner\w*\b/g;
/** Svaki dinamicki import, da se provjeri spominje li mu staza i "local" i "repair". */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
/**
 * Moduli koji u imenu nose "local repair", a NISU ponuda runnera, pa se smiju ucitati bezuvjetno.
 * Popis je namjerno izricit: novi modul s tim imenom mora ovdje dobiti obrazlozenje, inace ga gard
 * prijavi. `local-repair-confirmation-flow` je potvrdni korak za rizicne popravke (receipts koje
 * server trazi prije izdavanja posla); on ne dohvaca artefakt runnera i nista ne nudi za preuzimanje.
 */
const OFFER_UNRELATED_MODULES = new Set(['./local-repair-confirmation-flow']);

/**
 * Popis problema u `src/ui/app.ts`: ponuda lokalnog runnera (staza modula, dinamicki import i
 * render) smije se spominjati SAMO unutar grane `if(out.localRepair){ ... }`. Kad server ne izda
 * launch (zastavica iskljucena), `out.localRepair` je null, pa se modul nikad ni ne dohvaca.
 *
 * Ovo je dokaz DOSEZLJIVOSTI, ne izvodjenja. Dokaz neizvodjenja daje
 * `tests/repair-local-client-offer-runtime.test.ts`, koji izvrsi bas taj isjecak stvarnog izvora.
 *
 * Granica koju gard NE moze prijeci: ponudu preseljenu u drugu datoteku pod neutralnim imenom (bez
 * "local-repair" u stazi i bez tih imena) pregled jedne datoteke ne vidi. Tu karika ostaje
 * `renderLocalRepairRunnerOffer`, koja bez https artefakta i prikovanog SHA-256 vraca null.
 */
export function localRepairOfferProblems(source: string): string[] {
  const problems: string[] = [];
  const { noComments, codeOnly } = blank(source);

  const branches = [...codeOnly.matchAll(OFFER_BRANCH)];
  if (branches.length === 0) {
    problems.push('nema grane `if(out.localRepair){` koja ogradjuje ponudu lokalnog runnera');
  }
  if (branches.length > 1) {
    problems.push('vise od jedne grane `if(out.localRepair){`; gard ne zna koja stvarno ogradjuje ponudu');
  }
  const branch = branches[0];
  const branchOpen = branch ? codeOnly.indexOf('{', branch.index) : -1;
  const branchClose = branchOpen >= 0 ? matchingClose(codeOnly, branchOpen, '{') : -1;

  const outside = (at: number): boolean => branchOpen < 0 || branchClose < 0 || at < branchOpen || at > branchClose;

  if (OFFER_STATIC_IMPORT.test(noComments)) {
    problems.push('modul ponude lokalnog popravka se uvozi staticki, dakle ucitava bezuvjetno');
  }
  const literalImports = spans(noComments, DYNAMIC_IMPORT_LITERAL);
  for (const hit of noComments.matchAll(DYNAMIC_IMPORT_ANY)) {
    const at = hit.index ?? 0;
    if (within(literalImports, at)) continue;
    problems.push('dinamicki import bez doslovnog naziva modula; gard ne moze znati sto se ucitava');
  }
  for (const hit of codeOnly.matchAll(OFFER_IDENTIFIER)) {
    if (outside(hit.index ?? 0)) {
      problems.push('ponuda lokalnog runnera se poziva izvan grane if(out.localRepair)');
    }
  }
  for (const hit of noComments.matchAll(DYNAMIC_IMPORT)) {
    const specifier = hit[1].toLowerCase();
    if (!(specifier.includes('local') && specifier.includes('repair'))) continue;
    if (OFFER_UNRELATED_MODULES.has(hit[1])) continue;
    if (outside(hit.index ?? 0)) {
      problems.push('modul ponude lokalnog popravka se dohvaca izvan grane if(out.localRepair)');
    }
  }
  return problems;
}
