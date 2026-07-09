/**
 * scripts/gen-deadlines.mjs
 *
 * Generator/predlagac akademskih rokova za data/submission/academic-deadlines.json.
 * Utjelovljuje "3-lecnu auto-provjeru" (vidi docs/AUTO_PROVJERA_ROKOVA.md): svaka serija
 * nosi verification zapis (autoVerified / passes / sources / note). Auto-provjeren rok
 * ide live, ali ODVOJENO od `confirmed` (ljudska potvrda ostaje zlatni standard).
 *
 * Ponasanje:
 *   node scripts/gen-deadlines.mjs           -> ISPISI predlozene unose na stdout (nista ne mijenja)
 *   node scripts/gen-deadlines.mjs --write   -> SPOJI u JSON idempotentno, cuvajuci postojeci
 *                                               confirmed:true (ljudski flip prezivljava regen).
 *
 * Kljuc dedupa: facultyId | programId | workType | deadlineDate.
 *
 * Dodavanje fakulteta: dodaj unos u BATCHES. `deadlineDate` je STVARNI ROK PREDAJE, ne datum
 * obrane. Ako sluzbeni izvor daje samo termine obrana bez roka predaje (primjer: Pravni fakultet
 * u Zagrebu, rok predaje je iza AAI logina), NE dodavaj ga: 3-lecna provjera tada ODBIJA
 * fabrikaciju (vidi docs/AUTO_PROVJERA_ROKOVA.md, "Kad odbiti").
 *
 * IZVOR ISTINE ostaje sam JSON (rucni flipovi na confirmed:true su sigurni). Ovaj alat samo
 * dosljedno proizvodi ispravno oblikovane unose (siguran en-dash, jednolik verification zapis).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = 'data/submission/academic-deadlines.json';
const EN_DASH = '–'; // U+2013; MORA se poklapati s nazivom programa u zagreb-catalog.json

// --- Serije rokova po fakultetu; svaka je prosla 3-lecnu auto-provjeru ---
const BATCHES = [
  {
    facultyId: 'fpzg',
    workType: 'diplomski',
    academicYear: '2025/2026',
    programs: [
      'Diplomski studij Politologija',
      `Diplomski studij Politologija ${EN_DASH} Nacionalna sigurnost`,
      'Diplomski studij Novinarstvo',
    ],
    fetchedAt: '2026-07-09',
    confirmed: false,
    // rok predaje ("zakljucavanje popisa") + opis pripadnog termina obrane (za `source`)
    terms: [
      { deadlineDate: '2026-01-30', obrana: 'veljaci 2026 (obrane 16.-20.02.2026.)' },
      { deadlineDate: '2026-05-22', obrana: 'lipnju 2026 (obrane 08.-12.06.2026.)' },
      { deadlineDate: '2026-06-19', obrana: 'srpnju 2026 (obrane 29.06.-03.07.2026.)' },
      { deadlineDate: '2026-09-01', obrana: 'rujnu 2026 (obrane 07.-18.09.2026.)' },
    ],
    sourceCitation:
      "FPZG Odluka o rokovima obrana diplomskih radova 2025./2026. (KLASA 007-04/25-02/02, 23.10.2025), rok 'zakljucavanje popisa' za obranu u",
    sourceUrl:
      'https://www.fpzg.unizg.hr/_download/repository/5.%20Odluka_rokovi%20prijave%20i%20obrane%20diplomskih%20radova%202025.pdf',
    verification: {
      autoVerified: true,
      passes: 3,
      checkedAt: '2026-07-09',
      sources: [
        'https://www.fpzg.unizg.hr/_download/repository/5.%20Odluka_rokovi%20prijave%20i%20obrane%20diplomskih%20radova%202025.pdf',
        'https://www.fpzg.unizg.hr/studenti/obrane_diplomskih_radova',
      ],
      note:
        "3 lece: (1) ekstrakcija iz PDF Odluke KLASA 007-04/25-02/02 (23.10.2025); " +
        "(2) adversarijalno: 'zakljucavanje popisa' = rok predaje uvezanog rada + potpisan obrazac D2 " +
        "(nije datum obrane), potvrdena ak.god 2025/2026 i tri diplomska studija, dokument nije " +
        "zamijenjen novijim; (3) interna konzistentnost: rok predaje je prije pocetka pripadne obrane " +
        "(30.01<16.02, 22.05<08.06, 19.06<29.06, 01.09<07.09). OPREZ: konkretni datumi postoje SAMO u " +
        "PDF Odluci (HTML stranica ih ne navodi), dakle jedan mjerodavan izvor bez nezavisne druge " +
        "potvrde -> ceka zavrsnu rucnu potvrdu.",
    },
  },
  {
    facultyId: 'fsb',
    workType: 'diplomski',
    academicYear: '2025/2026',
    programs: ['Diplomski studiji Fakulteta strojarstva i brodogradnje'],
    fetchedAt: '2026-07-09',
    confirmed: false,
    // rok predaje = kolona "Datum predaje diplomskog rada" (NE "Zadnji dan predaje molbe")
    terms: [
      { deadlineDate: '2025-12-04', obrana: 'roku 1 (obrane 11., 12. i 15.12.2025.)' },
      { deadlineDate: '2026-01-29', obrana: 'roku 2 (obrane 05., 06. i 09.02.2026.)' },
      { deadlineDate: '2026-03-19', obrana: 'roku 3* (obrane 26., 27. i 30.03.2026.)' },
      { deadlineDate: '2026-05-07', obrana: 'roku 4 (obrane 14., 15. i 18.05.2026.)' },
      { deadlineDate: '2026-07-16', obrana: 'roku 5** (obrane 23.-24.07.2026.)' },
    ],
    sourceCitation:
      "FSB Plan obrane diplomskih radova diplomskih studija za ak. god. 2025./2026., kolona 'Datum predaje diplomskog rada', predaja u",
    sourceUrl: 'https://www.fsb.unizg.hr/index.php?alias=diplomski_ispiti',
    verification: {
      autoVerified: true,
      passes: 3,
      checkedAt: '2026-07-09',
      sources: ['https://www.fsb.unizg.hr/index.php?alias=diplomski_ispiti'],
      note:
        "3 lece: (1) ekstrakcija iz kolone 'Datum predaje diplomskog rada' (razlicito od 'Zadnji dan " +
        "predaje molbe' i 'Datum preuzimanja zadatka'); (2) adversarijalno: to je rok predaje gotovog rada " +
        "(ne datum obrane ni rok molbe), god 2025/2026, vrijedi za sve diplomske studije FSB-a (Strojarstvo, " +
        "Brodogradnja, Zrakoplovno inzenjerstvo, Mehatronika i robotika); (3) dvije nezavisne procitanosti " +
        "tablice (browser render + WebFetch) daju iste datume + interna konzistentnost (predaja prije " +
        "pripadne obrane). OPREZ: rokovi 3 i 5 nose oznake * i ** bez legende na stranici (moguce uvjetni); " +
        "jedan sluzbeni izvor (FSB stranica).",
    },
  },
];

function buildEntries() {
  const out = [];
  for (const b of BATCHES) {
    for (const program of b.programs) {
      for (const t of b.terms) {
        out.push({
          facultyId: b.facultyId,
          programId: program,
          workType: b.workType,
          academicYear: b.academicYear,
          deadlineDate: t.deadlineDate,
          source: `${b.sourceCitation} ${t.obrana}; ${b.sourceUrl}`,
          fetchedAt: b.fetchedAt,
          confirmed: b.confirmed,
          verification: b.verification,
        });
      }
    }
  }
  return out;
}

const key = (e) => `${e.facultyId}|${e.programId ?? ''}|${e.workType}|${e.deadlineDate}`;

const proposed = buildEntries();
const write = process.argv.includes('--write');

if (!write) {
  process.stdout.write(JSON.stringify(proposed, null, 2) + '\n');
  process.stderr.write(
    `\n[pregled] ${proposed.length} predlozenih unosa iz ${BATCHES.length} serije. ` +
      `Za spajanje u ${OUT}: node scripts/gen-deadlines.mjs --write\n`,
  );
} else {
  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const proposedByKey = new Map(proposed.map((e) => [key(e), e]));
  let added = 0;
  let updated = 0;
  let preserved = 0;

  // Postojeci redoslijed se cuva; confirmed:true se NE dira (ljudski flip pobjeduje).
  const merged = existing.map((e) => {
    const p = proposedByKey.get(key(e));
    if (!p) return e;
    proposedByKey.delete(key(e));
    if (e.confirmed === true) {
      preserved++;
      return e;
    }
    updated++;
    return p;
  });
  // Novi kljucevi na kraj.
  for (const p of proposedByKey.values()) {
    merged.push(p);
    added++;
  }

  writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  process.stderr.write(
    `[write] ${OUT}: ukupno ${merged.length} (novih ${added}, azuriranih ${updated}, ocuvanih confirmed ${preserved}).\n`,
  );
}
