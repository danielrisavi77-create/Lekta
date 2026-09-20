/**
 * Higijena SQL migracija: tajne i idempotencija crona.
 *
 * Postoji zbog izmjerenog kvara (2026-09-20). `0059_secure_reminder_cron.sql` je na staging bazi
 * srusio `db push` lanac od 24 migracije s porukom
 * "could not find valid entry for job send-deadline-reminders (SQLSTATE XX000)", jer je zvao
 * `cron.unschedule('send-deadline-reminders')` BEZUVJETNO, a taj posao na stagingu nikad nije
 * postojao (0012 ga samo opisuje u komentiranom runbooku). Ista je datoteka uz to nosila
 * PRODUKCIJSKI URL i PRODUKCIJSKI Bearer kljuc, pa bi staging baza svaki dan u 8 h zvala
 * produkcijsku funkciju za slanje podsjetnika stvarnim korisnicima.
 *
 * Gard je zato dvostruk i oba dijela moraju biti strojna, jer je oba propusta ljudsko oko
 * propustilo kroz pregled:
 *   1. nijedna migracija ne smije nositi tvrdo upisan endpoint projekta ni token-oblik kljuca,
 *   2. svaki `cron.unschedule` mora biti zasticen, inace migracija nije idempotentna (tvrdo
 *      pravilo repozitorija: migracija se u praksi primjenjuje vise puta i na vise okolina).
 *
 * ZASTO NE GOLA RIJEC "Bearer ": ispravna, popravljena migracija LEGITIMNO sadrzi niz
 * `'Bearer ' || v_bearer` (zaglavlje se slaze iz vault tajne). Gard koji trazi golu rijec bio bi
 * crven nad tocno onom datotekom koju zadatak trazi, a istovremeno bi propustio kljuc upisan u
 * drukcijem formatu. Zato se trazi TOKEN-OBLIK: `Bearer` + razmak + najmanje 20 znakova tokena.
 * Regexi su pisani doslovno u ovoj datoteci i provjereni okom (vodic: "Kontrolni bajt u
 * generiranom regexu": regex slozen kroz alat izgubi escape i gard prestane gristi).
 *
 * STO OVAJ GARD NE MOZE, i to se ne prikriva: on cita TEKST, pa ga slaganje niza zaobilazi.
 * `'https://' || 'ref.supabase.co/functions/v1/x'`, `chr(...)` ili `decode(..., 'base64')` daju u
 * izvodjenju isti URL i isti kljuc, a u izvoru nema ni jednog ni drugog oblika. Gard je zato
 * zastita od GRESKE (izmjereni kvar je bio obican doslovan niz), ne od namjere. Protiv namjere
 * stoje pregled promjene i gitleaks nad povijescu, ne ovaj test. Nalaz iz adversarijalnog
 * pregleda drugim alatom (codex, 2026-09-20).
 */

/** Jedan nalaz higijene nad jednom migracijom. */
export interface MigrationHygieneProblem {
  file: string;
  kind: 'hardcoded-endpoint' | 'bearer-literal' | 'unguarded-unschedule';
  detail: string;
}

/** Ulaz: ime datoteke i njezin sirovi SQL. */
export interface MigrationFile {
  file: string;
  sql: string;
}

/** Raspon tijela jednog dollar-quote bloka (`do $$ ... $$`), bez samih oznaka. */
export interface DollarBody {
  start: number;
  end: number;
}

interface ScanResult {
  /** Tekst iste DULJINE kao ulaz, s komentarima zamijenjenim razmacima (novi redovi ostaju). */
  stripped: string;
  /** Tijela dollar-quote blokova; `do $$ ... $$` tijelo je upravo takav blok. */
  dollarBodies: DollarBody[];
}

/** Otvara li se na poziciji `i` dollar-quote oznaka; vraca oznaku (npr. `$$` ili `$tag$`) ili null. */
function dollarTagAt(sql: string, i: number): string | null {
  if (sql[i] !== '$') return null;
  let j = i + 1;
  while (j < sql.length) {
    const ch = sql[j];
    if (ch === '$') return sql.slice(i, j + 1);
    // Oznaka je identifikator; znamenka na prvom mjestu nije oznaka nego parametar ($1).
    const isIdent = /[A-Za-z_]/.test(ch) || (j > i + 1 && /[0-9]/.test(ch));
    if (!isIdent) return null;
    j += 1;
  }
  return null;
}

/**
 * Prodji kroz SQL svjestan stringova i komentara.
 *
 * Komentari (`--` do kraja retka i ugnijezdeni blok komentari) se BRISU, a sadrzaj stringova se
 * CUVA: tvrdo upisan kljuc uvijek zivi UNUTAR stringa, pa bi brisanje stringova ubilo cijeli gard.
 * Duljina se cuva da se indeks moze prevesti natrag u broj retka.
 */
