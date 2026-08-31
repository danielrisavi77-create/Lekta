/**
 * Intake gate: brza trijaza datoteke ODMAH nakon odabira, PRIJE nego ista ode prema
 * Web Workeru ili DOM parseru (dio dvoslojne politike: tvrdi reject samo nedvosmisleno,
 * sumnjivo ide u pred-run potvrdu u UI-ju, pravi radovi se nikad tvrdo ne blokiraju).
 *
 * DOM-free modul: uvozi samo ZipReader/parser konstante i quick-stats parser; koristi ga
 * iskljucivo UI sloj (src/ui/app.ts). Golden/synthetic/conformance korpus poziva
 * analyzeDocx izravno pa ovaj gate NE utjece na engine ni snapshote.
 *
 * Fail-open: neocekivana interna greska gatea PROPUSTA datoteku (uz console.warn),
 * jer engine iza ima vlastite sigurnosne capove (zip bomba, DTD, broj odlomaka).
 */
import { ZipReader, MAX_SCAN_PARAGRAPHS } from './parser';
import { parseAppStats, type DocxQuickStats } from './quick-stats';
import { docxCapability, type DocxCapability } from '../repair/docx-budget';

/** Ispod ove velicine datoteka sigurno nije pravi rad: najmanji stvarni .docx pisaci
 *  (Word ~11 KB, LibreOffice/Google Docs ~5-6 KB) daju vise; sinteticki minimalac ~2 KB
 *  nije studentski rad. */
export const MIN_DOCX_BYTES = 4096;

/** Empty-check cita word/document.xml SAMO za datoteke do ove velicine: stvarno prazan
 *  docx je uvijek sitan, a velik docx bez teksta (npr. samo slike) NIJE nedvosmislen pa
 *  ide u sumnjivi tok umjesto tvrdog rejecta. */
export const EMPTY_SCAN_MAX_BYTES = 512 * 1024;

/** Dekompresijski budzet intake citanja (app.xml + mali document.xml). Namjerno strozi od
 *  engine budzeta: gate radi na glavnoj niti pa ne smije raspakirati stotine MB; legitiman
 *  docx do 512 KB nikad ne siri document.xml preko ovoga (realni XML omjeri ~10-20:1),
 *  a bomba koja probije padne na fail-open i rjesava je worker (off-thread) svojim capom. */
export const INTAKE_MAX_DECOMPRESSED_BYTES = 16 * 1024 * 1024;

/** Ispod ovog Wordovog broja rijeci (docProps/app.xml) dokument je SUMNJIV (pred-run
 *  potvrda, ne reject): i najkraci stvarni seminarski ima 1000+, CV/molba/predlozak
 *  tipicno ispod 300. Ako app.xml ne postoji, dokument NIJE sumnjiv (ne gnjavi se). */
export const SUSPICIOUS_WORDS_MAX = 300;

/** Post-run mreza: rezultat s manje rijeci od ovoga I nula naslova dobiva warning issue.
 *  Obje komponente zajedno: kostur od 1500 rijeci prolazi po rijecima, rad bez Wordovih
 *  stilova naslova ali s puno teksta prolazi po rijecima. */
export const POSTRUN_WORDS_MAX = 1000;

export type IntakeRejectCode = 'too-small' | 'not-zip' | 'corrupt' | 'macros' | 'no-document' | 'empty';

export interface IntakeReject { kind: 'reject'; code: IntakeRejectCode; message: string }
export interface IntakeOk {
  kind: 'ok';
  quickStats: DocxQuickStats | null;
  suspicious: boolean;
  suspicionReason: string | null;
  /** Sto se s paketom realno moze (analiza, popravak), izvedeno iz central directoryja jos na
   *  intakeu. `null` znaci da procjena NIJE napravljena (fail-open grana), nikad da je paket los. */
  capability: DocxCapability | null;
}
export type IntakeVerdict = IntakeOk | IntakeReject;

const OK_CLEAN: IntakeOk = { kind: 'ok', quickStats: null, suspicious: false, suspicionReason: null, capability: null };

function reject(code: IntakeRejectCode, message: string): IntakeReject {
  return { kind: 'reject', code, message };
}

/**
 * Pregledaj odabranu .docx datoteku i vrati verdikt: tvrdi reject (nedvosmisleno nije rad),
 * ok+suspicious (pred-run potvrda u UI-ju) ili cisti ok. Redoslijed provjera: svaka
 * jeftinija prije skuplje (velicina -> magic bytes -> central directory -> imena zapisa ->
 * app.xml -> mali document.xml).
 */
