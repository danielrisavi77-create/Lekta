/**
 * Cita RLS policyje nad `corpus_contributions` iz SAMIH migracija, redom kojim ih `db push` primjenjuje.
 *
 * Zasto ovako, a ne upitom nad bazom: zivu bazu ovaj repozitorij u testovima nema, a gard koji trazi
 * bazu ne bi se izvodio nigdje osim rucno (i bio bi tiho preskocen, sto je najgori oblik garda).
 * Migracije su izvor istine za shemu: sto u njima nije napisano, u bazi ne postoji.
 *
 * Sto ovo JEST: state machine nad `create policy` / `drop policy` izjavama za JEDNU poznatu tablicu.
 * Sto NIJE: SQL parser. Ne razumije `alter policy ... rename`, dinamicki SQL u `do $$` bloku ni
 * `drop table`. Zato `parseCorpusPolicyHistory` vraca i broj vidjenih `create policy` izjava, pa
 * tvrdnja moze pasti kad izvod prestane nalaziti ista (prazan skup nije dokaz cistoce).
 */

export interface MigrationFile {
  /** Ime datoteke migracije; sluzi samo poruci o gresci. */
  file: string;
  sql: string;
}

export interface CorpusPolicyHistory {
  /** Koliko je `create policy` izjava nad tablicom uopce vidjeno (anti vakuum). */
  createdCount: number;
  /** Imena policyja koji NAKON zadnje migracije jos vrijede za trazenu naredbu. */
  remaining: string[];
}

/** Makni komentare da `-- drop policy ...` u objasnjenju ne bude procitan kao izjava. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const IDENT = '(?:"[^"]+"|[a-z_][a-z0-9_$]*)';

/** `for update` ili `for all`; `all` pokriva i UPDATE pa se broji isto. */
export const FOR_UPDATE = /\bfor\s+(update|all)\b/i;
/** `for select` ili `for all`. */
export const FOR_SELECT = /\bfor\s+(select|all)\b/i;

function bare(name: string): string {
  return name.replace(/^"|"$/g, '');
}

/**
 * Prati zivot policyja nad tablicom kroz migracije. `migrations` mora biti u redoslijedu primjene
 * (Supabase ih sortira po verziji, dakle po imenu datoteke).
 */
export function parseCorpusPolicyHistory(
  migrations: readonly MigrationFile[],
  table = 'corpus_contributions',
  /** Koja naredba se prati. */
  command: RegExp = FOR_UPDATE,
): CorpusPolicyHistory {
  const live = new Set<string>();
  let createdCount = 0;
  const tablePattern = `(?:public\\.)?${table}`;
  // Jedan izraz s alternacijom, jer `matchAll` vraca pogotke REDOM po poziciji. Migracija koja
  // prvo obrise pa stvori policy (tocno to radi 0102) mora se citati tim redom; dva odvojena
  // prolaza bi redoslijed izgubila i dala krivi konacni skup.
  const statementRe = new RegExp(
    [
      `\\bcreate\\s+policy\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT})\\s+on\\s+${tablePattern}\\b([\\s\\S]*?);`,
      `\\bdrop\\s+policy\\s+(?:if\\s+exists\\s+)?(${IDENT})\\s+on\\s+${tablePattern}\\b`,
    ].join('|'),
    'gi',
  );

  for (const migration of migrations) {
    const sql = stripComments(migration.sql);
    for (const m of sql.matchAll(statementRe)) {
      if (m[3] !== undefined) {
        live.delete(bare(m[3]));
        continue;
      }
      createdCount += 1;
      if (command.test(m[2])) live.add(bare(m[1]));
    }
  }

  return { createdCount, remaining: [...live].sort() };
}
