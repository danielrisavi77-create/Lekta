// Persists ONLY the sanitized LektaResult projection for an Academic Completion handoff.
//
// Auth model: this endpoint intentionally does NOT use the user's Supabase JWT.
// Academic Completion mints a short-lived opaque handoff capability, stores only
// its SHA-256 hash, and puts the raw token in the Lekta URL fragment. The token
// is bound server-side to one owned academic project. CORS is defense in depth;
// the capability + DB RPC are the actual authorization boundary.
//
// Privacy: raw DOCX bytes/text, project/user identifiers, Issue.detail,
// Issue.location, mentor text and source passages are rejected/not represented
// in the canonical network payload below.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { corsHeadersFor } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((value) => value.trim()).filter(Boolean);

const MAX_BODY_BYTES = 256 * 1024;
const MAX_ISSUES = 500;
const MAX_CATEGORY_SCORES = 80;
const TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;
const ISSUE_KEY_RE = /^(rule:|check:)[A-Za-z0-9:_-]{1,313}$/;
const ALLOWED_TOP_LEVEL = new Set([
  'schemaVersion', 'analysisId', 'rulesetId', 'profileId',
  'score', 'scoreLabel', 'profileStatus', 'categoryScores', 'issues', 'analyzedAt',
  'documentFingerprint', 'coverageTier',
]);
const ALLOWED_ISSUE_KEYS = new Set([
  'issueKey', 'issueInstanceId', 'checkId', 'ruleId', 'category', 'severity',
  'summary', 'fixable', 'fixerId', 'status',
]);

function cleanText(value: unknown, max: number, required = false): string | null {
  if (typeof value !== 'string') {
    if (required) throw new Error('INVALID_TEXT');
    return null;
  }
  const out = value.trim().replace(/[\n\r\t]+/g, ' ');
  if ((required && !out) || out.length > max) throw new Error('INVALID_TEXT');
  return out || null;
}

function finiteNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error('INVALID_NUMBER');
  }
  return value;
}

function assertKnownKeys(value: Record<string, unknown>, allowed: Set<string>) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`UNKNOWN_FIELD:${key}`);
  }
}

function parseCategoryScores(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_CATEGORY_SCORES) {
    throw new Error('INVALID_CATEGORY_SCORES');
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('INVALID_CATEGORY_SCORE');
    const row = entry as Record<string, unknown>;
    assertKnownKeys(row, new Set(['category', 'earned', 'max']));
    const category = cleanText(row.category, 100, true)!;
    const max = finiteNumber(row.max, 0, 1000000);
    const earned = finiteNumber(row.earned, 0, max);
    return { category, earned, max };
  });
}

function parseIssues(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_ISSUES) throw new Error('INVALID_ISSUES');
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('INVALID_ISSUE');
    const row = entry as Record<string, unknown>;
    assertKnownKeys(row, ALLOWED_ISSUE_KEYS);

    const issueKey = cleanText(row.issueKey, 320, true)!;
    if (!ISSUE_KEY_RE.test(issueKey) || seen.has(issueKey)) throw new Error('INVALID_ISSUE_KEY');
    seen.add(issueKey);

    const severity = cleanText(row.severity, 16, true)!.toLowerCase();
    if (!['error', 'warning', 'info'].includes(severity)) throw new Error('INVALID_SEVERITY');
    const status = cleanText(row.status, 32, true);
    if (status !== 'OPEN') throw new Error('INVALID_STATUS');
    if (typeof row.fixable !== 'boolean') throw new Error('INVALID_FIXABLE');

    return {
      issueKey,
      ...(row.issueInstanceId ? { issueInstanceId: cleanText(row.issueInstanceId, 240, true) } : {}),
      checkId: cleanText(row.checkId, 160),
      ruleId: cleanText(row.ruleId, 200),
      category: cleanText(row.category, 100, true)!,
      severity,
      summary: cleanText(row.summary, 160, true)!,
      fixable: row.fixable,
      fixerId: cleanText(row.fixerId, 160),
      status: 'OPEN',
    };
  });
}

function parsePayload(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_BODY');
  const body = raw as Record<string, unknown>;
  assertKnownKeys(body, ALLOWED_TOP_LEVEL);
  if (body.schemaVersion !== '0.1') throw new Error('INVALID_SCHEMA_VERSION');

  const analysisId = cleanText(body.analysisId, 200, true)!;
  const rulesetId = cleanText(body.rulesetId, 500, true)!;
  const profileId = cleanText(body.profileId, 200);
  const score = finiteNumber(body.score, 0, 100);
  const categoryScores = parseCategoryScores(body.categoryScores);
  const issues = parseIssues(body.issues);
  const documentFingerprint = cleanText(body.documentFingerprint, 256);
  let coverageTier: number | null = null;
  if (body.coverageTier !== undefined && body.coverageTier !== null) {
    const rawTier = finiteNumber(body.coverageTier, 0, 100);
    if (!Number.isInteger(rawTier)) throw new Error('INVALID_COVERAGE_TIER');
    coverageTier = rawTier;
  }

  return {
    analysisId,
    profileId,
    rulesetId,
    score,
    categoryScores,
    issues,
    documentFingerprint,
    coverageTier,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(
    req.headers.get('Origin'),
    ALLOWED_ORIGINS,
    'POST, OPTIONS',
    'content-type, x-completion-handoff',
  );
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false }, 405);

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, reason: 'payload-too-large' }, 413);
  }

  const handoff = (req.headers.get('x-completion-handoff') ?? '').trim();
  if (!TOKEN_RE.test(handoff)) return json({ ok: false, reason: 'invalid-handoff' }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, reason: 'invalid-json' }, 400);
  }

  let payload: ReturnType<typeof parsePayload>;
  try {
    payload = parsePayload(raw);
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':')[0] : 'INVALID_PAYLOAD';
    return json({ ok: false, reason: code.toLowerCase() }, 400);
  }

  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, reason: 'payload-too-large' }, 413);
  }

  const tokenHash = await sha256Hex(handoff);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('lekta_record_completion_check_with_token', {
    p_token_hash: tokenHash,
    p_analysis_id: payload.analysisId,
    p_profile_id: payload.profileId,
    p_ruleset_id: payload.rulesetId,
    p_ruleset_version: null,
    p_score: payload.score,
    p_category_scores: payload.categoryScores,
    p_issues: payload.issues,
    p_document_fingerprint: payload.documentFingerprint,
    p_coverage_tier: payload.coverageTier,
    p_checked_at: new Date().toISOString(),
  });

  if (error) {
    const message = String(error.message || '');
    if (/HANDOFF_EXPIRED|TOKEN_INVALID|PROJECT_NOT_OWNED/i.test(message)) {
      return json({ ok: false, reason: 'invalid-handoff' }, 401);
    }
    if (/PROFILE_MISMATCH/i.test(message)) {
      return json({ ok: false, reason: 'profile-mismatch' }, 409);
    }
    console.error('record-completion-check failed', {
      code: error.code,
      message: message.slice(0, 160),
    });
    return json({ ok: false, reason: 'persistence-failed' }, 500);
  }

  return json({ ok: true, checkId: data }, 200);
});
