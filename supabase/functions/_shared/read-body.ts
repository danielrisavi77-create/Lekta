// Citanje HTTP tijela s TVRDOM gornjom granicom (audit P1-04, P1-06).
//
// Zasto postoji: `Content-Length` je tvrdnja KLIJENTA, ne mjera. Zaglavlje se smije izostaviti
// (`Transfer-Encoding: chunked`), poslati krivo ili poslati manje od stvarnog tijela. Provjera
// oblika
//
//     const clen = Number(req.headers.get('content-length') ?? '0');
//     if (clen && clen > MAX) return 413;
//     const body = await req.json();
//
// zato NE ogranicava nista: `clen` je 0 kad zaglavlja nema, uvjet `clen &&` otpadne, i `req.json()`
// procita tijelo do kraja bez ijedne granice. Napadac dobije proizvoljno velik zapis u memoriji
// prije nego je ijedna provjera stigla reci ne.
//
// Ovdje se tijelo cita STREAMOM i prekida u trenutku kad zbroj procitanih bajtova prijedje
// granicu, pa najveci trosak jednog zlonamjernog zahtjeva ostaje `maxBytes + jedan chunk`, bez
// obzira na to sto zaglavlje tvrdi.
//
// Zaglavlje se i dalje gleda, ali samo kao JEFTINO rano odbijanje poste na koju se mozemo
// osloniti kad je iskrena. Ono NIJE granica; granica je brojanje.

export type BoundedBody =
  | { ok: true; text: string }
  | { ok: false; reason: 'too_large' };

/**
 * Procita tijelo zahtjeva kao UTF-8 tekst, ali nikad vise od `maxBytes` bajtova.
 *
 * Vraca `{ ok: false, reason: 'too_large' }` cim tijelo prijedje granicu; pozivatelj na to
 * odgovara s HTTP 413. Prazno tijelo je uredan `{ ok: true, text: '' }`, jer "nema tijela" nije
 * greska ovog sloja nego pitanje validacije koja dolazi poslije.
 *
 * Granica se mjeri u BAJTOVIMA, ne znakovima: hrvatski dijakritici i drugi viseoktetni znakovi
 * inace bi dopustili osjetno vece tijelo od deklariranog limita.
 */
export async function readTextBounded(req: Request, maxBytes: number): Promise<BoundedBody> {
  // Rano odbijanje na temelju zaglavlja. Iskren klijent time ustedi i sebi i nama citanje;
  // neiskren ga preskoci, pa ispod slijedi stvarno brojanje.
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too_large' };

  const body = req.body;
  if (!body) return { ok: true, text: '' };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      // STROGO vece: tijelo tocno na granici je jos uvijek dopusteno.
      if (total > maxBytes) {
        // Otpustamo izvor odmah; ostatak tijela se vise ne cita ni ne alocira.
        await reader.cancel().catch(() => {});
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Spajamo pa tek onda dekodiramo. Dekodiranje chunk po chunk pokvarilo bi viseoktetni znak
  // koji je pao preko granice dva chunka (npr. "š" razlomljen na 0xC5 | 0xA1).
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(joined) };
}
