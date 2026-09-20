// Javno dohvatljiv runner-status endpoint. Supabase JWT se ne koristi jer se
// svaki payload autentificira P-256 kljucem koji je atomski vezan pri claimu.
// Dokumentarni tekst, potpis i kljuc uredjaja ne logiraju se.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

import { handleLocalRepairStatusHttp } from '../../../src/repair/local-runner/status-http.ts';
import { recordLocalRepairStatus } from '../../../src/repair/local-runner/status-service.ts';
import { createLocalRepairStatusSupabaseDependencies } from '../../../src/repair/local-runner/status-supabase-adapter.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LOCAL_REPAIR_DISABLED = Deno.env.get('REPAIR_LOCAL_DISABLED') === 'true';

const NO_STORE_JSON = {
  'cache-control': 'no-store',
  'content-type': 'application/json',
} as const;

Deno.serve(async (request: Request): Promise<Response> => {
  if (LOCAL_REPAIR_DISABLED) {
    return new Response(JSON.stringify({ error: 'disabled' }), {
      status: 503,
      headers: NO_STORE_JSON,
    });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'unavailable' }), {
      status: 503,
      headers: NO_STORE_JSON,
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const database = createLocalRepairStatusSupabaseDependencies({
    from: (table) => ({
      select: (columns) => ({
        eq: (column, value) => ({
          maybeSingle: async () => {
            const { data, error } = await admin
              .from(table)
              .select(columns)
              .eq(column, value)
              .maybeSingle();
            return { data, error };
          },
        }),
      }),
    }),
    rpc: async (name, params) => {
      const { data, error } = await admin.rpc(name, params);
      return { data, error };
    },
  });

  return handleLocalRepairStatusHttp(request, {
    record: (input) => recordLocalRepairStatus(input, {
      now: () => new Date(),
      ...database,
    }),
  });
});
