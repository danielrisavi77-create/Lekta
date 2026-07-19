/**
 * Deterministicka SAVJETODAVNA provjera cestih hrvatskih gramatickih i stilskih pogresaka u
 * akademskom tekstu. READ-ONLY i NE-GENERATIVNA (kao registerLint/typoLint): samo oznacava i
 * predlaze, NIKAD ne prepisuje tekst i NE ulazi u bodovnu ocjenu. Radi lokalno nad odlomcima;
 * details.grammarLint se ne salje na mrezu (sanitizeAnalysisResult zadrzava samo whitelist).
 *
 * NIZAK FALSE-POSITIVE je apsolutni prioritet: bolje propustiti nego lazno optuziti. Zato:
 *  - poklapanje je CJELORIJECNO (granica bez \b koji je ASCII i bez lookbehind zbog Safarija <16.4):
 *    vodeca granica je (^|ne-slovo), izraz je grupa 2, prateca granica je lookahead. Time izvedenice
 *    NE okidaju pravilo (npr. "nemogu" ne hvata "nemoguce", "talas" ne hvata "talasoterapija").
 *  - dio provjera je case-sensitive (samo mala slova) da vlastita imena i kratice (Netreba, Ostrvo,
 *    JEL) ne okidaju; posljedica je da se recenicno-inicijalne (velikim slovom) greske propustaju.
 *  - rizicne kategorije su namjerno SUZENE na lingvisticki cvrst podskup (npr. s/sa samo "sa+samoglasnik"
 *    i "s mnom"; da+prezent samo 1. lice modalni glagol + da + glagol na -m/-mo, tj. isti subjekt).
 *
 * Pravila potjecu iz adversarijalno verificiranog skupa (workflow), pa su rucno kurirana: spojena,
 * suzena i procisceni su ocito pogresni prijedlozi (npr. "izvjestaj" JEST hrvatski standard).
 */

export interface GrammarFinding {
  /** 0-based indeks odlomka (poravnat s registerLint/typoLint; UI pribraja +1). */
  paragraphIndex: number;
  kind: string;
  excerpt: string;
  suggestion: string;
}

// Nazivi provjera (kind): stabilni hrvatski identifikatori.
export const KIND_NE_SPOJENO = 'ne-spojeno';
export const KIND_KONDICIONAL = 'kondicional';
export const KIND_DA_PREZENT = 'da-prezent';
export const KIND_VEZNIK = 'veznik';
export const KIND_JE_LI = 'je-li';
export const KIND_S_SA = 's-sa';
export const KIND_SRBIZAM = 'srbizam';
export const KIND_PLEONAZAM = 'pleonazam';

export const GRAMMAR_KIND_LABELS: Record<string, string> = {
  [KIND_NE_SPOJENO]: 'Nijek „ne” (rastavljeno)',
  [KIND_KONDICIONAL]: 'Kondicional (bih/bi/bismo/biste)',
  [KIND_DA_PREZENT]: '„da” + prezent umjesto infinitiva',
  [KIND_VEZNIK]: 'Veznik/prijedlog (s obzirom, u vezi)',
  [KIND_JE_LI]: 'Upitna čestica „je li”',
  [KIND_S_SA]: 'Prijedlog s/sa',
  [KIND_SRBIZAM]: 'Nestandardni oblik',
  [KIND_PLEONAZAM]: 'Pleonazam/suvišnost',
};

const EXCERPT_RADIUS = 24;
const EXCERPT_MAX = 70;

