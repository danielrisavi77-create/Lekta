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

/**
 * IP kljuc iz x-forwarded-for: ZADNJI unos liste, tj. adresa koju je dodao najblizi proxy (gateway).
 * 'unknown' ako header nedostaje ili je prazan.
 *
 * T84 XFF (2026-10-04): mjerenje na stagingu pokazalo je da Supabase gateway CUVA klijentski
 * x-forwarded-for i svoju adresu dodaje iza njega. Prvi unos zato bira klijent: svaki izmisljen prvi
 * unos davao je nov brojac za IP limite (besplatni popravak, source-check, waitlist) i za IP usporedbu
 * u nagradi preporucitelju. Zadnji unos klijent ne moze postaviti. Prije deploya mjerenje na stagingu
 * mora potvrditi i drugu stranu: zadnji unos nije zajednicka unutarnja adresa (inace bi svi korisnici
 * dijelili jedan brojac).
 */
export function clientIpFromForwarded(forwardedFor: string | null): string {
  const hops = (forwardedFor ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  return hops.at(-1) ?? 'unknown';
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

/** sha256(salt + clientIp) kao hex. Ekstrakcija IP-a je fiksna (clientIpFromForwarded). */
export async function hashClientIp(forwardedFor: string | null, salt: string): Promise<string> {
  const ip = clientIpFromForwarded(forwardedFor);
  return sha256Hex(salt + ip);
}

/**
 * Preporucena varijanta: sam razrijesi salt (dedicirani ili izveden iz service-role kljuca)
 * pa hashira. Pozivatelji NE smiju vise slati goli '' salt (security-02).
 */
export async function hashClientIpSalted(
  forwardedFor: string | null,
  explicitSalt: string | null | undefined,
  serviceRoleKey: string,
): Promise<string> {
  const salt = await deriveIpSalt(explicitSalt, serviceRoleKey);
  return hashClientIp(forwardedFor, salt);
}