export async function inspectDocxIntake(file: File): Promise<IntakeVerdict> {
  try {
    // 1) Premalena datoteka ne moze biti pravi rad.
    if (file.size < MIN_DOCX_BYTES) {
      return reject('too-small', 'Datoteka je premalena da bude pravi Word dokument. Ponovno spremi rad iz Worda kao .docx.');
    }

    // 2) Magic bytes: svaki .docx pocinje lokalnim ZIP headerom PK\x03\x04.
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (!(head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
      return reject('not-zip', 'Datoteka nije pravi .docx dokument (nema Word ZIP potpis). Provjeri da nije preimenovana datoteka drugog tipa.');
    }

    // 3) Central directory: korupcija ili previse zapisa (MAX_ZIP_ENTRIES u ZipReaderu).
    let zip: ZipReader;
    try {
      zip = new ZipReader(await file.arrayBuffer(), { maxDecompressedBytes: INTAKE_MAX_DECOMPRESSED_BYTES });
    } catch {
      return reject('corrupt', 'Datoteka je oštećena ili nije valjan .docx. Ponovno je izvezi iz Worda (Spremi kao .docx).');
    }
    const names = zip.names();

    // 3b) Sto se s paketom moze: analiza i, VAZNIJE, popravak. Racuna se iz vec procitanog
    // central directoryja (bez ijedne skupe operacije) pa sucelje moze biti posteno prije
    // nego korisnik potvrdi slanje na popravak.
    const capability = docxCapability({
      fileBytes: file.size,
      entryCount: zip.entryCount(),
      totalDeclaredBytes: zip.declaredUncompressedTotal(),
    });

    // 4) Makronaredbe: vbaProject.bin (i preimenovani .docm). Nista se ne izvrsava lokalno,
    // ali dokument s makronaredbama nije standardni rad i ne zelimo ga dalje obradjivati.
    if (names.some((n) => /vbaproject/i.test(n))) {
      return reject('macros', 'Dokument sadrži makronaredbe (vbaProject) pa se ne može analizirati. U Wordu ga spremi kao .docx bez makronaredbi, ne kao .docm.');
    }

    // 5) Bez glavnog dijela nema sto analizirati.
    if (!names.includes('word/document.xml')) {
      return reject('no-document', 'U datoteci nije pronađen glavni Word dokument. Ponovno je izvezi iz Worda.');
    }

    // 6) Brza statistika iz docProps/app.xml (Word je sam upisuje pri spremanju).
    let quickStats: DocxQuickStats | null = null;
    try {
      const appXml = await zip.text('docProps/app.xml');
      if (appXml) quickStats = parseAppStats(appXml);
    } catch {
      quickStats = null;
    }

    // 7) Nedvosmisleno prazan dokument (tvrdi reject SAMO za sitne datoteke; app.xml tu ne
    // pomaze jer parseAppStats mapira Words=0 u null, pa se prazno cita iz document.xml).
    if (file.size <= EMPTY_SCAN_MAX_BYTES) {
      try {
        const docXml = await zip.text('word/document.xml');
        let paraCount = 0;
        const paraRe = /<w:p[\s/>]/g;
        let overCap = false;
        while (paraRe.exec(docXml)) if (++paraCount > MAX_SCAN_PARAGRAPHS) { overCap = true; break; }
        if (!overCap) {
          let alnum = 0;
          const textRe = /<w:t[^>]*>([^<]*)</g;
          let m: RegExpExecArray | null;
          while ((m = textRe.exec(docXml)) && alnum < 10) {
            alnum += (m[1].match(/[\p{L}\p{N}]/gu) || []).length;
          }
          if (alnum < 10) {
            return reject('empty', 'Dokument je prazan, nema teksta za analizu. Učitaj završni ili diplomski rad s tekstom.');
          }
        }
      } catch {
        // ZipLimitError ili neispravan XML: nije nedvosmisleno prazno, pusti dalje (fail-open;
        // worker i engine imaju vlastite capove off-thread).
      }
    }

    // 8) Sumnjivo malo teksta: pred-run potvrda, ne reject.
    if (quickStats && quickStats.words !== null && quickStats.words < SUSPICIOUS_WORDS_MAX) {
      return {
        kind: 'ok',
        quickStats,
        suspicious: true,
        suspicionReason: `Word za ovaj dokument bilježi samo ${quickStats.words} riječi`,
        capability,
      };
    }

    return { kind: 'ok', quickStats, suspicious: false, suspicionReason: null, capability };
  } catch (e) {
    // Fail-open: gate nikad ne smije lazno blokirati pravi rad zbog vlastite greske.
    console.warn('intake-gate: neočekivana greška, datoteka se propušta:', e);
    return { ...OK_CLEAN };
  }
}

/**
 * Post-run mreza: iz gotovog rezultata analize procijeni izgleda li dokument kao rad.
 * Vraca poruku za warning issue ili null. Konzervativno (rijeci I naslovi zajedno).
 */
export function postRunSuspicion(input: { words?: number | null; headings?: number | null } | null | undefined): string | null {
  if (!input) return null;
  const words = typeof input.words === 'number' && Number.isFinite(input.words) ? input.words : 0;
  const headings = typeof input.headings === 'number' && Number.isFinite(input.headings) ? input.headings : 0;
  if (words < POSTRUN_WORDS_MAX && headings === 0) {
    return `Dokument ima samo ${words} riječi i nijedan naslov oblikovan Wordovim stilovima.`;
  }
  return null;
}