function excerptAt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS);
  const ex = text.slice(start, end).trim();
  return ex.length > EXCERPT_MAX ? ex.slice(0, EXCERPT_MAX).trimEnd() : ex;
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Iterira cjelorijecna poklapanja bilo kojeg izraza (duzi imaju prednost u alternaciji). */
function* boundedFind(
  text: string,
  phrases: string[],
  caseSensitive: boolean,
): Generator<{ m: string; at: number }> {
  if (!phrases.length) return;
  const alt = phrases.slice().sort((a, b) => b.length - a.length).map(esc).join('|');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${alt})(?=$|[^\\p{L}\\p{N}])`, caseSensitive ? 'gu' : 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    yield { m: m[2], at: m.index + m[1].length };
    if (m.index === re.lastIndex) re.lastIndex++; // zastita od praznog poklapanja
  }
}

interface PhraseOpts {
  caseSensitive?: boolean;
  /** Preskoci ako izraz slijedi rijec "li" (npr. "bi li" je ispravan 3. lice, nije greska). */
  skipIfLi?: boolean;
  /** Preskoci ako je poklopljeni tekst SVE velikim slovima (kratica, npr. JEL). */
  skipAllCaps?: boolean;
  /** Preskoci ako izrazu neposredno prethodi samostalno „s”/„sa” (npr. „obzirom” unutar ispravnog
   *  „s obzirom”). Bez lookbehinda: provjerava tekst prije poklapanja. */
  skipIfPrecededByS?: boolean;
}

/** Generic runner: za svaki izraz iz mape prijedlog je pridruzena vrijednost. */
function runPhraseMap(
  paragraphs: string[],
  out: GrammarFinding[],
  kind: string,
  entries: Array<[string, string]>,
  opts: PhraseOpts = {},
): void {
  const phrases = entries.map((e) => e[0]);
  const sugg = new Map(entries.map((e) => [e[0].toLowerCase(), e[1]]));
  paragraphs.forEach((p, pi) => {
    for (const hit of boundedFind(p, phrases, !!opts.caseSensitive)) {
      if (opts.skipAllCaps && hit.m.length > 1 && hit.m === hit.m.toUpperCase() && hit.m !== hit.m.toLowerCase()) continue;
      if (opts.skipIfLi) {
        const after = p.slice(hit.at + hit.m.length);
        if (/^\s+li(?:$|[^\p{L}\p{N}])/u.test(after)) continue;
      }
      if (opts.skipIfPrecededByS && /(?:^|[^\p{L}\p{N}])(?:s|sa)\s+$/iu.test(p.slice(0, hit.at))) continue;
      const s = sugg.get(hit.m.toLowerCase());
      if (s === undefined) continue;
      out.push({ paragraphIndex: pi, kind, excerpt: excerptAt(p, hit.at, hit.m.length), suggestion: s });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// 1. Nijek "ne" pisan sastavljeno s glagolom (treba rastavljeno). Case-sensitive (mala slova) da
//    prezimena (Netreba, Nedam) i recenicno-inicijalne velike ne okidaju. Cjelorijecno poklapanje
//    automatski izuzima izvedenice (nemoguce, neznanje, nebitan, nevolja...).
// ---------------------------------------------------------------------------------------------
const NE_VERB = [
  'nemogu', 'nemože', 'nemožeš', 'nemožemo', 'nemožete',
  'neznam', 'neznaš', 'nezna', 'neznamo', 'neznate', 'neznaju',
  'netreba', 'netrebam', 'netrebaš', 'netrebamo', 'netrebate', 'netrebaju', 'netrebalo', 'netrebao', 'netrebala', 'netrebali', 'netrebale',
  'nebi', 'nebih', 'nebismo', 'nebiste',
  'nesmije', 'nesmiješ', 'nesmijem', 'nesmijemo', 'nesmijete', 'nesmiju',
  'nedam', 'nedaš', 'nedamo', 'nedaju',
  'neželim', 'neželiš', 'neželi', 'neželimo', 'neželite', 'nežele',
  'nevolim', 'nevoliš', 'nevoli', 'nevolimo', 'nevolite', 'nevole',
];

function checkNeSpojeno(paragraphs: string[], out: GrammarFinding[]): void {
  const entries = NE_VERB.map((w) => [w, `nijek „ne” piše se rastavljeno: „ne ${w.slice(2)}”`] as [string, string]);
  runPhraseMap(paragraphs, out, KIND_NE_SPOJENO, entries, { caseSensitive: true });
}

// ---------------------------------------------------------------------------------------------
// 2. Kondicional: slaganje pomocnog glagola s licem uz izrazenu zamjenicu. Preskace "bi li" (upitni
//    3. lice). Cjelorijecna zamjenica ("moja bi", "svi bi" ne okidaju).
// ---------------------------------------------------------------------------------------------
const KONDICIONAL: Array<[string, string]> = [
  ['ja bi', 'ja bih'], ['ja bismo', 'ja bih'],
  ['mi bi', 'mi bismo'], ['mi bih', 'mi bismo'],
  ['vi bi', 'vi biste'], ['vi bih', 'vi biste'], ['vi bismo', 'vi biste'],
];

function checkKondicional(paragraphs: string[], out: GrammarFinding[]): void {
  const entries = KONDICIONAL.map(([t, c]) => [t, `slaganje kondicionala s licem: „${t}” → „${c}”`] as [string, string]);
  runPhraseMap(paragraphs, out, KIND_KONDICIONAL, entries, { skipIfLi: true });
}

// ---------------------------------------------------------------------------------------------
// 3. "da" + prezent umjesto infinitiva (srbizam) uz ISTI subjekt: modalni/fazni glagol u 1. licu
//    (jd. ili mn.) + "da" + glagol koji zavrsava na -m/-mo (1. lice). Time je subjekt implicitno
//    isti (razlicit subjekt npr. "moram da dodjes" -> zavrsava na -s, ne okida). 3. lice (mora/moze,
//    kolizija s "more/sea" i epistemickim "mora da je") je NAMJERNO izostavljeno.
// ---------------------------------------------------------------------------------------------
const DA_MODALI_1 = [
  'moram', 'moramo', 'mogu', 'možemo', 'želim', 'želimo', 'hoću', 'hoćemo',
  'trebam', 'trebamo', 'pokušavam', 'pokušavamo', 'namjeravam', 'namjeravamo',
  'počinjem', 'počinjemo', 'nastavljam', 'nastavljamo', 'prestajem', 'prestajemo',
];

function checkDaPrezent(paragraphs: string[], out: GrammarFinding[]): void {
  const alt = DA_MODALI_1.slice().sort((a, b) => b.length - a.length).map(esc).join('|');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])((?:${alt}) da (\\p{L}+m(?:o)?))(?=$|[^\\p{L}\\p{N}])`, 'giu');
  paragraphs.forEach((p, pi) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p)) !== null) {
      const at = m.index + m[1].length;
      out.push({
        paragraphIndex: pi,
        kind: KIND_DA_PREZENT,
        excerpt: excerptAt(p, at, m[2].length),
        suggestion: 'uz isti subjekt hrvatski standard traži infinitiv umjesto „da” + prezent (npr. „moram ići” umjesto „moram da idem”)',
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  });
}

