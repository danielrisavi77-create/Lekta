/**
 * Proizvodi kako ih STVARNO sije supabase/migrations (F18 krug 3).
 *
 * Gard "Lektin checkout ne prodaje Katedra passove" mora imati baseline nad pravim katalogom, ne
 * nad rucno prepisanim popisom id-ova: rucni popis bi se razisao s migracijama cim netko doda
 * proizvod, a gard bi ostao zelen. Zato se ovdje PARSIRAJU `insert into [public.]products (...)
 * values (...), (...)` naredbe: popis stupaca iz zaglavlja, vrijednosti iz svake n-torke.
 *
 * Parser je namjerno uzak: prepoznaje samo oblik koji ove migracije koriste (navodnici, null,
 * brojevi, true/false). Nepoznat oblik BACA, da djelomican parse ne izgleda kao manji katalog.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface SeededProduct {
  file: string;
  row: Record<string, unknown>;
}

function parseValue(tok: string, file: string): unknown {
  const t = tok.trim();
  if (/^'.*'$/s.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  if (/^null$/i.test(t)) return null;
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  throw new Error(`${file}: nepoznata vrijednost u products insertu: ${t}`);
}

/** Razdvoji tijelo n-torke na vrijednosti po zarezima IZVAN navodnika. */
function splitTuple(body: string, file: string): unknown[] {
  const out: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") {
      if (inStr && body[i + 1] === "'") { cur += "''"; i++; continue; }
      inStr = !inStr;
      cur += ch;
      continue;
    }
    if (ch === ',' && !inStr) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (inStr) throw new Error(`${file}: nezatvoren navodnik u products insertu`);
  out.push(cur);
  return out.map((v) => parseValue(v, file));
}

export function parseProductSeeds(file: string, sql: string): SeededProduct[] {
  const text = sql.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '');
  const out: SeededProduct[] = [];
  const re = /insert\s+into\s+(?:public\.)?products\s*\(([^)]*)\)\s*values\s*([\s\S]*?)(?:on\s+conflict|;)/gi;
  for (const m of text.matchAll(re)) {
    const cols = m[1].split(',').map((c) => c.trim());
    const tuples = [...m[2].matchAll(/\(([^()]*)\)/g)];
    if (!tuples.length) throw new Error(`${file}: products insert bez n-torki`);
    for (const t of tuples) {
      const vals = splitTuple(t[1], file);
      if (vals.length !== cols.length) {
        throw new Error(`${file}: ${vals.length} vrijednosti za ${cols.length} stupaca`);
      }
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      out.push({ file, row });
    }
  }
  return out;
}

/** Svi proizvodi iz svih migracija, redom po datoteci. */
export function seededProducts(root = process.cwd()): SeededProduct[] {
  const dir = resolve(root, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .flatMap((f) => parseProductSeeds(f, readFileSync(join(dir, f), 'utf8')));
}
