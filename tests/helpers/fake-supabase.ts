/**
 * Lazan Supabase klijent za testove Edge handlera (F18 krug 2).
 *
 * Nije simulacija baze. Biljezi svaki lanac poziva (`from(t).update(x).eq(a, b)...`) kao jedan
 * `FakeCall` i odgovor uzima iz resolvera koji test zada. Time test tvrdi DVIJE stvari: koji je
 * upit handler stvarno poslao (tablica, stupci, filtri) i kako reagira na odgovor baze (npr.
 * 23505 na duplikat). Nepoznat lanac dobiva `{ data: null, error: null }`, kao prazan rezultat.
 */

export interface FakeCall {
  table: string;
  ops: Array<{ op: string; args: unknown[] }>;
}

export interface FakeResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

export type FakeResolver = (call: FakeCall) => FakeResult | undefined;

const CHAIN_METHODS = [
  'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'order', 'limit', 'maybeSingle', 'single',
] as const;

export interface FakeAdmin {
  admin: { from(table: string): unknown };
  calls: FakeCall[];
}

export function fakeAdmin(resolve: FakeResolver): FakeAdmin {
  const calls: FakeCall[] = [];
  const admin = {
    from(table: string): unknown {
      const call: FakeCall = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const m of CHAIN_METHODS) {
        builder[m] = (...args: unknown[]) => {
          call.ops.push({ op: m, args });
          return builder;
        };
      }
      // Pravi supabase-js graditelj upita JE thenable (`await admin.from(t).select()...`), pa ga
      // lazni mora oponasati; bez `then` handler bi dobio sam graditelj umjesto rezultata.
      // oxlint-disable-next-line unicorn/no-thenable
      builder.then = (ok: (v: FakeResult) => unknown, fail?: (e: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null, count: null, ...(resolve(call) ?? {}) }).then(ok, fail);
      return builder;
    },
  };
  return { admin, calls };
}

/** Prvi argument zadane operacije u lancu, ili undefined. */
export function argOf(call: FakeCall, op: string): unknown {
  return call.ops.find((o) => o.op === op)?.args[0];
}

/** Svi `eq` filtri lanca kao objekt stupac -> vrijednost. */
export function eqs(call: FakeCall): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const o of call.ops) if (o.op === 'eq') out[String(o.args[0])] = o.args[1];
  return out;
}

/** Operacija koja pise (insert, update, upsert, delete) ili 'select'. */
export function writeOp(call: FakeCall): string {
  return call.ops.find((o) => ['insert', 'update', 'upsert', 'delete'].includes(o.op))?.op ?? 'select';
}
