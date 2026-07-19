// src/repair/zip-codec.ts
//
// Docx je zip. Ovo je namjerno MINIMALAN, bez-ovisnosti ZIP citac/pisac
// (koristi Web Streams API CompressionStream/DecompressionStream, dostupno u
// modernim preglednicima i Node 18+), isti stil kao GOLDEN.md vec koristi
// DecompressionStream za citanje. Ne koristi JSZip ni slicnu biblioteku
// namjerno: manje ovisnosti, potpuna kontrola nad tim sto se dira.
//
// VAZNO o "bit-identicnosti": writeZip UVIJEK rekomprimira svaki entry
// (DEFLATE), pa komprimirani BYTEOVI netaknutog entryja mogu biti drugaciji
// nego u originalnom fajlu (razliciti deflate parametri mogu dati drugaciji
// bajt-stream za isti sadrzaj). To je OCEKIVANO i bezopasno, Word i svaki
// alat za otvaranje zipa gleda DEKOMPRIMIRANI sadrzaj, ne komprimirane
// bajtove. Golden test (fixers.test.ts) zato provjerava DEKOMPRIMIRANI
// sadrzaj netaknutih entryja je bit-identican, ne sirovi zip byte stream.

export interface ZipEntry {
  name: string;
  data: Uint8Array; // uvijek DEKOMPRIMIRAN sadrzaj
}

/** Zastitne granice citanja (WS-6.5). Izostavljeno = produkcijski defaulti (dovoljno siroki za pravi docx). */
export interface ReadZipLimits {
  maxEntries?: number;            // max broj zip entryja (default MAX_ZIP_ENTRIES)
  maxTotalDecompressed?: number;  // max ukupno dekomprimiranih bajtova (default MAX_TOTAL_DECOMPRESSED_BYTES)
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

// Zip-bomb / entry-flood obrana (WS-6.5). Ovaj codec vrti se i u pregledniku (klijentski repair)
// i na Supabase Edge (256MB, server-side repair), pa mora sam stati pred zlonamjernim docx-om,
// neovisno o parserovom intake-gateu (koji NE stiti repair putanju). Granice su namjerno daleko
// iznad svega realnog: pravi Word docx ima ~15-40 entryja i dekomprimira se na jedinice do desetke
// MB (i s medijem), pa validan rad nikad ne okine ove capove niti mijenja golden. Bomba (npr. mali
// deflate koji naraste u GB) presijeca se cim ukupna dekompresija probije budzet.
// VAZNO za peak memorije: inflateRaw skuplja chunkove pa concatBytes alocira JOS jedan buffer iste
// velicine dok su chunkovi jos zivi, pa je tranzijentni peak do 2x budzeta. Zato je budzet 64MB (a
// ne blizu 256MB): peak ostaje <= ~128MB, sto s ulazom (do 20MB) i runtime baselineom stane ispod
// Edge 256MB. Presjek (reader.cancel + throw) oslobodi memoriju odmah i da cist 422 umjesto OOM-a.
const MAX_ZIP_ENTRIES = 4096;
const MAX_TOTAL_DECOMPRESSED_BYTES = 64 * 1024 * 1024; // 64 MB ukupno; s 2x concat peakom <= ~128MB

function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crc32Table();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(data as Uint8Array<ArrayBuffer>);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concatBytes(chunks);
}

// `budget` je preostali dopusteni broj DEKOMPRIMIRANIH bajtova. Presjecamo stream cim ga probije
// (a ne tek na kraju), pa jedan bombasti entry ne moze alocirati GB prije provjere. Uncompressed-size
// polje iz zip headera je nepouzdano (moze biti lazirano), zato mjerimo STVARNI izlaz streama.
async function inflateRaw(data: Uint8Array, budget: number): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  // Fire-and-forget upis: ako presjecemo reader.cancel()-om zbog budzeta, writable se abortira i
  // write/close odbiju (ABORT_ERR). Drzimo promise da ga u finally progutamo (inace unhandled rejection).
  const pump = (async () => {
    try { await writer.write(data as Uint8Array<ArrayBuffer>); await writer.close(); }
    catch { /* namjerno: cancel je abortirao pisanje */ }
  })();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.readable.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > budget) {
        await reader.cancel().catch(() => {});
        throw new Error('zip-codec: dekomprimirani sadrzaj prelazi dopusteni budzet (moguca zip-bomba)');
      }
      chunks.push(value);
    }
  } finally {
    await pump.catch(() => {});
  }
  return concatBytes(chunks);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;

  writeBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  writeUint16(value: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, value, true);
    this.writeBytes(b);
  }

  writeUint32(value: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, value, true);
    this.writeBytes(b);
  }

  writeString(s: string): void {
    this.writeBytes(new TextEncoder().encode(s));
  }

  toBytes(): Uint8Array {
    return concatBytes(this.chunks);
  }
}

/**
 * Cita zip datoteku u niz entryja, dekomprimirajuci sve na DEFLATE ili STORED.
 * Poredak entryja u vracenom nizu odgovara poretku u central directoryju.
 */
