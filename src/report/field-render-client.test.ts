import { describe, expect, it, vi } from 'vitest';
import { requestFieldRender } from './field-render-client';

describe('field render client', () => {
  it('vraća jasan status kada endpoint nije konfiguriran', async () => {
    const result = await requestFieldRender({}, '', new Uint8Array([1]), vi.fn());
    expect(result.status).toBe('failed');
    expect(result.warnings[0]).toContain('nije konfiguriran');
  });

  it('parsira završeni LibreOffice rezultat', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ jobId: 'j1', status: 'done', renderedDocxBase64: 'AQI=', fieldsUpdated: 3, unresolvedFields: 1, warnings: [] }), { status: 200 }));
    const result = await requestFieldRender({ endpoint: '/render' }, 'token', new Uint8Array([1]), fetchMock);
    expect(result).toMatchObject({ jobId: 'j1', status: 'done', fieldsUpdated: 3, unresolvedFields: 1 });
    expect([...result.renderedDocx || []]).toEqual([1, 2]);
  });
});
