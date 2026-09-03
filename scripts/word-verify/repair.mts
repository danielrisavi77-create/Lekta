// scripts/word-verify/repair.mts
//
// Provuce .docx kroz PRAVI repair motor (src/repair/apply-fixers) s tipicnim skupom pravila
// jednog profila, i javi sto je primijenjeno, sto preskoceno i jesu li nedirnuti dijelovi
// izasli bit-identicni.
//
// Namjerno koristi ISTE pozive kao repair-docx Edge funkcija, da se ne provjerava neka
// paralelna, ljepsa verzija motora.
//
//   npx vite-node scripts/word-verify/repair.mts -- <ulaz.docx> <izlaz.docx>
import { readFileSync, writeFileSync } from 'node:fs';
import { applyFixers, type FixerRequest } from '../../src/repair/apply-fixers.ts';
import { readZip } from '../../src/repair/zip-codec.ts';
import { installXmlDomParser } from '../../src/docx/xml-dom-install.ts';
import { analyzeFixture } from '../../src/analysis/golden-entry.ts';
import {
  croatianTypographyRepairableItem,
  fieldIntegrityRepairableItem,
  finalDocumentInspectorRepairableItem,
} from '../../src/ui/repair-items.ts';

installXmlDomParser(true);

// Tipican profil: Times New Roman 12, prored 1,5, obostrano, margine 3/2,5 cm, A4.
// POZOR na jedinice: margins/paper-size primaju CENTIMETRE, font prima PT, prored MNOZITELJ.
const REQUESTS: FixerRequest[] = [
  { ruleId: 'margine', fixerId: 'margins-fixer', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 } },
  { ruleId: 'format', fixerId: 'paper-size-fixer', params: { w: 21, h: 29.7 } },
  { ruleId: 'font', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', fontSizePt: 12, deep: true } },
  { ruleId: 'prored', fixerId: 'line-spacing-fixer', params: { multiplier: 1.5, deep: true } },
  { ruleId: 'poravnanje', fixerId: 'alignment-fixer', params: { val: 'both', deep: true } },
  { ruleId: 'razmaci', fixerId: 'paragraph-spacing-fixer', params: { deep: true } },
  { ruleId: 'prazni-odlomci', fixerId: 'empty-paragraph-fixer', params: {} },
  { ruleId: 'fusnote-razmak', fixerId: 'footnote-spacing-fixer', params: { deep: true } },
  // Naslovi: razina 1 podebljana 14 pt, razine 2 i 3 podebljane 12 pt, sve poravnato slijeva.
  {
    ruleId: 'naslovi', fixerId: 'heading-format-fixer', params: {
      targets: [
        { level: 1, sizeHalfPoints: 28, bold: true, alignLeft: true },
        { level: 2, sizeHalfPoints: 24, bold: true, alignLeft: true },
        { level: 3, sizeHalfPoints: 24, bold: true, alignLeft: true },
      ],
    },
  },
  // Fusnote: Times New Roman 10 pt, obostrano.
  // `lineSpacing` i `deep` NISU kozmetika popisa nego pokrivenost oracla: bez njih Word provjera
  // vrti UZI skup od onoga sto sucelje stvarno salje, pa grana proreda fusnota (uvedena
  // 2026-09-03) ne bi bila dotaknuta. Izmjereno pri uvodjenju: `FootnoteText` je u popravljenom
  // paketu ostajao na `w:line="276"` iako je popravak radio, jer ga ovaj popis nikad nije zatrazio.
  // Isti razred kao harness koji je gradio stavke uzim graditeljem od panela.
  { ruleId: 'fusnote-tipografija', fixerId: 'footnote-typography-fixer', params: { fontName: 'Times New Roman', fontSizePt: 10, alignJustify: true, lineSpacing: 1, deep: true } },
  // Zahvat u TEKST: u produkciji ide samo uz izricitu privolu po stavci. Ovdje je ukljucen da
  // provjera dokaze i da radi i da ne dira nista osim naslova trazene razine.
  { ruleId: 'velika-slova-naslova', fixerId: 'heading-case-fixer', params: { levels: [1] } },
];

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('uporaba: vite-node scripts/word-verify/repair.mts -- <ulaz.docx> <izlaz.docx>');
  process.exit(2);
}

