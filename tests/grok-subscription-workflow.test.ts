// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/grok-subscription-smoke.yml', 'utf8');

describe('Grok subscription smoke workflow', () => {
  it('runs only by manual dispatch on the dedicated self-hosted Linux runner', () => {
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).not.toMatch(/\bpush:/);
    expect(workflow).not.toMatch(/pull_request:/);
    expect(workflow).toMatch(/runs-on:\s*\[self-hosted, linux, x64, lekta-grok\]/);
    expect(workflow).toMatch(/contents:\s*read/);
  });

  it('uses the explicit subscription-only runner mode without GitHub API secrets', () => {
    expect(workflow).toContain('--agent grok --grok-subscription --execute');
    expect(workflow).toContain('XAI_API_KEY');
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).not.toMatch(/--sandbox off/);
  });
});
