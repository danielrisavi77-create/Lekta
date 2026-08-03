/**
 * Cjelovitost .docx paketa nakon popravka (faza A, RE-47 klasa).
 *
 * Zasto vlastiti skener, a ne `parseXml` iz src/docx/parser.ts: taj guard trazi `parsererror`
 * cvor, sto je PREGLEDNICKA semantika. @xmldom/xmldom (runtime testova i produkcijskog Web
 * Workera) taj cvor NE stvara, pa `parseXml` na neispravnom samozatvarajucem tagu
 *
 *     <w:fldChar w:fldCharType="begin"/ w:dirty="true">
 *
 * uredno vrati Document. Dokazano u tests/repair-package-integrity.test.ts. Recikliranje
 * `parseXml` kao gatea dalo bi lazno zeleno tocno na klasi greske zbog koje gate postoji.
 *
 * Zato je ovo rucni tokenizer BEZ ijedne ovisnosti: bez DOMParsera, bez `node:*`, bez uvoza iz
 * ostatka aplikacije. Time smije zivjeti i u Deno Edge Functionu (supabase/functions/repair-docx),
 * gdje moze posluziti kao zadnji gate prije nego se popravljeni dokument posalje korisniku.
 */

/** Nalaz o jednom XML dijelu paketa. */
export interface XmlScanResult {
  ok: boolean;
  /** Citljiv opis prve greske (hrvatski), samo kad ok=false. */
  problem?: string;
  /** Priblizna pozicija u stringu, za lakse trazenje u velikom XML-u. */
  offset?: number;
}

export interface PartInspection {
  part: string;
  ok: boolean;
  problem?: string;
  offset?: number;
}

/** Minimalni oblik zip zapisa koji nam treba (podudara se sa ZipEntry iz zip-codec.ts). */
export interface PackageEntryLike {
  name: string;
  data: Uint8Array;
}

export interface PackageComparison {
  /** Dijelovi kojih je bilo prije, a nakon popravka ih nema. */
  dropped: string[];
  /** Dijelovi koji su bili neprazni, a sada su prazni (0 bajtova). */
  emptied: string[];
  /** Novi dijelovi (npr. word/numbering.xml koji fixer legitimno dodaje). */
  added: string[];
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

/**
 * Brza, ciljana provjera RE-47 oblika: atribut iza kose crte samozatvarajuceg taga.
 * Namjerno ostaje zasebna (i jeftina) jer je to konkretan, vec videni bug; puni skener ju
 * pokriva, ali ovaj oblik je citljiv u porukama testova.
 */
export function hasAttributeAfterSlash(xml: string): boolean {
  return /\/\s+[a-zA-Z_:][-\w.:]*\s*=/.test(xml);
}

function isNameStart(ch: string): boolean {
  return /[A-Za-z_:]/.test(ch);
}

/**
 * Strogi well-formedness skener. NE gradi stablo; provjerava tocno ono sto regex-patch pristup
 * u ovom motoru moze pokvariti:
 *   - atribut iza `/` (RE-47),
 *   - nezatvoren navodnik u vrijednosti atributa,
 *   - nebalansirane ili krivo ugnijezdjene tagove,
 *   - samostalan `<` u tekstu,
 *   - `&` koji ne zapocinje valjan entitet.
 *
 * Namjerno NE validira shemu (to je posao Tier 1/2 oraclea: python-docx, Word).
 */
export function scanXmlWellFormed(xml: string): XmlScanResult {
  const fail = (problem: string, offset: number): XmlScanResult => ({ ok: false, problem, offset });
  const stack: Array<{ name: string; offset: number }> = [];
  let i = 0;

  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      const textCheck = scanText(xml, i, xml.length);
      return textCheck ?? finish(stack);
    }
    const textCheck = scanText(xml, i, lt);
    if (textCheck) return textCheck;