const bytes = new Uint8Array(readFileSync(inPath));
const before = await readZip(bytes);

/**
 * Asistirani fixeri koji NE trebaju profilno pravilo nego samo analizu dokumenta. Bez njih je
 * Word oracle mjerio samo 11 fiksnih pravila, dakle uzi skup nego sto korisnik stvarno dobije.
 *
 * Namjerno se uzimaju ZADANI params iz obrasca, bez simulirane potvrde: ovo mjeri ono sto se
 * dogodi kad korisnik ne dira nijednu kvacicu, a to je i najcesci stvarni scenarij. Potvrdjenu
 * granu mjeri golden matrica (kljuc `<fixerId>(potvrdjeno)`).
 */
async function assistedRequests(): Promise<FixerRequest[]> {
  try {
    const file = new File([bytes], inPath, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result = await analyzeFixture(file);
    const items = [
      ...croatianTypographyRepairableItem(result),
      ...fieldIntegrityRepairableItem(result),
      ...finalDocumentInspectorRepairableItem(result),
    ];
    return items.map((item) => ({
      ruleId: item.ruleId,
      fixerId: item.fixerId,
      params: item.params as Record<string, unknown>,
    })) as FixerRequest[];
  } catch (error) {
    // Analiza ne smije srusiti oracle; bez nje se i dalje mjeri fiksni skup pravila.
    console.error(`upozorenje: analiza nije uspjela, asistirani fixeri se preskacu (${String(error)})`);
    return [];
  }
}

const assisted = await assistedRequests();
const result = await applyFixers(bytes, [...REQUESTS, ...assisted]);
writeFileSync(outPath, result.docxBytes);
const after = await readZip(result.docxBytes);

const beforeMap = new Map(before.map((e) => [e.name, e.data]));
const afterMap = new Map(after.map((e) => [e.name, e.data]));
const same = (a?: Uint8Array, b?: Uint8Array): boolean => {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** dc:title i dc:creator iz docProps/core.xml; '-' kad dijela nema. */
function coreProps(data?: Uint8Array): { naslov: string; autor: string } {
  if (!data) return { naslov: '-', autor: '-' };
  const xml = new TextDecoder().decode(data);
  const pick = (tag: string) => new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1]?.trim() ?? '';
  return { naslov: pick('dc:title') || '-', autor: pick('dc:creator') || '-' };
}

const lost = [...beforeMap.keys()].filter((n) => !afterMap.has(n));
const added = [...afterMap.keys()].filter((n) => !beforeMap.has(n));
const changed = [...beforeMap.keys()].filter((n) => afterMap.has(n) && !same(beforeMap.get(n), afterMap.get(n)));

console.log(JSON.stringify({
  ulaz: inPath,
  dijelovaPrije: before.length,
  dijelovaPoslije: after.length,
  asistiraniZahtjevi: assisted.map((request) => request.fixerId),
  // Autor i naslov iz docProps/core.xml, cita se IZ PAKETA a ne preko Worda: COM
  // BuiltInDocumentProperties je u ovom okruzenju null, pa bi provjera bila vakuozna.
  docPropsPrije: coreProps(beforeMap.get('docProps/core.xml')),
  docPropsPoslije: coreProps(afterMap.get('docProps/core.xml')),
  primijenjeno: result.changelog.map((c) => c.ruleId),
  preskoceno: result.skipped,
  // Zasto je nesto preskoceno: bez ovoga se 'no-target' i 'stale-anchor' ne razlikuju,
  // a to je upravo razlika izmedju "nema sto raditi" i "promasio je metu" (RE-46, RE-55).
  razlozi: result.skippedReasons,
  izgubljeniDijelovi: lost,
  dodaniDijelovi: added,
  promijenjeniDijelovi: changed,
  bitIdenticnih: beforeMap.size - changed.length - lost.length,
}, null, 2));
