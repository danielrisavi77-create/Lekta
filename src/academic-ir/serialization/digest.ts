import type { AcademicIR } from '../schema/root';
import { serializeAcademicIR } from './serialize';

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function digestAcademicIR(ir: AcademicIR): Promise<string> {
  return sha256Hex(serializeAcademicIR(ir));
}