function scanSql(sql: string): ScanResult {
  const out: string[] = new Array(sql.length);
  const dollarBodies: DollarBody[] = [];
  for (let i = 0; i < sql.length; i += 1) out[i] = sql[i];

  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < sql.length; i += 1) {
      if (sql[i] !== '\n' && sql[i] !== '\r') out[i] = ' ';
    }
  };

  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      let j = i;
      while (j < sql.length && sql[j] !== '\n') j += 1;
      blank(i, j);
      i = j;
      continue;
    }

    if (two === '/*') {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.slice(j, j + 2) === '/*') { depth += 1; j += 2; continue; }
        if (sql.slice(j, j + 2) === '*/') { depth -= 1; j += 2; continue; }
        j += 1;
      }
      blank(i, j);
      i = j;
      continue;
    }

    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j += 1; break; }
        j += 1;
      }
      i = j;
      continue;
    }

    if (sql[i] === '"') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== '"') j += 1;
      i = j + 1;
      continue;
    }

    const tag = dollarTagAt(sql, i);
    if (tag) {
      const bodyStart = i + tag.length;
      const close = sql.indexOf(tag, bodyStart);
      const bodyEnd = close === -1 ? sql.length : close;
      dollarBodies.push({ start: bodyStart, end: bodyEnd });
      // Tijelo se i dalje pretrazuje (unutra su naredbe koje gard mjeri), pa se preskace samo
      // otvarajuca oznaka, ne i sadrzaj.
      i = bodyStart;
      continue;
    }

    i += 1;
  }

  return { stripped: out.join(''), dollarBodies };
}

/** Javno: SQL bez komentara, iste duljine. Izlozeno radi samotestiranja u testu. */
export function stripSqlComments(sql: string): string {
  return scanSql(sql).stripped;
}

/** Endpoint projekta tvrdo upisan u migraciju (a ne procitan iz vaulta). */
const HARDCODED_ENDPOINT = /supabase\.co\/functions\/v1/;
/** Host s doslovnim project-refom, i kad putanja nije `/functions/v1`. */
const HARDCODED_PROJECT_HOST = /https:\/\/[a-z0-9]{16,}\.supabase\.co/;
/** Token-oblik: `Bearer` + razmak + najmanje 20 znakova tokena. Vidi zaglavlje datoteke. */
const BEARER_TOKEN_LITERAL = /Bearer\s+[A-Za-z0-9_\-.]{20,}/;

/**
 * Trazi se neosjetljivo na velicinu slova: SQL je case-insensitive, pa bi `CRON.UNSCHEDULE(`
 * inace posve zaobislo gard, a da SQL radi jednako. Nalaz iz adversarijalnog pregleda (2026-09-20).
 */
const UNSCHEDULE_CALL = /cron\.unschedule\s*\(/gi;
/** Idiom ovog repozitorija (0009, 0011, 0016, 0018, 0019, 0022, 0034, 0054). */
const EXCEPTION_GUARD = /exception\s+when\s+others/i;
/** Drugi valjan oblik: izricita provjera postojanja posla prije gasenja. */
const JOB_EXISTS_GUARD = /if\s+exists\s*\(\s*select\s+1\s+from\s+cron\.job/i;

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/**
 * Je li poziv `cron.unschedule` na poziciji `at` zasticen.
 *
 * Dva prihvacena oblika, namjerno oba: repozitorij danas koristi iskljucivo `begin ... exception
 * when others then null; end;`, ali buduca migracija smije legitimno napisati
 * `if exists (select 1 from cron.job where jobname = ...)`. Gard mora ostati SIGURNOSNI, ne
 * stilski, inace postane prepreka ispravnom kodu.
 *
 * Prozor unaprijed staje na PRVOM `begin` ili `end`, sto god dodje prije. Bez zaustavljanja na
 * `begin` gard ne grize: nezasticen unschedule na vrhu bloka "posudio" bi `exception when others`
 * iz nekog kasnijeg, nepovezanog `begin ... end` bloka u istoj migraciji i prosao vakuumski.
 */
function unscheduleIsGuarded(stripped: string, body: DollarBody, at: number, len: number): boolean {
  const before = stripped.slice(body.start, at);
  if (JOB_EXISTS_GUARD.test(before)) return true;

  const rest = stripped.slice(at + len, body.end);
  const stop = /\b(begin|end)\b/i.exec(rest);
  const window = stop ? rest.slice(0, stop.index) : rest;
  return EXCEPTION_GUARD.test(window);
}

/** Sve povrede higijene nad zadanim skupom migracija. Prazan niz znaci cisto. */
export function migrationHygieneProblems(files: MigrationFile[]): MigrationHygieneProblem[] {
  const problems: MigrationHygieneProblem[] = [];

  for (const { file, sql } of files) {
    const { stripped, dollarBodies } = scanSql(sql);

    const endpoint = HARDCODED_ENDPOINT.exec(stripped) ?? HARDCODED_PROJECT_HOST.exec(stripped);
    if (endpoint) {
      problems.push({
        file,
        kind: 'hardcoded-endpoint',
        detail: `redak ${lineOf(stripped, endpoint.index)}: endpoint projekta tvrdo upisan u migraciju (mora doci iz vault tajne)`,
      });
    }

    const bearer = BEARER_TOKEN_LITERAL.exec(stripped);
    if (bearer) {
      problems.push({
        file,
        kind: 'bearer-literal',
        detail: `redak ${lineOf(stripped, bearer.index)}: token-oblik Bearer kljuca upisan u migraciju`,
      });
    }

    UNSCHEDULE_CALL.lastIndex = 0;
    for (;;) {
      const hit = UNSCHEDULE_CALL.exec(stripped);
      if (!hit) break;
      const at = hit.index;
      const body = dollarBodies.find((b) => at >= b.start && at < b.end);
      if (!body || !unscheduleIsGuarded(stripped, body, at, hit[0].length)) {
        problems.push({
          file,
          kind: 'unguarded-unschedule',
          detail: `redak ${lineOf(stripped, at)}: cron.unschedule bez zastite (nije idempotentno: pada s XX000 ako posao ne postoji)`,
        });
      }
    }
  }

  return problems;
}
