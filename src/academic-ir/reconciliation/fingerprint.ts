import { sha256Hex } from '../serialization/digest';

export function normalizeDocumentText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export async function fingerprintDocumentText(text: string): Promise<string> {
  return sha256Hex(normalizeDocumentText(text));
}
