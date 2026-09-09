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

// `Uint8Array<ArrayBuffer>`, ne goli `Uint8Array`: `Response` (BodyInit) i TextDecoder traze pravi
// ArrayBuffer ispod, a `Uint8Array<ArrayBufferLike>` Deno odbija tipski (TS2345).
export type BoundedBytes =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; reason: 'too_large' };

export type BoundedForm =
  | { ok: true; form: FormData }
  | { ok: false; reason: 'too_large' | 'bad_request' };

/**
 * Procita tijelo zahtjeva kao SIROVE BAJTOVE, ali nikad vise od `maxBytes`.
 *
 * Ovo je jedina petlja koja stvarno broji; `readTextBounded` i `readFormDataBounded` su tanki
 * omotaci nad njom. Izdvojena je 2026-09-09 (vanjski audit, nalaz 5) jer je `repair-docx` kao
 * jedina funkcija s visemegabajtnim BINARNIM tijelom ostala bez granice: tekstualna varijanta joj
 * nije mogla posluziti, pa je zvala `req.formData()` izravno i parsirala cijeli multipart prije
 * ijedne provjere velicine.
 */
export async function readBytesBounded(req: Request, maxBytes: number): Promise<BoundedBytes> {
  // Rano odbijanje na temelju zaglavlja. Iskren klijent time ustedi i sebi i nama citanje;
  // neiskren ga preskoci, pa ispod slijedi stvarno brojanje.
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too_large' };

  const body = req.body;
  if (!body) return { ok: true, bytes: new Uint8Array(0) };

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

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: joined };
}

/**
 * Procita tijelo zahtjeva kao UTF-8 tekst, ali nikad vise od `maxBytes` bajtova.
 *
 * Vraca `{ ok: false, reason: 'too_large' }` cim tijelo prijedje granicu; pozivatelj na to
 * odgovara s HTTP 413. Prazno tijelo je uredan `{ ok: true, text: '' }`, jer "nema tijela" nije
 * greska ovog sloja nego pitanje validacije koja dolazi poslije.
 *
 * Granica se mjeri u BAJTOVIMA, ne znakovima: hrvatski dijakritici i drugi viseoktetni znakovi
 * inace bi dopustili osjetno vece tijelo od deklariranog limita. Dekodira se tek SPOJENI niz:
 * dekodiranje chunk po chunk pokvarilo bi viseoktetni znak koji je pao preko granice dva chunka
 * (npr. "š" razlomljen na 0xC5 | 0xA1).
 */
export async function readTextBounded(req: Request, maxBytes: number): Promise<BoundedBody> {
  const out = await readBytesBounded(req, maxBytes);
  if (!out.ok) return out;
  return { ok: true, text: new TextDecoder().decode(out.bytes) };
}

/**
 * Procita multipart tijelo (`FormData`), ali tek NAKON sto je cijelo tijelo omedjeno brojanjem.
 *
 * `req.formData()` sam po sebi cita do kraja i tek onda vraca dijelove, pa provjera velicine
 * datoteke POSLIJE njega stize kad je memorija vec potrosena. Ovdje se bajtovi prvo omedje
 * (`readBytesBounded`), pa se parsiraju kroz `Response`, koji za multipart treba samo
 * `content-type` s `boundary` parametrom. Bez tog zaglavlja parser baca, sto je ispravan 400.
 *
 * `maxBytes` je granica za CIJELO tijelo (datoteka + meta + multipart okvir), ne za jedan dio;
 * pozivatelj granicu pojedinog dijela provjerava sam, jer samo on zna sto koji dio smije nositi.
 */
export async function readFormDataBounded(req: Request, maxBytes: number): Promise<BoundedForm> {
  const out = await readBytesBounded(req, maxBytes);
  if (!out.ok) return out;
  try {
    const form = await new Response(out.bytes, {
      headers: { 'content-type': req.headers.get('content-type') ?? '' },
    }).formData();
    return { ok: true, form };
  } catch {
    return { ok: false, reason: 'bad_request' };
  }
}

/**
 * Smije li tekstualni dio (npr. `meta` JSON) uci u obradu: mjeri se u BAJTOVIMA UTF-8, ne u
 * znakovima, iz istog razloga kao i granica tijela. Cista funkcija, pa ju mutacijski test moze
 * pozvati sinkrono.
 */
export function metaWithinBudget(metaRaw: string, maxBytes: number): boolean {
  return new TextEncoder().encode(metaRaw).byteLength <= maxBytes;
}
