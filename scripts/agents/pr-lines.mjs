#!/usr/bin/env node
// Dva obvezna retka opisa PR-a (T58): `Neto redaka: +<dodano>/-<uklonjeno>` i
// `Nove ovisnosti: nema | <popis paketa>`.
//
// Ciste funkcije (`netoRedaka`, `noveOvisnosti`, `retciOpisa`, `provjeriOpisPr`) ne pokrecu git ni
// mrezu; testira ih `tests/pr-lines.test.ts`. CLI (`--provjeri`) koristi CI job `pr-opis` u
// `.github/workflows/pr-opis.yml`: tijelo PR-a cita iz okoline (PR_BODY), a package.json
// baze i heada iz gita, pa nijedan korisnicki tekst ne prolazi kroz shell.
//
// Spajanje u `.claude/workflows/lekta-lean.js` i `lekta-no-fable-coding.js` ide zasebno: te skripte
// nemaju shell, pa bi shortstat i package.json morao vratiti agent kroz shemu, sto mijenja tok agenata.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SEKCIJE_OVISNOSTI = ['dependencies', 'devDependencies'];

const SHORTSTAT_RE =
  /^\s*(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?\s*$/;

/**
 * Pretvara izlaz `git diff --shortstat` u `+<dodano>/-<uklonjeno>`.
 * Prazan izlaz znaci da diff nema promjena (+0/-0). Sve ostalo sto nije shortstat baca gresku:
 * djelomican ili pogresan ulaz mora srusiti mjerenje, ne dati +0/-0.
 */
export function netoRedaka(diffShortstat) {
  if (typeof diffShortstat !== 'string') {
    throw new TypeError('netoRedaka: ocekivan string (izlaz git diff --shortstat)');
  }
  const tekst = diffShortstat.replace(/\r/g, '').trim();
  if (tekst === '') return '+0/-0';
  const m = SHORTSTAT_RE.exec(tekst);
  if (!m) throw new Error(`netoRedaka: nije izlaz git diff --shortstat: "${tekst}"`);
  return `+${Number(m[2] ?? 0)}/-${Number(m[3] ?? 0)}`;
}

function kaoPaket(pkg, oznaka) {
  if (pkg == null) return {};
  const obj = typeof pkg === 'string' ? JSON.parse(pkg) : pkg;
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TypeError(`noveOvisnosti: ${oznaka} nije package.json objekt`);
  }
  return obj;
}

function imenaOvisnosti(pkg) {
  const imena = new Set();
  for (const sekcija of SEKCIJE_OVISNOSTI) {
    const s = pkg[sekcija];
    if (s == null) continue;
    if (typeof s !== 'object' || Array.isArray(s)) {
      throw new TypeError(`noveOvisnosti: "${sekcija}" nije objekt`);
    }
    for (const ime of Object.keys(s)) imena.add(ime);
  }
  return imena;
}

/**
 * Paketi koji postoje u `dependencies` ili `devDependencies` heada, a u bazi ni u jednoj od te dvije
 * sekcije. Premjestanje izmedju sekcija i promjena verzije nisu nova ovisnost. `basePkg` smije biti
 * null (package.json u bazi ne postoji). Prima objekt ili JSON string. Vraca sortiran niz.
 */
export function noveOvisnosti(basePkg, headPkg) {
  const base = imenaOvisnosti(kaoPaket(basePkg, 'base'));
  const head = imenaOvisnosti(kaoPaket(headPkg, 'head'));
  return [...head].filter((ime) => !base.has(ime)).sort();
}

/** Oba obvezna retka, spremna za lijepljenje u opis PR-a ili izvjestaj workflowa. */
export function retciOpisa({ diffShortstat, basePkg, headPkg }) {
  const nove = noveOvisnosti(basePkg, headPkg);
  return [
    `Neto redaka: ${netoRedaka(diffShortstat)}`,
    `Nove ovisnosti: ${nove.length ? nove.join(', ') : 'nema'}`,
  ];
}

const NETO_RE = /^[ \t>*-]*Neto redaka:[ \t]*\+\d+\/-\d+[ \t]*$/m;
const OVISNOSTI_RE = /^[ \t>*-]*Nove ovisnosti:[ \t]*(\S.*?)[ \t]*$/m;

