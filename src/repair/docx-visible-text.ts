import { readZip } from './zip-codec';

/** Spaja vidljivi tekst DOCX dokumenta redom, bez oslanjanja na sirovu OOXML strukturu. */
export async function documentText(bytes: Uint8Array): Promise<string> {
  const entries = await readZip(bytes);
  const document = entries.find((entry) => entry.name === 'word/document.xml');
  if (!document) throw new Error('DOCX nema word/document.xml');
  const xml = new TextDecoder().decode(document.data);
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) =>
      match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    )
    .join('');
}
