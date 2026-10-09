// supabase/functions/_shared/hash-ip.ts
//
// Kanonsko soljeno hashiranje klijentskog IP-a. JEDAN izvor istine da SVE funkcije koje pisu
// ip_hash (generate-report, redeem-referral-signup) proizvedu ISTU vrijednost za isti IP. To je
// preduvjet da anti-fraud provjera u grant-referrer-reward moze usporediti referred_ip_hash
// (iz signupa) s report_generations.ip_hash (od preporucitelja). Bez zajednicke ekstrakcije
// I salta usporedba je besmislena.
//
// Salt (IP_HASH_SALT) je GDPR ojacanje (nesoljeni sha256 IPv4 je reverzibilan brute-forceom
// 2^32 prostora). PRIJE: kad IP_HASH_SALT nije postavljen, funkcije su padale na '' pa je
// ip_hash bio NESOLJEN i prakticki obrnjiv (security-02). SADA: deriveIpSalt izvodi stabilan
// salt iz service-role kljuca (hashiran, ne sirovi) kad dedicirani secret fali, pa ip_hash
// NIKAD nije nesoljen. faculty-request od T84 koristi ovaj isti pomocnik (prije vlastitu derivaciju).

/** Samo `get`, da pomocnik radi i s Headers iz Deno-a i s lazom u testu. */
export interface HeaderReader { get(name: string): string | null }

/** IPV6 moze imati 45 znakova; dulji ili ne-IP header ne stvara zajednicki unknown bucket. */
const MAX_IP_KEY_LENGTH = 45;

/**
 * IP dolazi samo iz cf-connecting-ip postavljenog na ZASTICENOM proxy ulazu.
 * Nepostojeci/krivotvoreni oblik ne smije postati novi quota ili anti-fraud identitet.
 * To NE dokazuje da origin odbija izravan promet; to se mora potvrditi na stagingu.
 */
export function clientIpFromHeaders(headers: HeaderReader): string {
  const raw = (headers.get('cf-connecting-ip') ?? '').trim();
  if (!raw || raw.length > MAX_IP_KEY_LENGTH) throw new Error('UNTRUSTED_CLIENT_IP');

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) {
    const octets = raw.split('.');
    if (octets.every((part) => Number(part) <= 255 && (part === '0' || !part.startsWith('0')))) {
      return octets.join('.');
    }
    throw new Error('UNTRUSTED_CLIENT_IP');
  }

  // URL standard canonicalizes IPv6 without relying on Node-only net.isIP inside Deno Edge.
  if (raw.includes(':') && !/[\s,;/%]/.test(raw)) {
    try {
      const host = new URL('http://[' + raw + ']/').hostname;
      if (host.startsWith('[') && host.endsWith(']')) return host.slice(1, -1);
    } catch { /* invalid IPv6 syntax */ }
  }
  throw new Error('UNTRUSTED_CLIENT_IP');
}

/**
 * Je li zahtjev dosao s pouzdanim klijentskim IP-om. Provjerava se NA ULAZU svake funkcije koja
 * limitira ili usporeduje po IP-u, prije ikakvog citanja tijela, upisa, rezervacije, nagrade ili
 * naplate (T84 XFF, Codex P1 na #346): sama iznimka iz hashiranja dolazi prekasno u endpointima koji
 * su do tada vec promijenili stanje.
 */
export function hasTrustedClientIp(headers: HeaderReader): boolean {
  try {
    clientIpFromHeaders(headers);
    return true;
  } catch {
    return false;
  }
}

/**
 * Omotac za Deno.serve: zahtjev bez pouzdanog klijentskog IP-a dobiva 403 client_ip_untrusted PRIJE
 * rukovatelja, dakle prije citanja tijela, auth poziva, rezervacije slota, upisa ili nagrade (sinkrono,
 * bez ijednog await-a). OPTIONS prolazi da CORS preflight ostane na rukovatelju. Odgovor namjerno nema
 * CORS zaglavlja: pouzdan promet kroz Cloudflare uvijek ima cf-connecting-ip, pa ovo vide samo
 * zahtjevi mimo zasticenog ulaza.
 */
export function requireTrustedClientIp(
  handler: (req: Request) => Response | Promise<Response>,
): (req: Request) => Response | Promise<Response> {
  return (req) => {
    if (req.method !== 'OPTIONS' && !hasTrustedClientIp(req.headers)) {
      return new Response(JSON.stringify({ error: 'client_ip_untrusted' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }
    return handler(req);
  };
}

/** Oznaka sheme hashiranja IP-a (v2 = cf-connecting-ip). Stari zapisi (x-forwarded-for) nemaju prefiks. */
export const IP_HASH_SCHEME_PREFIX = 'v2:';

/**
 * Shema kojom je spremljen ip_hash. 'legacy' je sve bez prefiksa v2: (prva shema, x-forwarded-for).
 * Hashevi iz razlicitih shema se NE smiju usporedivati kao jednaki ni kao razliciti: usporedba tada
 * nije moguca, pa pozivatelj mora konzervativno zadrzati odluku (grant-referrer-reward).
 */
export function ipHashScheme(hash: string): 'v2' | 'legacy' {
  return hash.startsWith(IP_HASH_SCHEME_PREFIX) ? 'v2' : 'legacy';
}

/** sha256(input) kao hex. */
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Razrijesi salt: dedicirani IP_HASH_SALT ako je postavljen, inace STABILAN salt izveden iz
 * service-role kljuca (hashiran, ne sirovi kljuc). Tako ip_hash nikad nije nesoljen, cak ni
 * prije nego vlasnik postavi dedicirani secret. Ista derivacija u svim funkcijama pa ostaje
 * konzistentan (anti-fraud usporedba). Isti string kao inline derivacija u faculty-request.
 */
export async function deriveIpSalt(
  explicitSalt: string | null | undefined,
  serviceRoleKey: string,
): Promise<string> {
  if (explicitSalt) return explicitSalt;
  return sha256Hex('lekta-ip-hash-salt|' + serviceRoleKey);
}

/** 'v2:' + sha256(salt + clientIp) kao hex. Ekstrakcija IP-a je fiksna (clientIpFromHeaders). */
export async function hashClientIp(headers: HeaderReader, salt: string): Promise<string> {
  const ip = clientIpFromHeaders(headers);
  return IP_HASH_SCHEME_PREFIX + (await sha256Hex(salt + ip));
}

/**
 * Preporucena varijanta: sam razrijesi salt (dedicirani ili izveden iz service-role kljuca)
 * pa hashira. Pozivatelji NE smiju vise slati goli '' salt (security-02).
 */
export async function hashClientIpSalted(
  headers: HeaderReader,
  explicitSalt: string | null | undefined,
  serviceRoleKey: string,
): Promise<string> {
  const salt = await deriveIpSalt(explicitSalt, serviceRoleKey);
  return hashClientIp(headers, salt);
}
