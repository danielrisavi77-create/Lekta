import { describe, expect, it } from 'vitest';
import { repairDocxCorsHeaders } from '../supabase/functions/repair-docx/cors.ts';

const ALLOWED_ORIGINS = ['https://lekta-staging.netlify.app'];

describe('repair-docx CORS preflight', () => {
  it('allows the auth, binary-response, and stable-request headers used by the browser POST', () => {
    const headers = repairDocxCorsHeaders('https://lekta-staging.netlify.app', ALLOWED_ORIGINS);
    const allowed = String(headers['Access-Control-Allow-Headers']).split(',').map((h) => h.trim().toLowerCase());

    expect(headers['Access-Control-Allow-Origin']).toBe('https://lekta-staging.netlify.app');
    expect(headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(allowed).toContain('authorization');
    expect(allowed).toContain('x-lekta-response');
    expect(allowed).toContain('x-lekta-request-id');
    expect(allowed).toContain('x-lekta-request-fingerprint');
    expect(allowed).toContain('x-lekta-request-mode');
  });

  it('does not grant a foreign origin access to repair-docx', () => {
    const headers = repairDocxCorsHeaders('https://example.invalid', ALLOWED_ORIGINS);

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
