/** Public same-origin session; keep redirect cookies without logging or persisting them. */
export const UPISNIK_BASE = 'https://hko.srce.hr/usp/';

/**
 * Sigurna javna referenca za audit. Izvrsni fetch zadrzava cijeli URL, ali raport i log
 * nikad ne dobivaju URL-rewritten session id, query token ni fragment.
 */
export function reportableUpisnikUrl(url: URL): string {
  const path = url.pathname.replace(/;[^/]*/g, '');
  if (path === '/usp/index' || path === '/usp/pretrazivanje') {
    return new URL(path, UPISNIK_BASE).href;
  }
  // Neocekivana putanja moze sadrzavati opaque token: ne pohranjuj je u artefakt.
  return UPISNIK_BASE;
}


export function createUpisnikSession(fetcher: typeof fetch = fetch):
  (path: string) => Promise<{ url: string; html: string; contentType: string | null; hasSessionCookie: boolean }> {
  const cookies = new Map<string, string>();
  return async (path) => {
    let url = new URL(path, UPISNIK_BASE);
    for (let hop = 0; hop <= 5; hop += 1) {
      if (url.origin !== new URL(UPISNIK_BASE).origin || !url.pathname.startsWith('/usp/')) {
        throw new Error('UNEXPECTED_SOURCE_ORIGIN');
      }
      const cookie = [...cookies.values()].join('; ');
      const response = await fetcher(url.href, {
        redirect: 'manual', signal: AbortSignal.timeout(45_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'hr-HR,hr;q=0.9,en;q=0.7',
          Referer: `${UPISNIK_BASE}index`,
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
      for (const value of response.headers.getSetCookie()) {
        const pair = value.split(';')[0].trim();
        const separator = pair.indexOf('=');
        if (separator < 1) continue;
        const name = pair.slice(0, separator);
        if (/;\s*max-age\s*=\s*0\s*(?:;|$)/i.test(value)) cookies.delete(name);
        else cookies.set(name, pair);
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('SOURCE_REDIRECT_WITHOUT_LOCATION');
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`SOURCE_HTTP_ERROR: ${response.status}`);
      }
      const html = await response.text();
      if (/Dogodila se pogre/i.test(html)) throw new Error('SOURCE_APPLICATION_ERROR: HTTP 200 is not success');
      return { url: reportableUpisnikUrl(url), html, contentType: response.headers.get('content-type'), hasSessionCookie: cookies.size > 0 };
    }
    throw new Error('TOO_MANY_REDIRECTS');
  };
}
