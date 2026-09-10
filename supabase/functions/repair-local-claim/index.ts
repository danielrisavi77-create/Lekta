// Jednokratni, javno dohvatljiv runner endpoint. Supabase JWT se namjerno ne
// koristi: autentikacija je 256-bitni claim token koji baza atomski trosi i
// odmah veze uz P-256 kljuc uredjaja. Token i dokumentarni tekst se ne logiraju.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

import { handleLocalRepairClaimHttp } from '../../../src/repair/local-runner/claim-http.ts';
import { claimLocalRepairJob } from '../../../src/repair/local-runner/claim-service.ts';
import { createLocalRepairClaimSupabaseDependencies } from '../../../src/repair/local-runner/supabase-adapter.ts';

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
  const dependencies = createLocalRepairClaimSupabaseDependencies({
    rpc: async (name, params) => {
      const { data, error } = await admin.rpc(name, params);
      return { data, error };
    },
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (path, expiresInSeconds) => {
          const { data, error } = await admin.storage
            .from(bucket)
            .createSignedUrl(path, expiresInSeconds);
          return { data, error };
        },
      }),
    },
  });

  return handleLocalRepairClaimHttp(request, {
    claim: (input) => claimLocalRepairJob(input, dependencies),
  });
});
