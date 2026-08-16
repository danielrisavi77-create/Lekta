import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'migrations', '0084_revoke_legacy_agent_payload_attach.sql'),
  'utf8',
);

describe('legacy agent payload attachment RPC', () => {
  it('keeps the old function available only to the service worker', () => {
    expect(migration).toContain('revoke all on function public.attach_agent_payloads_to_run');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.attach_agent_payloads_to_run');
    expect(migration).toContain('to service_role');
  });
});
