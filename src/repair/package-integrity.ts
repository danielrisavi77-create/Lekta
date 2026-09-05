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
    // Imena atributa vidjena na OVOM elementu: duplikat je fatalna XML greska (XML 1.0
    // sec. 3.1, WFC: Unique Att Spec) koju Word i lxml odbijaju, a regex-patcher je moze
    // proizvesti umetanjem atributa koji vec postoji umjesto zamjene postojeceg.
    const seenAttrs = new Set<string>();
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
      if (seenAttrs.has(attrName)) return fail(`atribut ${attrName} ponovljen na istom elementu <${name}>`, attrStart);
      seenAttrs.add(attrName);
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

/**
 * Klasa kvara koju cisti XML skener NE VIDI (audit DOCX-20).
 *
 * `scanXmlWellFormed` dokazuje da je svaki dirani dio dobro oblikovan XML. To je nuzno, ali nije
 * dovoljno: paket moze biti sastavljen od samih besprijekornih XML-ova i svejedno biti neispravan
 * OPC paket. Dva nacina na koja se to dogadja, oba ih Word prijavi kao "dokument je ostecen":
 *
 *   1. dio postoji u zipu, ali `[Content_Types].xml` ne kaze kojeg je tipa (nema ni Default za
 *      njegovu ekstenziju ni Override za njegovu punu putanju);
 *   2. `.rels` datoteka pokazuje na dio kojeg u paketu nema (visece `r:id`).
 *
 * Oboje moze nastati kad popravak DODA ili UKLONI dio (K5 footer flow, uklanjanje praznih
 * dijelova), a upravo tu XML skener ne pomaze jer je svaki pojedini dio ispravan.
 */
export interface PackageStructureIssue {
  kind: 'content-type-missing' | 'dangling-relationship' | 'schema-invalid-content';
  part: string;
  detail: string;
}

/** Dekodiraj sadrzaj dijela kao tekst. Binarni dijelovi (slike) se ovdje nikad ne citaju. */
function partText(entry: PackageEntryLike): string {
  return new TextDecoder().decode(entry.data);
}

/** Normalizira putanju iz zipa i iz OPC zapisa na isti oblik (bez vodece kose crte). */
function normalizePart(name: string): string {
  return name.replace(/^\/+/, '').toLowerCase();
}

/**
 * Je li svaki dio paketa pokriven `[Content_Types].xml`.
 *
 * `_rels/**` i sam `[Content_Types].xml` se ne navode u sadrzaju tipova, pa se preskacu.
 * Kad `[Content_Types].xml` uopce nema, ne prijavljujemo svaki dio posebno nego jedan kvar:
 * paket bez njega nije OPC paket i poruka mora reci upravo to.
 */
export function checkContentTypes(entries: readonly PackageEntryLike[]): PackageStructureIssue[] {
  const contentTypes = entries.find((e) => normalizePart(e.name) === '[content_types].xml');
  if (!contentTypes) {
    return [{ kind: 'content-type-missing', part: '[Content_Types].xml', detail: 'paket nema [Content_Types].xml' }];
  }
  const xml = partText(contentTypes);
  const defaults = new Set(
    [...xml.matchAll(/<Default[^>]*Extension\s*=\s*"([^"]+)"/gi)].map((m) => m[1].toLowerCase()),
  );
  const overrides = new Set(
    [...xml.matchAll(/<Override[^>]*PartName\s*=\s*"([^"]+)"/gi)].map((m) => normalizePart(m[1])),
  );

  const issues: PackageStructureIssue[] = [];
  for (const entry of entries) {
    const name = normalizePart(entry.name);
    if (name === '[content_types].xml' || name.includes('_rels/')) continue;
    if (name.endsWith('/')) continue; // direktorij, nije dio
    if (overrides.has(name)) continue;
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
    if (ext && defaults.has(ext)) continue;
    issues.push({
      kind: 'content-type-missing',
      part: entry.name,
      detail: `nema ni Default za ".${ext}" ni Override za taj dio`,
    });
  }
  return issues;
}

/**
 * Pokazuje li svaka relacija na dio koji stvarno postoji.
 *
 * `TargetMode="External"` se preskace: to su URL-ovi (hiperveze), ne dijelovi paketa. Relativna
 * meta se razrjesuje u odnosu na mapu kojoj `.rels` pripada, po OPC pravilu:
 * `word/_rels/document.xml.rels` -> baza je `word/`.
 */
