// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createUpisnikSession } from '../src/programs/upisnik-session';

describe('javna Upisnik sesija', () => {
  it('prenosi kolacic iz preusmjeravanja i u sljedecu pretragu', async () => {
    const seen: RequestInit[] = [];
    const read = createUpisnikSession(async (_url, options) => {
      seen.push(options!);
      if (seen.length === 1) return new Response('', { status: 302, headers: {
        location: '/usp/index', 'set-cookie': 'JSESSIONID=fixture; Path=/usp; HttpOnly',
      } });
      return new Response('<html>public</html>');
    });
    await read('index');
    await read('pretrazivanje?q=1');
    expect(seen[0].redirect).toBe('manual');
    expect(new Headers(seen[1].headers).get('cookie')).toBe('JSESSIONID=fixture');
    expect(new Headers(seen[2].headers).get('cookie')).toBe('JSESSIONID=fixture');
  });
  it('ne proglasava javni odgovor pokvarenim samo jer nema Set-Cookie', async () => {
    const read = createUpisnikSession(async () => new Response('<html>public</html>'));
    expect(await read('index')).toMatchObject({ html: '<html>public</html>', hasSessionCookie: false });
  });
  it('ne salje kolacic drugom originu', async () => {
    let calls = 0;
    const read = createUpisnikSession(async () => {
      calls += 1;
      return new Response('', { status: 302, headers: { location: 'https://example.net/', 'set-cookie': 'JSESSIONID=fixture' } });
    });
    await expect(read('index')).rejects.toThrow('UNEXPECTED_SOURCE_ORIGIN');
    expect(calls).toBe(1);
  });
  it('ne dohvaca proizvoljnu pocetnu adresu', async () => {
    let calls = 0;
    const read = createUpisnikSession(async () => { calls += 1; return new Response(''); });
    await expect(read('https://example.net/')).rejects.toThrow('UNEXPECTED_SOURCE_ORIGIN');
    expect(calls).toBe(0);
  });
  it('odbija HTTP gresku', async () => {
    const read = createUpisnikSession(async () => new Response('error', { status: 500 }));
    await expect(read('index')).rejects.toThrow('SOURCE_HTTP_ERROR: 500');
  });
  it('odbija aplikacijsku gresku i uz HTTP 200', async () => {
    const read = createUpisnikSession(async () => new Response('Dogodila se pogreška'));
    await expect(read('index')).rejects.toThrow('SOURCE_APPLICATION_ERROR');
  });
  it('ogranicava petlju preusmjeravanja', async () => {
    let calls = 0;
    const read = createUpisnikSession(async () => {
      calls += 1; return new Response('', { status: 302, headers: { location: '/usp/index' } });
    });
    await expect(read('index')).rejects.toThrow('TOO_MANY_REDIRECTS');
    expect(calls).toBe(6);
  });
  it('brise istekli kolacic umjesto da ga salje u novi zahtjev', async () => {
    const seen: RequestInit[] = [];
    const read = createUpisnikSession(async (_url, options) => {
      seen.push(options!);
      const headers: Record<string, string> = seen.length === 1 ? { 'set-cookie': 'JSESSIONID=fixture; Path=/usp' }
        : seen.length === 2 ? { 'set-cookie': 'JSESSIONID=; Max-Age=0; Path=/usp' } : {};
      return new Response('ok', { headers });
    });
    await read('index'); await read('index'); await read('index');
    expect(new Headers(seen[2].headers).get('cookie')).toBeNull();
  });

  it('redaktira URL-rewritten jsessionid i upitne tokene iz izvjestaja, ali prati puni redirect tijekom dohvata', async () => {
    const fetched: string[] = [];
    const read = createUpisnikSession(async (url) => {
      fetched.push(String(url));
      if (fetched.length === 1) {
        return new Response('', { status: 302, headers: { location: '/usp/index;jsessionid=secret-path?access_token=secret-query#secret-fragment' } });
      }
      return new Response('<html>public</html>');
    });
    const report = await read('index');
    expect(fetched[1]).toContain('jsessionid=secret-path');
    expect(fetched[1]).toContain('access_token=secret-query');
    expect(report.url).toBe('https://hko.srce.hr/usp/index');
    expect(JSON.stringify(report)).not.toContain('secret-');
  });

  it('ne iznosi query token ni neocekivani path segment u auditu', async () => {
    const read = createUpisnikSession(async () => new Response('<html>public</html>'));
    const query = await read('pretrazivanje?session=secret-query');
    expect(query.url).toBe('https://hko.srce.hr/usp/pretrazivanje');
    const unknown = await read('private/secret-path');
    expect(unknown.url).toBe('https://hko.srce.hr/usp/');
    expect(JSON.stringify(unknown)).not.toContain('secret-path');
  });


  it.each([
    'JSESSIONID=expired; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Path=/usp',
    'JSESSIONID=expired; Max-Age=-1; Path=/usp',
    'JSESSIONID=expired; Max-Age=0; Path=/usp',
  ])('uklanja sesijski cookie po Expires ili nepozitivnom Max-Age (%s)', async (expired) => {
    const seen: RequestInit[] = [];
    const read = createUpisnikSession(async (_url, options) => {
      seen.push(options!);
      const header = seen.length === 1 ? 'JSESSIONID=old; Path=/usp' : seen.length === 2 ? expired : '';
      return new Response('ok', header ? { headers: { 'set-cookie': header } } : {});
    });
    await read('index'); await read('index'); await read('pretrazivanje');
    expect(new Headers(seen[1].headers).get('cookie')).toBe('JSESSIONID=old');
    expect(new Headers(seen[2].headers).get('cookie')).toBeNull();
  });

  it('pozitivan Max-Age prestaje vaziti nakon isteka i nadjacava Expires iz proslosti', async () => {
    let now = 1_790_000_000_000;
    const seen: RequestInit[] = [];
    const read = createUpisnikSession(async (_url, options) => {
      seen.push(options!);
      return new Response('ok', seen.length === 1 ? {
        headers: { 'set-cookie': 'JSESSIONID=short; Max-Age=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT' },
      } : {});
    }, () => now);
    await read('index');
    await read('index');
    expect(new Headers(seen[1].headers).get('cookie')).toBe('JSESSIONID=short');
    now += 1_001;
    const next = await read('pretrazivanje');
    expect(new Headers(seen[2].headers).get('cookie')).toBeNull();
    expect(next.hasSessionCookie).toBe(false);
  });

});
