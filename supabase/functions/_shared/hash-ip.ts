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

/** Gornja granica duljine kljuca: najdulji tekstualni IPv6 zapis ima 45 znakova. */
const MAX_IP_KEY_LENGTH = 64;

/**
 * IP kljuc iz zaglavlja `cf-connecting-ip` koje postavlja Cloudflare ispred Supabase gatewaya.
 * 'unknown' ako zaglavlja nema, prazno je ili nije kratki tekst.
 *
 * T84 XFF (izmjereno na stagingu 2026-10-09, funkcija diag-headers): gateway PREPISUJE klijentski
 * x-forwarded-for u oblik "<ip klijenta>,<ip klijenta>, <promjenjivi AWS cvor>". Zadnji unos je dakle
 * jedan od nekoliko unutarnjih cvorova (isti za mnogo korisnika, i mijenja se), pa je ne valja kao
 * kljuc (zajednicki brojac za sve). Klijentski `cf-connecting-ip` Cloudflare odbija (greska 1000),
 * pa tu vrijednost klijent ne moze podmetnuti. x-forwarded-for i x-real-ip se namjerno NE citaju.
 */
export function clientIpFromHeaders(headers: HeaderReader): string {
  const ip = (headers.get('cf-connecting-ip') ?? '').trim();
  return ip !== '' && ip.length <= MAX_IP_KEY_LENGTH ? ip : 'unknown';
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

/** sha256(salt + clientIp) kao hex. Ekstrakcija IP-a je fiksna (clientIpFromHeaders). */
export async function hashClientIp(headers: HeaderReader, salt: string): Promise<string> {
  const ip = clientIpFromHeaders(headers);
  return sha256Hex(salt + ip);
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
