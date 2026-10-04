// supabase/functions/repair-docx/attempt-cap.ts
//
// T84 RD-2: dnevni strop ishoda koji NE trose kvotu ni slot (popravak bez izmjena, odbijena isporuka na
// vratima integriteta). Korisnik za njih ne placa, ali svaki je puni rad (citanje do 20 MB, readZip,
// applyFixers), pa bez stropa jedan racun moze isti dokument ponavljati bez kraja.
//
// Dnevnik je zasebna tablica `repair_attempt_log` (0209), ne report_generations, pa ga ne vide placeni
// strop generate-reporta ni ostali potrosaci te tablice (Codex R4 na #294).
//
// Pokusaj se REZERVIRA upisom retka `pending` PRIJE citanja tijela (Codex R3 na #294, runda 2), pa
// skupi rad uvijek ima zapis koji strop broji. Neuspjela rezervacija je 503 prije skupog rada. Na
// kraju se ishod dopisuje (`no_change`, `integrity_failed`), a kad je pokusaj zabiljezen u
// report_generations (pa ga broji drugi strop), rezervacija se brise da se ne broji dvaput. Neuspjelo
// dopisivanje ili brisanje ostavlja `pending`, koji se i dalje broji: greska je na strani stroze.
//
// Citanje je FAIL-CLOSED (Codex R2 na #294): greska ili nepoznat broj nije "ispod stropa".
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

/** Rezervacija pokusaja: `off` kad je strop iskljucen, inace id retka `pending`. */
export type AttemptReservation = { kind: 'off' } | { kind: 'reserved'; id: string };

/**
 * Upisi `pending` redak prije citanja tijela. null znaci da upis nije uspio: pozivatelj odgovara 503
 * prije skupog rada. cap <= 0 iskljucuje strop i nista se ne upisuje.
 */
export async function reserveAttempt(admin: any, userId: string, cap: number): Promise<AttemptReservation | null> {
  if (!(cap > 0)) return { kind: 'off' };
  try {
    const { data, error } = await admin.from('repair_attempt_log')
      .insert({ user_id: userId, outcome: 'pending' })
      .select('id')
      .single();
    if (error || typeof data?.id !== 'string') {
      console.error('[repair-docx] rezervacija pokusaja nije uspjela', error?.message ?? 'bez id-a');
      return null;
    }
    return { kind: 'reserved', id: data.id };
  } catch (e) {
    console.error('[repair-docx] rezervacija pokusaja nije uspjela', e);
    return null;
  }
}

/** Dopisi ishod bez potrosnje na rezervaciju. false: redak ostaje `pending` i dalje se broji. */
export async function finishAttempt(admin: any, reservation: AttemptReservation, outcome: AttemptOutcome): Promise<boolean> {
  if (reservation.kind === 'off') return true;
  try {
    const { error } = await admin.from('repair_attempt_log').update({ outcome }).eq('id', reservation.id);
    if (error) console.error('[repair-docx] ishod pokusaja nije dopisan', error.message);
    return !error;
  } catch (e) {
    console.error('[repair-docx] ishod pokusaja nije dopisan', e);
    return false;
  }
}

/**
 * Obrisi rezervaciju jer je pokusaj zabiljezen u report_generations i broji ga drugi strop.
 * false: redak ostaje `pending` i broji se u ovaj strop (stroze, ne blaze).
 */
export async function dropAttempt(admin: any, reservation: AttemptReservation): Promise<boolean> {
  if (reservation.kind === 'off') return true;
  try {
    const { error } = await admin.from('repair_attempt_log').delete().eq('id', reservation.id);
    if (error) console.error('[repair-docx] rezervacija pokusaja nije obrisana', error.message);
    return !error;
  } catch (e) {
    console.error('[repair-docx] rezervacija pokusaja nije obrisana', e);
    return false;
  }
}
