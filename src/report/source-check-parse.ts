/**
 * Ishod provjere postojanja izvora u hrvatskom korpusu i njegovo OBRAMBENO citanje.
 *
 * Izdvojeno iz repair-client.ts jer isti oblik sada dolazi s DVA mjesta: uz popravak (naslijedjeni,
 * spojeni put) i iz zasebne source-check funkcije (novi, usporedni put). Jedan parser znaci da se
 * ta dva ne mogu razici u tome sto smatraju valjanim rezultatom.
 *
 * `found` sadrzi ISKLJUCIVO pogotke; izostanak reference iz tog popisa NIJE dokaz da izvor ne
 * postoji (korpus pokriva hrvatske repozitorije, ne knjige ni strane izvore). `checked`/`total`
 * postoje da se djelomican rezultat (potrosen budzet vremena) ne bi prikazao kao potpun.
 */

export interface RepairSourceCheck {
  found: Array<{
    index: number;
    verdict: 'found' | 'weak';
    score: number;
    matchedTitle: string;
    where: string;
    url: string | null;
  }>;
  checked: number;
  total: number;
  truncated: boolean;
}

/**
 * Procitaj `sourceCheck` obrambeno. Provjera izvora je DODATAK: bilo kakav neocekivan oblik (stari
 * server bez K3, ugasena zastavica, ostecen JSON) daje `null`, a popravak se svejedno isporucuje.
 * Verdikt izvan {found, weak} se odbacuje jer korpus druge presude ne smije donositi.
 */
export function parseSourceCheck(raw: unknown): RepairSourceCheck | null {
  const sc = raw as Partial<RepairSourceCheck> | null | undefined;
  if (!sc || typeof sc !== 'object' || !Array.isArray(sc.found)) return null;
  const total = Number(sc.total);
  const checked = Number(sc.checked);
  if (!Number.isFinite(total) || total <= 0) return null;
  const found = sc.found
    .filter((f: any) => f && (f.verdict === 'found' || f.verdict === 'weak')
      && Number.isInteger(f.index) && f.index >= 0 && typeof f.matchedTitle === 'string')
    .map((f: any) => ({
      index: f.index as number,
      verdict: f.verdict as 'found' | 'weak',
      score: Number.isFinite(Number(f.score)) ? Number(f.score) : 0,
      matchedTitle: String(f.matchedTitle),
      where: typeof f.where === 'string' && f.where ? f.where : 'hrvatski repozitorij',
      url: typeof f.url === 'string' && f.url ? f.url : null,
    }));
  const safeChecked = Number.isFinite(checked) ? Math.max(0, Math.min(checked, total)) : 0;
  return { found, checked: safeChecked, total, truncated: sc.truncated === true || safeChecked < total };
}
