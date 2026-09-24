import { describe, expect, it } from 'vitest';
import { DEPLOYMENT_CONFIG } from '../src/config/deployment';

describe('deployment config in Vitest', () => {
  it('uses the loopback Supabase when tests have no explicit backend', () => {
    expect(String(import.meta.env.TEST)).toBe('true');
    expect(DEPLOYMENT_CONFIG.supabaseUrl).toBe('http://127.0.0.1:54321');
    expect(DEPLOYMENT_CONFIG.supabaseAnonKey).toBe('lokalni-dev-bez-kljuca');
  });
});
