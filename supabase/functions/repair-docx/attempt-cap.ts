// supabase/functions/repair-docx/attempt-cap.ts
//
// T84 RD-2: dnevni strop ishoda koji NE trose kvotu ni slot (popravak bez izmjena, odbijena isporuka na
// vratima integriteta). Korisnik za njih ne placa, ali svaki je puni rad (citanje do 20 MB, readZip,
// applyFixers), pa bez stropa jedan racun moze isti dokument ponavljati bez kraja.
//
// Dnevnik je zasebna tablica `repair_attempt_log` (0209), ne report_generations, pa ga ne vide placeni
// strop generate-reporta ni ostali potrosaci te tablice (Codex R4 na #294).
//
// Oba poziva su FAIL-CLOSED (Codex R2 i R3 na #294): greska ili nepoznat broj nije "ispod stropa", a
// neuspjeli upis nije tiho propusten, jer bi inace strop prestao djelovati bas kad dnevnik ne radi.
//
// deno-lint-ignore-file no-explicit-any

export type AttemptOutcome = 'no_change' | 'integrity_failed';
export type AttemptCapStatus = 'ok' | 'over' | 'error';

const DAY_MS = 24 * 3600 * 1000;

/** Je li korisnik u zadnja 24 sata dosegao strop ishoda bez potrosnje. cap <= 0 iskljucuje strop. */
export async function attemptCapStatus(admin: any, userId: string, cap: number, now: number = Date.now()): Promise<AttemptCapStatus> {
  if (!(cap > 0)) return 'ok';
  try {
    const { count, error } = await admin.from('repair_attempt_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', new Date(now - DAY_MS).toISOString());
    if (error || typeof count !== 'number') {
      console.error('[repair-docx] dnevnik pokusaja necitljiv', error?.message ?? 'count null');
      return 'error';
    }
    return count >= cap ? 'over' : 'ok';
  } catch (e) {
    console.error('[repair-docx] dnevnik pokusaja necitljiv', e);
    return 'error';
  }
}

/** Upisi ishod bez potrosnje. false znaci da upis nije uspio i pozivatelj ne smije tiho nastaviti. */
export async function recordAttempt(admin: any, userId: string, outcome: AttemptOutcome): Promise<boolean> {
  try {
    const { error } = await admin.from('repair_attempt_log').insert({ user_id: userId, outcome });
    if (error) console.error('[repair-docx] upis u dnevnik pokusaja nije uspio', error.message);
    return !error;
  } catch (e) {
    console.error('[repair-docx] upis u dnevnik pokusaja nije uspio', e);
    return false;
  }
}