export async function readZip(bytes: Uint8Array, limits?: ReadZipLimits): Promise<ZipEntry[]> {
  const maxEntries = limits?.maxEntries ?? MAX_ZIP_ENTRIES;
  const maxTotalDecompressed = limits?.maxTotalDecompressed ?? MAX_TOTAL_DECOMPRESSED_BYTES;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Nadji EOCD, traziti unatrag od kraja (dopusta proizvoljan komentar polje).
  let eocdOffset = -1;
  const maxCommentScan = Math.min(bytes.length, 65557); // 22 + max 65535 komentar
  for (let i = bytes.length - 22; i >= bytes.length - maxCommentScan && i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('zip-codec: EOCD potpis nije pronadjen, nije valjan zip');

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries > maxEntries) {
    throw new Error(`zip-codec: previse zip entryja (${totalEntries} > ${maxEntries}), moguc entry-flood`);
  }

  const entries: ZipEntry[] = [];
  let ptr = centralDirOffset;
  let decompressedBudget = maxTotalDecompressed;

  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(ptr, true) !== CENTRAL_DIR_SIG) {
      throw new Error(`zip-codec: ocekivan central directory potpis na offsetu ${ptr}`);
    }
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLength = view.getUint16(ptr + 28, true);
    const extraLength = view.getUint16(ptr + 30, true);
    const commentLength = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);
    const nameBytes = bytes.subarray(ptr + 46, ptr + 46 + fileNameLength);
    const name = new TextDecoder().decode(nameBytes);

    // Procitaj lokalni header da znamo TOCAN pocetak podataka (extra polje se
    // moze razlikovati izmedju lokalnog i central directory zapisa).
    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIG) {
      throw new Error(`zip-codec: ocekivan local file header potpis na offsetu ${localHeaderOffset}`);
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedData = bytes.subarray(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (compressionMethod === 0) {
      // STORED: "dekomprimirani" sadrzaj su sami bajtovi, pa i njih naplacujemo iz budzeta.
      if (compressedData.length > decompressedBudget) {
        throw new Error('zip-codec: sadrzaj prelazi dopusteni budzet (moguca zip-bomba)');
      }
      data = compressedData.slice();
    } else if (compressionMethod === 8) {
      data = await inflateRaw(compressedData, decompressedBudget);
    } else {
      throw new Error(`zip-codec: nepodrzana kompresijska metoda ${compressionMethod} za ${name}`);
    }
    decompressedBudget -= data.length;

    entries.push({ name, data });
    ptr += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Pise niz entryja natrag u zip bajtove. Sve se komprimira DEFLATE metodom
 * (jednostavnije i dovoljno, Word podrzava DEFLATE univerzalno).
 */
export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const fileWriter = new ByteWriter();
  const centralDirWriter = new ByteWriter();
  const localOffsets: number[] = [];

  // Deterministicki fiksni timestamp: DOS epoha 1980-01-01 00:00 (mjesec/dan 0
  // je formalno nevaljan DOS datum, pa se pise 1. sijecnja: (0<<9)|(1<<5)|1).
  const DOS_TIME = 0;
  const DOS_DATE = 0x21;

  // Komprimiraj i izracunaj CRC JEDNOM po entryju; central directory mora
  // prepisati iste vrijednosti kao local header, ne raditi drugi deflate.
  const prepared = [];
  for (const entry of entries) {
    prepared.push({
      entry,
      nameBytes: new TextEncoder().encode(entry.name),
      compressed: await deflateRaw(entry.data),
      crc: crc32(entry.data),
    });
  }

  for (const p of prepared) {
    localOffsets.push(fileWriter.length);

    fileWriter.writeUint32(LOCAL_FILE_HEADER_SIG);
    fileWriter.writeUint16(20); // version needed
    fileWriter.writeUint16(0); // flags
    fileWriter.writeUint16(8); // compression method: deflate
    fileWriter.writeUint16(DOS_TIME); // mod time
    fileWriter.writeUint16(DOS_DATE); // mod date
    fileWriter.writeUint32(p.crc);
    fileWriter.writeUint32(p.compressed.length);
    fileWriter.writeUint32(p.entry.data.length);
    fileWriter.writeUint16(p.nameBytes.length);
    fileWriter.writeUint16(0); // extra length
    fileWriter.writeBytes(p.nameBytes);
    fileWriter.writeBytes(p.compressed);
  }

  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];

    centralDirWriter.writeUint32(CENTRAL_DIR_SIG);
    centralDirWriter.writeUint16(20); // version made by
    centralDirWriter.writeUint16(20); // version needed
    centralDirWriter.writeUint16(0); // flags
    centralDirWriter.writeUint16(8); // compression method
    centralDirWriter.writeUint16(DOS_TIME); // mod time
    centralDirWriter.writeUint16(DOS_DATE); // mod date
    centralDirWriter.writeUint32(p.crc);
    centralDirWriter.writeUint32(p.compressed.length);
    centralDirWriter.writeUint32(p.entry.data.length);
    centralDirWriter.writeUint16(p.nameBytes.length);
    centralDirWriter.writeUint16(0); // extra length
    centralDirWriter.writeUint16(0); // comment length
    centralDirWriter.writeUint16(0); // disk number start
    centralDirWriter.writeUint16(0); // internal attrs
    centralDirWriter.writeUint32(0); // external attrs
    centralDirWriter.writeUint32(localOffsets[i]);
    centralDirWriter.writeBytes(p.nameBytes);
  }

  const centralDirOffset = fileWriter.length;
  const centralDirBytes = centralDirWriter.toBytes();

  const eocdWriter = new ByteWriter();
  eocdWriter.writeUint32(EOCD_SIG);
  eocdWriter.writeUint16(0); // disk number
  eocdWriter.writeUint16(0); // disk with central dir
  eocdWriter.writeUint16(entries.length); // entries on this disk
  eocdWriter.writeUint16(entries.length); // total entries
  eocdWriter.writeUint32(centralDirBytes.length);
  eocdWriter.writeUint32(centralDirOffset);
  eocdWriter.writeUint16(0); // comment length

  return concatBytes([fileWriter.toBytes(), centralDirBytes, eocdWriter.toBytes()]);
}