// ---------------------------------------------------------------------------------------------
// 4. Veznici/prijedlozi: "s obzirom na to da", "u vezi s" + instrumental. Cjelorijecno; duzi izrazi
//    imaju prednost (obzirom na to da prije obzirom na).
// ---------------------------------------------------------------------------------------------
const VEZNIK: Array<[string, string]> = [
  ['obzirom na to da', 's obzirom na to da'], ['obzirom na to', 's obzirom na to'],
  ['obzirom da', 's obzirom na to da'], ['obzirom na', 's obzirom na'],
  ['sa obzirom', 's obzirom'],
  ['s obzirom da', 's obzirom na to da'], ['s obzirom kako', 's obzirom na to da'],
  ['u vezi toga', 'u vezi s tim'], ['u vezi tog', 'u vezi s tim'],
  ['u vezi čega', 'u vezi s čim'], ['u vezi ovoga', 'u vezi s ovim'],
  ['u vezi onoga', 'u vezi s onim'], ['u vezi svega', 'u vezi sa svim'],
  ['u vezi navedenog', 'u vezi s navedenim'], ['u vezi navedenoga', 'u vezi s navedenim'],
  ['u vezi vašeg', 'u vezi s Vašim'], ['u vezi vaše', 'u vezi s Vašom'],
  ['u svezi s', 'u vezi s'], ['u svezi sa', 'u vezi sa'],
  ['u svezi toga', 'u vezi s tim'], ['u svezi navedenog', 'u vezi s navedenim'],
  ['vezano za navedeno', 'u vezi s navedenim'], ['vezano uz navedeno', 'u vezi s navedenim'],
  ['vezano na navedeno', 'u vezi s navedenim'], ['vezano za to da', 'u vezi s tim da'],
];

