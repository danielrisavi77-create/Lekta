// Cisti tekst iz word/document.xml za BROJANJE (kartice.html .docx uvoz). NIJE parser:
// bez DOM-a, bez stilova, bez fusnota/endnota, samo vidljivi tekst glavnog dokumenta.
// Namjerno odvojen od punog OOXML parsera (src/docx/parser.ts radi samo ZIP sloj ovdje;
// analiza rada i dalje ide iskljucivo kroz analyzeDocx). Iskljuceno po dizajnu:
//  - w:delText (obrisano u pracenim izmjenama) i w:instrText (kod polja) nisu w:t pa se ne broje
//  - fusnote/endnote/zaglavlja zive u drugim partovima koje uopce ne citamo
// Vjeran je hrvatskoj kartici: prijelomi odlomaka -> \n (counter ih ne broji u znakove).

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m);
}

// Jedan token po pojavi: tekst runa, tab ili prijelom retka unutar odlomka, redoslijedom
// pojavljivanja (zato JEDAN kombinirani regex, ne odvojeni prolazi koji bi izgubili poredak).
const TOKEN_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<w:cr\b[^>]*\/?>/g;

/** Vidljivi tekst iz XML-a word/document.xml: odlomci odvojeni s \n. */
export function extractDocxText(documentXml: string): string {
  const paragraphs = documentXml.split(/<\/w:p>/);
  const out: string[] = [];
  for (const chunk of paragraphs) {
    let text = '';
    TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_RE.exec(chunk))) {
      if (m[1] !== undefined) text += decodeEntities(m[1]);
      else if (m[0].startsWith('<w:tab')) text += '\t';
      else if (m[0].startsWith('<w:br') || m[0].startsWith('<w:cr')) text += '\n';
      // samozatvoreni <w:t/> ne nosi tekst
    }
    if (text) out.push(text);
  }
  return out.join('\n');
}