export function checkRelationshipTargets(entries: readonly PackageEntryLike[]): PackageStructureIssue[] {
  const present = new Set(entries.map((e) => normalizePart(e.name)));
  const issues: PackageStructureIssue[] = [];

  for (const entry of entries) {
    const name = normalizePart(entry.name);
    if (!name.endsWith('.rels')) continue;
    const base = name.replace(/_rels\/[^/]*$/, ''); // "word/_rels/document.xml.rels" -> "word/"
    const xml = partText(entry);
    for (const m of xml.matchAll(/<Relationship[^>]*>/gi)) {
      const tag = m[0];
      if (/TargetMode\s*=\s*"External"/i.test(tag)) continue;
      const target = tag.match(/Target\s*=\s*"([^"]+)"/i)?.[1];
      if (!target) continue;
      if (/^[a-z]+:\/\//i.test(target)) continue; // apsolutni URL bez TargetMode
      const resolved = normalizePart(target.startsWith('/') ? target : base + target);
      // Rijesi "../" segmente (npr. Target="../media/slika.png" iz word/_rels/).
      const parts: string[] = [];
      for (const seg of resolved.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg !== '.' && seg !== '') parts.push(seg);
      }
      const finalPath = parts.join('/');
      if (!present.has(finalPath)) {
        issues.push({
          kind: 'dangling-relationship',
          part: entry.name,
          detail: `relacija pokazuje na "${target}", a taj dio ne postoji u paketu`,
        });
      }
    }
  }
  return issues;
}

/**
 * TRECA KLASA: dio je dobro OBLIKOVAN XML i paket je ispravan OPC, ali sadrzaj krsi SHEMU.
 *
 * Zasto postoji, izmjereno 2026-09-03: `croatian-typography-fixer` je definicije tab-stopova
 * (`<w:pPr><w:tabs><w:tab w:val="right" .../></w:tabs>`) zamjenjivao tekstom i proizvodio
 * `<w:tabs><w:t xml:space="preserve"> </w:t></w:tabs>`. Word je takav dokument ODBIJAO otvoriti
 * ("error processing the XML file, Part: /word/document.xml"), a pogodjeno je 6 od 38 stvarnih
 * studentskih radova nakon zadanog popravka.
 *
 * Nijedna postojeca razina to nije vidjela, i to je pravi nalaz:
 *   Tier 0 `scanXmlWellFormed`  prolazi (XML JEST dobro oblikovan), `integrityFailure` je bio `null`
 *   Tier 0 OPC provjere         prolaze (tipovi i relacije su netaknuti)
 *   Tier 1 `lxml strict-open`   prolazi (isto pitanje, drugi alat)
 *   Tier 2 Word                 JEDINI odbija
 * Kvar je do korisnika putovao kroz sve automatske gardove, pa je zaustavlja tek covjek koji
 * dokument ne moze otvoriti.
 *
 * OVO NIJE VALIDATOR SHEME i ne pretvara se da jest. Provjerava JEDAN izmjeren razred: da u
 * `<w:tabs>` ne zavrsi nista osim definicija tab-stopova. Sire tvrdnje (puni `wml.xsd`) su drugi
 * posao; lazno siroko ime bi ovdje bilo gore od uskog, jer bi sugeriralo pokrivenost koje nema.
 *
 * Pozivatelj (`apply-fixers`) usporedjuje stanje PRIJE i POSLIJE i javlja samo NOVE probleme, pa
 * ulazni dokument koji vec krsi shemu ne blokira popravak.
 */
const SCHEMA_SCANNED_PARTS = /^word\/(document\d*\.xml|footnotes\.xml|endnotes\.xml|header\d*\.xml|footer\d*\.xml)$/i;

export function checkSchemaInvalidContent(entries: readonly PackageEntryLike[]): PackageStructureIssue[] {
  const issues: PackageStructureIssue[] = [];
  for (const entry of entries) {
    if (!SCHEMA_SCANNED_PARTS.test(normalizePart(entry.name))) continue;
    const xml = partText(entry);
    for (const match of xml.matchAll(/<w:tabs\b[^>]*>([\s\S]*?)<\/w:tabs>/g)) {
      const inner = match[1] ?? '';
      // Unutar <w:tabs> po shemi smiju stajati samo <w:tab .../> elementi (CT_TabStop).
      const strani = inner.replace(/<w:tab\b[^>]*\/>/g, '').trim();
      if (!strani) continue;
      const oznaka = /<([A-Za-z_:][-\w:.]*)/.exec(strani)?.[1] ?? '(tekst)';
      issues.push({
        kind: 'schema-invalid-content',
        part: entry.name,
        detail: `<w:tabs> sadrzi <${oznaka}>, a smije sadrzavati samo definicije tab-stopova (Word odbija otvoriti takav dokument)`,
      });
      break; // jedan nalaz po dijelu je dovoljan; popis se inace napuni istim kvarom
    }
  }
  return issues;
}

/** Sve strukturne provjere odjednom. */
export function checkPackageStructure(entries: readonly PackageEntryLike[]): PackageStructureIssue[] {
  return [...checkContentTypes(entries), ...checkRelationshipTargets(entries), ...checkSchemaInvalidContent(entries)];
}
