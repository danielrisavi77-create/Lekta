// Binarni oblik odgovora popravka: metapodaci + docx u JEDNOM tijelu, bez base64.
//
// ZASTO POSTOJI (audit DOCX-05). Odgovor je do sada bio JSON s `docxBase64`. Za dokument od 20 MB
// to znaci, u istom trenutku:
//   - ulazni Uint8Array (20 MB),
//   - raspakirani i ponovno spakirani rezultat (jos toliko),
//   - base64 string (~27 MB, jer base64 raste 4/3),
//   - i JOS jedna kopija istog stringa unutar `JSON.stringify` izlaza (~27 MB).
// Peak je tako visestruko veci od same datoteke, a Edge funkcija ima 256 MB. Binarni oblik brise
// zadnje dvije stavke, dakle ~54 MB stringova po velikom popravku.
//
// ZASTO VLASTITI OKVIR, A NE HEADER: metapodaci nose changelog i rezultat provjere izvora, sto
// zna biti nekoliko kilobajta. HTTP zaglavlja imaju tihe granice (obicno 8 do 16 KB, ovisno o
// posredniku) i kad se probiju, odgovor se odbija bez korisne poruke. Okvir u tijelu nema tu
// granicu i lako se testira s obje strane.
//
// FORMAT (little-endian, jer su i zip strukture LE pa nema mijesanja konvencija):
//   [0..3]   uint32  duljina JSON metapodataka u bajtovima
//   [4..4+n) UTF-8   JSON metapodaci (sve osim samog dokumenta)
//   [4+n..]  bajtovi .docx dokumenta
//
// Stari klijent ovo NIKAD ne vidi: server salje binarni oblik samo kad ga klijent izricito
// zatrazi (`X-Lekta-Response: binary`), inace vraca zatecen JSON.

/** Zaglavlje kojim klijent trazi binarni oblik odgovora. */
export const REPAIR_BINARY_REQUEST_HEADER = 'X-Lekta-Response';
export const REPAIR_BINARY_REQUEST_VALUE = 'binary';

/** Content-Type binarnog oblika. Namjerno vlastiti tip: nijedan posrednik ga nece pokusati tumaciti. */
export const REPAIR_BINARY_CONTENT_TYPE = 'application/x-lekta-repair';

/** Gornja granica duljine metapodataka; stiti od okvira koji tvrdi besmislenu duljinu. */
const MAX_META_BYTES = 4 * 1024 * 1024;

/** Spoji metapodatke i dokument u jedno tijelo. */
export function encodeRepairFrame(meta: unknown, docxBytes: Uint8Array): Uint8Array {
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const out = new Uint8Array(4 + metaBytes.length + docxBytes.length);
  new DataView(out.buffer).setUint32(0, metaBytes.length, true);
  out.set(metaBytes, 4);
  out.set(docxBytes, 4 + metaBytes.length);
  return out;
}

export interface DecodedRepairFrame<T = Record<string, unknown>> {
  meta: T;
  docxBytes: Uint8Array;
}

/**
 * Rastavi tijelo natrag u metapodatke i dokument.
 *
 * Baca na svaki oblik koji ne odgovara okviru. Namjerno NE pokusava spasiti djelomicno tijelo:
 * krnji odgovor koji bismo "nekako" protumacili zavrsio bi kao ostecen .docx u korisnikovim
 * rukama, a to je gore od jasne greske.
 */
export function decodeRepairFrame<T = Record<string, unknown>>(body: Uint8Array): DecodedRepairFrame<T> {
  if (body.length < 4) throw new Error('repair-framing: tijelo je krace od zaglavlja okvira');
  const metaLength = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true);
  if (metaLength > MAX_META_BYTES) {
    throw new Error(`repair-framing: metapodaci tvrde ${metaLength} bajta, iznad dopustenog`);
  }
  if (4 + metaLength > body.length) {
    throw new Error('repair-framing: metapodaci prelaze duljinu tijela (krnji odgovor)');
  }
  const metaText = new TextDecoder().decode(body.subarray(4, 4 + metaLength));
  let meta: T;
  try {
    meta = JSON.parse(metaText) as T;
  } catch {
    throw new Error('repair-framing: metapodaci nisu valjan JSON');
  }
  // `slice`, ne `subarray`: rezultat mora biti neovisan o velikom ulaznom bufferu, inace bi
  // zadrzavanje malog dokumenta drzalo zivim cijelo tijelo odgovora.
  return { meta, docxBytes: body.slice(4 + metaLength) };
}
