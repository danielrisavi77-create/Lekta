// supabase/functions/_shared/hash-ip.ts
//
// Kanonsko soljeno hashiranje klijentskog IP-a. JEDAN izvor istine da SVE funkcije koje pisu
// ip_hash (generate-report, redeem-referral-signup) proizvedu ISTU vrijednost za isti IP. To je
// preduvjet da anti-fraud provjera u grant-referrer-reward moze usporediti referred_ip_hash
// (iz signupa) s report_generations.ip_hash (od preporucitelja). Bez zajednicke ekstrakcije
// I salta usporedba je besmislena.
//
// Salt (IP_HASH_SALT) je GDPR ojacanje (nesoljeni sha256 IPv4 je reverzibilan). Ako salt nije
// postavljen, obje strane koriste '' pa su i dalje medusobno konzistentne (samo bez GDPR koristi).

/** Prvi (klijentski) IP iz x-forwarded-for liste; 'unknown' ako header nedostaje. */
export function clientIpFromForwarded(forwardedFor: string | null): string {
  return (forwardedFor ?? '').split(',')[0].trim() || 'unknown';
}

/** sha256(salt + clientIp) kao hex. Ekstrakcija IP-a je fiksna (clientIpFromForwarded). */
export async function hashClientIp(forwardedFor: string | null, salt: string): Promise<string> {
  const ip = clientIpFromForwarded(forwardedFor);
  const enc = new TextEncoder().encode(salt + ip);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
