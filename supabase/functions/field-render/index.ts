// Lekta Edge Function: field-render.
// Javni klijent nikad ne zove LibreOffice worker izravno. Ova funkcija radi JWT
// autentikaciju, limit veličine i privatno prosljeđivanje raw DOCX tijela.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { corsHeadersFor } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WORKER_URL = Deno.env.get('FIELD_RENDER_WORKER_URL') ?? '';
const WORKER_TOKEN = Deno.env.get('FIELD_RENDER_WORKER_TOKEN') ?? '';
const MAX_BYTES = Number(Deno.env.get('FIELD_RENDER_MAX_BYTES') ?? String(20 * 1024 * 1024));
const TIMEOUT_MS = Number(Deno.env.get('FIELD_RENDER_TIMEOUT_MS') ?? '240000');
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((value) => value.trim()).filter(Boolean);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin, ALLOWED_ORIGINS), 'content-type': 'application/json' },
  });
}

function isDocx(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = corsHeadersFor(origin, ALLOWED_ORIGINS);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  if (!WORKER_URL || !WORKER_TOKEN) return json({ error: 'disabled' }, 503, origin);

  const auth = req.headers.get('Authorization') ?? '';
  if (!SUPABASE_URL || !SERVICE_ROLE || !/^Bearer\s+\S+/i.test(auth)) return json({ error: 'unauthorized' }, 401, origin);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!data.user) return json({ error: 'unauthorized' }, 401, origin);

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength && contentLength > MAX_BYTES * 1.05) return json({ error: 'payload_too_large' }, 413, origin);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: 'bad_request' }, 400, origin); }
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'bad_request' }, 400, origin);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: 'payload_too_large' }, 413, origin);
  if (!isDocx(bytes)) return json({ error: 'not_a_docx' }, 415, origin);

  const requestId = crypto.randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'content-type': DOCX_MIME,
        'content-length': String(bytes.length),
        'x-lekta-worker-token': WORKER_TOKEN,
        'x-request-id': requestId,
      },
      body: bytes,
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) return json({ error: 'render_worker_failed', workerStatus: response.status, requestId }, response.status >= 500 ? 503 : 422, origin);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { return json({ error: 'invalid_worker_response', requestId }, 502, origin); }
    if (!parsed || typeof parsed !== 'object' || (parsed as Record<string, unknown>).status !== 'done' || typeof (parsed as Record<string, unknown>).renderedDocxBase64 !== 'string') {
      return json({ error: 'invalid_worker_response', requestId }, 502, origin);
    }
    return json({ ...(parsed as Record<string, unknown>), jobId: requestId }, 200, origin);
  } catch (error) {
    return json({ error: error instanceof DOMException && error.name === 'AbortError' ? 'render_timeout' : 'render_unavailable', requestId }, 504, origin);
  } finally {
    clearTimeout(timeout);
  }
});
