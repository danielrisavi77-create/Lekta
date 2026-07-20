/**
 * Admin "mini stats": read-only agregati bete.
 *
 * Namjerno NE postoji nijedna funkcija koja dohvaca tudji dokument, naslov ili e-mail. Modul
 * barata iskljucivo brojevima koje vrati Edge funkcija `admin-stats`; pravo se provjerava
 * serverski (tablica `admin_users`, migracija 0031), pa je ovaj kod bezopasan i ako ga netko
 * ucita bez ovlasti: bez admin retka poslužitelj vraca 403 i ovdje nema sto prikazati.
 *
 * Dijeljeni obrazac s `session.ts`/`repair-client.ts`: injektabilan `fetch` da je testabilno.
 */

export interface AdminStatsConfig {
  endpoint: string;
}

export interface BetaStats {
  generatedAt?: string;
  repair?: {
    total?: number; last24h?: number; last7d?: number; distinctUsers?: number;
    failed?: number; resultBytes?: number; originalBytes?: number; avgChanges?: number;
  };
  generations24h?: Record<string, number>;
  byWorkType?: Record<string, number>;
  users?: { total?: number; last7d?: number };
  storage?: { objects?: number; bytes?: number };
}

export type AdminStatsResult =
  | { ok: true; stats: BetaStats }
  | { ok: false; message: string };

/** Dohvati agregate. Poruke su namjerno razlicite za 401 i 403: prvo je "nisi prijavljen", drugo "nisi admin". */
export async function fetchAdminStats(
  cfg: AdminStatsConfig,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdminStatsResult> {
  if (!cfg.endpoint) return { ok: false, message: 'admin endpoint nije konfiguriran' };
  if (!token) return { ok: false, message: 'potrebna je prijava' };
  try {
    const res = await fetchImpl(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    if (res.status === 401) return { ok: false, message: 'prijava je istekla, prijavi se ponovno' };
    if (res.status === 403) return { ok: false, message: 'ovaj račun nema administratorska prava' };
    if (!res.ok) return { ok: false, message: `dohvat nije uspio (${res.status})` };
    const body = await res.json().catch(() => null);
    const stats = body && typeof body === 'object' ? (body as { stats?: BetaStats }).stats : null;
    if (!stats || typeof stats !== 'object') return { ok: false, message: 'nevaljan odgovor poslužitelja' };
    return { ok: true, stats };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'mrežna greška' };
  }
}

/** Bajtovi u citljiv oblik (hrvatski decimalni zarez). */
export function formatBytes(bytes: number | undefined): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : 0).replace('.', ',')} MB`;
  return `${(mb / 1024).toFixed(2).replace('.', ',')} GB`;
}

export interface StatTile { label: string; value: string; hint?: string }

/**
 * Agregati -> ploce za prikaz. Cista funkcija (bez DOM-a) da se ponasanje moze testirati,
 * ukljucujuci prazno stanje: kad jos nema nijednog popravka, mora vratiti nule, ne rusiti se.
 */
export function toStatTiles(stats: BetaStats): StatTile[] {
  const r = stats.repair ?? {};
  const g = stats.generations24h ?? {};
  const u = stats.users ?? {};
  const s = stats.storage ?? {};
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const rateLimited = num(g['rate_limited']);
  const failed = num(r.failed) + num(g['repair_failed']);

  return [
    { label: 'Popravaka ukupno', value: String(num(r.total)), hint: `${num(r.last7d)} u 7 dana` },
    { label: 'Popravaka (24 h)', value: String(num(r.last24h)) },
    { label: 'Korisnika s popravkom', value: String(num(r.distinctUsers)), hint: `${num(u.total)} registriranih` },
    { label: 'Novih računa (7 dana)', value: String(num(u.last7d)) },
    { label: 'Prosječno izmjena', value: String(num(r.avgChanges)).replace('.', ',') },
    { label: 'Neuspjelih popravaka', value: String(failed), hint: failed ? 'provjeri Edge logove' : 'bez grešaka' },
    { label: 'Odbijeno zbog limita (24 h)', value: String(rateLimited) },
    { label: 'Pohrana', value: formatBytes(s.bytes), hint: `${num(s.objects)} datoteka` },
  ];
}

/** Raspodjela po vrsti rada, sortirana silazno; prazno kad jos nema podataka. */
export function toWorkTypeRows(stats: BetaStats): Array<{ workType: string; count: number }> {
  const by = stats.byWorkType ?? {};
  return Object.entries(by)
    .map(([workType, count]) => ({ workType, count: Number(count) || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.workType.localeCompare(b.workType, 'hr'));
}
