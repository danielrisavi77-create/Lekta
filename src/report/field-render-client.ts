const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface FieldRenderResult {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  renderedDocx?: Uint8Array;
  warnings: string[];
  fieldsUpdated: number;
  unresolvedFields: number;
  source: 'libreoffice';
}
export interface FieldRenderConfig { endpoint?: string }

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function requestFieldRender(
  config: FieldRenderConfig,
  accessToken: string,
  fileBytes: Uint8Array,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<FieldRenderResult> {
  if (!config.endpoint) return { jobId: '', status: 'failed', warnings: ['fieldRenderEndpoint nije konfiguriran'], fieldsUpdated: 0, unresolvedFields: 0, source: 'libreoffice' };
  const form = new FormData();
  form.append('file', new Blob([fileBytes as Uint8Array<ArrayBuffer>], { type: DOCX_MIME }), 'rad-field-integrity.docx');
  let response: Response;
  try {
    response = await fetchImpl(config.endpoint, { method: 'POST', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, body: form, ...(signal ? { signal } : {}) });
  } catch (error) {
    return { jobId: '', status: 'failed', warnings: [error instanceof Error ? error.message : 'Render nije dostupan'], fieldsUpdated: 0, unresolvedFields: 0, source: 'libreoffice' };
  }
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  const status = body.status === 'queued' || body.status === 'running' || body.status === 'done' || body.status === 'failed' ? body.status : response.ok ? 'queued' : 'failed';
  const encoded = typeof body.renderedDocxBase64 === 'string' ? body.renderedDocxBase64 : typeof body.docxBase64 === 'string' ? body.docxBase64 : undefined;
  return {
    jobId: typeof body.jobId === 'string' ? body.jobId : '',
    status,
    ...(encoded ? { renderedDocx: decodeBase64(encoded) } : {}),
    warnings: Array.isArray(body.warnings) ? body.warnings.filter((item): item is string => typeof item === 'string').slice(0, 50) : [response.ok ? 'Render čeka obradu.' : `Render nije uspio (${response.status}).`],
    fieldsUpdated: typeof body.fieldsUpdated === 'number' && Number.isFinite(body.fieldsUpdated) ? body.fieldsUpdated : 0,
    unresolvedFields: typeof body.unresolvedFields === 'number' && Number.isFinite(body.unresolvedFields) ? body.unresolvedFields : 0,
    source: 'libreoffice',
  };
}
