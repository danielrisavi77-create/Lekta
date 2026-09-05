/**
 * Kanal A: priprema pseudonimizirane kopije dokumenta za prilog korpusu, na SERVERU, u istom pozivu popravka.
 *
 * Isti postupak kao lokalni ingest (`scripts/corpus-ingest.mts`): dijelovi paketa koji su XML ili .rels prolaze kroz
 * `pseudonymizeDocx`, ostali (slike, fontovi) ostaju bajt-identicni, paket se ponovno zapise. Keyring (mapa
 * pseudonim -> pojam) se ovdje NAMJERNO NE VRACA: pozivatelj dobiva samo bajtove i brojeve, pa ga ni ne moze
 * pohraniti. Sol je pozivateljeva i slucajna po prilogu; ne pohranjuje se, pa isti pojam u dva priloga dobiva
 * razlicite pseudonime (nema grafa povezivanja).
 *
 * Cist modul: bez Deno i bez Node API-ja osim onoga sto `zip-codec` i `pseudonymize` vec traze
 * (`node:crypto` HMAC, koji Deno podrzava). Dijele ga Edge funkcija i testovi.
 */
import { readZip, writeZip, type ZipEntry } from '../repair/zip-codec.ts';
import { pseudonymizeDocx } from './pseudonymize.ts';

export interface CorpusCopyReport {
  /** Broj pojmova zamijenjenih pseudonimima (0 = `vacuous`: nista prepoznato, sto NIJE dokaz cistoce). */
  dictionarySize: number;
  /** Nositelji koji su ocisceni (npr. `core.creator`, `document.frontMatter`). Imena nositelja, nikad pojmovi. */
  carriersCleaned: string[];
  /** Rjecnik prazan: dokument nije imao prepoznatljiv osobni podatak u metapodacima ni na naslovnici. */
  vacuous: boolean;
  /** Prepoznati pojmovi koji su NAKON zamjene jos prisutni. Mora biti 0; inace se kopija ne smije pohraniti. */
  leaks: number;
}

export interface CorpusCopy {
  bytes: Uint8Array;
  report: CorpusCopyReport;
}

/**
 * Pseudonimizira docx i vraca novi paket. Baca kad paket nije citljiv; pozivatelj tada NE pohranjuje nista.
 * Kad `report.leaks > 0`, kopija se isto ne smije pohraniti: to je ugovor pozivatelja, ovdje se samo mjeri.
 */
export async function prepareCorpusCopy(bytes: Uint8Array, salt: string): Promise<CorpusCopy> {
  const entries = (await readZip(bytes)) as ZipEntry[];
  const decoder = new TextDecoder();
  const parts: Record<string, string> = {};
  for (const e of entries) {
    if (/\.(xml|rels)$/i.test(e.name)) parts[e.name] = decoder.decode(e.data);
  }
  const result = pseudonymizeDocx(parts, { salt });
  const encoder = new TextEncoder();
  const rebuilt: ZipEntry[] = entries.map((e) =>
    result.parts[e.name] !== undefined ? { name: e.name, data: encoder.encode(result.parts[e.name]) } : e,
  );
  return {
    bytes: await writeZip(rebuilt),
    report: {
      dictionarySize: result.dictionarySize,
      carriersCleaned: [...result.carriersCleaned],
      vacuous: result.dictionarySize === 0,
      leaks: result.leaks.length,
    },
  };
}

/** Staza u bucketu `corpus`: bez korisnickog identiteta, samo mjesec i id priloga (nepovezivost). */
export function corpusObjectPath(contributionId: string, now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}/${contributionId}.docx`;
}
