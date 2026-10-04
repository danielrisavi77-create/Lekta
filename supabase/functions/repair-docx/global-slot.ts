// supabase/functions/repair-docx/global-slot.ts
//
// GLOBALNI slot popravka iz baze (audit DOCX-06) s limitom PO KORISNIKU (T84 RD-3).
//
// Prije je `try_acquire_repair_slot` (0094) brojao samo globalno (4), pa je jedan racun s cetiri
// paralelna teska zahtjeva drzao sve ostale na 503 `busy` do isteka leasea (300 s). Migracija 0209
// dodaje `try_acquire_repair_slot_for_user`, koja uz globalni limit broji i slotove istog korisnika.
//
// Cetiri ishoda, i sva su namjerna:
//   - `ok`        : slot dobiven, `release()` ga vraca (jednokratno);
//   - `full`      : globalni limit dosegnut -> 503 busy;
//   - `user_busy` : korisnik vec drzi svoje slotove -> 503 busy (klijent vec zna taj odgovor);
//   - `absent`    : nijedan RPC ne radi. Popravak se tada NE blokira, nego pada na per-instance
//                   gate uz glasan log, jer isporuka koda i migracije nisu atomarne.
// Dok 0209 nije primijenjena, novi RPC ne postoji: tada se koristi stari globalni (0094), pa
// zastita nikad ne padne ispod danasnje.
//
// deno-lint-ignore-file no-explicit-any

export interface RepairSlotLimits {
  userId: string;
  maxGlobal: number;
  maxPerUser: number;
  leaseSeconds: number;
}

export type RepairSlot =
  | { kind: 'ok'; release: () => Promise<void> }
  | { kind: 'full' }
  | { kind: 'user_busy' }
  | { kind: 'absent'; release: null };

function releaser(admin: any, slotId: string): () => Promise<void> {
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    const { error } = await admin.rpc('release_repair_slot', { p_id: slotId });
    // Neoslobodjen slot nije trajan kvar: lease ga pocisti pri sljedecem preuzimanju.
    if (error) console.error('[repair-docx] globalni slot nije oslobodjen', error.message);
  };
}

export async function acquireRepairSlot(admin: any, limits: RepairSlotLimits): Promise<RepairSlot> {
  try {
    const perUser = await admin.rpc('try_acquire_repair_slot_for_user', {
      p_max: limits.maxGlobal,
      p_lease_seconds: limits.leaseSeconds,
      p_user_id: limits.userId,
      p_max_per_user: limits.maxPerUser,
    });
    if (!perUser.error) {
      const row = Array.isArray(perUser.data) ? perUser.data[0] : perUser.data;
      if (row?.reason === 'user_busy') return { kind: 'user_busy' };
      if (!row?.slot_id) return { kind: 'full' };
      return { kind: 'ok', release: releaser(admin, String(row.slot_id)) };
    }
    console.error('[repair-docx] slot po korisniku nedostupan (0209?), padam na globalni', perUser.error.message);

    const global = await admin.rpc('try_acquire_repair_slot', {
      p_max: limits.maxGlobal,
      p_lease_seconds: limits.leaseSeconds,
    });
    if (global.error) {
      console.error('[repair-docx] globalni slot nedostupan, padam na per-instance gate', global.error.message);
      return { kind: 'absent', release: null };
    }
    if (!global.data) return { kind: 'full' };
    return { kind: 'ok', release: releaser(admin, String(global.data)) };
  } catch (e) {
    console.error('[repair-docx] globalni slot: neocekivana greska, padam na per-instance gate', e);
    return { kind: 'absent', release: null };
  }
}