/**
 * Provjera opisa PR-a. Vraca popis gresaka (prazan = u redu).
 * `stvarneNove` je rezultat `noveOvisnosti(base, head)`: ako opis kaze `nema` a diff dodaje paket,
 * to je greska. Popis u opisu se ne usporeduje ime po ime; trazi se samo da ne tvrdi `nema` kad nije.
 * HTML komentari se izbacuju prije provjere, pa redak iz predloska ostavljen u komentaru ne vrijedi.
 */
export function provjeriOpisPr(body, stvarneNove = []) {
  const tekst = String(body ?? '').replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const greske = [];
  if (!NETO_RE.test(tekst)) {
    greske.push('Nedostaje redak `Neto redaka: +<dodano>/-<uklonjeno>` (npr. `Neto redaka: +120/-4`).');
  }
  const m = OVISNOSTI_RE.exec(tekst);
  if (!m) {
    greske.push('Nedostaje redak `Nove ovisnosti: nema | <popis paketa>`.');
  } else {
    const vrijednost = m[1].replace(/`/g, '').trim();
    if (/^<.*>$/.test(vrijednost) || vrijednost.includes('|')) {
      greske.push(`Redak \`Nove ovisnosti\` je ostao kao predlozak: "${vrijednost}".`);
    } else if (vrijednost.toLowerCase() === 'nema' && stvarneNove.length) {
      greske.push(
        `Opis kaze \`Nove ovisnosti: nema\`, a package.json dodaje: ${stvarneNove.join(', ')}.`,
      );
    }
  }
  return greske;
}

/**
 * Dependabot (koordinator lekta-37, 2026-10-04). `@dependabot rebase` prepisuje tijelo PR-a i brise rucno
 * dodane retke, a close/reopen brise granu (#280). Za PR ciji je autor Dependabot provjera zato ne trazi
 * retke u opisu: oba retka racuna sama iz diffa (`retciDependabot`) i prolazi. Autor se prepoznaje po
 * loginu I tipu racuna iz dogadjaja PR-a; za svakog drugog autora ponasanje je nepromijenjeno.
 *
 * Iznimka vrijedi SAMO kad PR mijenja iskljucivo podrzane manifeste (korijenski package.json i
 * package-lock.json), jer samo za njih provjera zna izracunati `Nove ovisnosti`. Bilo koja druga datoteka
 * (requirements*.txt, deno.lock, ugnijezdeni package.json...) obara provjeru s jasnom porukom: provjera
 * nikad ne tvrdi `nema` za ekosustav koji ne cita.
 *
 * Ovo je opisni gate, ne sigurnosni: pull_request job iz forka moze mijenjati i ovu skriptu.
 */
export const DEPENDABOT_LOGIN = 'dependabot[bot]';
export const DEPENDABOT_PODRZANE_DATOTEKE = ['package.json', 'package-lock.json'];

export function jeDependabot(autor) {
  return autor != null && autor.login === DEPENDABOT_LOGIN && autor.type === 'Bot';
}

/** Ovisnosti koje postoje i u bazi i u headu, a verzija se promijenila, kao `ime@verzija` (samo informativno). */
export function promjeneVerzija(basePkg, headPkg) {
  const base = kaoPaket(basePkg, 'base');
  const head = kaoPaket(headPkg, 'head');
  const verzija = (pkg, ime) => SEKCIJE_OVISNOSTI.map((s) => pkg[s]?.[ime]).find((v) => v !== undefined);
  const uBazi = imenaOvisnosti(base);
  return [...imenaOvisnosti(head)]
    .filter((ime) => uBazi.has(ime) && verzija(base, ime) !== verzija(head, ime))
    .sort()
    .map((ime) => `${ime}@${verzija(head, ime)}`);
}

/**
 * Retci koje provjera sama racuna za Dependabot PR. `Nove ovisnosti` koristi ISTU definiciju kao za ljude
 * (`noveOvisnosti`: kljuc kojeg u bazi nije bilo); promjena verzije nije nova ovisnost i ide u zaseban redak.
 */
export function retciDependabot({ diffShortstat, basePkg, headPkg }) {
  const verzije = promjeneVerzija(basePkg, headPkg);
  return [
    ...retciOpisa({ diffShortstat, basePkg, headPkg }),
    `Promjene verzija: ${verzije.length ? verzije.join(', ') : 'nema'}`,
  ];
}

