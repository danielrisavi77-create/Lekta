export interface LinkCheckResult {
  url: string;
  status: 'ok' | 'redirect' | 'not-found' | 'blocked' | 'error' | 'timeout';
  httpStatus?: number;
  finalUrl?: string;
  redirectChain?: string[];
  canonicalUrl?: string;
  checkedAt: string;
  source: 'metadata-endpoint';
}

interface LinkCheckResponse { results?: LinkCheckResult[]; warnings?: string[]; }

export async function checkLinks(endpoint: string, urls: string[], accessToken = '', timeoutMs = 10000): Promise<{ results: LinkCheckResult[]; warnings: string[] }> {
  const unique = [...new Set(urls.filter((url) => /^https?:\/\//i.test(url)))].slice(0, 100);
  if (!unique.length) return { results: [], warnings: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(timeoutMs, 30000)));
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify({ urls: unique }), signal: controller.signal });
    if (!response.ok) return { results: [], warnings: [`Provjera poveznica nije uspjela (${response.status}).`] };
    const payload = await response.json() as LinkCheckResponse;
    return { results: Array.isArray(payload.results) ? payload.results : [], warnings: Array.isArray(payload.warnings) ? payload.warnings : [] };
  } catch (error) {
    return { results: [], warnings: [error instanceof DOMException && error.name === 'AbortError' ? 'Provjera poveznica je istekla.' : 'Provjera poveznica nije dostupna.'] };
  } finally { clearTimeout(timer); }
}
