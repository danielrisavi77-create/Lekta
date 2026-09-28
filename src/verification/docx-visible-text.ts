import { readZip } from '../repair/zip-codec.ts';

/** Spaja vidljivi tekst DOCX dokumenta redom, bez oslanjanja na sirovu OOXML strukturu. */
export async function documentText(bytes: Uint8Array): Promise<string> {
  const entries = await readZip(bytes);
  const document = entries.find((entry) => entry.name === 'word/document.xml');
  if (!document) throw new Error('DOCX nema word/document.xml');
  const xml = new TextDecoder().decode(document.data);
  return [...xml.matchAll(/<w:t\b[^>]*\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .filter((match) => match[1] !== undefined)
    .map((match) =>
      match[1].replace(/&(amp|lt|gt|quot|apos|#(?:[0-9]+|x[0-9a-fA-F]+));/g, (entity, code: string) => {
        if (code[0] === '#') {
          const value = code[1] === 'x'
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10);
          return value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
            ? String.fromCodePoint(value)
            : entity;
        }
        return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[code as 'amp' | 'lt' | 'gt' | 'quot' | 'apos'];
      }),
    )
    .join('');
}
