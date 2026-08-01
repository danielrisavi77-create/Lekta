/**
 * Concurrency i storage-kvota za repair-docx. Ciste, testabilne odluke koje Edge Function
 * poziva; DB I/O i env citanje ostaju u supabase/functions/repair-docx/index.ts (isti
 * obrazac kao decideReportAccess/unambiguousMismatch u ovom direktoriju).
 *
 * AUDIT_MASTER.md, poglavlje 9: repair-docx je imao file-size limit i dnevni cap po
 * korisniku/IP-u, ali NI concurrency limit NI storage-quota/kill switch (za razliku od
 * preflight-start, koji kill switch vec ima). Ovo popunjava ta dva nedostajuca sloja.
 */

/**
 * Best-effort semafor PO IZOLATU. Deno Edge funkcije mogu voziti na vise usporednih
 * instanci (autoscale), pa ovo NIJE globalno atomicna brana, isto ograničenje kao vec
 * dokumentirani TOCTOU na per-user dnevnim capovima drugdje u repair-docx/preflight-start.
 * Cilj je jeftino uhvatiti "ista topla instanca dobila vise paralelnih teskih zahtjeva"
 * prije nego se popravak i pohrana pokrenu, ne zamijeniti pravi cross-instance rate limit.
 */
export class ConcurrencyGate {
  private inFlight = 0;
  constructor(private readonly max: number) {}

  /** true = slot dobiven, pozivatelj MORA zvati release() kad zavrsi (uspjeh ili greska). */
  tryAcquire(): boolean {
    if (this.max <= 0) return true; // 0 ili negativno = limit iskljucen
    if (this.inFlight >= this.max) return false;
    this.inFlight++;
    return true;
  }

  release(): void {
    if (this.inFlight > 0) this.inFlight--;
  }

  get current(): number {
    return this.inFlight;
  }
}

/**
 * Treba li preskociti pohranu u "Moji popravci" zbog globalne dnevne kvote broja poslova.
 * Sam popravak dokumenta NIKAD ne ovisi o ovome: pohrana je vec fail-open (storeRepairJob
 * moze vratiti null bez greske za korisnika), ovo je samo dodatan razlog za isti ishod, da
 * neograničen upis u Storage ne postane trosak/DoS povrsina dok naplata ne stane iza njega.
 */
export function storageQuotaExceeded(recentJobCount: number, dailyCap: number): boolean {
  if (dailyCap <= 0) return false; // 0 ili negativno = bez ogranicenja
  return recentJobCount >= dailyCap;
}