function checkVeznik(paragraphs: string[], out: GrammarFinding[]): void {
  const entries = VEZNIK.map(([t, c]) => [t, `hrvatski standard: „${t}” → „${c}”`] as [string, string]);
  runPhraseMap(paragraphs, out, KIND_VEZNIK, entries, { skipIfPrecededByS: true });
}

// ---------------------------------------------------------------------------------------------
// 5. Upitna cestica "je li" (i inverzija) umjesto "jeli/jel/da li/dal". skipAllCaps stiti kraticu JEL.
//    "jeli su/smo/ste" (glagol jesti) izuzet je jer nije u triggerima (samo "jeli" + upitna rijec).
// ---------------------------------------------------------------------------------------------
const JE_LI: Array<[string, string]> = [
  ['jeli to', 'je li to'], ['jeli tako', 'je li tako'], ['jeli istina', 'je li istina'],
  ['jeli moguće', 'je li moguće'], ['jeli moguce', 'je li moguće'],
  ['jeli točno', 'je li točno'], ['jeli tocno', 'je li točno'],
  ['jeli potrebno', 'je li potrebno'], ['jeli ovo', 'je li ovo'], ['jeli stvarno', 'je li stvarno'],
  ['jel', 'je li'], ["jel'", 'je li'], ['jelda', 'je li'], ['jel da', 'je li'],
  ['da li je', 'je li'], ['da li su', 'jesu li'], ['da li će', 'hoće li'], ['da li ce', 'hoće li'],
  ['da li ima', 'ima li'], ['da li može', 'može li'], ['da li moze', 'može li'],
  ['da li mogu', 'mogu li'], ['da li postoji', 'postoji li'], ['da li treba', 'treba li'],
  ["dal'", 'je li'], ['dal je', 'je li'], ['dal li', 'je li'], ['dal ima', 'ima li'],
];

function checkJeLi(paragraphs: string[], out: GrammarFinding[]): void {
  const entries = JE_LI.map(([t, c]) => [t, `upitna čestica: „${t}” → „${c}”`] as [string, string]);
  runPhraseMap(paragraphs, out, KIND_JE_LI, entries, { skipAllCaps: true });
}