    // Deklaracije i sekcije koje preskacemo u cijelosti.
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) return fail('nezatvorena <? ... ?> deklaracija', lt);
      i = end + 2;
      continue;
    }
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end < 0) return fail('nezatvoren komentar', lt);
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end < 0) return fail('nezatvorena CDATA sekcija', lt);
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<!', lt)) {
      // DOCTYPE i slicno: isti stav kao parseXml (Word to nikad ne pise u dijelove paketa).
      return fail('nedopustena <! ... > deklaracija (npr. DOCTYPE)', lt);
    }

    // Zatvarajuci tag.
    if (xml.startsWith('</', lt)) {
      let j = lt + 2;
      const nameStart = j;
      while (j < xml.length && !WHITESPACE.has(xml[j]) && xml[j] !== '>') j++;
      const name = xml.slice(nameStart, j);
      while (j < xml.length && WHITESPACE.has(xml[j])) j++;
      if (xml[j] !== '>') return fail(`zatvarajuci tag </${name}> nije uredno zavrsen`, lt);
      const open = stack.pop();
      if (!open) return fail(`zatvarajuci tag </${name}> bez otvarajuceg`, lt);
      if (open.name !== name) return fail(`ocekivan </${open.name}>, a nadjen </${name}>`, lt);
      i = j + 1;
      continue;
    }

    // Otvarajuci (ili samozatvarajuci) tag.
    let j = lt + 1;
    if (j >= xml.length || !isNameStart(xml[j])) return fail('tag bez valjanog imena', lt);
    const nameStart = j;
    while (j < xml.length && !WHITESPACE.has(xml[j]) && xml[j] !== '>' && xml[j] !== '/') j++;
    const name = xml.slice(nameStart, j);

    let selfClosing = false;
    for (;;) {
      while (j < xml.length && WHITESPACE.has(xml[j])) j++;
      if (j >= xml.length) return fail(`nezatvoren tag <${name}>`, lt);

      if (xml[j] === '>') { j++; break; }

      if (xml[j] === '/') {
        // XML dopusta samo `/>` (spojeno). Sve drugo iza kose crte je RE-47 klasa greske.
        if (xml[j + 1] !== '>') {
          return fail(`iza kose crte u <${name}> ne slijedi '>' (atribut iza '/' cini XML nevaljanim)`, j);
        }
        selfClosing = true;
        j += 2;
        break;
      }

      // Atribut: ime = "vrijednost"
      if (!isNameStart(xml[j])) return fail(`neocekivan znak u tagu <${name}>`, j);
      const attrStart = j;
      while (j < xml.length && !WHITESPACE.has(xml[j]) && xml[j] !== '=' && xml[j] !== '>' && xml[j] !== '/') j++;
      const attrName = xml.slice(attrStart, j);
      while (j < xml.length && WHITESPACE.has(xml[j])) j++;
      if (xml[j] !== '=') return fail(`atribut ${attrName} u <${name}> nema '='`, attrStart);
      j++;
      while (j < xml.length && WHITESPACE.has(xml[j])) j++;
      const quote = xml[j];
      if (quote !== '"' && quote !== "'") return fail(`vrijednost atributa ${attrName} u <${name}> nije pod navodnicima`, j);
      const valueStart = ++j;
      const close = xml.indexOf(quote, valueStart);
      if (close < 0) return fail(`nezatvoren navodnik u atributu ${attrName} (<${name}>)`, valueStart);
      // Unutar vrijednosti '<' nije dopusten; '/' i navodnik druge vrste jesu (npr. URI-ji).
      if (xml.slice(valueStart, close).includes('<')) return fail(`znak '<' u vrijednosti atributa ${attrName}`, valueStart);
      j = close + 1;
    }

    if (!selfClosing) stack.push({ name, offset: lt });
    i = j;
  }

  return finish(stack);

  function finish(open: Array<{ name: string; offset: number }>): XmlScanResult {
    if (open.length) {
      const last = open[open.length - 1];
      return fail(`tag <${last.name}> nije zatvoren`, last.offset);
    }
    return { ok: true };
  }
}

/**
 * Tekstualni sadrzaj izmedu tagova. Provjerava samo ono sto regex-patch moze pokvariti:
 * samostalan `&` koji ne zapocinje valjan entitet. (`<` se ovdje ne moze pojaviti jer petlja
 * gore reze tekst tocno do sljedeceg `<`.)
 */
function scanText(xml: string, from: number, to: number): XmlScanResult | null {
  for (let k = from; k < to; k++) {
    if (xml[k] !== '&') continue;
    const semi = xml.indexOf(';', k + 1);
    if (semi < 0 || semi - k > 12) return { ok: false, problem: "znak '&' ne zapocinje valjan entitet", offset: k };
    const entity = xml.slice(k + 1, semi);
    const valid = /^(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+)$/.test(entity);
    if (!valid) return { ok: false, problem: `nepoznat entitet &${entity};`, offset: k };
    k = semi;
  }
  return null;
}

/** Skenira svaki XML/rels dio paketa. Binarni dijelovi (slike, fontovi) se preskacu. */
export function inspectDocxParts(entries: readonly PackageEntryLike[]): PartInspection[] {
  const decoder = new TextDecoder();
  const out: PartInspection[] = [];
  for (const entry of entries) {
    if (!/\.(xml|rels)$/i.test(entry.name)) continue;
    const result = scanXmlWellFormed(decoder.decode(entry.data));
    out.push({ part: entry.name, ok: result.ok, ...(result.problem ? { problem: result.problem } : {}), ...(result.offset != null ? { offset: result.offset } : {}) });
  }
  return out;
}

/** Popis dijelova koji su nakon popravka nestali, ispraznjeni ili dodani. */
export function comparePackages(before: readonly PackageEntryLike[], after: readonly PackageEntryLike[]): PackageComparison {
  const beforeMap = new Map(before.map((e) => [e.name, e.data.length]));
  const afterMap = new Map(after.map((e) => [e.name, e.data.length]));
  const dropped: string[] = [];
  const emptied: string[] = [];
  const added: string[] = [];
  for (const [name, size] of beforeMap) {
    const afterSize = afterMap.get(name);
    if (afterSize === undefined) dropped.push(name);
    else if (size > 0 && afterSize === 0) emptied.push(name);
  }
  for (const name of afterMap.keys()) if (!beforeMap.has(name)) added.push(name);
  return { dropped: dropped.sort(), emptied: emptied.sort(), added: added.sort() };
}
