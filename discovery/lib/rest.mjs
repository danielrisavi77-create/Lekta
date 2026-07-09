/**
 * PostgREST I/O za waitlist discovery skripte (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcije 7, 8).
 *
 * faculty_requests i faculty_request_counts su iza service role (RLS bez anon/authenticated
 * politike, view revokan). Zato ove skripte citaju i pisu ISKLJUCIVO service-role kljucem, nikad
 * anon kljucem i nikad iz preglednika. Kljuc dolazi iz okoline (SUPABASE_SERVICE_ROLE_KEY), ne
 * commita se. fetch je globalan (Node 18+).
 */

/** Procita i validira Supabase okolinu; baca jasnu gresku ako fali kljuc (da ne pukne tiho). */
export function restEnv(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new Error(
      'Nedostaje SUPABASE_URL ili SUPABASE_SERVICE_ROLE_KEY. Postavi ih u okolinu (ne commitaj):\n' +
        '  SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node discovery/<skripta>.mjs',
    );
  }
  return { url, key };
}

function headers(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...extra };
}

async function ok(res, what) {
  if (res.ok) return res;
  const body = await res.text().catch(() => '');
  throw new Error(`${what} nije uspio (HTTP ${res.status}): ${body.slice(0, 300)}`);
}

/** GET na PostgREST (npr. `faculty_request_counts?select=*`). Vraca parsiran JSON niz. */
export async function restGet(env, path, fetchImpl = fetch) {
  const res = await ok(await fetchImpl(`${env.url}/rest/v1/${path}`, { headers: headers(env.key) }), `GET ${path}`);
  return res.json();
}

/** PATCH na PostgREST uz return=minimal (npr. oznaka notified_at). */
export async function restPatch(env, path, body, fetchImpl = fetch) {
  await ok(
    await fetchImpl(`${env.url}/rest/v1/${path}`, {
      method: 'PATCH',
      headers: headers(env.key, { Prefer: 'return=minimal' }),
      body: JSON.stringify(body),
    }),
    `PATCH ${path}`,
  );
}

/** Agregat potraznje (sekcija 7). Service role zaobilazi RLS/revoke na viewu. */
export function fetchCounts(env, fetchImpl = fetch) {
  return restGet(env, 'faculty_request_counts?select=*', fetchImpl);
}

/** URL-encode vrijednost za PostgREST eq. filtar. */
const enc = (v) => encodeURIComponent(String(v));

/**
 * Redovi koji cekaju obavijest (email postoji, notified_at null) za pokrivenu celiju (sekcija 8).
 * Match po faculty_id ILI faculty_name_raw (fakultet izvan kataloga), uz opcionalni program/vrstu.
 */
export function fetchPending(env, { facultyId, facultyName, programId, workType, limit = 500 }, fetchImpl = fetch) {
  const q = ['email=not.is.null', 'notified_at=is.null'];
  if (facultyId) q.push(`faculty_id=eq.${enc(facultyId)}`);
  if (facultyName) q.push(`faculty_name_raw=eq.${enc(facultyName)}`);
  if (programId) q.push(`program_id=eq.${enc(programId)}`);
  if (workType) q.push(`work_type=eq.${enc(workType)}`);
  q.push('select=id,email,faculty_id,faculty_name_raw,program_id,work_type');
  q.push(`limit=${Number(limit) || 500}`);
  return restGet(env, `faculty_requests?${q.join('&')}`, fetchImpl);
}

/** Oznaci redove kao obavijestene (nakon uspjesnog slanja). */
export function markNotified(env, ids, at, fetchImpl = fetch) {
  if (!ids.length) return Promise.resolve();
  const list = ids.map(enc).join(',');
  return restPatch(env, `faculty_requests?id=in.(${list})`, { notified_at: at }, fetchImpl);
}

/** Posalji jedan e-mail preko Resend REST API-ja. Vraca true na uspjeh. */
export async function sendResend({ apiKey, from, to, subject, text, html }, fetchImpl = fetch) {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  return res.ok;
}