// ---------------------------------------------------------------------------------------------
// 6. Prijedlog s/sa (SUZENO na lingvisticki cvrste slucajeve): "sa" + rijec na samoglasnik uvijek je
//    "s" (sa autom -> s autom); ispred "mnom" uvijek "sa" (s mnom -> sa mnom). Opci "sa + suglasnik"
//    (klasteri) je NAMJERNO izostavljen (visok FP).
// ---------------------------------------------------------------------------------------------
function checkSSa(paragraphs: string[], out: GrammarFinding[]): void {
  // 6a. "sa" + rijec koja pocinje samoglasnikom -> "s". Preskace set-fraze "sa i bez" / "sa ili".
  const reVok = /(^|[^\p{L}\p{N}])(sa)\s+(?=[aeiouAEIOU])(\p{L}+)/gu;
  // 6b. "s mnom" -> "sa mnom".
  paragraphs.forEach((p, pi) => {
    reVok.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = reVok.exec(p)) !== null) {
      const next = (m[3] || '').toLowerCase();
      if (next === 'i' || next === 'ili') continue; // "sa i bez", "sa ili bez"
      const at = m.index + m[1].length;
      out.push({
        paragraphIndex: pi,
        kind: KIND_S_SA,
        excerpt: excerptAt(p, at, 2),
        suggestion: 'ispred riječi na samoglasnik piše se „s”, ne „sa” (npr. „s autom”, „s Ivanom”)',
      });
      if (m.index === reVok.lastIndex) reVok.lastIndex++;
    }
    for (const hit of boundedFind(p, ['s mnom'], false)) {
      out.push({
        paragraphIndex: pi,
        kind: KIND_S_SA,
        excerpt: excerptAt(p, hit.at, hit.m.length),
        suggestion: 'ispred „mnom” piše se „sa”: „sa mnom”',
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// 7. Nestandardni (srpski) oblici -> hrvatski standard. Case-sensitive (mala slova) da vlastita
//    imena/naslovi (Ostrvo s blagom, Saobracajni fakultet) ne okidaju. Cjelorijecno (izvedenice
//    poput "talasoterapija" izuzete). Grupe: forme -> osnovni standard.
// ---------------------------------------------------------------------------------------------
const SRBIZMI: Array<{ forms: string[]; std: string }> = [
  { forms: ['hiljada', 'hiljadu', 'hiljade', 'hiljadi', 'hiljadom', 'hiljadama'], std: 'tisuća' },
  { forms: ['talas', 'talasa', 'talasu', 'talasom', 'talasi', 'talase', 'talasima'], std: 'val' },
  { forms: ['vazduh', 'vazduha', 'vazduhu', 'vazduhom', 'vazdušni', 'vazdušna', 'vazdušno', 'vazdušne', 'vazdušnih', 'vazdušnog'], std: 'zrak (zračni)' },
  { forms: ['izvinjenje', 'izvinjenja', 'izvinjenju', 'izvinjenjem', 'izviniti', 'izvinite', 'izvini', 'izvinjavam', 'izvinjava', 'izvinjavamo'], std: 'isprika / ispričati se' },
  { forms: ['porodični', 'porodična', 'porodično', 'porodičnu', 'porodičnog', 'porodičnom', 'porodičnoj', 'porodičnih', 'porodičnim'], std: 'obiteljski' },
  { forms: ['uslov', 'uslova', 'uslovu', 'uslovom', 'uslovi', 'uslovima', 'uslove', 'uslovni', 'uslovna', 'uslovno', 'uslovljen', 'uslovljena', 'uslovljava', 'bezuslovno', 'bezuslovan'], std: 'uvjet (uvjetovati)' },
  { forms: ['sudija', 'sudije', 'sudiji', 'sudiju', 'sudijom', 'sudijama', 'sudijski', 'sudijska', 'sudijsko'], std: 'sudac (suca, sutkinja)' },
  { forms: ['ostrvo', 'ostrva', 'ostrvu', 'ostrvom', 'ostrvima', 'ostrvski', 'ostrvska', 'ostrvsko'], std: 'otok (otočni)' },
  { forms: ['hljeb', 'hljeba', 'hljebu', 'hljebom', 'hleb', 'hleba', 'hlebu', 'hlebom'], std: 'kruh' },
  { forms: ['sedmično', 'sedmični', 'sedmična', 'sedmične', 'sedmičnu', 'sedmičnog', 'sedmičnom', 'sedmičnih', 'sedmičnim'], std: 'tjedni / tjedno' },
  { forms: ['saobraćaj', 'saobraćaja', 'saobraćaju', 'saobraćajem', 'saobraćajni', 'saobraćajna', 'saobraćajno', 'saobraćajnih', 'saobraćajnica'], std: 'promet (prometni)' },
  { forms: ['fabrika', 'fabrike', 'fabrici', 'fabriku', 'fabrikom', 'fabrikama', 'fabrički', 'fabrička', 'fabričko'], std: 'tvornica (tvornički)' },
  { forms: ['sopstven', 'sopstveni', 'sopstvena', 'sopstveno', 'sopstvenu', 'sopstvenom', 'sopstvenih', 'sopstvenim', 'sopstvenog'], std: 'vlastiti' },
  { forms: ['obezbijediti', 'obezbijedi', 'obezbijedio', 'obezbijedila', 'obezbijeđen', 'obezbjeđenje', 'obezbediti', 'obezbedi', 'obezbedio', 'obezbeđenje'], std: 'osigurati (osiguranje)' },
  { forms: ['prisustvo', 'prisustva', 'prisustvu', 'prisustvom', 'prisustvovati', 'prisustvuje', 'prisustvujem', 'prisustvuju', 'prisustvovao', 'prisustvovala'], std: 'nazočnost / prisutnost' },
  { forms: ['učestvovati', 'učestvuje', 'učestvujem', 'učestvuju', 'učestvujemo', 'učestvovao', 'učestvovala', 'učešće', 'učešća', 'učesnik', 'učesnici', 'učesnika'], std: 'sudjelovati / sudionik' },
  { forms: ['opšti', 'opšta', 'opšte', 'opšteg', 'opštem', 'opštu', 'opštih', 'opštim', 'opština', 'opštine', 'opštini', 'opštinski'], std: 'opći / općina' },
];

function checkSrbizmi(paragraphs: string[], out: GrammarFinding[]): void {
  const entries: Array<[string, string]> = [];
  for (const g of SRBIZMI) for (const f of g.forms) entries.push([f, `nestandardno „${f}”; hrvatski standard: „${g.std}”`]);
  runPhraseMap(paragraphs, out, KIND_SRBIZAM, entries, { caseSensitive: true });
}

// ---------------------------------------------------------------------------------------------
// 8. Pleonazmi i suvisne konstrukcije (stil). Cjelorijecno.
// ---------------------------------------------------------------------------------------------
const PLEONAZMI: Array<[string, string]> = [
  ['čak štoviše', 'zadržite „štoviše” ili „čak”'], ['cak stovise', 'zadržite „štoviše” ili „čak”'],
  ['otprilike oko', 'zadržite jedan izraz: „oko” ili „otprilike”'], ['približno oko', 'zadržite jedan izraz: „oko” ili „približno”'],
  ['oko cca', 'zadržite jedan izraz'], ['cca oko', 'zadržite jedan izraz'],
  ['vremenski period', 'dovoljno je „razdoblje”'], ['vremenskog perioda', 'dovoljno je „razdoblja”'],
  ['vremenskom periodu', 'dovoljno je „razdoblju”'], ['vremenskim periodom', 'dovoljno je „razdobljem”'],
  ['zajednička suradnja', 'dovoljno je „suradnja”'], ['zajedničke suradnje', 'dovoljno je „suradnje”'],
  ['zajedničku suradnju', 'dovoljno je „suradnju”'], ['zajedničkom suradnjom', 'dovoljno je „suradnjom”'],
  ['silaziti dolje', 'dovoljno je „silaziti”'], ['silazi dolje', 'dovoljno je „silazi”'],
  ['penjati se gore', 'dovoljno je „penjati se”'], ['penje se gore', 'dovoljno je „penje se”'],
  ['vratiti se natrag', 'dovoljno je „vratiti se”'], ['vratiti natrag', 'dovoljno je „vratiti se”'],
  ['vratio se natrag', 'dovoljno je „vratio se”'], ['vratili se natrag', 'dovoljno je „vratili se”'],
  ['vratili natrag', 'dovoljno je „vratili se”'], ['vrati se natrag', 'dovoljno je „vrati se”'],
  ['mala sitnica', 'dovoljno je „sitnica”'], ['male sitnice', 'dovoljno je „sitnice”'],
  ['kako-tako', 'preciznije: „djelomično” ili „osrednje”'], ['kako–tako', 'preciznije: „djelomično” ili „osrednje”'],
];

function checkPleonazmi(paragraphs: string[], out: GrammarFinding[]): void {
  const entries = PLEONAZMI.map(([t, c]) => [t, `pleonazam/suvišnost: „${t}” — ${c}`] as [string, string]);
  runPhraseMap(paragraphs, out, KIND_PLEONAZAM, entries);
}

/** Pokrece sve gramaticke/stilske provjere nad odlomcima; nalazi sortirani po indeksu odlomka. */
export function grammarLint(paragraphs: string[]): GrammarFinding[] {
  const out: GrammarFinding[] = [];
  const ps = paragraphs || [];
  checkNeSpojeno(ps, out);
  checkKondicional(ps, out);
  checkDaPrezent(ps, out);
  checkVeznik(ps, out);
  checkJeLi(ps, out);
  checkSSa(ps, out);
  checkSrbizmi(ps, out);
  checkPleonazmi(ps, out);
  out.sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  return out;
}

/** Sazetak: ukupan broj i raspodjela po vrsti provjere. */
export function grammarLintSummary(findings: GrammarFinding[]): { total: number; byKind: Record<string, number> } {
  const byKind: Record<string, number> = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  return { total: findings.length, byKind };
}
