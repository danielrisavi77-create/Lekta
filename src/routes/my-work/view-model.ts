import type { LocalDocumentSessionSummary } from '../../session/local-document-session';
import type { RepairJob } from '../../report/repair-history';

/**
 * MODEL PRIKAZA ZA `/moji-radovi/`.
 *
 * Cista funkcija stanja: bez DOM-a, bez mreze, bez IndexedDB. Sve odluke o tome STO stranica tvrdi
 * odlucuju se ovdje, pa se mogu izmjeriti bez preglednika.
 *
 * JEDNA ODLUKA JE VAZNIJA OD OSTALIH i zato je izdvojena u tip, ne u komentar:
 *
 *     "pohrana nije dostupna"  NIJE  "nemas spremljenih radova"
 *     "prijava nije ukljucena" NIJE  "nemas popravaka"
 *
 * Prvo je nepoznato stanje, drugo je tvrdnja o korisniku. Kad se stope, stranica kaze studentu da
 * nema rad koji zapravo ima, samo ga ne moze procitati (privatni prozor, blokirani podaci
 * stranice). Isti razred kao `deployedProduction: null` u deploy manifestu, gdje "izvjestaj ne
 * poznaje funkciju" nije isto sto i "funkcija nije deployana".
 */

export type LocalWorkView =
  /** Pohrana je odbijena ili nedostupna. Ne znamo ima li korisnik radova. */
  | { kind: 'unavailable'; reason: string }
  /** Pohrana radi i prazna je. Ovo JEST tvrdnja o korisniku. */
  | { kind: 'empty' }
  | { kind: 'list'; items: LocalWorkItem[] };

export interface LocalWorkItem {
  id: string;
  name: string;
  /** Odrediste je radna povrsina s tom sesijom; fragment nosi SAMO nasumican id. */
  href: string;
  stageLabel: string;
  /** Koliko jos stoji lokalno; sesija ima rok, pa je pretsucivanje toga zavaravanje. */
  expiryLabel: string;
}

export type AccountView =
  /** Backend nije konfiguriran u ovoj izvedbi. Nije isto sto i "nisi prijavljen". */
  | { kind: 'not-configured' }
  | { kind: 'signed-out' }
  | { kind: 'expired'; email: string | null }
  /** Dohvat je pao. Ne znamo ima li popravaka; NE prikazuj kao prazno. */
  | { kind: 'error'; email: string; message: string }
  | { kind: 'empty'; email: string }
  | { kind: 'jobs'; email: string; items: AccountJobItem[] };

export interface AccountJobItem {
  id: string;
  label: string;
  createdLabel: string;
  statusLabel: string;
  /** `false` dok se posao brise: potpisani URL bi vodio u nista. */
  downloadable: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  profile: 'čeka potvrdu profila',
  results: 'nalaz je spreman',
  repairPlan: 'plan popravka',
  comparison: 'usporedba prije i poslije',
  submission: 'predajni paket',
};

/** Rok se izrazava u punim satima; minute ovdje nikoga ne zanimaju, a lazna preciznost smeta. */
export function expiryLabel(expiresAt: number, now: number): string {
  const ms = expiresAt - now;
  if (ms <= 0) return 'istekao';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `još ${hours} h na ovom uređaju`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return `još ${minutes} min na ovom uređaju`;
}

export function localWorkView(
  result: { ok: true; summaries: readonly LocalDocumentSessionSummary[] } | { ok: false; reason: string },
  now: number,
): LocalWorkView {
  if (!result.ok) return { kind: 'unavailable', reason: result.reason };

  // Istekle sesije se ne prikazuju cak i ako ih pohrana vrati: rok je obecanje korisniku, a
  // ponudjena poveznica na istekli rad vodi u prazan zaslon.
  const live = result.summaries.filter((s) => s.expiresAt > now);
  if (live.length === 0) return { kind: 'empty' };

  return {
    kind: 'list',
    items: live.map((s) => ({
      id: s.id,
      name: s.name,
      href: `/rad/#session=${s.id}`,
      stageLabel: STAGE_LABELS[s.stage] ?? 'u tijeku',
      expiryLabel: expiryLabel(s.expiresAt, now),
    })),
  };
}

export function accountView(input: {
  configured: boolean;
  session: { email?: unknown; expiresAt?: unknown } | null;
  now: number;
  jobs: { ok: true; jobs: readonly RepairJob[] } | { ok: false; message: string } | null;
}): AccountView {
  if (!input.configured) return { kind: 'not-configured' };

  const email = typeof input.session?.email === 'string' ? input.session.email : null;
  if (!input.session || !email) return { kind: 'signed-out' };

  const expiresAt = typeof input.session.expiresAt === 'number' ? input.session.expiresAt : null;
  if (expiresAt !== null && expiresAt <= input.now) return { kind: 'expired', email };

  if (!input.jobs) return { kind: 'error', email, message: 'Popis nije dohvaćen.' };
  if (!input.jobs.ok) return { kind: 'error', email, message: input.jobs.message };
  if (input.jobs.jobs.length === 0) return { kind: 'empty', email };

  return {
    kind: 'jobs',
    email,
    items: input.jobs.jobs.map((job) => ({
      id: job.id,
      label: job.label ?? job.workType,
      createdLabel: job.createdAt.slice(0, 10),
      statusLabel: job.deleting ? 'briše se' : job.status,
      downloadable: !job.deleting && job.status === 'done' && job.resultPath.length > 0,
    })),
  };
}