/** Datoteke diffa koje iznimka za Dependabot ne podrzava (izvan DEPENDABOT_PODRZANE_DATOTEKE). */
export function nepodrzaneDatoteke(datoteke) {
  if (!Array.isArray(datoteke)) throw new TypeError('nepodrzaneDatoteke: ocekivan popis datoteka diffa');
  return datoteke.filter((d) => !DEPENDABOT_PODRZANE_DATOTEKE.includes(d)).sort();
}

/**
 * Provjera opisa za zadanog autora. Dependabot prolazi bez redaka samo kad diff dira iskljucivo podrzane
 * manifeste; inace pada s porukom. Svi ostali autori idu kroz `provjeriOpisPr`, nepromijenjeno.
 */
export function provjeriPrZaAutora(body, stvarneNove, autor, datoteke) {
  if (!jeDependabot(autor)) return provjeriOpisPr(body, stvarneNove);
  const izvan = nepodrzaneDatoteke(datoteke);
  if (izvan.length) {
    return [
      `Dependabot iznimka podrzava samo ${DEPENDABOT_PODRZANE_DATOTEKE.join(' i ')}; ovaj PR mijenja i: ${izvan.join(', ')}. `
        + 'Nove ovisnosti za te datoteke se ne racunaju, pa retke treba dodati u opis rucno.',
    ];
  }
  return [];
}

function gitShowPackage(ref) {
  try {
    return execFileSync('git', ['show', `${ref}:package.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    // Samo "datoteka ne postoji u tom refu" je legitimno null; sve drugo (nepostojeci ref, plitki
    // checkout) mora srusiti provjeru umjesto da tiho kaze "nema novih ovisnosti".
    const stderr = String(err.stderr ?? '');
    if (/does not exist in|exists on disk, but not in/.test(stderr)) return null;
    throw new Error(`git show ${ref}:package.json nije uspio: ${stderr.trim() || err.message}`);
  }
}

function ulazIzGita(baseRef, headRef) {
  return {
    diffShortstat: execFileSync('git', ['diff', '--shortstat', `${baseRef}...${headRef}`], { encoding: 'utf8' }),
    datoteke: execFileSync('git', ['diff', '--name-only', `${baseRef}...${headRef}`], { encoding: 'utf8' })
      .replace(/\r/g, '').split('\n').filter(Boolean),
    basePkg: gitShowPackage(baseRef),
    headPkg: gitShowPackage(headRef),
  };
}

function glavni(argv) {
  const [naredba, ...ostalo] = argv;
  if (naredba === '--provjeri') {
    const [baseRef, headRef] = ostalo;
    if (!baseRef || !headRef) throw new Error('uporaba: pr-lines.mjs --provjeri <baseRef> <headRef> (PR_BODY u okolini)');
    const ulaz = ulazIzGita(baseRef, headRef);
    console.log(`Izracunato za ovaj PR: ${retciOpisa(ulaz).join(' | ')}`);
    const nove = noveOvisnosti(ulaz.basePkg, ulaz.headPkg);
    const autor = { login: process.env.PR_AUTHOR ?? '', type: process.env.PR_AUTHOR_TYPE ?? '' };
    if (jeDependabot(autor)) {
      console.log(`Dependabot PR: retci se ne traze u opisu, izracunati su iz diffa: ${retciDependabot(ulaz).join(' | ')}`);
    }
    const greske = provjeriPrZaAutora(process.env.PR_BODY ?? '', nove, autor, ulaz.datoteke);
    for (const g of greske) console.log(`::error title=pr-opis::${g}`);
    if (greske.length) {
      console.log('Opis PR-a mora sadrzavati oba retka (vidi .github/PULL_REQUEST_TEMPLATE.md). Nakon uredjivanja opisa ponovno pokreni job pr-opis.');
      return 1;
    }
    console.log(jeDependabot(autor) ? 'Dependabot PR: provjera opisa prolazi bez rucnih redaka.' : 'Opis PR-a sadrzi oba obvezna retka.');
    return 0;
  }
  if (naredba === '--izracunaj') {
    const baseRef = ostalo[0] ?? 'origin/master';
    const headRef = ostalo[1] ?? 'HEAD';
    for (const r of retciOpisa(ulazIzGita(baseRef, headRef))) {
      console.log(r);
    }
    return 0;
  }
  throw new Error('uporaba: pr-lines.mjs --izracunaj [baseRef] [headRef] | --provjeri <baseRef> <headRef>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = glavni(process.argv.slice(2));
  } catch (err) {
    console.error(`pr-lines: ${err.message}`);
    process.exitCode = 2;
  }
}
